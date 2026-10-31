import { describe, it, expect, vi } from 'vitest';
import {
  ReceiptVerificationQueue,
  MockReceiptVisionProvider,
  receiptVerificationQueue
} from '../src/services/receiptQueue';
import { rawPrisma } from '../src/config/database';

describe('AI Receipt Verification Queue & Auto-Reconciliation', () => {
  it('should extract structured payment metadata with mock vision provider', async () => {
    const provider = new MockReceiptVisionProvider();
    const metadata = await provider.extractReceipt('https://storage.parsbuilding.ir/receipts/rec_1.jpg');

    expect(metadata.extractedAmount).toBe(1_500_000);
    expect(metadata.confidenceScore).toBe(0.95);
    expect(metadata.extractedTrackingNum).toBeDefined();
    expect(metadata.destinationCard).toBe('5022-****-****-9876');
  });

  it('should auto-verify high-confidence receipts and reconcile double-entry ledger', async () => {
    const complexId = 'cpx-receipt-1';
    const unitId = 'unit-101';
    const receiptId = 'rcpt-101';
    const userId = 'resident-1';

    // Mock DB queries
    vi.spyOn(rawPrisma.receiptVerification, 'update').mockResolvedValue({} as any);
    vi.spyOn(rawPrisma.ledgerTransaction, 'findFirst').mockResolvedValue(null); // No duplicate
    vi.spyOn(rawPrisma.unit, 'findUnique').mockResolvedValue({
      id: unitId,
      unitNumber: 101,
      currentBalance: 1_500_000
    } as any);

    const txCreateSpy = vi.spyOn(rawPrisma.ledgerTransaction, 'create').mockResolvedValue({
      id: 'tx-new-1',
      transactionId: 'tx-rcpt-123',
      amount: 1_500_000
    } as any);

    const unitUpdateSpy = vi.spyOn(rawPrisma.unit, 'update').mockResolvedValue({} as any);
    const complexUpdateSpy = vi.spyOn(rawPrisma.complex, 'update').mockResolvedValue({} as any);

    const queue = ReceiptVerificationQueue.getInstance();
    const result = await queue.processJob({
      receiptId,
      complexId,
      unitId,
      uploadedById: userId,
      imageUrl: 'https://storage.parsbuilding.ir/receipts/valid.jpg',
      createdAt: new Date().toISOString()
    });

    expect(result.status).toBe('VERIFIED');
    expect(result.reconciliation?.autoSettled).toBe(true);
    expect(txCreateSpy).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        complexId,
        unitId,
        amount: 1_500_000,
        type: 'PAYMENT'
      })
    }));

    // Unit balance decremented by 1,500,000
    expect(unitUpdateSpy).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: unitId },
      data: { currentBalance: { decrement: 1_500_000 } }
    }));

    // Complex liquid fund incremented by 1,500,000
    expect(complexUpdateSpy).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: complexId },
      data: { currentFund: { increment: 1_500_000 } }
    }));
  });

  it('should detect duplicate tracking numbers and reject the receipt (Anti-Replay)', async () => {
    vi.spyOn(rawPrisma.receiptVerification, 'update').mockResolvedValue({} as any);
    // Simulate duplicate tracking number already recorded in DB
    vi.spyOn(rawPrisma.ledgerTransaction, 'findFirst').mockResolvedValue({
      id: 'existing-tx-id',
      referenceNumber: 'TRK-DUPLICATE'
    } as any);

    const queue = ReceiptVerificationQueue.getInstance();
    queue.setVisionProvider({
      extractReceipt: async () => ({
        extractedAmount: 2_000_000,
        extractedDate: new Date(),
        extractedTrackingNum: 'TRK-DUPLICATE',
        extractedSenderCard: null,
        destinationCard: null,
        confidenceScore: 0.98,
        rawAiOutput: {}
      })
    });

    const result = await queue.processJob({
      receiptId: 'rcpt-dup',
      complexId: 'cpx-1',
      unitId: 'unit-1',
      uploadedById: 'user-1',
      imageUrl: 'https://storage/dup.jpg',
      createdAt: new Date().toISOString()
    });

    expect(result.status).toBe('REJECTED');
    expect(result.rejectionReason).toContain('تکراری');
  });

  it('should route ambiguous or low-confidence receipts to MANUAL_REVIEW', async () => {
    vi.spyOn(rawPrisma.receiptVerification, 'update').mockResolvedValue({} as any);
    vi.spyOn(rawPrisma.ledgerTransaction, 'findFirst').mockResolvedValue(null);
    vi.spyOn(rawPrisma.unit, 'findUnique').mockResolvedValue({ id: 'u1', currentBalance: 1_000_000 } as any);

    const queue = ReceiptVerificationQueue.getInstance();
    queue.setVisionProvider(new MockReceiptVisionProvider());

    const result = await queue.processJob({
      receiptId: 'rcpt-low',
      complexId: 'cpx-1',
      unitId: 'u1',
      uploadedById: 'user-1',
      imageUrl: 'https://storage/low_confidence.jpg',
      createdAt: new Date().toISOString()
    });

    expect(result.status).toBe('MANUAL_REVIEW');
  });
});
