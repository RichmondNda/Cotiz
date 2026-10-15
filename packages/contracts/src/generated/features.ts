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

/** Lot qui livre chaque fonctionnalité ; `planGated` : dépend aussi du plan ; `externalProvider` : groupe 6. */
export const FEATURE_SPECS = {
  payments: { lot: '3.3', planGated: false, externalProvider: false },
  activation_codes: { lot: '2.3', planGated: false, externalProvider: false },
  password_reset_manual: { lot: '1.1', planGated: false, externalProvider: false },
  realtime: { lot: '4.2', planGated: false, externalProvider: false },
  web_push: { lot: '4.2', planGated: false, externalProvider: false },
  contracts: { lot: '4.1', planGated: true, externalProvider: false },
  imports: { lot: '4.4', planGated: true, externalProvider: false },
  auto_reminders: { lot: '4.3', planGated: true, externalProvider: false },
  team: { lot: '4.5', planGated: true, externalProvider: false },
  invoices: { lot: '4.6', planGated: false, externalProvider: false },
  exports: { lot: '4.6', planGated: true, externalProvider: false },
  usage_stats: { lot: '4.6', planGated: false, externalProvider: false },
  mfa: { lot: '4.7', planGated: false, externalProvider: false },
  audit_log: { lot: '4.7', planGated: false, externalProvider: false },
  reconciliation: { lot: '5.1', planGated: true, externalProvider: false },
  public_api: { lot: '5.2', planGated: true, externalProvider: false },
  analytics: { lot: '5.2', planGated: true, externalProvider: false },
  channel_email: { lot: '6.1', planGated: false, externalProvider: true },
  channel_sms: { lot: '6.2', planGated: false, externalProvider: true },
  online_payment: { lot: '6.3', planGated: false, externalProvider: true },
} as const satisfies Record<Feature, { lot: string; planGated: boolean; externalProvider: boolean }>;
