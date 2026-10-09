import { describe, expect, it } from 'vitest';
import { auditDiff, MASKED, maskPhone } from './audit-diff.js';

describe('auditDiff : avant/après limités aux champs modifiés', () => {
  it('modification : seulement les champs qui changent, des deux côtés', () => {
    expect(
      auditDiff(
        { name: 'Entraide', status: 'active', city: 'Abidjan', version: 3 },
        { name: 'Entraide', status: 'suspended', city: 'Abidjan', version: 4 },
      ),
    ).toEqual({ before: { status: 'active', version: 3 }, after: { status: 'suspended', version: 4 } });
  });

  it('un champ ajouté ou retiré compte comme modifié (null de l’autre côté)', () => {
    expect(auditDiff({ a: 1 }, { b: 2 })).toEqual({ before: { a: 1, b: null }, after: { a: null, b: 2 } });
  });

  it('compare les valeurs imbriquées par contenu, sans tenir compte de l’ordre des clés', () => {
    expect(auditDiff({ m: { amount: 25000, currency: 'XOF' } }, { m: { currency: 'XOF', amount: 25000 } })).toEqual({
      before: {},
      after: {},
    });
    expect(auditDiff({ tags: ['a', 'b'] }, { tags: ['b', 'a'] })).toEqual({
      before: { tags: ['a', 'b'] },
      after: { tags: ['b', 'a'] },
    });
  });

  it('création : tout l’après, pas d’avant ; annulation : tout l’avant, pas d’après', () => {
    expect(auditDiff(null, { name: 'Projet', amount: 5000 })).toEqual({
      before: null,
      after: { name: 'Projet', amount: 5000 },
    });
    expect(auditDiff({ name: 'Projet' }, null)).toEqual({ before: { name: 'Projet' }, after: null });
  });

  it('consultation : ni avant ni après', () => {
    expect(auditDiff(null, null)).toEqual({ before: null, after: null });
  });

  it.each([
    'password',
    'passwordHash',
    'secret',
    'totpSecret',
    'token',
    'refreshToken',
    'code',
    'codeHash',
    'codeEncrypted',
    'otp',
    'pin',
    'apiKey',
    'keyHash',
    'activationCode',
    'otpCode',
    'pinCode',
    'resetCode',
    'pin_code',
    'api_key',
    'privateKey',
    'secretKey',
    'encryptionKey',
    'signingKey',
    'accessKey',
  ])('masque le champ secret %s, même modifié', (field) => {
    expect(auditDiff({ [field]: 'ancien' }, { [field]: 'nouveau' })).toEqual({
      before: { [field]: MASKED },
      after: { [field]: MASKED },
    });
    expect(auditDiff(null, { [field]: 'valeur' })).toEqual({ before: null, after: { [field]: MASKED } });
  });

  it.each([
    'reasonCode',
    'rejectionReasonCode',
    'postalCode',
    'currencyCode',
    'countryCode',
    'lastStatusCode',
    'idempotencyKey',
    'dedupeKey',
    'objectKey',
    'tokenCount',
    'pinned',
  ])('ne masque pas %s', (field) => {
    expect(auditDiff(null, { [field]: 'x' })).toEqual({ before: null, after: { [field]: 'x' } });
  });

  it('masque aussi dans les objets imbriqués', () => {
    expect(auditDiff(null, { credentials: { password: 'x', email: 'a@b.c' } })).toEqual({
      before: null,
      after: { credentials: { password: MASKED, email: 'a@b.c' } },
    });
  });

  it('compare et enregistre les dates (Date) par leur instant', () => {
    const jan = new Date('2026-01-01T00:00:00.000Z');
    const feb = new Date('2026-02-01T00:00:00.000Z');
    expect(auditDiff({ dueAt: jan }, { dueAt: feb })).toEqual({
      before: { dueAt: '2026-01-01T00:00:00.000Z' },
      after: { dueAt: '2026-02-01T00:00:00.000Z' },
    });
    expect(auditDiff({ dueAt: jan }, { dueAt: new Date(jan) })).toEqual({ before: {}, after: {} });
    expect(auditDiff(null, { dueAt: jan })).toEqual({ before: null, after: { dueAt: '2026-01-01T00:00:00.000Z' } });
  });

  it('accepte les montants bigint : nombre s’ils sont sûrs, chaîne sinon', () => {
    expect(auditDiff({ amount: 25000n }, { amount: 50000n })).toEqual({
      before: { amount: 25000 },
      after: { amount: 50000 },
    });
    expect(auditDiff(null, { amount: 2n ** 60n })).toEqual({ before: null, after: { amount: '1152921504606846976' } });
    expect(auditDiff({ amount: 25000n }, { amount: 25000n })).toEqual({ before: {}, after: {} });
  });

  it('masque partiellement les téléphones, avant comme après (architecture/13)', () => {
    expect(auditDiff({ phoneE164: '+2250708091011' }, { phoneE164: '+2250512345611' })).toEqual({
      before: { phoneE164: '+225 07 •• •• •• 11' },
      after: { phoneE164: '+225 05 •• •• •• 11' },
    });
    expect(auditDiff(null, { contactPhone: '+2250708091011', contact_phone: '+2250708091011' })).toEqual({
      before: null,
      after: { contactPhone: '+225 07 •• •• •• 11', contact_phone: '+225 07 •• •• •• 11' },
    });
  });

  it('le numéro d’encaissement d’un moyen de paiement (public) reste lisible', () => {
    expect(auditDiff(null, { details: { operator: 'orange', number: '+2250708091011' } })).toEqual({
      before: null,
      after: { details: { operator: 'orange', number: '+2250708091011' } },
    });
  });
});

describe('maskPhone', () => {
  it.each([
    ['+2250708091011', '+225 07 •• •• •• 11'],
    ['+33612345678', '+33•••••••78'],
    ['0708091011', '••••••••11'],
    ['12', '••'],
    ['', ''],
  ])('%s → %s', (phone, masked) => {
    expect(maskPhone(phone)).toBe(masked);
  });

  it('une valeur qui n’est pas une chaîne est masquée entièrement', () => {
    expect(maskPhone(708091011)).toBe(MASKED);
    expect(maskPhone(null)).toBeNull();
  });
});
