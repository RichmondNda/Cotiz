import { describe, expect, it } from 'vitest';
import {
  ActivateRequest,
  AssociationRequestInput,
  Handoff,
  LoginRequest,
  LoginResponse,
  PublicPlanList,
  RequestApproved,
} from '../index.js';

// Exemples tirés de docs/specs/seed-reference.yaml et des fiches écran (docs/ui/public.md, super-admin.md).

const xof = (amount: number) => ({ amount, currency: 'XOF' });
const plan = (code: string, name: string, priceMonthly: number, limits: [number | null, number, number]) => ({
  id: `01928f3e-6a7b-7c3d-9e4f-${String(code.length).padStart(12, '0')}`,
  code,
  name,
  description: null,
  priceMonthly: xof(priceMonthly),
  priceYearly: xof(priceMonthly * 10),
  limits: { projects: limits[0], subscribers: limits[1], managers: limits[2] },
  features: code === 'pro' ? ['imports', 'auto_reminders', 'contracts'] : [],
  isFeatured: code === 'essentiel',
});

describe('espace public et authentification', () => {
  it('pub.plans : les trois plans de référence, Pro sans limite de projets', () => {
    const body = {
      items: [
        plan('decouverte', 'Découverte', 0, [1, 20, 1]),
        plan('essentiel', 'Essentiel', 10000, [5, 100, 2]),
        plan('pro', 'Pro', 25000, [null, 500, 5]),
      ],
    };
    expect(PublicPlanList.parse(body)).toEqual(body);
  });

  it('pub.request : demande d’Entraide Yopougon, champ piège vide', () => {
    const demande = {
      association: {
        name: 'Entraide Yopougon',
        type: 'association',
        city: 'Abidjan',
        country: "Côte d'Ivoire",
        activityDescription: 'Entraide entre familles du quartier.',
      },
      contact: {
        firstName: 'Awa',
        lastName: 'Koné',
        title: 'Trésorière',
        email: 'awa.kone@entraide-yopougon.ci',
        phone: '+2250708091011',
      },
      needs: { estimatedSubscribers: '51_200', desiredPlanId: null },
      termsAccepted: true,
      website: '',
      altcha: 'eyJhbGdvcml0aG0iOiJTSEEtMjU2In0=',
    };
    expect(AssociationRequestInput.safeParse(demande).success).toBe(true);
    expect(AssociationRequestInput.safeParse({ ...demande, website: 'https://spam.example' }).success).toBe(false);
    expect(AssociationRequestInput.safeParse({ ...demande, termsAccepted: false }).success).toBe(false);
    expect(
      AssociationRequestInput.safeParse({
        ...demande,
        association: { ...demande.association, activityDescription: 'x'.repeat(501) },
      }).success,
    ).toBe(false);
  });

  it('auth.login : souscripteur par téléphone E.164, gestionnaire par email', () => {
    expect(LoginRequest.parse({ space: 'subscriber', identifier: '+2250544218790', password: 'secret' })).toEqual({
      space: 'subscriber',
      identifier: '+2250544218790',
      password: 'secret',
      rememberMe: false,
    });
    expect(
      LoginRequest.safeParse({ space: 'association', identifier: 'awa.kone@entraide-yopougon.ci', password: 'x' })
        .success,
    ).toBe(true);
    expect(LoginRequest.safeParse({ space: 'subscriber', identifier: '05 44 21 87 90', password: 'x' }).success).toBe(
      false,
    );
    expect(LoginResponse.parse({ status: 'mfa_required', mfaToken: 't', expiresAt: '2026-09-29T10:05:00Z' })).toEqual({
      status: 'mfa_required',
      mfaToken: 't',
      expiresAt: '2026-09-29T10:05:00Z',
    });
  });

  it('auth.activate : code K7M4-P9QX, avec ou sans tiret ; caractères ambigus refusés', () => {
    const base = { space: 'subscriber', identifier: '+2250544218790', newPassword: 'motdepasse-solide' };
    expect(ActivateRequest.safeParse({ ...base, code: 'K7M4-P9QX' }).success).toBe(true);
    expect(ActivateRequest.safeParse({ ...base, code: 'k7m4p9qx' }).success).toBe(true);
    expect(ActivateRequest.safeParse({ ...base, code: 'K7M4-P9Q0' }).success).toBe(false);
    expect(ActivateRequest.safeParse({ ...base, code: 'K7M4-P9QI' }).success).toBe(false);
  });
});

describe('espace plateforme', () => {
  const handoff = {
    code: 'K7M4-P9QX',
    expiresAt: '2026-10-02T14:00:00Z',
    recipient: {
      id: '01928f3e-6a7b-7c3d-9e4f-123456789abc',
      firstName: 'Awa',
      lastName: 'Koné',
      phone: '+2250708091011',
      email: 'awa.kone@entraide-yopougon.ci',
    },
    message: 'Bonjour Awa, votre espace Entraide Yopougon est prêt…',
    activationUrl: 'https://app.cotiz.app/activer?t=awa.kone%40entraide-yopougon.ci',
    whatsappUrl: 'https://wa.me/2250708091011?text=Bonjour',
    smsUrl: null,
    mailtoUrl: 'mailto:awa.kone@entraide-yopougon.ci?subject=Cotiz',
  };

  it('handoff de l’approbation : code, message prêt, liens WhatsApp et mailto', () => {
    expect(Handoff.parse(handoff)).toEqual(handoff);
    expect(Handoff.safeParse({ ...handoff, smsUrl: 'https://example.org' }).success).toBe(false);
  });

  it('pf.req.approve : la réponse porte l’association créée et le handoff', () => {
    const shape = RequestApproved.shape;
    expect(Object.keys(shape).sort()).toEqual(['associationId', 'handoff', 'request']);
  });
});
