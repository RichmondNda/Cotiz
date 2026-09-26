// Outils des handlers de mocks (auto-importés par Nitro).
// - latence simulée 200–400 ms pour que les états de chargement (squelettes) existent ;
// - `?scenario=` pour forcer les états de données de l'inventaire (`vide`, `file-vide`…) ;
//   scénarios communs : `erreur` (réponse 500) et `chargement` (réponse retardée de 10 s).
import type { H3Event } from 'h3'
import type { Role, UtilisateurSession } from '~~/types'
import { superadmin } from '../mocks/referentiel'

export function lireScenario(event: H3Event): string | undefined {
  const s = getQuery(event).scenario
  return typeof s === 'string' && s ? s : undefined
}

async function attendre(ms: number) {
  await new Promise(r => setTimeout(r, ms))
}

/** Handler de mock : latence, scénarios communs, puis la réponse. */
export function defineMockHandler<T>(fn: (event: H3Event, scenario: string | undefined) => T | Promise<T>) {
  return defineEventHandler(async (event) => {
    const scenario = lireScenario(event)
    await attendre(scenario === 'chargement' ? 10_000 : 200 + Math.random() * 200)
    if (scenario === 'erreur') {
      throw createError({ statusCode: 500, statusMessage: 'Erreur simulée (scénario « erreur »)' })
    }
    return fn(event, scenario)
  })
}

export function introuvable(quoi: string): never {
  throw createError({ statusCode: 404, statusMessage: `${quoi} introuvable` })
}

/** Paramètre de route obligatoire. */
export function parametre(event: H3Event, nom: string): string {
  const v = getRouterParam(event, nom)
  if (!v) throw createError({ statusCode: 400, statusMessage: `Paramètre « ${nom} » manquant` })
  return decodeURIComponent(v)
}

/** Filtre texte optionnel d'une query. */
export function filtre(event: H3Event, nom: string): string | undefined {
  const v = getQuery(event)[nom]
  return typeof v === 'string' && v ? v : undefined
}

/** Utilisateur de la session mockée, d'après le cookie `cotiz_role`. */
export function utilisateurSession(event: H3Event): UtilisateurSession | null {
  const role = getCookie(event, 'cotiz_role') as Role | undefined
  switch (role) {
    case 'souscripteur':
      return { id: 'moussa-diarra', role, prenom: 'Moussa', nom: 'Diarra', fonction: 'Souscripteur' }
    case 'gestionnaire':
      return { id: 'awa-kone', role, prenom: 'Awa', nom: 'Koné', fonction: 'Trésorière', associationId: 'entraide-yopougon' }
    case 'superadmin':
      return { id: superadmin.id, role, prenom: superadmin.prenom }
    default:
      return null
  }
}
