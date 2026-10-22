// Plans d'abonnement : `Plan` / `PublicPlan` du contrat → `Plan` de l'interface (cartes tarifaires, SaPlans, SaPlan).
import { FEATURE_SPECS } from '@cotiz/contracts'
import type { Feature, Plan as PlanContrat, PublicPlan } from '@cotiz/contracts'
import type { ModificationPlan, Plan } from '~~/types'

/** Puces des cartes tarifaires par fonctionnalité (features.yaml soumises au plan). */
const PUCES: Record<string, string[]> = {
  payments: ['Grille d’échéances', 'Déclaration et validation des paiements'],
  contracts: ['Contrats à signer en ligne'],
  auto_reminders: ['Relances automatiques'],
  imports: ['Import de membres par Excel'],
  analytics: ['Rapports avancés'],
}

/**
 * Fonctionnalités incluses dans tout plan (features.yaml, `planGated: false`) : le back ne les porte pas dans un plan
 * (choix Q4 du lot 1.2), l'interface les affiche en tête de chaque plan, comme la maquette.
 */
const INCLUSES = (Object.keys(PUCES) as Feature[]).filter(f => !FEATURE_SPECS[f].planGated)
const avecIncluses = (features: readonly string[]) => [...INCLUSES.filter(f => !features.includes(f)), ...features]

/** Libellés de SaPlan (FONCTIONNALITES_PLAN, alias compris) → clé de fonctionnalité. */
const CLES: Record<string, Feature> = {
  'Grille d’échéances': 'payments',
  'Déclaration et validation des paiements': 'payments',
  'Contrats à signer en ligne': 'contracts',
  'Signature électronique des contrats': 'contracts',
  'Relances automatiques': 'auto_reminders',
  'Import de membres par Excel': 'imports',
  'Rapports avancés': 'analytics',
}

/**
 * Plans de l'offre, dans l'ordre : un plan qui reprend toutes les fonctionnalités du précédent affiche
 * « Tout <précédent> » puis ses nouveautés (cartes tarifaires de la maquette).
 */
export function vuePlans(plans: (PlanContrat | PublicPlan)[]): Plan[] {
  const features = plans.map(p => avecIncluses(p.features))
  return plans.map((p, i) => {
    const precedent = plans[i - 1]
    const avant = features[i - 1] ?? []
    const siennes = features[i]!
    const herite = precedent && avant.length > 0 && avant.every(f => siennes.includes(f))
    const propres = herite ? siennes.filter(f => !avant.includes(f)) : siennes
    return {
      id: p.id,
      nom: p.name,
      description: p.description ?? undefined,
      prixMensuel: p.priceMonthly.amount,
      prixAnnuel: p.priceYearly.amount,
      quotas: { projets: p.limits.projects, souscripteurs: p.limits.subscribers, gestionnaires: p.limits.managers },
      fonctionnalites: [...(herite ? [`Tout ${precedent.name}`] : []), ...propres.flatMap(f => PUCES[f] ?? [f])],
      associationsAbonnees: 'subscribersCount' in p ? p.subscribersCount : 0,
      misEnAvant: p.isFeatured,
      statut: !('isActive' in p) || p.isActive ? 'actif' : 'archive',
      version: 'version' in p ? p.version : 1,
      code: p.code,
    }
  })
}

/** Saisie de SaPlan → corps `PlanInput` du contrat (« Tout X » = fonctionnalités du plan X). */
export function versPlanInput(plan: ModificationPlan, tous: Plan[]) {
  const cles = new Set<Feature>()
  const ajouter = (libelles: string[], vus: Set<string>) => {
    for (const libelle of libelles) {
      // « Tout Essentiel » reprend les fonctionnalités d'Essentiel, « Tout Découverte » compris.
      const tout = /^Tout (.+)$/.exec(libelle)
      if (tout && !vus.has(tout[1]!)) ajouter(tous.find(p => p.nom === tout[1])?.fonctionnalites ?? [], new Set([...vus, tout[1]!]))
      // Sans libellé (team, exports…) : la clé est affichée telle quelle, elle repart telle quelle.
      const k = CLES[libelle] ?? (libelle in FEATURE_SPECS ? libelle as Feature : undefined)
      if (k) cles.add(k)
    }
  }
  ajouter(plan.fonctionnalites, new Set())
  // Un prix non saisi n'est jamais envoyé comme 0 F (plan gratuit) : le formulaire l'exige avant l'appel.
  const montant = (v: number | '[PRIX]') => {
    if (typeof v !== 'number') throw new Error('Plan : prix non saisi')
    return { amount: v, currency: 'XOF' as const }
  }
  return {
    name: plan.nom,
    description: plan.description ?? null,
    priceMonthly: montant(plan.prixMensuel),
    priceYearly: montant(plan.prixAnnuel),
    limits: { projects: num(plan.quotas.projets), subscribers: num(plan.quotas.souscripteurs), managers: num(plan.quotas.gestionnaires) },
    // Seules les fonctionnalités soumises au plan partent au back (les autres sont dans tout plan).
    features: [...cles].filter(k => FEATURE_SPECS[k].planGated),
    isFeatured: plan.misEnAvant,
    isActive: plan.statut === 'actif',
  }
}

const num = (q: number | null | '[N]') => (typeof q === 'number' ? q : null)

/** Code d'un nouveau plan déduit de son nom (`Essentiel (copie)` → `essentiel-copie`). */
export const codePlan = (nom: string) =>
  nom.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'plan'
