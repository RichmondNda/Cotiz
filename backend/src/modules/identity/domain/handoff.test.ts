import { Handoff } from '@cotiz/contracts';
import { describe, expect, it } from 'vitest';
import { buildHandoff } from './handoff.js';

const moussa = {
  id: '00000000-0000-7000-8000-000000000002',
  firstName: 'Moussa',
  lastName: 'Traoré',
  phone: '+2250544218790',
  email: null,
};
const awa = {
  id: '00000000-0000-7000-8000-000000000001',
  firstName: 'Awa',
  lastName: 'Koné',
  phone: null,
  email: 'awa.kone@entraide-yopougon.ci',
};
const base = 'https://app.cotiz.app';
const expiresAt = new Date('2026-10-02T14:00:00Z');

describe('buildHandoff (message prêt à transmettre)', () => {
  it('activation d’un souscripteur : message, liens WhatsApp et SMS, lien d’activation sans le code', () => {
    const handoff = Handoff.parse(
      buildHandoff({
        purpose: 'activation',
        space: 'subscriber',
        code: 'K7M4-P9QX',
        expiresAt,
        recipient: moussa,
        appUrl: base,
      }),
    );
    expect(handoff.code).toBe('K7M4-P9QX');
    expect(handoff.expiresAt).toBe('2026-10-02T14:00:00.000Z');
    expect(handoff.message).toContain('Bonjour Moussa');
    expect(handoff.message).toContain('K7M4-P9QX');
    expect(handoff.message).toContain('2 octobre');
    expect(handoff.activationUrl).toBe('https://app.cotiz.app/activer?t=%2B2250544218790');
    expect(handoff.activationUrl).not.toMatch(/K7M4|P9QX/);
    expect(handoff.whatsappUrl).toBe(`https://wa.me/2250544218790?text=${encodeURIComponent(handoff.message)}`);
    expect(handoff.smsUrl).toBe(`sms:+2250544218790?body=${encodeURIComponent(handoff.message)}`);
    expect(handoff.mailtoUrl).toBeNull();
  });

  it('gestionnaire sans téléphone : mailto seulement, lien d’activation sans l’email', () => {
    const handoff = Handoff.parse(
      buildHandoff({
        purpose: 'activation',
        space: 'association',
        code: 'K7M4-P9QX',
        expiresAt,
        recipient: awa,
        appUrl: base,
      }),
    );
    expect(handoff.whatsappUrl).toBeNull();
    expect(handoff.smsUrl).toBeNull();
    expect(handoff.mailtoUrl).toMatch(/^mailto:awa\.kone@entraide-yopougon\.ci\?subject=/);
    expect(decodeURIComponent(handoff.mailtoUrl ?? '')).toContain(handoff.message);
    // Vue d'activation de l'espace association (identifiant : email), pas celle du souscripteur (téléphone).
    expect(handoff.activationUrl).toBe('https://app.cotiz.app/activer?espace=association');
  });

  it('gestionnaire avec téléphone : vue association, ni téléphone ni email dans le lien', () => {
    const handoff = buildHandoff({
      purpose: 'activation',
      space: 'association',
      code: 'K7M4-P9QX',
      expiresAt,
      recipient: { ...awa, phone: '+2250707070707' },
      appUrl: base,
    });
    expect(handoff.activationUrl).toBe('https://app.cotiz.app/activer?espace=association');
    expect(handoff.message).toContain('https://app.cotiz.app/activer?espace=association');
    expect(handoff.whatsappUrl).toMatch(/^https:\/\/wa\.me\/2250707070707\?text=/);
  });

  it('personnel de la plateforme : vue plateforme', () => {
    const handoff = buildHandoff({
      purpose: 'activation',
      space: 'platform',
      code: 'K7M4-P9QX',
      expiresAt,
      recipient: awa,
      appUrl: base,
    });
    expect(handoff.activationUrl).toBe('https://app.cotiz.app/activer?espace=plateforme');
  });

  it('réinitialisation : 6 chiffres, durée en minutes, aucun lien d’activation', () => {
    const handoff = Handoff.parse(
      buildHandoff({
        purpose: 'password_reset',
        space: 'subscriber',
        code: '048213',
        expiresAt: new Date('2026-10-02T14:15:00Z'),
        recipient: moussa,
        appUrl: base,
      }),
    );
    expect(handoff.message).toContain('048213');
    expect(handoff.message).toContain('15 minutes');
    expect(handoff.activationUrl).toBeNull();
  });

  it('message personnel du gestionnaire ajouté à la fin', () => {
    const handoff = buildHandoff({
      purpose: 'activation',
      space: 'subscriber',
      code: 'K7M4-P9QX',
      expiresAt,
      recipient: moussa,
      appUrl: base,
      personalMessage: 'À dimanche à la réunion.',
    });
    expect(handoff.message.endsWith('À dimanche à la réunion.')).toBe(true);
  });
});
