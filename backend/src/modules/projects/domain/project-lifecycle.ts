import type { ProjectStatus } from '@cotiz/contracts';

/**
 * Cycle de vie d'un projet (lot 2.2) : publication (brouillon → inscriptions ouvertes), démarrage à la date de début
 * (tâche projects.activate), clôture (inscriptions ouvertes ou en cours → terminé). Modification tant qu'il n'est ni
 * terminé ni archivé (choix Q8) ; suppression d'un brouillon seulement (Q4). Pas d'archivage en V1 (Q3).
 */
export const TRANSITIONS = {
  publish: { from: ['draft'], to: 'enrolling' },
  activate: { from: ['enrolling'], to: 'active' },
  close: { from: ['enrolling', 'active'], to: 'completed' },
} as const satisfies Record<string, { from: readonly ProjectStatus[]; to: ProjectStatus }>;

export type Transition = keyof typeof TRANSITIONS;

/** La transition est-elle permise depuis `status` ? */
export function canTransition(transition: Transition, status: ProjectStatus): boolean {
  return (TRANSITIONS[transition].from as readonly ProjectStatus[]).includes(status);
}

export const EDITABLE_STATUSES: readonly ProjectStatus[] = ['draft', 'enrolling', 'active'];
export const DELETABLE_STATUSES: readonly ProjectStatus[] = ['draft'];
