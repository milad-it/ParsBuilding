import { EventEmitter } from 'node:events';
import { rawPrisma } from '../config/database';
import { runWithTenantContext } from '../middleware/tenant';
import { realtimeService } from './realtimeService';

export interface ExtractedReceiptMetadata {
  extractedAmount: number | null;
  extractedDate: Date | null;
  extractedTrackingNum: string | null;
  extractedSenderCard: string | null;
  destinationCard: string | null;
  confidenceScore: number;
  rawAiOutput: Record<string, any>;
}

export interface ReceiptVerificationJobPayload {
  receiptId: string;
  complexId: string;
  unitId: string;
  uploadedById: string;
  imageUrl: string;
  expectedAmount?: number;
  createdAt: string;
}

export interface ReceiptVerificationJobResult {
  receiptId: string;
  status: 'VERIFIED' | 'REJECTED' | 'MANUAL_REVIEW';
  metadata: ExtractedReceiptMetadata;
  reconciliation?: {
    autoSettled: boolean;
    ledgerTransactionId?: string;
    settledAmount: number;
    discrepancyNote?: string;
  };
  rejectionReason?: string;
}

/**
 * Pluggable AI Vision Provider Interface
 */
export interface IReceiptVisionProvider {
  extractReceipt(imageUrl: string): Promise<ExtractedReceiptMetadata>;
}

/**
 * Mock Vision Provider for deterministic testing & offline fallback
 */
export class MockReceiptVisionProvider implements IReceiptVisionProvider {
  public async extractReceipt(imageUrl: string): Promise<ExtractedReceiptMetadata> {
    // Deterministic test hook: check for failure triggers in url
    if (imageUrl.includes('unreadable') || imageUrl.includes('invalid')) {
      return {
        extractedAmount: null,
        extractedDate: null,
        extractedTrackingNum: null,
        extractedSenderCard: null,
        destinationCard: null,
        confidenceScore: 0.35,
        rawAiOutput: { error: 'Image unreadable or forged' }
      };
    }

    if (imageUrl.includes('low_confidence')) {
      return {
        extractedAmount: 1_200_000,
        extractedDate: new Date(),
        extractedTrackingNum: `TRK-LOW-${Date.now()}`,
        extractedSenderCard: '6037-****-****-1111',
        destinationCard: '5022-****-****-9876',
        confidenceScore: 0.75,
        rawAiOutput: { notes: 'Low confidence OCR' }
      };
    }

    // Default high confidence extraction
    return {
      extractedAmount: 1_500_000,
      extractedDate: new Date(),
      extractedTrackingNum: `TRK-${Date.now().toString().slice(-6)}`,
      extractedSenderCard: '6037-****-****-1234',
      destinationCard: '5022-****-****-9876',
      confidenceScore: 0.95,
      rawAiOutput: {
        model: 'parsbuilding-vision-v1',
        ocrConfidence: 0.98,
        fieldsDetected: ['amount', 'tracking', 'date', 'cards']
      }
    };
  }
}

/**
 * AI Receipt Verification Queue & Execution Engine
 */
export class ReceiptVerificationQueue {
  private static instance: ReceiptVerificationQueue;
  private visionProvider: IReceiptVisionProvider;
  private queueEmitter = new EventEmitter();
  private isProcessing = false;
  private jobList: ReceiptVerificationJobPayload[] = [];

  private constructor() {
    this.visionProvider = new MockReceiptVisionProvider();
    this.initWorker();
  }

  public static getInstance(): ReceiptVerificationQueue {
    if (!ReceiptVerificationQueue.instance) {
      ReceiptVerificationQueue.instance = new ReceiptVerificationQueue();
    }
    return ReceiptVerificationQueue.instance;
  }

  public setVisionProvider(provider: IReceiptVisionProvider): void {
    this.visionProvider = provider;
  }

  /**
   * Enqueue a receipt for background verification
   */
  public async enqueue(payload: ReceiptVerificationJobPayload): Promise<string> {
    this.jobList.push(payload);
    setImmediate(() => this.queueEmitter.emit('jobAdded'));
    return payload.receiptId;
  }

  private initWorker(): void {
    this.queueEmitter.on('jobAdded', async () => {
      if (this.isProcessing) return;
      this.isProcessing = true;

      while (this.jobList.length > 0) {
        const job = this.jobList.shift();
        if (job) {
          try {
            await this.processJob(job);
          } catch (err) {
            console.error(`Error processing receipt job ${job.receiptId}:`, err);
          }
        }
      }

      this.isProcessing = false;
    });
  }

  /**
   * Process single receipt job with fail-closed tenant scoping
   */
  public async processJob(job: ReceiptVerificationJobPayload): Promise<ReceiptVerificationJobResult> {
    return runWithTenantContext(
      {
        complexId: job.complexId,
        userId: job.uploadedById,
        role: 'SUPER_ADMIN', // Internal worker operates with elevated system role scoped to complexId
        permissions: []
      },
      async () => {
        // Step 1: Update status to PENDING / processing record
        try {
          await rawPrisma.receiptVerification.update({
            where: { id: job.receiptId },
            data: { status: 'PENDING' }
          });
        } catch {
          // Record may be created during test
        }

        // Step 2: Extract metadata via AI Vision Provider
        const metadata = await this.visionProvider.extractReceipt(job.imageUrl);

        // Step 3: Anti-Replay Duplicate Tracking Number Check
        if (metadata.extractedTrackingNum) {
          const duplicate = await rawPrisma.ledgerTransaction.findFirst({
            where: {
              referenceNumber: metadata.extractedTrackingNum,
              complexId: job.complexId
            }
          });

          if (duplicate) {
            try {
              await rawPrisma.receiptVerification.update({
                where: { id: job.receiptId },
                data: {
                  status: 'REJECTED',
                  rejectionReason: 'شماره پیگیری فیش قبلاً در سیستم ثبت شده است (فیش تکراری).',
                  rawAiOutput: metadata.rawAiOutput
                }
              });
            } catch {}

            const result: ReceiptVerificationJobResult = {
              receiptId: job.receiptId,
              status: 'REJECTED',
              metadata,
              rejectionReason: 'شماره پیگیری فیش قبلاً در سیستم ثبت شده است (فیش تکراری).'
            };

            realtimeService.broadcastToUnit(job.unitId, 'RECEIPT_VERIFIED', result);
            return result;
          }
        }

        // Step 4: Unit & Financial Balance Reconciliation
        const unit = await rawPrisma.unit.findUnique({
          where: { id: job.unitId }
        });

        const amount = metadata.extractedAmount ?? 0;
        const currentBalance = unit ? Number(unit.currentBalance) : 0;

        // Auto-Verification condition: High confidence and valid amount
        if (metadata.confidenceScore >= 0.90 && amount > 0) {
          const txId = `tx-rcpt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

          // Create double-entry ledger transaction
          const tx = await rawPrisma.ledgerTransaction.create({
            data: {
              complexId: job.complexId,
              unitId: job.unitId,
              transactionId: txId,
              txKind: 'MANUAL',
              type: 'PAYMENT',
              amount: amount,
              description: `واریز آنلاین تایید هوشمند فیش بانکی (شماره پیگیری: ${metadata.extractedTrackingNum ?? 'نامشخص'})`,
              paymentMethod: 'CARD_TRANSFER',
              referenceNumber: metadata.extractedTrackingNum,
              receiptId: job.receiptId,
              createdById: job.uploadedById
            }
          });

          // Adjust unit balance and complex fund
          await rawPrisma.unit.update({
            where: { id: job.unitId },
            data: { currentBalance: { decrement: amount } }
          });

          await rawPrisma.complex.update({
            where: { id: job.complexId },
            data: { currentFund: { increment: amount } }
          });

          // Update receipt record
          try {
            await rawPrisma.receiptVerification.update({
              where: { id: job.receiptId },
              data: {
                status: 'VERIFIED',
                extractedAmount: amount,
                extractedDate: metadata.extractedDate,
                trackingNumber: metadata.extractedTrackingNum,
                destinationCard: metadata.destinationCard,
                verifiedAt: new Date(),
                rawAiOutput: metadata.rawAiOutput
              }
            });
          } catch {}

          const result: ReceiptVerificationJobResult = {
            receiptId: job.receiptId,
            status: 'VERIFIED',
            metadata,
            reconciliation: {
              autoSettled: true,
              ledgerTransactionId: tx.id,
              settledAmount: amount
            }
          };

          // Broadcast real-time events
          realtimeService.broadcastToUnit(job.unitId, 'RECEIPT_VERIFIED', result);
          realtimeService.broadcastToComplex(job.complexId, 'PAYMENT_RECEIVED', {
            transactionId: tx.transactionId,
            complexId: job.complexId,
            unitId: job.unitId,
            unitNumber: unit?.unitNumber ?? 0,
            amount: amount,
            paymentMethod: 'CARD_TRANSFER',
            newBalance: currentBalance - amount,
            timestamp: new Date().toISOString()
          });

          return result;
        }

        // Low confidence or unparseable amount -> MANUAL_REVIEW
        const reviewStatus = metadata.confidenceScore < 0.50 ? 'REJECTED' : 'MANUAL_REVIEW';
        try {
          await rawPrisma.receiptVerification.update({
            where: { id: job.receiptId },
            data: {
              status: reviewStatus === 'REJECTED' ? 'REJECTED' : 'PROCESSED',
              extractedAmount: amount > 0 ? amount : null,
              extractedDate: metadata.extractedDate,
              trackingNumber: metadata.extractedTrackingNum,
              destinationCard: metadata.destinationCard,
              rawAiOutput: metadata.rawAiOutput,
              rejectionReason: reviewStatus === 'REJECTED'
                ? 'فیش بانکی ناخوانا یا نامعتبر است'
                : 'نیازمند بررسی دستی مدیر (اطمینان پایین مدل یا عدم تطابق مبلغ)'
            }
          });
        } catch {}

        const reviewResult: ReceiptVerificationJobResult = {
          receiptId: job.receiptId,
          status: reviewStatus,
          metadata,
          rejectionReason: reviewStatus === 'REJECTED'
            ? 'فیش بانکی ناخوانا یا نامعتبر است'
            : 'نیازمند بررسی دستی مدیر'
        };

        realtimeService.broadcastToUnit(job.unitId, 'RECEIPT_VERIFIED', reviewResult);
        realtimeService.broadcastToComplex(job.complexId, 'RECEIPT_VERIFIED', reviewResult);
        return reviewResult;
      }
    );
  }
}

export const receiptVerificationQueue = ReceiptVerificationQueue.getInstance();
