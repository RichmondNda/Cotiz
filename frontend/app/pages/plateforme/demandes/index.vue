<!--
  SaDemandes — traiter les demandes dans l'ordre et retrouver les anciennes.
  Onglets À traiter (compteur orange) · Approuvées · Refusées · Toutes ; recherche nom ou email ; filtres pays et plan
  souhaité ; tableau trié de la plus ancienne à la plus récente, ligne cliquable vers le traitement.
  Mobile : liste de cartes (nom, date, plan, badge). Onglet dans l'URL (`?onglet=approuvee`).
  Scénarios : `vide` (aucune à traiter) (+ `chargement`, `erreur`). Recherche sans résultat : interaction réelle.
-->
<script setup lang="ts">
import type { ColonneTable } from '~/components/cz/CzTable.vue'
import type { Onglet } from '~/components/cz/CzTabs.vue'
import type { Demande, StatutDemande } from '~~/types'
import { formatDate } from '~/utils/format'
import { STATUTS_DEMANDE, TYPES_ASSOCIATION } from '~/utils/statuts'

definePageMeta({ middleware: 'espace-plateforme', layout: 'backoffice', espace: 'superadmin', titre: 'Demandes' })
useHead({ title: 'Demandes · Cotiz' })

type OngletDemandes = StatutDemande | 'toutes'

const route = useRoute()
const router = useRouter()
const { data, pending, error, refresh } = useDemandes()
const { data: plans } = usePlans()

const ONGLETS: { valeur: OngletDemandes, label: string }[] = [
  { valeur: 'a_traiter', label: 'À traiter' },
  { valeur: 'approuvee', label: 'Approuvées' },
  { valeur: 'refusee', label: 'Refusées' },
  { valeur: 'toutes', label: 'Toutes' },
]
const onglet = computed<OngletDemandes>({
  get: () => (ONGLETS.some(o => o.valeur === route.query.onglet) ? route.query.onglet as OngletDemandes : 'a_traiter'),
  set: v => router.replace({ query: { ...route.query, onglet: v === 'a_traiter' ? undefined : v } }),
})
const demandes = computed(() => data.value ?? [])
const compte = (o: OngletDemandes) => (o === 'toutes' ? demandes.value.length : demandes.value.filter(d => d.statut === o).length)
const onglets = computed<Onglet[]>(() => ONGLETS.map(o => ({
  label: o.label,
  valeur: o.valeur,
  // « 0 » reste affiché sur « À traiter » (capture `vide`).
  compteur: o.valeur === 'a_traiter' ? String(compte(o.valeur)) : compte(o.valeur),
  tonCompteur: o.valeur === 'a_traiter' ? 'warning' : 'neutral',
})))

const recherche = ref('')
const pays = ref('tous')
const plan = ref('tous')
const optionsPays = computed(() => [
  { valeur: 'tous', label: 'tous' },
  ...[...new Set(demandes.value.map(d => d.association.pays))].map(p => ({ valeur: p, label: p })),
])
const optionsPlans = computed(() => [
  { valeur: 'tous', label: 'tous' },
  ...(plans.value ?? []).map(p => ({ valeur: p.id, label: p.nom })),
])
const nomPlan = (id: string) => plans.value?.find(p => p.id === id)?.nom ?? id
const responsable = (d: Demande) => `${d.responsable.prenom} ${d.responsable.nom}`.trim()

const lignes = computed(() => {
  const q = recherche.value.trim().toLocaleLowerCase('fr')
  return demandes.value
    .filter(d => (onglet.value === 'toutes' || d.statut === onglet.value)
      && (pays.value === 'tous' || d.association.pays === pays.value)
      && (plan.value === 'tous' || d.besoins.planSouhaiteId === plan.value)
      && (!q || [d.association.nom, responsable(d), d.responsable.email].some(t => t.toLocaleLowerCase('fr').includes(q))))
    .map(d => ({
      id: d.id,
      association: d.association.nom,
      type: TYPES_ASSOCIATION[d.association.type],
      responsable: responsable(d),
      email: d.responsable.email,
      ville: d.association.ville,
      souscripteurs: d.besoins.souscripteursEstimes,
      plan: nomPlan(d.besoins.planSouhaiteId),
      recueLe: d.recueLe,
      statut: d.statut,
    }))
})

const COLONNES: ColonneTable[] = [
  { cle: 'association', label: 'Association', squelette: 'personne' },
  { cle: 'responsable', label: 'Responsable' },
  { cle: 'ville', label: 'Ville' },
  { cle: 'souscripteurs', label: 'Souscripteurs estimés', num: true },
  { cle: 'plan', label: 'Plan souhaité' },
  { cle: 'recueLe', label: 'Reçue le' },
  { cle: 'statut', label: 'Statut', squelette: 'badge' },
]

const chargement = computed(() => pending.value && !data.value)
const recherchee = computed(() => recherche.value.trim())
function effacer() {
  recherche.value = ''
  pays.value = 'tous'
  plan.value = 'tous'
}
</script>

<template>
  <div class="sa-demandes">
    <EnTetePage
      titre="Demandes de création"
      sous-titre="Traitez les demandes dans l’ordre d’arrivée."
    />

    <CzTabs
      v-model="onglet"
      :onglets="onglets"
      label="Statut des demandes"
    />

    <div class="cz-toolbar sa-demandes__outils">
      <CzInput
        v-model="recherche"
        type="search"
        placeholder="Nom ou email"
        label="Rechercher une demande"
        class="sa-demandes__recherche"
      />
      <CzFiltreMenu
        v-model="pays"
        libelle="Pays"
        :options="optionsPays"
      />
      <CzFiltreMenu
        v-model="plan"
        libelle="Plan souhaité"
        :options="optionsPlans"
      />
      <span class="sa-demandes__tri">Tri : plus ancienne en premier</span>
    </div>

    <CzTable
      :colonnes="COLONNES"
      :lignes="lignes"
      :chargement="chargement"
      :lignes-squelette="4"
      :erreur="error ? 'Vérifiez votre connexion, puis réessayez.' : undefined"
      label="Demandes de création d’association"
      @ligne="l => router.push(`/plateforme/demandes/${l.id}`)"
      @reessayer="refresh()"
    >
      <template #cell-association="{ ligne }">
        <NuxtLink
          :to="`/plateforme/demandes/${ligne.id}`"
          class="sa-demandes__nom"
          @click.stop
        >{{ ligne.association }}</NuxtLink>
        <div class="sa-demandes__sous">
          {{ ligne.type }}
        </div>
      </template>
      <template #cell-responsable="{ ligne }">
        {{ ligne.responsable }}
        <div class="sa-demandes__sous">
          {{ ligne.email }}
        </div>
      </template>
      <template #cell-recueLe="{ ligne }">
        <span class="sa-demandes__muted">{{ formatDate(ligne.recueLe, 'numerique') }}</span>
      </template>
      <template #cell-statut="{ ligne }">
        <CzBadge :ton="STATUTS_DEMANDE[ligne.statut].ton">
          {{ STATUTS_DEMANDE[ligne.statut].libelle }}
        </CzBadge>
      </template>
      <template #carte="{ ligne }">
        <!-- La carte entière est cliquable (CzTable, `@ligne`) : pas de lien imbriqué. -->
        <div class="sa-demandes__carte">
          <span class="sa-demandes__carte-l">
            <b>{{ ligne.association }}</b>
            <span class="sa-demandes__sous">Reçue le {{ formatDate(ligne.recueLe, 'numerique') }} · {{ ligne.plan }}</span>
          </span>
          <CzBadge :ton="STATUTS_DEMANDE[ligne.statut].ton">
            {{ STATUTS_DEMANDE[ligne.statut].libelle }}
          </CzBadge>
        </div>
      </template>
      <template #vide>
        <CzEmpty
          v-if="recherchee"
          icone="recherche"
          ton="neutral"
          titre="Aucun résultat"
          :description="`Aucune demande ne correspond à « ${recherchee} ».`"
          integre
        >
          <template #action>
            <CzButton
              variante="fantome"
              taille="sm"
              @click="effacer"
            >
              Effacer la recherche
            </CzButton>
          </template>
        </CzEmpty>
        <CzEmpty
          v-else-if="onglet === 'a_traiter' && pays === 'tous' && plan === 'tous'"
          icone="valide"
          ton="success"
          titre="Aucune demande à traiter"
          description="Les nouvelles demandes de création apparaîtront ici."
          integre
        />
        <CzEmpty
          v-else
          icone="filtre"
          ton="neutral"
          titre="Aucune demande"
          description="Aucune demande ne correspond à ces filtres."
          integre
        >
          <template #action>
            <CzButton
              variante="fantome"
              taille="sm"
              @click="effacer"
            >
              Réinitialiser les filtres
            </CzButton>
          </template>
        </CzEmpty>
      </template>
    </CzTable>
  </div>
</template>

<style scoped>
.sa-demandes {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.sa-demandes__recherche {
  width: 300px;
}

.sa-demandes__tri {
  margin-left: auto;
  font-size: 13px;
  color: var(--text-muted);
}

.sa-demandes__nom {
  font-weight: 600;
  color: var(--text-strong);
  text-decoration: none;
}

.sa-demandes__nom:hover {
  text-decoration: underline;
}

.sa-demandes__sous {
  font-size: 12px;
  color: var(--text-muted);
}

.sa-demandes__muted {
  color: var(--text-muted);
}

.sa-demandes__carte {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  min-height: 44px;
  color: var(--text);
  text-decoration: none;
}

.sa-demandes__carte-l {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.sa-demandes__carte-l b {
  color: var(--text-strong);
}

@media (max-width: 767px) {
  .sa-demandes__outils {
    flex-wrap: wrap;
  }

  .sa-demandes__recherche {
    width: 100%;
  }

  .sa-demandes__tri {
    display: none;
  }
}
</style>
