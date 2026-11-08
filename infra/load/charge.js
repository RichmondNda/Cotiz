// Charge du lot 3.5 (étape 3, architecture/09 et 12) avec k6, contre une pile locale, sur le jeu de preparer.mjs :
//   node infra/load/preparer.mjs
//   docker run --rm --network host -v "$PWD/infra/load:/charge" grafana/k6:1.0.0 run /charge/charge.js \
//     -e BASE=http://localhost:3080/api/v1        (par le front, comme en production ; :4000 pour l'api seule)
// Objectifs de architecture/09, par requête, à charge nominale (scénarios successifs, pas superposés) : grille 200 × 24
// p95 < 500 ms, lectures (tableau de bord) p95 < 300 ms, écritures (déclarations au fil de l'eau, validations)
// p95 < 800 ms. Puis architecture/12 : 100 déclarations simultanées, toutes acceptées sans délai d'expiration (la file du
// pool de connexions les étale : latence relevée, bornée large), et 2 validations concurrentes sans interblocage.
// Débits sous le plafond par association (600 requêtes/min) : on mesure la latence, pas le limiteur.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';
import exec from 'k6/execution';

const jeu = JSON.parse(open('/charge/.jeu/jeu.json'));
const BASE = __ENV.BASE ?? jeu.api;
const refus = new Counter('refus_inattendus');

const entetes = (jeton, extra = {}) => ({
  headers: { authorization: `Bearer ${jeton}`, 'content-type': 'application/json', ...extra },
});

export const options = {
  summaryTrendStats: ['med', 'p(90)', 'p(95)', 'max'],
  scenarios: {
    // Un gestionnaire sur la grille (lecture du lot 2.4, test/perf/ledger-grid-200x24 : chaque page < 500 ms), puis deux.
    grille: { executor: 'constant-vus', vus: 1, duration: '20s', exec: 'grille' },
    grille_2: {
      executor: 'constant-vus',
      vus: 2,
      duration: '10s',
      startTime: '21s',
      exec: 'grille',
      tags: { nom: 'grille_2' },
    },
    tableau_de_bord: { executor: 'constant-vus', vus: 2, duration: '20s', startTime: '32s', exec: 'tableauDeBord' },
    // 100 déclarations (fonds d'entrée) au fil de l'eau : 5 par seconde pendant 20 s.
    declarations: {
      executor: 'shared-iterations',
      vus: 5,
      iterations: 100,
      startTime: '55s',
      maxDuration: '60s',
      exec: 'declarer',
    },
    // Puis 100 en même temps (première mensualité de chacun).
    rafale: {
      executor: 'per-vu-iterations',
      vus: 100,
      iterations: 1,
      startTime: '85s',
      maxDuration: '60s',
      exec: 'rafale',
    },
    validations: {
      executor: 'per-vu-iterations',
      vus: 2,
      iterations: 1,
      startTime: '110s',
      maxDuration: '60s',
      exec: 'valider',
    },
  },
  thresholds: {
    'http_req_duration{nom:grille}': ['p(95)<500'],
    // Relevé seulement (deux gestionnaires sur la même grille au même instant), affiché par ce seuil large.
    'http_req_duration{nom:grille_2}': ['p(95)<2000'],
    'http_req_duration{nom:tableau_de_bord}': ['p(95)<300'],
    'http_req_duration{nom:declaration}': ['p(95)<800'],
    'http_req_duration{nom:validation}': ['p(95)<800'],
    'checks{nom:declaration}': ['rate==1'],
    'http_req_duration{nom:rafale}': ['max<15000'],
    'checks{nom:rafale}': ['rate==1'],
    'checks{nom:validation}': ['rate==1'],
    refus_inattendus: ['count==0'],
  },
};

/** Les deux pages de 100 lignes de la grille 200 × 24. */
export function grille() {
  const nom = exec.scenario.name;
  const url = `${BASE}/associations/${jeu.aid}/projects/${jeu.pid}/grid?limit=100`;
  const p1 = http.get(url, { ...entetes(jeu.gestion), tags: { nom } });
  const ok = check(
    p1,
    { 'grille 200': (r) => r.status === 200, '24 colonnes': (r) => r.json('columns').length === 24 },
    { nom },
  );
  if (!ok) refus.add(1);
  const suite = p1.status === 200 ? p1.json('nextCursor') : null;
  if (suite) http.get(`${url}&cursor=${encodeURIComponent(suite)}`, { ...entetes(jeu.gestion), tags: { nom } });
  sleep(1);
}

export function tableauDeBord() {
  const r = http.get(`${BASE}/associations/${jeu.aid}/dashboard`, {
    ...entetes(jeu.gestion),
    tags: { nom: 'tableau_de_bord' },
  });
  if (!check(r, { 'tableau de bord 200': (x) => x.status === 200 }, { nom: 'tableau_de_bord' })) refus.add(1);
  sleep(1);
}

/** Rang de l'itération dans son scénario (0…n-1) : `__VU` compte les VU de tous les scénarios. */
const rang = () => exec.scenario.iterationInTest;

/** Déclaration du souscripteur `i` sur sa n-ième échéance ouverte, par référence de transaction. */
function declaration(i, n, nom) {
  const s = jeu.souscripteurs[i];
  const e = s.echeances[n];
  const corps = {
    projectId: jeu.pid,
    amount: { amount: e.montant, currency: 'XOF' },
    paidOn: new Date().toISOString().slice(0, 10),
    paymentMethodId: jeu.paymentMethodId,
    transactionReference: `CHARGE-${n}-${i + 1}`,
    allocations: [{ installmentId: e.id, amount: { amount: e.montant, currency: 'XOF' } }],
  };
  const r = http.post(`${BASE}/me/payments`, JSON.stringify(corps), {
    ...entetes(s.jeton, { 'idempotency-key': `charge-${jeu.pid}-${n}-${i + 1}` }),
    tags: { nom },
  });
  if (!check(r, { 'déclaration 201': (x) => x.status === 201 }, { nom })) refus.add(1, { statut: String(r.status) });
}

/** Fonds d'entrée, une itération par souscripteur, 5 à la fois. */
export function declarer() {
  declaration(rang(), 0, 'declaration');
  sleep(1);
}

/** Première mensualité, les 100 souscripteurs au même instant. */
export function rafale() {
  declaration(rang(), 1, 'rafale');
}

/** Version du paiement (If-Match), lue sur le détail comme le fait le front : le résumé de la liste n'en a pas. */
function version(id) {
  return http.get(`${BASE}/associations/${jeu.aid}/payments/${id}`, entetes(jeu.gestion)).json('version');
}

function validerPaiement(id, v, cle, nom) {
  return http.post(`${BASE}/associations/${jeu.aid}/payments/${id}/validate`, '{}', {
    ...entetes(jeu.gestion, { 'idempotency-key': cle, 'if-match': `W/"${v}"` }),
    tags: { nom },
  });
}

/**
 * Deux gestionnaires en même temps : d'abord deux paiements différents du même projet (les deux passent : verrous pris
 * dans le même ordre, aucun interblocage), puis le même paiement, version lue avant que l'autre ne valide (exactement
 * un 200, l'autre 409 ou 412).
 */
export function valider() {
  const i = rang();
  const file = http
    .get(`${BASE}/associations/${jeu.aid}/payments?status=pending&limit=10`, entetes(jeu.gestion))
    .json('items');
  const distinct = file[i].id;
  const r1 = validerPaiement(distinct, version(distinct), `val-${distinct}`, 'validation');
  if (!check(r1, { 'validation distincte 200': (x) => x.status === 200 }, { nom: 'validation' })) {
    refus.add(1);
    console.error(`validation distincte → ${r1.status} ${r1.body}`);
  }
  const commun = file[2].id;
  const v = version(commun);
  sleep(2);
  const r2 = validerPaiement(commun, v, `val-${commun}-${i}`, 'validation_meme');
  check(
    r2,
    { 'même paiement : 200, 409 ou 412': (x) => [200, 409, 412].includes(x.status) },
    { nom: 'validation_meme' },
  );
  console.log(`gestionnaire ${i + 1} : même paiement → ${r2.status}`);
}
