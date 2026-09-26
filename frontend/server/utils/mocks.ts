// Outils des handlers de mocks (auto-importés par Nitro).
// - latence simulée 200–400 ms pour que les états de chargement (squelettes) existent ;
// - `?scenario=` pour forcer les états de données de l'inventaire (`vide`, `file-vide`…) ;
//   scénarios communs : `erreur` (réponse 500) et `chargement` (réponse retardée de 10 s).
import type { H3Event } from 'h3'
import type { Role, UtilisateurSession } from '~~/types'
import { superadmin } from '../mocks/referentiel'
import { store } from '../mocks/store'

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

/** Utilisateurs de chaque rôle de la session mockée (DONNEES-REFERENCE : Moussa Diarra, Awa Koné, Richy). */
const SOUSCRIPTEUR_SESSION = 'moussa-diarra'
const GESTIONNAIRE_SESSION = 'awa-kone'

const majuscule = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

/** Utilisateur de la session mockée, d'après le cookie `cotiz_role` ; lu dans le store en mémoire. */
export function utilisateurSession(event: H3Event): UtilisateurSession | null {
  const role = getCookie(event, 'cotiz_role') as Role | undefined
  switch (role) {
    case 'souscripteur': {
      const s = store.souscripteurs.find(x => x.id === SOUSCRIPTEUR_SESSION)
      return s ? { id: s.id, role, prenom: s.prenom, nom: s.nom, fonction: 'Souscripteur' } : null
    }
    case 'gestionnaire': {
      const g = store.gestionnaires.find(x => x.id === GESTIONNAIRE_SESSION)
      return g ? { id: g.id, role, prenom: g.prenom, nom: g.nom, fonction: g.fonction ? majuscule(g.fonction) : undefined, associationId: g.associationId } : null
    }
    case 'superadmin':
      return { id: superadmin.id, role, prenom: superadmin.prenom }
    default:
      return null
  }
}

/** Erreur métier (statusMessage en ASCII : il sert de texte de statut HTTP) : `data.code` est lu par le front (`codeErreur()`) pour choisir le message affiché. */
export function erreurMetier(statusCode: number, code: string, statusMessage: string): never {
  throw createError({ statusCode, statusMessage, data: { code } })
}
