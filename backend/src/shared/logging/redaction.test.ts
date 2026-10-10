import { describe, expect, it } from 'vitest';
import { MASKED, maskPhones, redact, serializeError } from './redaction.js';

describe('redact', () => {
  it('masque les champs sensibles à toute profondeur, quelle que soit leur casse', () => {
    const out = redact({
      password: 'S3cret!',
      body: { newPassword: 'x', phone: '+2250707070707', activation_code: '123456', otp: '9999' },
      headers: { Authorization: 'Bearer abc', cookie: 'sid=1', 'set-cookie': ['sid=2'] },
      sessions: [{ refreshToken: 'r', accessToken: 'a' }],
      apiKey: 'k',
    });
    expect(out).toEqual({
      password: MASKED,
      body: { newPassword: MASKED, phone: MASKED, activation_code: MASKED, otp: MASKED },
      headers: { Authorization: MASKED, cookie: MASKED, 'set-cookie': MASKED },
      sessions: [{ refreshToken: MASKED, accessToken: MASKED }],
      apiKey: MASKED,
    });
  });

  it.each([
    // Colonnes de docs/specs/schema.sql (champs Drizzle) et en-têtes.
    'passwordHash',
    'password_hash',
    'codeHash',
    'codeEncrypted',
    'secretEncrypted',
    'refreshTokenHash',
    'keyHash',
    'phoneE164',
    'phone_e164',
    'totp',
    'totpSecret',
    'x-api-key',
    'proxy-authorization',
    'secretAccessKey',
    'userId',
    'actorUserId',
  ])('masque le champ %s', (key) => {
    expect(redact({ [key]: 'valeur' })).toEqual({ [key]: MASKED });
  });

  it('garde les codes d’erreur, statuts et identifiants de requête', () => {
    const fields = {
      errorCode: 'internal_error',
      statusCode: 500,
      sqlstate: '23505',
      requestId: '0f8c2b1e-0000-7000-8000-000000000001',
      associationId: '00000000-0000-7000-8000-0000000ab001',
      currency: 'XOF',
    };
    expect(redact(fields)).toEqual(fields);
  });

  it('masque les numéros de téléphone dans les textes libres', () => {
    expect(redact({ msg: 'relance envoyée au +225 07 07 07 07 07 pour la cotisation' })).toEqual({
      msg: `relance envoyée au ${MASKED} pour la cotisation`,
    });
  });

  it('ne modifie pas l’objet journalisé et supporte les cycles', () => {
    const input: Record<string, unknown> = { password: 'x' };
    input.self = input;
    const out = redact(input) as Record<string, unknown>;
    expect(input.password).toBe('x');
    expect(out.password).toBe(MASKED);
    expect(out.self).toBe('[cycle]');
  });
});

describe('maskPhones', () => {
  it.each([
    ['+2250707070707'],
    ['+225 07 07 07 07 07'],
    ['+221-77-123-45-67'],
    ['07 07 07 07 07'],
    ['0707070707'],
    ['07.07.07.07.07'],
  ])('masque %s', (phone) => {
    expect(maskPhones(`tél. ${phone}.`)).toBe(`tél. ${MASKED}.`);
  });

  it.each([
    ['00000000-0000-7000-8000-0000000ab001'],
    ['25 000 F'],
    ['durée 1234 ms'],
    ['2026-10-10T17:54:01.419Z'],
    ['SQLSTATE 23505'],
  ])('laisse %s intact', (text) => {
    expect(maskPhones(text)).toBe(text);
  });
});

describe('serializeError', () => {
  it('ne reprend ni le message ni les paramètres d’une erreur SQL', () => {
    const pg = Object.assign(new Error('duplicate key value: (+2250707070707)'), {
      code: '23505',
      table: 'subscribers',
      constraint: 'subscribers_phone_key',
      detail: 'Key (phone)=(+2250707070707) already exists.',
    });
    const drizzle = Object.assign(new Error('Failed query: insert ... params: +2250707070707', { cause: pg }), {
      query: 'insert into subscribers ...',
      params: ['+2250707070707'],
    });
    const out = serializeError(drizzle);
    expect(JSON.stringify(out)).not.toContain('2250707070707');
    expect(out).toMatchObject({ type: 'Error', sqlstate: '23505', table: 'subscribers' });
    expect(out.stack).toEqual(expect.arrayContaining([expect.stringMatching(/^\s*at /)]));
  });

  it('reprend le message d’une autre erreur, téléphones masqués', () => {
    const out = serializeError(new TypeError('numéro +2250707070707 introuvable'));
    expect(out).toMatchObject({ type: 'TypeError', message: `numéro ${MASKED} introuvable` });
  });
});
