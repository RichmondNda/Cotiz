#!/usr/bin/env node
// Génère ../docs/api-v0.md (contrat d'API V0 que le back-end NestJS devra respecter) à partir de server/api/.
//   node scripts/generer-contrat-api.mjs      (depuis frontend/, après `nuxt prepare` : .nuxt/tsconfig.server.json)
//
// Pour chaque handler : méthode et route (nom du fichier), description (commentaire d'en-tête), rôle exigé,
// paramètres de route et de query, corps (`readBody<T>`), réponse (type inféré par le compilateur TypeScript),
// scénarios (`?scenario=`) et erreurs (404 `introuvable`, erreurs métier `erreurMetier`, `createError`).
// Les types référencés sont recopiés en annexe depuis types/.
import ts from 'typescript'
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const RACINE_API = 'server/api'
const SORTIE = '../docs/api-v0.md'

const fichiers = (function lister(d) {
  return readdirSync(d).flatMap(n => (statSync(join(d, n)).isDirectory() ? lister(join(d, n)) : [join(d, n)]))
})(RACINE_API).filter(f => f.endsWith('.ts') && !f.includes(`${sep}_dev${sep}`)).sort()

// Programme TypeScript du serveur Nitro (auto-imports compris).
const config = ts.getParsedCommandLineOfConfigFile('.nuxt/tsconfig.server.json', {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} })
const programme = ts.createProgram({ rootNames: [...new Set([...config.fileNames, ...fichiers.map(f => join(process.cwd(), f))])], options: config.options })
const tc = programme.getTypeChecker()

function route(f) {
  const rel = relative(RACINE_API, f).split(sep).join('/').replace(/\.ts$/, '')
  const m = rel.match(/^(.*?)(?:\.(get|post|patch|put|delete))$/)
  const chemin = (m ? m[1] : rel).replace(/(^|\/)index$/, '').replace(/\[([^\]]+)\]/g, ':$1')
  return { methode: (m?.[2] ?? 'get').toUpperCase(), chemin: `/api/${chemin}`.replace(/\/$/, '') }
}

function enTete(source) {
  const lignes = []
  for (const l of source.split('\n')) {
    if (!l.startsWith('//')) break
    lignes.push(l.replace(/^\/\/ ?/, ''))
  }
  // La première ligne répète souvent « GET /api/… — » : on garde la description.
  const d = lignes.join(' ').replace(/^(GET|POST|PATCH|PUT|DELETE) \/api\/\S*\s*(—\s*)?/, '').trim()
  return d.charAt(0).toUpperCase() + d.slice(1)
}

function typeReponse(sf) {
  let resultat = 'inconnu'
  ts.forEachChild(sf, (n) => {
    if (!ts.isExportAssignment(n) || !ts.isCallExpression(n.expression)) return
    const fn = n.expression.arguments[0]
    if (!fn) return
    const sig = tc.getSignaturesOfType(tc.getTypeAtLocation(fn), ts.SignatureKind.Call)[0]
    if (!sig) return
    let t = tc.getReturnTypeOfSignature(sig)
    t = tc.getAwaitedType(t) ?? t
    resultat = tc.typeToString(t, n, ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope)
  })
  return resultat.replace(/import\("[^"]+"\)\./g, '')
}

const uniques = a => [...new Set(a)]
const tout = (s, re) => uniques([...s.matchAll(re)].map(m => m[1]))

const endpoints = fichiers.map((f) => {
  const source = readFileSync(f, 'utf8')
  const sf = programme.getSourceFile(join(process.cwd(), f))
  const { methode, chemin } = route(f)
  const roles = []
  if (/souscripteurSession\(/.test(source)) roles.push('souscripteur')
  if (/gestionnaireSession\(/.test(source)) roles.push('gestionnaire')
  if (/superadminSession\(|role !== 'superadmin'/.test(source)) roles.push('superadmin')
  const erreurs = [
    ...[...source.matchAll(/introuvable\('([^']+)'\)/g)].map(m => `404 — ${m[1]} introuvable`),
    ...[...source.matchAll(/erreurMetier\((\d{3}), '([^']+)'/g)].map(m => `${m[1]} — \`${m[2]}\``),
    ...[...source.matchAll(/createError\(\{ statusCode: (\d{3}), statusMessage: '([^']+)'/g)].map(m => `${m[1]} — ${m[2]}`),
  ]
  if (roles.includes('gestionnaire')) erreurs.push('401 — non connecté comme gestionnaire')
  if (roles.includes('souscripteur')) erreurs.push('403 — réservé aux souscripteurs')
  return {
    fichier: f,
    domaine: chemin.split('/')[2] || 'racine',
    methode,
    chemin,
    description: enTete(source),
    roles,
    parametres: tout(chemin, /:([A-Za-z]+)/g),
    query: uniques([
      ...tout(source, /filtre\(event, '([^']+)'\)/g),
      ...tout(source, /getQuery\(event\)\.([A-Za-z]+)/g),
      ...tout(source, /getQuery<[^>]*>\(event\)[^;]*?\b([a-zA-Z]+)\b(?=[,}])/g).filter(() => false),
    ]).filter(q => q !== 'scenario'),
    corps: tout(source, /readBody<([A-Za-z]+)>/g)[0],
    reponse: methode === 'DELETE' && /return\s*;|return undefined|setResponseStatus\(event, 204\)/.test(source) ? '204 (sans corps)' : typeReponse(sf),
    scenarios: tout(source, /scenario === '([^']+)'/g),
    erreurs: uniques(erreurs),
  }
})

// Types de types/ cités (corps ou réponse), avec leurs dépendances directes.
const sourcesTypes = Object.fromEntries(readdirSync('types').filter(f => f !== 'index.ts').map(f => [f, readFileSync(join('types', f), 'utf8')]))
const declarations = new Map()
for (const [f, s] of Object.entries(sourcesTypes)) {
  const sf = ts.createSourceFile(f, s, ts.ScriptTarget.Latest, true)
  sf.forEachChild((n) => {
    if ((ts.isInterfaceDeclaration(n) || ts.isTypeAliasDeclaration(n)) && n.name) {
      declarations.set(n.name.text, { fichier: f, texte: s.slice(n.getFullStart(), n.getEnd()).trim() })
    }
  })
}
const cites = new Set()
const aVisiter = endpoints.flatMap(e => [e.corps, e.reponse]).filter(Boolean).flatMap(t => t.match(/[A-Z][A-Za-z]+/g) ?? [])
while (aVisiter.length) {
  const n = aVisiter.pop()
  if (cites.has(n) || !declarations.has(n)) continue
  cites.add(n)
  aVisiter.push(...(declarations.get(n).texte.replace(/^\s*\/\*[\s\S]*?\*\/|\/\/.*$/gm, '').match(/\b[A-Z][A-Za-z]+\b/g) ?? []))
}

// Ancre d'un titre, calculée comme GitHub (minuscules, ponctuation retirée, espaces → tirets).
const ancre = t => t.toLowerCase().replace(/[^\p{L}\p{N} _-]/gu, '').replace(/ /g, '-')
const esc = s => s.replace(/\|/g, '\\|')
const L = []
L.push('# Contrat d’API Cotiz — V0', '')
L.push('> Généré par `frontend/scripts/generer-contrat-api.mjs` à partir des handlers de mocks (`frontend/server/api/`)')
L.push('> et des types partagés (`frontend/types/`). **Ne pas modifier à la main** : modifier le handler ou le type, puis')
L.push('> relancer `npm run contrat-api` depuis `frontend/`.', '')
L.push('## Conventions', '')
L.push('- **Base** : `runtimeConfig.public.apiBase` (V0 : mocks Nitro sur `/api`). Brancher NestJS = changer cette base.')
L.push('- **Format** : JSON. Montants en **entiers F CFA** (pas de décimales). Dates `AAAA-MM-JJ`, horodatages ISO 8601.')
L.push('- **Session** : en V0, cookie `cotiz_role` (`souscripteur` · `gestionnaire` · `superadmin`) posé par `POST /api/session/connexion`.')
L.push('  Utilisateurs de la session mockée : Moussa Diarra (souscripteur), Awa Koné (gestionnaire, Entraide Yopougon), Richy (super-admin).')
L.push('  Le back-end remplacera ce cookie par sa propre authentification ; les réponses restent filtrées selon l’utilisateur connecté.')
L.push('- **Erreurs** : `{ statusCode, statusMessage, data?: { code } }`. Le front lit `data.code` (erreurs métier, 409/422) pour choisir le message.')
L.push('  404 = ressource introuvable (le front affiche « X introuvable » + retour à la liste). 401/403 = session absente ou mauvais rôle.')
L.push('- **Scénarios** (dev uniquement, à ne pas implémenter côté NestJS) : `?scenario=<état>` force un état de données.')
L.push('  Communs à tous les endpoints : `erreur` (500) et `chargement` (réponse retardée de 10 s). Les scénarios propres sont listés par endpoint.')
L.push('- **Latence simulée** : 200–400 ms (états de chargement).', '')

L.push('## Sommaire', '')
L.push('| Méthode | Route | Rôle | Description |', '|---|---|---|---|')
for (const e of endpoints) {
  L.push(`| ${e.methode} | [\`${e.chemin}\`](#${ancre(`${e.methode} ${e.chemin}`)}) | ${e.roles.join(', ') || '—'} | ${esc(e.description.split('. ')[0].slice(0, 110))} |`)
}
L.push('')

let domaine = ''
for (const e of endpoints) {
  if (e.domaine !== domaine) {
    domaine = e.domaine
    L.push(`## ${domaine}`, '')
  }
  L.push(`### ${e.methode} ${e.chemin}`, '')
  if (e.description) L.push(e.description, '')
  const lignes = []
  if (e.roles.length) lignes.push(`- **Rôle** : ${e.roles.join(', ')}`)
  if (e.parametres.length) lignes.push(`- **Paramètres de route** : ${e.parametres.map(p => `\`${p}\``).join(', ')}`)
  if (e.query.length) lignes.push(`- **Query** (optionnels) : ${e.query.map(p => `\`${p}\``).join(', ')}`)
  if (e.corps) lignes.push(`- **Corps** : \`${e.corps}\` (voir annexe)`)
  lignes.push(`- **Réponse** : ${e.reponse.length > 90 || e.reponse.includes('{') ? '' : `\`${e.reponse}\``}`)
  if (e.reponse.length > 90 || e.reponse.includes('{')) lignes.push('', '```ts', e.reponse, '```', '')
  if (e.scenarios.length) lignes.push(`- **Scénarios** : ${e.scenarios.map(s => `\`${s}\``).join(', ')}`)
  if (e.erreurs.length) lignes.push(`- **Erreurs** : ${e.erreurs.join(' · ')}`)
  lignes.push(`- **Source** : \`frontend/${e.fichier.split(sep).join('/')}\``)
  L.push(...lignes, '')
}

L.push('## Annexe — types', '', 'Recopiés de `frontend/types/` (source de vérité). Seuls les types utilisés par les corps et les réponses figurent ici.', '')
for (const [f] of Object.entries(sourcesTypes)) {
  const ici = [...cites].filter(n => declarations.get(n).fichier === f)
  if (!ici.length) continue
  L.push(`### ${f}`, '', '```ts', ...ici.map(n => declarations.get(n).texte + '\n'), '```', '')
}

mkdirSync('../docs', { recursive: true })
writeFileSync(SORTIE, L.join('\n').replace(/\n{3,}/g, '\n\n'))
console.log(`${SORTIE} : ${endpoints.length} endpoints, ${cites.size} types en annexe.`)
const inconnus = endpoints.filter(e => e.reponse === 'inconnu')
if (inconnus.length) console.log('⚠ réponse non inférée :', inconnus.map(e => `${e.methode} ${e.chemin}`).join(', '))
