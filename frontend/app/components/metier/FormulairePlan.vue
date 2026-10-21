<!--
  Formulaire d'un plan d'abonnement (SaPlan) : en-tête (Annuler, Enregistrer le plan), Présentation · Prix (remise
  calculée) · Quotas (compteurs, « Illimité ») · Fonctionnalités incluses · Publication, et aperçu en direct de la
  carte tarif de la landing. Modification d'un plan qui a des abonnés : avertissement dès le premier changement.
  Quotas `[N]` des données de référence : le formulaire part de 5 / 100 / 3 (valeurs de la maquette).
-->
<script setup lang="ts">
import type { ModificationPlan, Plan, Quota } from '~~/types'
import { FONCTIONNALITES_PLAN } from '~/utils/statuts'
import { pluriel } from '~/utils/format'

const props = defineProps<{
  /** Plan modifié ; `null` en création. */
  plan: Plan | null
}>()

type CleQuota = 'projets' | 'souscripteurs' | 'gestionnaires'

const toast = useToast()
const { creer, modifier } = useActionsPlan()
const creation = computed(() => !props.plan)

// ---------------------------------------------------------------- Formulaire
const QUOTAS: { cle: CleQuota, libelle: string, pas: number, defaut: number }[] = [
  { cle: 'projets', libelle: 'Projets actifs', pas: 1, defaut: 5 },
  { cle: 'souscripteurs', libelle: 'Souscripteurs', pas: 10, defaut: 100 },
  { cle: 'gestionnaires', libelle: 'Comptes gestionnaires', pas: 1, defaut: 3 },
]

function etatInitial(p: Plan | null | undefined) {
  const valeur = (q: Quota | undefined, defaut: number) => (typeof q === 'number' ? q : defaut)
  const cochee = (f: (typeof FONCTIONNALITES_PLAN)[number]) => Boolean(p?.fonctionnalites.some(x => x === f.libelle || x === f.alias))
  return {
    nom: p?.nom ?? '',
    description: p?.description ?? '',
    prixMensuel: typeof p?.prixMensuel === 'number' ? p.prixMensuel : null as number | null,
    prixAnnuel: typeof p?.prixAnnuel === 'number' ? p.prixAnnuel : null as number | null,
    quotas: Object.fromEntries(QUOTAS.map(q => [q.cle, valeur(p?.quotas[q.cle], q.defaut)])) as Record<CleQuota, number>,
    illimite: Object.fromEntries(QUOTAS.map(q => [q.cle, p?.quotas[q.cle] === null])) as Record<CleQuota, boolean>,
    fonctionnalites: FONCTIONNALITES_PLAN.map(cochee),
    misEnAvant: p?.misEnAvant ?? false,
    actif: (p?.statut ?? 'actif') === 'actif',
  }
}
// État initialisé depuis le plan chargé (rendu serveur compris : le composant n'est créé qu'une fois le plan là).
const f = reactive(etatInitial(props.plan))
const modifie = ref(false)
watch(f, () => (modifie.value = true), { deep: true })

const erreurNom = ref('')
const erreurPrixMensuel = ref('')
const erreurPrixAnnuel = ref('')
const remise = computed(() => {
  const m = f.prixMensuel
  const a = f.prixAnnuel
  return m && a ? `Remise affichée : ${Math.round((1 - a / (m * 12)) * 100)} % par rapport au mensuel` : 'La remise annuelle est calculée automatiquement.'
})
const avertissement = computed(() => !creation.value && modifie.value && (props.plan?.associationsAbonnees ?? 0) > 0)

/** Plan tel qu'il sera enregistré (les prix non saisis gardent le placeholder `[PRIX]`). */
const brouillon = computed<ModificationPlan>(() => {
  const autres = (props.plan?.fonctionnalites ?? []).filter(x => !FONCTIONNALITES_PLAN.some(c => c.libelle === x || c.alias === x))
  return {
    nom: f.nom.trim(),
    description: f.description.trim() || undefined,
    prixMensuel: f.prixMensuel ?? '[PRIX]',
    prixAnnuel: f.prixAnnuel ?? '[PRIX]',
    quotas: Object.fromEntries(QUOTAS.map(q => [q.cle, f.illimite[q.cle] ? null : f.quotas[q.cle]])) as Plan['quotas'],
    fonctionnalites: [...autres, ...FONCTIONNALITES_PLAN.filter((_, i) => f.fonctionnalites[i]).map(c => c.libelle)],
    misEnAvant: f.misEnAvant,
    statut: f.actif ? 'actif' : 'archive',
  }
})
/** Carte de l'aperçu : seules les fonctionnalités cochées sont listées (comme la maquette). */
const apercu = computed<Plan>(() => ({
  ...brouillon.value,
  id: props.plan?.id ?? 'nouveau',
  nom: f.nom.trim() || 'Nom du plan',
  fonctionnalites: FONCTIONNALITES_PLAN.filter((_, i) => f.fonctionnalites[i]).map(c => c.libelle),
  associationsAbonnees: props.plan?.associationsAbonnees ?? 0,
}))

const envoi = ref(false)
async function enregistrer() {
  erreurNom.value = f.nom.trim() ? '' : 'Le nom du plan est obligatoire'
  erreurPrixMensuel.value = f.prixMensuel === null ? 'Indiquez le prix mensuel (0 pour un plan gratuit)' : ''
  erreurPrixAnnuel.value = f.prixAnnuel === null ? 'Indiquez le prix annuel (0 pour un plan gratuit)' : ''
  if (erreurNom.value || erreurPrixMensuel.value || erreurPrixAnnuel.value) return
  envoi.value = true
  try {
    const enregistre = creation.value
      ? await creer(brouillon.value)
      : await modifier(props.plan!.id, props.plan!.version ?? 1, brouillon.value)
    toast.succes(creation.value ? 'Plan créé' : 'Plan enregistré', { message: `« ${enregistre.nom} » est à jour sur la page Tarifs.` })
    await navigateTo('/plateforme/plans')
  }
  catch (e) {
    // Refus du back (code déjà pris, modifié entre-temps…) : son message (errors.yaml) ; sinon, la connexion.
    toast.erreur('Enregistrement impossible', { message: messageRefus(e) ?? 'Vérifiez votre connexion, puis réessayez.' })
  }
  finally {
    envoi.value = false
  }
}
</script>

<template>
  <div class="sa-plan">
    <EnTetePage
      :titre="creation ? 'Nouveau plan' : `Modifier le plan ${plan?.nom ?? ''}`"
      :sous-titre="creation ? 'Créez une formule tarifaire.' : pluriel(plan?.associationsAbonnees ?? 0, 'association abonnée', 'associations abonnées')"
    >
      <template #actions>
        <CzButton
          variante="fantome"
          to="/plateforme/plans"
        >
          Annuler
        </CzButton>
        <CzButton
          :chargement="envoi"
          libelle-chargement="Enregistrement…"
          @click="enregistrer"
        >
          Enregistrer le plan
        </CzButton>
      </template>
    </EnTetePage>

    <CzAlert
      v-if="avertissement"
      ton="warning"
      icone="alerte"
    >
      <b>Ce plan compte {{ pluriel(plan?.associationsAbonnees ?? 0, 'association abonnée', 'associations abonnées') }}.</b>
      Une baisse de quota ou une hausse de prix s’appliquera à leur prochaine échéance. Prévenez-les avant d’enregistrer.
    </CzAlert>

    <div class="sa-plan__grille">
      <form
        class="sa-plan__form"
        novalidate
        @submit.prevent="enregistrer"
      >
        <section class="cz-card sa-plan__carte">
          <h2 class="sa-plan__h2">
            Présentation
          </h2>
          <CzField
            label="Nom du plan"
            requis
            :erreur="erreurNom || undefined"
          >
            <CzInput
              v-model="f.nom"
              placeholder="Ex. Essentiel"
            />
          </CzField>
          <CzField label="Description courte">
            <CzInput
              v-model="f.description"
              placeholder="Une phrase affichée sous le nom"
              :maxlength="120"
            />
          </CzField>
        </section>

        <section class="cz-card sa-plan__carte">
          <h2 class="sa-plan__h2">
            Prix
          </h2>
          <div class="sa-plan__deux">
            <CzField
              label="Prix mensuel"
              :erreur="erreurPrixMensuel || undefined"
            >
              <CzInput
                v-model="f.prixMensuel"
                type="montant"
                placeholder="0"
              />
            </CzField>
            <CzField
              label="Prix annuel"
              :aide="remise"
              :erreur="erreurPrixAnnuel || undefined"
            >
              <CzInput
                v-model="f.prixAnnuel"
                type="montant"
                placeholder="0"
              />
            </CzField>
          </div>
        </section>

        <section class="cz-card sa-plan__carte">
          <h2 class="sa-plan__h2">
            Quotas
          </h2>
          <div
            v-for="q in QUOTAS"
            :key="q.cle"
            class="sa-plan__quota"
          >
            <span class="sa-plan__quota-l">{{ q.libelle }}</span>
            <CzCounter
              v-model="f.quotas[q.cle]"
              :min="q.pas"
              :pas="q.pas"
              :disabled="f.illimite[q.cle]"
              :label="q.libelle"
              :class="{ 'sa-plan__compteur--inactif': f.illimite[q.cle] }"
            />
            <CzCheckbox v-model="f.illimite[q.cle]">
              Illimité
            </CzCheckbox>
          </div>
        </section>

        <section class="cz-card sa-plan__carte">
          <h2 class="sa-plan__h2">
            Fonctionnalités incluses
          </h2>
          <div class="sa-plan__fonctions">
            <CzCheckbox
              v-for="(c, i) in FONCTIONNALITES_PLAN"
              :key="c.libelle"
              v-model="f.fonctionnalites[i]"
            >
              {{ c.libelle }}
            </CzCheckbox>
          </div>
        </section>

        <section class="cz-card sa-plan__carte">
          <h2 class="sa-plan__h2">
            Publication
          </h2>
          <div class="sa-plan__interrupteur">
            <CzToggle
              v-model="f.misEnAvant"
              label="Mettre en avant sur la landing"
            />
            <span>Mettre en avant sur la landing (badge « Le plus choisi »)</span>
          </div>
          <div class="sa-plan__interrupteur">
            <CzToggle
              v-model="f.actif"
              label="Plan actif"
            />
            <span>Actif — proposé aux nouvelles associations</span>
          </div>
        </section>
      </form>

      <aside class="sa-plan__apercu">
        <div class="sa-plan__apercu-titre">
          Aperçu sur la landing
        </div>
        <div
          class="sa-plan__vitrine"
          data-theme="manager"
          :class="{ 'is-inactif': !f.actif }"
        >
          <CarteTarif
            :plan="apercu"
            apercu
          />
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.sa-plan {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.sa-plan__grille {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  gap: var(--space-6);
  align-items: start;
}

.sa-plan__form {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  min-width: 0;
}

.sa-plan__carte {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-6);
}

.sa-plan__h2 {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 16px;
  color: var(--text-strong);
}

.sa-plan__deux {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-4);
}

.sa-plan__quota {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  min-height: 44px;
}

.sa-plan__quota-l {
  flex-grow: 1;
  font-size: 14px;
}

.sa-plan__compteur--inactif {
  opacity: 0.5;
}

.sa-plan__fonctions {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.sa-plan__fonctions > * {
  min-height: 44px;
}

.sa-plan__interrupteur {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  font-size: 14px;
}

.sa-plan__apercu {
  position: sticky;
  top: calc(64px + var(--space-4));
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.sa-plan__apercu-titre {
  font-family: var(--font-display);
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-muted);
}

/* Fond des sections de la landing (corail pâle), cartes au thème du site public. */
.sa-plan__vitrine {
  padding: var(--space-4);
  border-radius: var(--r-card);
  background: var(--corail-page);
}

.sa-plan__vitrine.is-inactif {
  opacity: 0.5;
}

@media (max-width: 1023px) {
  .sa-plan__grille {
    grid-template-columns: minmax(0, 1fr);
  }

  .sa-plan__apercu {
    position: static;
  }
}

@media (max-width: 767px) {
  .sa-plan__deux {
    grid-template-columns: minmax(0, 1fr);
  }

  .sa-plan__quota {
    flex-wrap: wrap;
  }

  .sa-plan__quota-l {
    width: 100%;
  }
}
</style>
