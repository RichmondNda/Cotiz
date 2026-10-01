import { z } from 'zod';
import { EnrollmentStatus, MemberStanding, UserStatus } from './enums.js';
import { Installment } from './ledger.js';
import { PersonContact } from './people.js';
import { ProjectRef } from './project.js';
import { Instant, IsoDate, Money, Uuid } from './scalars.js';

/** Inscription d'un souscripteur à un projet (onglet Souscripteurs, fiche). */
export const Enrollment = z.object({
  id: Uuid,
  projectId: Uuid,
  member: PersonContact,
  status: EnrollmentStatus,
  /** Situation calculée par `memberStanding()` (+ `activation_pending`). */
  standing: MemberStanding,
  /** Date d'entrée : première échéance générée à partir de cette date. */
  startsFrom: IsoDate,
  joinedAt: Instant,
  contractSignedAt: Instant.nullable(),
  paid: Money,
  remaining: Money,
  /** Montant des échéances en retard. */
  lateAmount: Money,
  /** Engagement total sur le projet (dates fixes) ; `null` pour un cycle roulant. */
  commitment: Money.nullable(),
  withdrawnAt: Instant.nullable(),
});
export type Enrollment = z.infer<typeof Enrollment>;

export const MemberProfile = PersonContact.extend({
  address: z.string().nullable(),
  city: z.string().nullable(),
  /** Compte activé ou code d'activation en attente. */
  accountStatus: UserStatus,
});

/** Inscription avec le projet et ses échéances (fiche souscripteur). */
export const EnrollmentWithSchedule = Enrollment.extend({ project: ProjectRef, installments: z.array(Installment) });
