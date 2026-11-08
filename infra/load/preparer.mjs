// Jeu de charge du lot 3.5 (étape 3), construit par l'API sur la pile visée, sans écrire en base à la main : une
// association neuve à chaque passage (plan Pro, 500 souscripteurs), sa responsable, un moyen Mobile money, un projet de
// 24 mensualités, 200 inscriptions en masse (grille 200 × 24), 100 souscripteurs activés. Écrit infra/load/.jeu/jeu.json
// (jetons d'accès de 15 min : lancer k6 juste après ; dossier ignoré par git).
//   COTIZ_API=http://localhost:4000/api/v1 node infra/load/preparer.mjs
// La pile doit autoriser assez d'activations par minute et par IP (RATE_LIMIT_ENDPOINT_PER_MIN, 20 par défaut) :
// COTIZ_RATE_LIMIT_ENDPOINT_PER_MIN=1000 sur la pile Docker locale (app.yml).
import { mkdirSync, writeFileSync } from 'node:fs';

const API = process.env.COTIZ_API ?? 'http://localhost:4000/api/v1';
const ADMIN = {
  email: process.env.CAPTURE_SUPERADMIN_EMAIL ?? 'richy@cotiz.app',
  password: process.env.CAPTURE_SUPERADMIN_PASSWORD ?? 'Plateau-Dev-Cotiz-2026',
};
const MOT_DE_PASSE = 'Charge-Locale-2026';
const SOUSCRIPTEURS = 200;
const ACTIFS = 100;
const suffixe = String(Date.now()).slice(-7);

async function appel(chemin, { methode = 'GET', jeton, corps, idempotent = false } = {}) {
  const r = await fetch(API + chemin, {
    method: methode,
    headers: {
      ...(corps ? { 'content-type': 'application/json' } : {}),
      ...(jeton ? { authorization: `Bearer ${jeton}` } : {}),
      ...(idempotent ? { 'idempotency-key': crypto.randomUUID() } : {}),
    },
    body: corps ? JSON.stringify(corps) : undefined,
  });
  const texte = await r.text();
  if (!r.ok) throw new Error(`${methode} ${chemin} → ${r.status} ${texte.slice(0, 300)}`);
  return texte ? JSON.parse(texte) : null;
}
const connexion = async (space, identifier, password) =>
  (await appel('/auth/login', { methode: 'POST', corps: { space, identifier, password } })).accessToken;
const activation = (space, identifier, code) =>
  appel('/auth/activate', { methode: 'POST', corps: { space, identifier, code, newPassword: MOT_DE_PASSE } });
const tel = (n) => `+22507${String(Number(suffixe) % 100).padStart(2, '0')}${String(n).padStart(6, '0')}`;

const debut = performance.now();
const admin = await connexion('platform', ADMIN.email, ADMIN.password);
const plans = await appel('/public/plans');
const pro = plans.items.find((p) => p.code === 'pro');
if (!pro) throw new Error('Plan « pro » absent');

const email = `charge-${suffixe}@essai.cotiz.app`;
const cree = await appel('/platform/associations', {
  methode: 'POST',
  jeton: admin,
  idempotent: true,
  corps: {
    association: {
      name: `Charge ${suffixe}`,
      type: 'association',
      city: 'Abidjan',
      country: 'CI',
      registrationNumber: null,
      description: 'Jeu de charge (lot 3.5).',
    },
    owner: { firstName: 'Kadi', lastName: 'Charge', email, phone: tel(0) },
    subscription: {
      planId: pro.id,
      startsOn: new Date().toISOString().slice(0, 10),
      managerSeats: null,
      trialDays: null,
    },
    issueCredentialsNow: true,
  },
});
const aid = cree.association.id;
await activation('association', email, cree.handoff.code);
const gestion = await connexion('association', email, MOT_DE_PASSE);

const moyens = await appel(`/associations/${aid}/payment-methods`, {
  methode: 'PUT',
  jeton: gestion,
  corps: {
    items: [
      {
        kind: 'mobile_money',
        label: 'Wave',
        details: { operator: 'wave', number: '+2250701020304' },
        instructions: null,
        isActive: true,
      },
    ],
  },
});
const projet = await appel(`/associations/${aid}/projects`, {
  methode: 'POST',
  jeton: gestion,
  idempotent: true,
  corps: {
    name: `Grille 200 × 24 · ${suffixe}`,
    description: '',
    requiredSubscribers: null,
    graceDays: 5,
    entryFee: { amount: 50000, currency: 'XOF' },
    installmentAmount: { amount: 25000, currency: 'XOF' },
    frequency: 'monthly',
    dueDay: 5,
    scheduleType: 'fixed',
    startDate: '2026-03-01',
    endDate: '2028-01-31',
    paymentMethods: [{ paymentMethodId: moyens.items[0].id, instructionsOverride: null }],
  },
});
const pid = projet.id;
// Création = brouillon ; l'assistant de l'interface publie aussitôt (inscriptions ouvertes).
await appel(`/associations/${aid}/projects/${pid}/publish`, { methode: 'POST', jeton: gestion });
const lignes = Array.from({ length: SOUSCRIPTEURS }, (_, i) => ({
  phone: tel(i + 1),
  firstName: `Personne ${i + 1}`,
  lastName: 'Charge',
  startsFrom: '2026-03-01',
}));
const rapport = await appel(`/associations/${aid}/enrollments/bulk`, {
  methode: 'POST',
  jeton: gestion,
  idempotent: true,
  corps: { projectId: pid, rows: lignes },
});
const echecs = rapport.results.filter((r) => r.outcome === 'failed');
if (echecs.length) throw new Error(`Inscriptions en échec : ${JSON.stringify(echecs.slice(0, 3))}`);

// Codes en clair (« Codes à remettre ») des 100 premiers comptes, puis activation (la session renvoyée sert à k6).
const codes = [];
let curseur = null;
do {
  const page = await appel(
    `/associations/${aid}/activation-codes?limit=100${curseur ? `&cursor=${encodeURIComponent(curseur)}` : ''}`,
    { jeton: gestion },
  );
  codes.push(...page.items.filter((x) => x.state === 'live' && x.handoff));
  curseur = page.nextCursor;
} while (curseur);
const souscripteurs = [];
for (const c of codes.slice(0, ACTIFS)) {
  const { accessToken } = await activation('subscriber', c.member.phone, c.handoff.code);
  const detail = await appel(`/me/projects/${pid}`, { jeton: accessToken });
  // Deux échéances ouvertes (fonds d'entrée, puis la première mensualité) : une déclaration au fil de l'eau, une en rafale.
  const ouvertes = detail.installments.filter((e) => e.status !== 'paid' && e.status !== 'waived').slice(0, 2);
  if (ouvertes.length < 2) throw new Error('Moins de deux échéances ouvertes');
  souscripteurs.push({
    jeton: accessToken,
    echeances: ouvertes.map((e) => ({ id: e.id, montant: e.remaining?.amount ?? e.amountDue.amount })),
  });
}
if (souscripteurs.length < ACTIFS) throw new Error(`Seulement ${souscripteurs.length} comptes activés sur ${ACTIFS}`);

mkdirSync(new URL('./.jeu/', import.meta.url), { recursive: true });
writeFileSync(
  new URL('./.jeu/jeu.json', import.meta.url),
  JSON.stringify(
    {
      api: API,
      aid,
      pid,
      gestion,
      paymentMethodId: moyens.items[0].id,
      souscripteurs,
      preparéLe: new Date().toISOString(),
    },
    null,
    1,
  ),
);
console.log(
  `Jeu prêt en ${Math.round((performance.now() - debut) / 1000)} s : association ${aid}, projet ${pid}, ${SOUSCRIPTEURS} inscrits, ${souscripteurs.length} actifs`,
);
