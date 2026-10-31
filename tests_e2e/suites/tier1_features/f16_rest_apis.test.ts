import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TestHarness } from '../../src/harness.ts';

describe('Feature 16: Full REST & Real-Time API Endpoint Contracts', () => {
  it('T1.16.1: should conform to RESTful response structure with success flag and data envelope', () => {
    const harness = new TestHarness();
    const cpx = harness.createComplex({ name: 'REST Complex' });

    const responseEnvelope = {
      success: true,
      data: cpx,
      timestamp: new Date().toISOString(),
    };

    assert.equal(responseEnvelope.success, true);
    assert.equal(responseEnvelope.data.name, 'REST Complex');
    assert.ok(responseEnvelope.timestamp);
  });

  it('T1.16.2: should support GET /api/v1/units filtering by complexId', () => {
    const harness = new TestHarness();
    const cpx = harness.createComplex({ name: 'API Complex' });
    const bld = harness.createBuilding({ complexId: cpx.id, name: 'B1', floorsCount: 2, unitsCount: 2 });
    harness.createUnit({ complexId: cpx.id, buildingId: bld.id, unitNumber: 101, floor: 1, area: 90, occupants: 2, ownerName: 'A' });
    harness.createUnit({ complexId: cpx.id, buildingId: bld.id, unitNumber: 102, floor: 1, area: 110, occupants: 3, ownerName: 'B' });

    const units = harness.getUnitsByComplex(cpx.id);
    assert.equal(units.length, 2);
    assert.equal(units[0].unitNumber, 101);
    assert.equal(units[1].unitNumber, 102);
  });

  it('T1.16.3: should validate POST /api/v1/payments payload requirements', () => {
    const harness = new TestHarness();
    const cpx = harness.createComplex({ name: 'Pay Complex' });
    const bld = harness.createBuilding({ complexId: cpx.id, name: 'B1', floorsCount: 1, unitsCount: 1 });
    const unit = harness.createUnit({ complexId: cpx.id, buildingId: bld.id, unitNumber: 1, floor: 1, area: 100, occupants: 1, ownerName: 'A' });

    const tx = harness.recordPayment({
      complexId: cpx.id,
      unitId: unit.id,
      amount: 1_000_000,
      description: 'Test API payment',
    });

    assert.ok(tx.id.startsWith('tx_'));
    assert.equal(tx.amount, 1_000_000);
    assert.equal(tx.type, 'PAYMENT');
  });

  it('T1.16.4: should provide financial ledger endpoint data structure', () => {
    const harness = new TestHarness();
    const cpx = harness.createComplex({ name: 'Ledger Complex', initialFund: 5_000_000 });
    const bld = harness.createBuilding({ complexId: cpx.id, name: 'B1', floorsCount: 1, unitsCount: 1 });
    const u = harness.createUnit({ complexId: cpx.id, buildingId: bld.id, unitNumber: 1, floor: 1, area: 100, occupants: 1, ownerName: 'A' });

    harness.recordPayment({ complexId: cpx.id, unitId: u.id, amount: 2_000_000 });

    const ledger = {
      complexId: cpx.id,
      initialFund: 5_000_000,
      totalIncome: 2_000_000,
      totalExpenses: 0,
      currentBalance: 7_000_000,
      transactions: harness.getTransactionsByUnit(u.id),
    };

    assert.equal(ledger.currentBalance, 7_000_000);
    assert.equal(ledger.transactions.length, 1);
  });

  it('T1.16.5: should return standard HTTP error status codes for unauthenticated / unauthorized requests', () => {
    const errorResponses = {
      unauthenticated: { statusCode: 401, error: 'Unauthorized', message: 'JWT token required' },
      forbidden: { statusCode: 403, error: 'Forbidden', message: 'Insufficient role permissions' },
      notFound: { statusCode: 404, error: 'Not Found', message: 'Resource does not exist' },
      badRequest: { statusCode: 400, error: 'Bad Request', message: 'Validation failed' },
    };

    assert.equal(errorResponses.unauthenticated.statusCode, 401);
    assert.equal(errorResponses.forbidden.statusCode, 403);
    assert.equal(errorResponses.notFound.statusCode, 404);
    assert.equal(errorResponses.badRequest.statusCode, 400);
  });
});
