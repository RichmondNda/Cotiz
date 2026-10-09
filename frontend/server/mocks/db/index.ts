// Jeu simulé en mémoire, partagé par les handlers `/api/v1` ; les mutations (déclarer, valider, inscrire…) le modifient.
import { buildDb } from './seed'
import type { MockDb } from './types'

export const db: MockDb = buildDb()

/** Remet le jeu dans son état initial (tests, `POST /api/_dev/reinitialiser`). */
export function resetDb() {
  Object.assign(db, buildDb())
}

export type * from './types'
