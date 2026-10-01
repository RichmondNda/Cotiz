import { z } from 'zod';
import { Instant } from './scalars.js';
import { PersonContact } from './people.js';

/**
 * Message prêt à transmettre par une personne (sans fournisseur, architecture/03-auth.md) : code d'activation,
 * de réinitialisation ou d'invitation. Le code n'est jamais dans `activationUrl`.
 */
export const Handoff = z
  .object({
    /** Code affiché (`K7M4-P9QX` pour une activation, 6 chiffres pour une réinitialisation). */
    code: z.string().min(6),
    expiresAt: Instant,
    recipient: PersonContact,
    message: z.string(),
    activationUrl: z.url().nullable(),
    whatsappUrl: z.url().nullable(),
    smsUrl: z.string().startsWith('sms:').nullable(),
    mailtoUrl: z.string().startsWith('mailto:').nullable(),
  })
  .meta({ id: 'Handoff' });
export type Handoff = z.infer<typeof Handoff>;
