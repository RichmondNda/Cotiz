<!--
  SaAssociations — trouver une association et voir d'un coup d'œil son état.
  En-tête « Associations » + total, Exporter (CSV), Créer une association ; puces de statut (compteurs illustratifs :
  148 au total), filtres plan et pays, recherche ; vue Tableau / Cartes ; menu ⋯ (voir, changer de plan, suspendre).
  Filtres dans l'URL (`?statut=impayee&plan=pro`) : liens des KPI du tableau de bord.
  Scénarios : `vide` (+ `chargement`, `erreur`).
-->
<script setup lang="ts">
import type { ColonneTable } from '~/components/cz/CzTable.vue'
import type { ElementMenu } from '~/components/cz/CzMenu.vue'
import type { AssociationListe, StatutAssociation } from '~~/types'
import { formatDate, formatRelatif, pluriel } from '~/utils/format'
import { telechargerCsv } from '~/utils/csv'
import { STATUTS_ASSOCIATION } from '~/utils/statuts'

definePageMeta({ middleware: 'espace-plateforme', layout: 'backoffice', espace: 'superadmin', titre: 'Associations' })
useHead({ title: 'Associations · Cotiz' })

type Statut = 'toutes' | StatutAssociation
type Vue = 'tableau' | 'cartes'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const { data: plans } = usePlans()

// ---------------------------------------------------------------- Filtres (URL)
const PUCES: { valeur: Statut, label: string }[] = [
  { valeur: 'toutes', label: 'Toutes' },
  { valeur: 'active', label: 'Actives' },
  { valeur: 'impayee', label: 'Impayées' },
  { valeur: 'suspendue', label: 'Suspendues' },
  { valeur: 'onboarding', label: 'Onboarding' },
]
const parametre = (cle: string) => (typeof route.query[cle] === 'string' ? route.query[cle] as string : undefined)
function filtreUrl(cle: string, defaut: string) {
  return computed<string>({
    get: () => parametre(cle) ?? defaut,
    set: v => router.replace({ query: { ...route.query, [cle]: v === defaut ? undefined : v } }),
  })
}
const statut = filtreUrl('statut', 'toutes') as Ref<Statut>
const plan = filtreUrl('plan', 'tous')
const pays = filtreUrl('pays', 'tous')
const recherche = ref('')
const vue = ref<Vue>('tableau')

const { data, pending, error, refresh } = useAssociations(() => ({
  statut: statut.value === 'toutes' ? undefined : statut.value,
  plan: plan.value === 'tous' ? undefined : plan.value,
  q: recherche.value.trim() || undefined,
}))

const compteurs = computed(() => data.value?.compteurs)
const compteur = (s: Statut) => (s === 'toutes' ? compteurs.value?.toutes : compteurs.value?.[s])
const optionsPlans = computed(() => [{ valeur: 'tous', label: 'tous' }, ...(plans.value ?? []).map(p => ({ valeur: p.id, label: p.nom }))])
const optionsPays = [{ valeur: 'tous', label: 'tous' }, { valeur: 'Côte d’Ivoire', label: 'Côte d’Ivoire' }]

const associations = computed(() => (data.value?.associations ?? [])
  .filter(a => pays.value === 'tous' || a.pays === pays.value)
  .map(a => ({ ...a })))
const filtre = computed(() => statut.value !== 'toutes' || plan.value !== 'tous' || pays.value !== 'tous' || Boolean(recherche.value.trim()))

// La liste ne détaille que les associations de démonstration : pagination sur le total de référence (148),
// comme la maquette (pages 1, 2, 3 quels que soient les filtres).
const PAR_PAGE = 50
const { page, pages, lignesPage } = usePagination(associations, { parPage: PAR_PAGE, totalReference: () => compteurs.value?.toutes ?? 0 })
watch([statut, plan, pays, recherche], () => (page.value = 1))
const pied = computed(() => (associations.value.length
  ? `Affichage de ${pluriel(associations.value.length, 'association')} de démonstration · ${compteurs.value?.toutes ?? associations.value.length} au total`
  : '0 résultat'))

function reinitialiser() {
  recherche.value = ''
  router.replace({ query: {} })
}

// ---------------------------------------------------------------- Lignes
const COLONNES: ColonneTable[] = [
  { cle: 'nom', label: 'Association', squelette: 'personne' },
  { cle: 'planNom', label: 'Plan', squelette: 'badge' },
  { cle: 'statut', label: 'Statut', squelette: 'badge' },
  { cle: 'nbProjets', label: 'Projets', num: true },
  { cle: 'nbSouscripteurs', label: 'Souscripteurs', num: true },
  { cle: 'derniereActivite', label: 'Dernière activité' },
  { cle: 'creeeLe', label: 'Entrée' },
  { cle: 'actions', label: '', largeur: '56px' },
]
const entree = (d: string) => formatDate(d, 'numerique').slice(3)
const lien = (a: AssociationListe) => `/plateforme/associations/${a.id}`
const actions = (a: AssociationListe): ElementMenu[] => [
  { label: 'Voir', to: lien(a) },
  { label: 'Changer de plan', to: { path: lien(a), query: { onglet: 'abonnement' } } },
  { label: 'Suspendre', to: { path: lien(a), query: { onglet: 'parametres' } }, danger: true, separe: true, disabled: a.statut === 'suspendue' },
]

function exporter() {
  telechargerCsv('associations.csv', [
    ['Association', 'Ville', 'Plan', 'Statut', 'Projets', 'Souscripteurs', 'Dernière activité', 'Entrée'],
    ...associations.value.map(a => [a.nom, a.ville, a.planNom, STATUTS_ASSOCIATION[a.statut].libelle, a.nbProjets, a.nbSouscripteurs, formatDate(a.derniereActivite, 'numerique'), entree(a.creeeLe)]),
  ])
  toast.succes('Export prêt', { message: `${pluriel(associations.value.length, 'association')} exportées en CSV.` })
}

const chargement = computed(() => pending.value && !data.value)
</script>

<template>
  <div class="sa-assos">
    <EnTetePage titre="Associations">
      <template #apres-titre>
        <CzCount
          v-if="compteurs"
          :valeur="compteurs.toutes"
          ton="neutral"
          class="sa-assos__total"
        />
      </template>
      <template #actions>
        <CzButton
          variante="secondaire"
          icone="telecharger"
          :disabled="!associations.length"
          @click="exporter"
        >
          Exporter
        </CzButton>
        <CzButton
          icone="ajouter"
          to="/plateforme/associations/nouvelle"
        >
          Créer une association
        </CzButton>
      </template>
    </EnTetePage>

    <div class="cz-toolbar sa-assos__outils">
      <div
        class="sa-assos__puces"
        role="group"
        aria-label="Statut"
      >
        <CzChip
          v-for="p in PUCES"
          :key="p.valeur"
          :actif="statut === p.valeur"
          @click="statut = p.valeur"
        >
          {{ p.label }}<template v-if="compteur(p.valeur) !== undefined">
            · {{ compteur(p.valeur) }}
          </template>
        </CzChip>
      </div>
      <span
        class="sa-assos__sep"
        aria-hidden="true"
      />
      <CzFiltreMenu
        v-model="plan"
        libelle="Plan"
        :options="optionsPlans"
      />
      <CzFiltreMenu
        v-model="pays"
        libelle="Pays"
        :options="optionsPays"
      />
      <CzInput
        v-model="recherche"
        type="search"
        placeholder="Rechercher"
        label="Rechercher une association"
        class="sa-assos__recherche"
      />
    </div>

    <CzSegmented
      v-model="vue"
      :options="[{ valeur: 'tableau', label: 'Tableau' }, { valeur: 'cartes', label: 'Cartes' }]"
      label="Affichage"
      class="sa-assos__vue"
    />

    <!-- Tableau -->
    <CzTable
      v-if="vue === 'tableau'"
      :colonnes="COLONNES"
      :lignes="lignesPage"
      :chargement="chargement"
      :erreur="error ? 'Vérifiez votre connexion, puis réessayez.' : undefined"
      label="Associations de la plateforme"
      @ligne="a => navigateTo(lien(a))"
      @reessayer="refresh()"
    >
      <template #cell-nom="{ ligne }">
        <div class="cz-person">
          <CzAvatar
            :nom="ligne.nom"
            :initiales="ligne.sigle"
            org
            ton="sa"
            class="sa-assos__avatar"
          />
          <div>
            <NuxtLink
              :to="lien(ligne)"
              class="sa-assos__nom"
              @click.stop
            >{{ ligne.nom }}</NuxtLink>
            <div class="sub">
              {{ ligne.ville }}
            </div>
          </div>
        </div>
      </template>
      <template #cell-planNom="{ ligne }">
        <CzBadge ton="brand">
          {{ ligne.planNom }}
        </CzBadge>
      </template>
      <template #cell-statut="{ ligne }">
        <CzBadge :ton="STATUTS_ASSOCIATION[ligne.statut].ton">
          {{ STATUTS_ASSOCIATION[ligne.statut].libelle }}
        </CzBadge>
      </template>
      <template #cell-derniereActivite="{ ligne }">
        <span class="sa-assos__muted">{{ formatRelatif(ligne.derniereActivite) }}</span>
      </template>
      <template #cell-creeeLe="{ ligne }">
        <span class="sa-assos__muted">{{ entree(ligne.creeeLe) }}</span>
      </template>
      <template #cell-actions="{ ligne }">
        <CzMenu
          :elements="actions(ligne)"
          :label="`Actions sur ${ligne.nom}`"
          class="sa-assos__menu"
          @click.stop
        >
          <template #declencheur="{ basculer, attrs }">
            <CzButton
              variante="icone"
              taille="sm"
              icone="actions"
              :label="`Actions sur ${ligne.nom}`"
              v-bind="attrs"
              @click="basculer"
            />
          </template>
        </CzMenu>
      </template>
      <template #carte="{ ligne }">
        <div class="top">
          <div class="cz-person">
            <CzAvatar
              :nom="ligne.nom"
              :initiales="ligne.sigle"
              org
              ton="sa"
              class="sa-assos__avatar"
            />
            <div>
              <!-- La carte entière est cliquable (CzTable, `@ligne`) : pas de lien imbriqué. -->
              <span class="sa-assos__nom">{{ ligne.nom }}</span>
              <div class="sub">
                Plan {{ ligne.planNom }} · {{ pluriel(ligne.nbSouscripteurs, 'souscripteur') }}
              </div>
            </div>
          </div>
          <CzBadge :ton="STATUTS_ASSOCIATION[ligne.statut].ton">
            {{ STATUTS_ASSOCIATION[ligne.statut].libelle }}
          </CzBadge>
        </div>
      </template>
      <template #vide>
        <CzEmpty
          icone="filtre"
          ton="neutral"
          titre="Aucune association"
          :description="filtre ? 'Aucune association ne correspond à ces filtres.' : 'Les associations apparaissent ici dès leur création.'"
          integre
        >
          <template
            v-if="filtre"
            #action
          >
            <CzButton
              variante="fantome"
              taille="sm"
              @click="reinitialiser"
            >
              Réinitialiser les filtres
            </CzButton>
          </template>
        </CzEmpty>
      </template>
    </CzTable>

    <!-- Cartes -->
    <template v-else>
      <div
        v-if="chargement"
        class="sa-assos__cartes"
      >
        <CarteAssociation
          v-for="i in 3"
          :key="i"
          vue="superadmin"
          chargement
        />
      </div>
      <CzErreurChargement
        v-else-if="error"
        titre="Impossible d’afficher les associations"
        @reessayer="refresh()"
      />
      <div
        v-else-if="associations.length"
        class="sa-assos__cartes"
      >
        <CarteAssociation
          v-for="a in lignesPage"
          :key="a.id"
          vue="superadmin"
          :nom="a.nom"
          :initiales="a.sigle"
          :sous-titre="`Plan ${a.planNom} · ${pluriel(a.nbSouscripteurs, 'souscripteur')}`"
          :chiffres="[{ valeur: String(a.nbProjets), libelle: a.nbProjets > 1 ? 'projets' : 'projet' }, { valeur: formatRelatif(a.derniereActivite), libelle: 'dernière activité' }]"
          :statut="{ type: 'association', valeur: a.statut }"
          :to="lien(a)"
        />
      </div>
      <div
        v-else
        class="cz-card"
      >
        <CzEmpty
          icone="filtre"
          ton="neutral"
          titre="Aucune association"
          description="Aucune association ne correspond à ces filtres."
          integre
        >
          <template #action>
            <CzButton
              variante="fantome"
              taille="sm"
              @click="reinitialiser"
            >
              Réinitialiser les filtres
            </CzButton>
          </template>
        </CzEmpty>
      </div>
    </template>

    <div
      v-if="!chargement && !error"
      class="cz-tfoot"
    >
      <span>{{ pied }}</span>
      <CzPagination
        v-if="pages > 1"
        v-model:page="page"
        :pages="pages"
      />
    </div>
  </div>
</template>

<style scoped>
.sa-assos {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.sa-assos__total {
  height: 24px;
  padding: 0 var(--space-3);
  font-size: 13px;
}

.sa-assos__outils {
  flex-wrap: wrap;
}

.sa-assos__puces {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.sa-assos__sep {
  width: 1px;
  height: 24px;
  margin: 0 var(--space-1);
  background: var(--border);
}

.sa-assos__recherche {
  width: 240px;
  margin-left: auto;
}

.sa-assos__vue {
  align-self: flex-start;
}

.sa-assos__avatar {
  width: 36px;
  height: 36px;
  font-size: 12px;
}

.sa-assos__nom {
  font-weight: 600;
  color: var(--text-strong);
  text-decoration: none;
}

.sa-assos__nom:hover {
  text-decoration: underline;
}

.sa-assos__muted {
  color: var(--text-muted);
}

.sa-assos__cartes {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--space-4);
}

@media (max-width: 767px) {
  .sa-assos__sep {
    display: none;
  }

  .sa-assos__recherche {
    width: 100%;
    margin-left: 0;
  }
}
</style>
