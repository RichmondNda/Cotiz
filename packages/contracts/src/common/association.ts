import { z } from 'zod';
import { EstimatedSubscribers } from './enums.js';
import { Email, PhoneE164 } from './people.js';

/** Type déclaré d'une association (liste ouverte : association, mutuelle, tontine, groupement…). */
export const AssociationType = z.string().min(1).max(60);

/** Champs « L'association » du formulaire de demande et de la création directe. */
export const AssociationIdentity = z.object({
  name: z.string().min(2).max(120),
  type: AssociationType,
  city: z.string().min(1).max(80),
  country: z.string().min(2).max(80),
  registrationNumber: z.string().max(60).nullable().optional(),
});

/** Responsable ou gestionnaire principal. */
export const ContactPerson = z.object({
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  email: Email,
  phone: PhoneE164,
});

export const RequestNeeds = z.object({
  estimatedSubscribers: EstimatedSubscribers,
  plannedProjects: z.int().min(0).nullable().optional(),
  desiredPlanId: z.uuid().nullable().optional(),
  /** « Comment avez-vous connu Cotiz ? » */
  acquisitionSource: z.string().max(120).nullable().optional(),
});
