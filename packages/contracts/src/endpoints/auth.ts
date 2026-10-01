import { z } from 'zod';
import { Email, NewPassword, PhoneE164 } from '../common/people.js';
import { ResetRequestSpace, SessionSpace } from '../common/enums.js';
import { Instant } from '../common/scalars.js';
import { defineEndpoint, noFlags } from '../registry.js';

// Authentification (architecture/03-auth.md). Le jeton de rafraîchissement circule dans un cookie HttpOnly,
// jamais dans les corps JSON.

/** Identifiant de connexion : email (gestionnaire, plateforme) ou téléphone E.164 (souscripteur). */
export const LoginIdentifier = z.union([Email, PhoneE164]);

/** Code d'activation ou d'invitation : 8 caractères sans ambiguïté, tiret facultatif (`K7M4-P9QX`). */
export const ActivationCode = z.string().regex(/^[2-9A-HJ-KM-NP-Z]{4}-?[2-9A-HJ-KM-NP-Z]{4}$/i, 'activation_code');
/** Code de réinitialisation ou de second facteur : 6 chiffres. */
export const SixDigitCode = z.string().regex(/^\d{6}$/, 'six_digits');

/** Session ouverte : jeton d'accès JWT (15 min), gardé en mémoire par le front. */
export const AccessToken = z.object({
  accessToken: z.string().min(1),
  expiresAt: Instant,
  space: SessionSpace,
});
export type AccessToken = z.infer<typeof AccessToken>;

export const LoginRequest = z.object({
  space: SessionSpace,
  identifier: LoginIdentifier,
  password: z.string().min(1),
  /** « Rester connecté » : cookie de rafraîchissement persistant (sinon de session). */
  rememberMe: z.boolean().default(false),
});

export const LoginResponse = z.discriminatedUnion('status', [
  AccessToken.extend({ status: z.literal('authenticated') }),
  /** Second facteur exigé (plateforme, lot 4.7) : poursuivre avec `auth.mfa` › `verify`. */
  z.object({ status: z.literal('mfa_required'), mfaToken: z.string().min(1), expiresAt: Instant }),
]);
export type LoginResponse = z.infer<typeof LoginResponse>;

export const authLogin = defineEndpoint({
  id: 'auth.login',
  space: 'auth',
  permission: 'public',
  errors: ['invalid_credentials', 'account_locked', 'account_not_activated', 'association_suspended', 'wrong_space'],
  flags: { ...noFlags, rateLimited: true },
  operations: {
    login: {
      method: 'POST',
      path: '/api/v1/auth/login',
      request: { body: LoginRequest },
      response: { status: 200, body: LoginResponse },
    },
  },
});

export const authRefresh = defineEndpoint({
  id: 'auth.refresh',
  space: 'auth',
  permission: 'public',
  errors: ['session_expired', 'session_revoked'],
  flags: { ...noFlags, rateLimited: true },
  operations: {
    refresh: {
      method: 'POST',
      path: '/api/v1/auth/refresh',
      request: {},
      response: { status: 200, body: AccessToken },
    },
  },
});

export const authLogout = defineEndpoint({
  id: 'auth.logout',
  space: 'auth',
  permission: 'authenticated',
  errors: [],
  flags: noFlags,
  operations: {
    logout: { method: 'POST', path: '/api/v1/auth/logout', request: {}, response: { status: 204 } },
  },
});

export const ForgotPasswordRequest = z.object({
  space: ResetRequestSpace,
  identifier: LoginIdentifier,
});

export const authForgot = defineEndpoint({
  id: 'auth.forgot',
  space: 'auth',
  permission: 'public',
  errors: [],
  flags: { ...noFlags, rateLimited: true },
  operations: {
    /** Réponse identique (202, sans corps) que le compte existe ou non. */
    forgot: {
      method: 'POST',
      path: '/api/v1/auth/password/forgot',
      request: { body: ForgotPasswordRequest },
      response: { status: 202 },
    },
  },
});

export const VerifyResetCodeRequest = z.object({
  space: ResetRequestSpace,
  identifier: LoginIdentifier,
  code: SixDigitCode,
});

/** Jeton de réinitialisation court (10 min) à présenter à `auth.reset`. */
export const ResetToken = z.object({ resetToken: z.string().min(1), expiresAt: Instant });

export const authVerify = defineEndpoint({
  id: 'auth.verify',
  space: 'auth',
  permission: 'public',
  errors: ['invalid_code', 'code_expired', 'too_many_attempts'],
  flags: { ...noFlags, rateLimited: true },
  operations: {
    verify: {
      method: 'POST',
      path: '/api/v1/auth/password/verify-code',
      request: { body: VerifyResetCodeRequest },
      response: { status: 200, body: ResetToken },
    },
  },
});

export const ResetPasswordRequest = z.object({ resetToken: z.string().min(1), newPassword: NewPassword });

export const authReset = defineEndpoint({
  id: 'auth.reset',
  space: 'auth',
  permission: 'public',
  errors: ['weak_password', 'reset_token_invalid'],
  flags: { ...noFlags, rateLimited: true, audited: true },
  operations: {
    /** Toutes les sessions de la personne sont révoquées. */
    reset: {
      method: 'POST',
      path: '/api/v1/auth/password/reset',
      request: { body: ResetPasswordRequest },
      response: { status: 204 },
    },
  },
});

export const ActivateRequest = z.object({
  space: SessionSpace,
  identifier: LoginIdentifier,
  code: ActivationCode,
  newPassword: NewPassword,
});

export const authActivate = defineEndpoint({
  id: 'auth.activate',
  space: 'auth',
  permission: 'public',
  errors: ['invalid_code', 'code_expired', 'too_many_attempts', 'weak_password', 'already_activated'],
  flags: { ...noFlags, rateLimited: true, audited: true },
  operations: {
    /** Code consommé, compte actif et connecté directement. */
    activate: {
      method: 'POST',
      path: '/api/v1/auth/activate',
      request: { body: ActivateRequest },
      response: { status: 200, body: AccessToken },
    },
  },
});

export const MfaVerifyRequest = z.union([
  z.object({ mfaToken: z.string().min(1), code: SixDigitCode }),
  z.object({ mfaToken: z.string().min(1), recoveryCode: z.string().min(8) }),
]);

export const TotpEnrollment = z.object({
  /** Secret en base 32, à saisir à la main si le QR code ne peut pas être lu. */
  secret: z.string().min(16),
  /** `otpauth://totp/…`, rendu en QR code côté client. */
  otpauthUrl: z.string().startsWith('otpauth://'),
});

export const authMfa = defineEndpoint({
  id: 'auth.mfa',
  space: 'auth',
  permission: 'public',
  errors: ['invalid_code', 'too_many_attempts'],
  flags: { ...noFlags, rateLimited: true, audited: true },
  operations: {
    verify: {
      method: 'POST',
      path: '/api/v1/auth/mfa/verify',
      request: { body: MfaVerifyRequest },
      response: { status: 200, body: AccessToken },
    },
    enroll: {
      method: 'POST',
      path: '/api/v1/me/mfa/totp',
      request: {},
      response: { status: 201, body: TotpEnrollment },
    },
    /** Confirme l'enrôlement ; les codes de secours ne sont affichés qu'une fois. */
    confirm: {
      method: 'POST',
      path: '/api/v1/me/mfa/totp/confirm',
      request: { body: z.object({ code: SixDigitCode }) },
      response: { status: 200, body: z.object({ recoveryCodes: z.array(z.string()).min(1) }) },
    },
  },
});
