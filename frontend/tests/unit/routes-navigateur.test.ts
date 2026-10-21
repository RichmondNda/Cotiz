// Pages gardées (middleware espace-*) toutes rendues dans le navigateur : au rendu serveur, la garde d'un espace basculé
// ne contrôle rien (aucune identité côté serveur), une page oubliée serait servie sans garde.
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ROUTES_NAVIGATEUR } from '../../server/bascule/routes-navigateur'

const PAGES = join(__dirname, '../../app/pages')

function fichiers(dossier: string): string[] {
  return readdirSync(dossier, { withFileTypes: true })
    .flatMap(e => (e.isDirectory() ? fichiers(join(dossier, e.name)) : e.name.endsWith('.vue') ? [join(dossier, e.name)] : []))
}

/** `asso/projets/[slug]/index.vue` → `/asso/projets/x`. */
function route(fichier: string) {
  const segments = relative(PAGES, fichier).replace(/\.vue$/, '').split('/').filter(s => s !== 'index')
  return '/' + segments.map(s => s.replace(/^\[.*\]$/, 'x')).join('/')
}

const couverte = (r: string) => ROUTES_NAVIGATEUR.some(motif =>
  motif.endsWith('/**') ? r.startsWith(motif.slice(0, -2)) : r === motif)

describe('ROUTES_NAVIGATEUR', () => {
  const gardees = fichiers(PAGES).filter(f => /middleware:[^)]*espace-(plateforme|gestionnaire|souscripteur)/s.test(readFileSync(f, 'utf8')))

  it('couvre chaque page gardée', () => {
    expect(gardees.length).toBeGreaterThan(40)
    expect(gardees.map(route).filter(r => !couverte(r))).toEqual([])
  })

  it('ne couvre aucune page publique (connexion, landing, demande)', () => {
    for (const r of ['/', '/connexion', '/connexion/association', '/demande', '/mot-de-passe', '/activer']) expect(couverte(r)).toBe(false)
  })
})
