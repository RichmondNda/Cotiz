import { describe, expect, it } from 'vitest';
import { DeclarePaymentInput, Me, PaymentsQuery, SubscriberDashboard, UploadRequest } from '../index.js';

// Exemples tirés de docs/specs/seed-reference.yaml (Moussa : 395 000 F restants, 50 000 F en retard).

const xof = (amount: number) => ({ amount, currency: 'XOF' });
const uuid = (n: number) => `01928f3e-6a7b-7c3d-9e4f-${String(n).padStart(12, '0')}`;
const entraide = { id: uuid(10), name: 'Entraide Yopougon', logoFileId: null, suspended: false };
const centre = { id: uuid(20), name: 'Centre communautaire' };

describe('espace souscripteur', () => {
  it('me.dash : tableau de bord de Moussa', () => {
    const dashboard = {
      remainingTotal: xof(395000),
      projectsCount: 3,
      associationsCount: 2,
      late: { count: 2, amount: xof(50000) },
      nextDue: { project: centre, association: entraide, dueDate: '2026-10-05', amount: xof(25000) },
      contractsToSign: [{ project: { id: uuid(21), name: 'Voyage solidaire' }, association: entraide }],
      projects: [
        {
          enrollmentId: uuid(30),
          project: { ...centre, status: 'active' },
          association: entraide,
          standing: 'late',
          paid: xof(125000),
          remaining: xof(325000),
          commitment: xof(500000),
          progress: 0.25,
          late: { count: 2, amount: xof(50000), since: '2026-08-11' },
          nextDue: { dueDate: '2026-10-05', amount: xof(25000) },
        },
      ],
      recentPayments: [],
    };
    expect(SubscriberDashboard.parse(dashboard)).toEqual(dashboard);
  });

  it('me.declare : preuve (fichier) ou référence de transaction obligatoire', () => {
    const base = {
      projectId: centre.id,
      amount: xof(75000),
      paidOn: '2026-09-10',
      paymentMethodId: uuid(9),
      allocations: [
        { installmentId: uuid(106), amount: xof(25000) },
        { installmentId: uuid(107), amount: xof(25000) },
        { installmentId: uuid(108), amount: xof(25000) },
      ],
    };
    expect(DeclarePaymentInput.safeParse({ ...base, proofFileId: uuid(77) }).success).toBe(true);
    expect(DeclarePaymentInput.safeParse({ ...base, transactionReference: 'OM-2026-0910-4471' }).success).toBe(true);
    const sansPreuve = DeclarePaymentInput.safeParse(base);
    expect(sansPreuve.success).toBe(false);
    expect(sansPreuve.error?.issues[0]?.message).toBe('proof_required');
    expect(DeclarePaymentInput.safeParse({ ...base, proofFileId: uuid(77), allocations: [] }).success).toBe(false);
  });

  it('me : permissions et fonctionnalités limitées aux catalogues', () => {
    const moi = {
      user: {
        id: uuid(1),
        firstName: 'Moussa',
        lastName: 'Diarra',
        email: null,
        phone: '+2250544218790',
        locale: 'fr-CI',
      },
      space: 'subscriber',
      currentAssociationId: null,
      memberships: [
        { association: { ...entraide, slug: 'entraide-yopougon', status: 'active' }, role: 'subscriber', title: null },
      ],
      platformRole: null,
      permissions: ['subscriber.self', 'authenticated'],
      features: ['payments', 'activation_codes'],
    };
    expect(Me.safeParse(moi).success).toBe(true);
    expect(Me.safeParse({ ...moi, features: ['teleportation'] }).success).toBe(false);
    expect(Me.safeParse({ ...moi, permissions: ['payments.everything'] }).success).toBe(false);
  });

  it('fl.upload : preuve de paiement déclarée par son type et sa taille', () => {
    expect(
      UploadRequest.safeParse({
        purpose: 'payment_proof',
        fileName: 'recu.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 182000,
      }).success,
    ).toBe(true);
    expect(
      UploadRequest.safeParse({ purpose: 'selfie', fileName: 'x', mimeType: 'image/jpeg', sizeBytes: 1 }).success,
    ).toBe(false);
  });

  it('les requêtes de liste refusent un `limit` hors bornes', () => {
    expect(PaymentsQuery.safeParse({ limit: '500' }).success).toBe(false);
  });
});
