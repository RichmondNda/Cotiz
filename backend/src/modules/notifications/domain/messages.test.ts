import { Money } from '@cotiz/domain';
import { describe, expect, it } from 'vitest';
import {
  installmentDueSoonMessage,
  managersDigestMessage,
  associationRequestSubmittedMessage,
  memberEnrolledMessage,
  passwordResetRequestedMessage,
  paymentDeclaredMessage,
  paymentRejectedMessage,
  paymentRevertedMessage,
  paymentsDigestMessage,
  paymentValidatedMessage,
  userActivatedMessage,
} from './messages.js';

const P = '00000000-0000-7000-8000-00000000c301';
const PAY = '00000000-0000-7000-8000-0000000f0001';
const U = '00000000-0000-7000-8000-0000000a0001';
/** U+202F (milliers) et U+00A0 (avant le symbole) : docs/specs/test-vectors/money.json. */
const THIN = String.fromCharCode(0x202f);
const NBSP = String.fromCharCode(0xa0);
const facts = { paymentId: PAY, projectId: P, projectName: 'Centre communautaire', amount: Money.of(25_000, 'XOF') };

describe('textes des notifications', () => {
  it('paiement validé : montant formaté (U+202F), lien du projet (architecture/07)', () => {
    expect(paymentValidatedMessage(facts)).toEqual({
      type: 'payment.validated',
      title: 'Paiement validé',
      body: `Vos 25${THIN}000${NBSP}F pour Centre communautaire ont été validés.`,
      actionUrl: `/projets/${P}`,
      data: { actionLabel: 'Voir le projet', paymentId: PAY, projectId: P },
    });
  });

  it('rejet et annulation : montant déclaré formaté, souscripteur renvoyé au projet', () => {
    expect(paymentRejectedMessage(facts)).toMatchObject({
      type: 'payment.rejected',
      body: `Votre déclaration de 25${THIN}000${NBSP}F pour Centre communautaire a été rejetée. Le motif est indiqué sur le projet.`,
      actionUrl: `/projets/${P}`,
    });
    expect(paymentRevertedMessage(facts)).toMatchObject({
      type: 'payment.reverted',
      body: `Votre déclaration de 25${THIN}000${NBSP}F pour Centre communautaire est de nouveau en attente : sa validation a été annulée.`,
      actionUrl: `/projets/${P}`,
    });
  });

  it('devise de la ligne, jamais supposée : GNF → FG', () => {
    expect(paymentValidatedMessage({ ...facts, amount: Money.of(150_000, 'GNF') }).body).toBe(
      `Vos 150${THIN}000${NBSP}FG pour Centre communautaire ont été validés.`,
    );
  });

  it('déclaration : gestionnaires renvoyés au paiement ; récapitulatif vers la file', () => {
    expect(paymentDeclaredMessage({ ...facts, subscriberName: 'Moussa Diarra' })).toMatchObject({
      body: `Moussa Diarra a déclaré 25${THIN}000${NBSP}F pour Centre communautaire.`,
      actionUrl: `/asso/paiements/${PAY}`,
    });
    expect(paymentsDigestMessage({ pendingCount: 7 })).toMatchObject({
      type: 'payment.declared',
      title: '7 paiements à valider',
      actionUrl: '/asso/paiements',
      data: { digest: true },
    });
    expect(paymentsDigestMessage({ pendingCount: 0 }).title).toBe('1 paiement à valider');
  });

  it('inscription, activation, réinitialisation, demande : liens d’architecture/07', () => {
    expect(memberEnrolledMessage({ associationName: 'Entraide', projectId: P, projectName: 'X' }).actionUrl).toBe(
      `/projets/${P}`,
    );
    expect(userActivatedMessage({ userId: U, name: 'Kofi Annan' }).actionUrl).toBe(`/asso/souscripteurs/${U}`);
    expect(passwordResetRequestedMessage({ audience: 'manager', name: 'Kofi Annan' }).actionUrl).toBe(
      '/asso/souscripteurs/reinitialisations',
    );
    expect(passwordResetRequestedMessage({ audience: 'platform' }).actionUrl).toBe('/plateforme/reinitialisations');
    expect(
      associationRequestSubmittedMessage({ requestId: PAY, reference: 'REQ-1', associationName: 'Entraide' }).actionUrl,
    ).toBe(`/plateforme/demandes/${PAY}`);
  });

  it('échéance dans 3 jours : date en toutes lettres, reste dû, lien de déclaration du projet', () => {
    const m = installmentDueSoonMessage({
      projectId: P,
      projectName: 'Centre communautaire',
      dueDate: '2026-10-05',
      remaining: Money.of(25_000, 'XOF'),
    });
    expect(m).toEqual({
      type: 'installment.due_soon',
      title: 'Échéance dans 3 jours',
      body: `Prochaine échéance le 5 octobre : 25${THIN}000${NBSP}F pour Centre communautaire.`,
      actionUrl: `/paiements/declarer?projet=${P}`,
      data: { actionLabel: 'Déclarer un paiement', projectId: P },
    });
    expect(
      installmentDueSoonMessage({
        projectId: P,
        projectName: 'X',
        dueDate: '2027-01-01',
        remaining: Money.of(500, 'GNF'),
      }).body,
    ).toBe(`Prochaine échéance le 1er janvier : 500${NBSP}FG pour X.`);
  });

  it('récapitulatif du jour : rubriques non nulles seulement, accords, lien du tableau de bord ; rien → aucun', () => {
    expect(managersDigestMessage({ pendingPayments: 6, newLateSubscribers: 2, codesToHand: 1 })).toEqual({
      type: 'digest.daily',
      title: 'Récapitulatif du jour',
      body: '6 paiements à valider · 2 souscripteurs passés en retard · 1 code d’activation à remettre.',
      actionUrl: '/asso',
      data: { actionLabel: 'Ouvrir le tableau de bord', digest: true },
    });
    expect(managersDigestMessage({ pendingPayments: 1, newLateSubscribers: 0, codesToHand: 3 })?.body).toBe(
      '1 paiement à valider · 3 codes d’activation à remettre.',
    );
    expect(managersDigestMessage({ pendingPayments: 0, newLateSubscribers: 1, codesToHand: 0 })?.body).toBe(
      '1 souscripteur passé en retard.',
    );
    expect(managersDigestMessage({ pendingPayments: 0, newLateSubscribers: 0, codesToHand: 0 })).toBeNull();
  });

  it('aucun mot interdit à l’écran (payer, approuver, encaisser, facture, adhérent, mensualité)', () => {
    const all = [
      paymentValidatedMessage(facts),
      paymentRejectedMessage(facts),
      paymentRevertedMessage(facts),
      paymentDeclaredMessage({ ...facts, subscriberName: 'Moussa Diarra' }),
      paymentsDigestMessage({ pendingCount: 3 }),
      memberEnrolledMessage({ associationName: 'Entraide', projectId: P, projectName: 'X' }),
      userActivatedMessage({ userId: U, name: 'Kofi Annan' }),
      passwordResetRequestedMessage({ audience: 'manager', name: 'Kofi Annan' }),
      passwordResetRequestedMessage({ audience: 'platform' }),
      associationRequestSubmittedMessage({ requestId: PAY, reference: 'REQ-1', associationName: 'Entraide' }),
      installmentDueSoonMessage({
        projectId: P,
        projectName: 'X',
        dueDate: '2026-10-05',
        remaining: Money.of(1, 'XOF'),
      }),
      managersDigestMessage({ pendingPayments: 6, newLateSubscribers: 2, codesToHand: 1 }),
    ].filter((m) => m !== null);
    expect(all).toHaveLength(12);
    for (const m of all) {
      // Liste blanche de `data` : jamais de code, de téléphone, de preuve ni de commentaire.
      for (const key of Object.keys(m.data ?? {})) {
        expect(['actionLabel', 'paymentId', 'projectId', 'userId', 'requestId', 'digest']).toContain(key);
      }
      const text = `${m.title} ${m.body} ${typeof m.data?.actionLabel === 'string' ? m.data.actionLabel : ''}`;
      expect(text).not.toMatch(/\b(pay(er|é|ée|és|ez|ons)|approuv|encaiss|factur|adhérent|mensualit|campagne|client)/i);
    }
  });
});
