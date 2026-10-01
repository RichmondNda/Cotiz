// Généré par scripts/gen.mjs depuis docs/specs/features.yaml. Ne pas modifier : lancer « pnpm --filter contracts gen ».

/** Fonctionnalités exposées par `GET /me` (`features`). */
export const FEATURES = [
  'payments',
  'activation_codes',
  'password_reset_manual',
  'realtime',
  'web_push',
  'contracts',
  'imports',
  'auto_reminders',
  'team',
  'invoices',
  'exports',
  'usage_stats',
  'mfa',
  'audit_log',
  'reconciliation',
  'public_api',
  'analytics',
  'channel_email',
  'channel_sms',
  'online_payment',
] as const;
export type Feature = (typeof FEATURES)[number];
