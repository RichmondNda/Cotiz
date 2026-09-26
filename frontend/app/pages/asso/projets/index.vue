<!--
  MgProjets — liste des projets de l'association : accéder à un projet et comparer leur état.
  Puces de statut avec compteurs, recherche, vue cartes / tableau (tri sur chaque colonne, menu ⋯ par ligne).
  Filtre, recherche et vue vivent dans l'URL (`?statut=termine&q=Tontine&vue=tableau`) : partageables et capturables.
  Mobile : en-tête avec « + Nouveau », puces défilantes, cartes seulement.
  États : nominal, vide (scénario `vide`), filtre sans résultat (`?statut=termine&q=Tontine`), chargement, erreur.
-->
<script setup lang="ts">
import type { ColonneTable, TriTable } from '~/components/cz/CzTable.vue'
import type { ElementMenu } from '~/components/cz/CzMenu.vue'
import type { Projet, StatutProjet } from '~~/types'
import { formatDate, formatFCFA, formatMois, formatPourcent, pluriel } from '~/utils/format'
import { LIBELLES_FREQUENCE } from '~/utils/echeancier'
import {
  alerteProjet,
  echeancePied,
  inscritsProjet,
  lienProjetGestionnaire,
  proprietesCarteProjet,
  trierParRetards,
} from '~/utils/projets-gestionnaire'

definePageMeta({ middleware: 'espace-gestionnaire', layout: 'backoffice', espace: 'gestionnaire', titre: 'Projets' })
useHead({ title: 'Projets · Cotiz' })

type Filtre = 'tous' | StatutProjet
type Vue = 'cartes' | 'tableau'

const route = useRoute()
const router = useRouter()
const { data: moi } = useMoi()
const { data, pending, error, refresh } = useProjets()

const FILTRES: { valeur: Filtre, label: string, court: string, adjectif: string }[] = [
  { valeur: 'tous', label: 'Tous', court: 'Tous', adjectif: '' },
  { valeur: 'en_cours', label: 'En cours', court: 'En cours', adjectif: 'en cours' },
  { valeur: 'inscriptions_ouvertes', label: 'Inscriptions ouvertes', court: 'Inscriptions', adjectif: 'aux inscriptions ouvertes' },
  { valeur: 'brouillon', label: 'Brouillons', court: 'Brouillons', adjectif: 'en brouillon' },
  { valeur: 'termine', label: 'Terminés', court: 'Terminés', adjectif: 'terminé' },
]

// ---------------------------------------------------------------- État dans l'URL
function lireQuery(cle: string): string {
  const v = route.query[cle]
  return typeof v === 'string' ? v : ''
}
function ecrireQuery(cle: string, valeur: string, defaut = '') {
  const query = { ...route.query, [cle]: valeur === defaut ? undefined : valeur }
  router.replace({ query })
}

const filtre = computed<Filtre>({
  get: () => (FILTRES.some(f => f.valeur === lireQuery('statut')) ? lireQuery('statut') as Filtre : 'tous'),
  set: v => ecrireQuery('statut', v, 'tous'),
})
const vue = computed<Vue>({
  get: () => (lireQuery('vue') === 'tableau' ? 'tableau' : 'cartes'),
  set: v => ecrireQuery('vue', v, 'cartes'),
})
// La saisie reste locale (pas de navigation à chaque touche) et se reporte dans l'URL après une courte pause.
const recherche = ref(lireQuery('q'))
let minuterie: ReturnType<typeof setTimeout> | undefined
watch(recherche, (q) => {
  clearTimeout(minuterie)
  minuterie = setTimeout(() => ecrireQuery('q', q.trim()), 250)
})
watch(() => route.query.q, q => (recherche.value = typeof q === 'string' ? q : ''))

function effacerFiltres() {
  recherche.value = ''
  router.replace({ query: { ...route.query, statut: undefined, q: undefined } })
}

// ---------------------------------------------------------------- Données
const projets = computed(() => trierParRetards(data.value ?? []))
const compte = (f: Filtre) => (f === 'tous' ? projets.value.length : projets.value.filter(p => p.statut === f).length)
const optionsPuces = computed(() => FILTRES.map(f => ({ valeur: f.valeur, label: f.label, compteur: compte(f.valeur) })))

const normaliser = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('fr')
const filtres = computed(() => {
  const q = normaliser(lireQuery('q').trim())
  return projets.value.filter(p => (filtre.value === 'tous' || p.statut === filtre.value) && (!q || normaliser(p.nom).includes(q)))
})

const chargement = computed(() => pending.value && !data.value)
const vide = computed(() => !chargement.value && !error.value && projets.value.length === 0)
const sansResultat = computed(() => !vide.value && !chargement.value && !error.value && filtres.value.length === 0)

const sousTitre = computed(() => [pluriel(projets.value.length, 'projet'), moi.value?.association?.nom].filter(Boolean).join(' · '))
const descriptionSansResultat = computed(() => {
  const f = FILTRES.find(x => x.valeur === filtre.value)!
  const q = lireQuery('q').trim()
  return `Aucun projet${f.adjectif ? ` ${f.adjectif}` : ''}${q ? ` pour « ${q} »` : ''}.`
})

// ---------------------------------------------------------------- Tableau
const COLONNES: ColonneTable[] = [
  { cle: 'nom', label: 'Projet', triable: true },
  { cle: 'statut', label: 'Statut', triable: true, squelette: 'badge' },
  { cle: 'frequence', label: 'Fréquence', triable: true },
  { cle: 'montant', label: 'Par échéance', num: true, triable: true, squelette: 'montant' },
  { cle: 'souscripteurs', label: 'Souscripteurs', num: true, triable: true },
  { cle: 'collecte', label: 'Collecté', num: true, triable: true, squelette: 'montant' },
  { cle: 'recouvrement', label: 'Recouvrement', num: true, triable: true },
  { cle: 'prochaine', label: 'Prochaine échéance', triable: true },
  { cle: 'actions', label: '', largeur: '56px' },
]
const tri = ref<TriTable | null>({ cle: 'nom', sens: 'asc' })

const lignes = computed(() => filtres.value.map((p) => {
  const ouvert = p.statut === 'inscriptions_ouvertes'
  return {
    id: p.id,
    nom: p.nom,
    statut: p.statut,
    frequence: `${LIBELLES_FREQUENCE[p.frequence]}${p.jourEcheance ? `, le ${p.jourEcheance}` : ''}`,
    montant: p.montantEcheance,
    souscripteurs: inscritsProjet(p),
    collecte: ouvert ? '—' : formatFCFA(p.montantCollecte),
    recouvrement: ouvert ? '—' : formatPourcent(p.tauxRecouvrement),
    prochaine: p.prochaineEcheance ?? '',
    projet: p,
  }
}))

function actions(p: Projet): ElementMenu[] {
  return [
    { label: 'Ouvrir', icone: 'voir', to: lienProjetGestionnaire(p) },
    { label: 'Dupliquer', icone: 'copier', to: { path: '/asso/projets/nouveau', query: { modele: p.id } } },
    { label: 'Archiver', icone: 'supprimer', to: `${lienProjetGestionnaire(p)}/parametres`, danger: true, separe: true },
  ]
}
function prochaineTableau(p: Projet): string {
  if (!p.prochaineEcheance || !/^\d{4}-/.test(p.prochaineEcheance)) return '—'
  return p.statut === 'inscriptions_ouvertes' ? formatMois(p.prochaineEcheance, 'court-annee').toLowerCase() : formatDate(p.prochaineEcheance)
}
</script>

<template>
  <div class="projets">
    <EnTeteGestionnaireMobile
      titre="Projets"
      :sous-titre="pluriel(projets.length, 'projet')"
    >
      <template #actions>
        <CzButton
          taille="sm"
          to="/asso/projets/nouveau"
          aria-label="Nouveau projet"
        >
          + Nouveau
        </CzButton>
      </template>
    </EnTeteGestionnaireMobile>
    <EnTetePage
      titre="Projets"
      :sous-titre="sousTitre"
      class="cz-desktop"
    >
      <template #actions>
        <CzButton
          taille="lg"
          icone="ajouter"
          to="/asso/projets/nouveau"
        >
          Créer un projet
        </CzButton>
      </template>
    </EnTetePage>

    <div class="cz-toolbar projets__outils">
      <CzChips
        v-model="filtre"
        :options="optionsPuces"
        label="Filtrer par statut"
        class="projets__puces cz-desktop"
      />
      <div
        class="projets__puces-mobile cz-mobile"
        role="group"
        aria-label="Filtrer par statut"
      >
        <CzChip
          v-for="f in FILTRES"
          :key="f.valeur"
          :actif="filtre === f.valeur"
          @click="filtre = f.valeur"
        >
          {{ f.court }} · {{ compte(f.valeur) }}
        </CzChip>
      </div>
      <div class="end cz-desktop">
        <CzInput
          v-model="recherche"
          type="search"
          placeholder="Rechercher un projet"
          label="Rechercher un projet"
          class="projets__recherche"
        />
        <CzSegmented
          v-model="vue"
          :options="[{ valeur: 'cartes', label: 'Cartes' }, { valeur: 'tableau', label: 'Tableau' }]"
          label="Affichage"
        />
      </div>
    </div>

    <!-- Chargement -->
    <div
      v-if="chargement"
      class="projets__grille"
    >
      <CarteProjet
        v-for="i in 3"
        :key="i"
        chargement
      />
    </div>

    <CzEmpty
      v-else-if="error"
      icone="alerte"
      ton="danger"
      titre="Impossible d’afficher les projets"
      description="Vérifiez votre connexion, puis réessayez."
    >
      <template #action>
        <CzButton
          variante="secondaire"
          @click="refresh()"
        >
          Réessayer
        </CzButton>
      </template>
    </CzEmpty>

    <!-- Vide -->
    <template v-else-if="vide">
      <CzEmpty
        icone="projet"
        titre="Aucun projet pour l’instant"
        description="Créez votre premier projet pour commencer à inscrire des souscripteurs."
        class="projets__vide cz-desktop"
      >
        <template #action>
          <CzButton
            taille="sm"
            to="/asso/projets/nouveau"
          >
            Créer un projet
          </CzButton>
        </template>
      </CzEmpty>
      <CzCard
        variante="lg"
        class="cz-mobile"
      >
        <CzEmpty
          icone="projet"
          titre="Aucun projet"
          description="Créez un projet pour commencer à suivre les cotisations."
          integre
          class="projets__vide-mobile"
        >
          <template #action>
            <CzButton to="/asso/projets/nouveau">
              Nouveau projet
            </CzButton>
          </template>
        </CzEmpty>
      </CzCard>
    </template>

    <!-- Filtre sans résultat -->
    <template v-else-if="sansResultat">
      <CzEmpty
        icone="recherche"
        ton="neutral"
        titre="Aucun projet ne correspond"
        :description="descriptionSansResultat"
        class="cz-desktop"
      >
        <template #action>
          <CzButton
            variante="fantome"
            taille="sm"
            @click="effacerFiltres"
          >
            Effacer les filtres
          </CzButton>
        </template>
      </CzEmpty>
      <CzCard
        variante="lg"
        class="cz-mobile"
      >
        <CzEmpty
          icone="recherche"
          ton="neutral"
          titre="Aucun projet dans ce filtre"
          integre
          class="projets__vide-mobile"
        >
          <template #action>
            <CzButton
              variante="secondaire"
              @click="effacerFiltres"
            >
              Voir tous les projets
            </CzButton>
          </template>
        </CzEmpty>
      </CzCard>
    </template>

    <template v-else>
      <!-- Cartes (toujours en mobile) -->
      <div
        class="projets__grille"
        :class="{ 'projets__grille--mobile-seul': vue === 'tableau' }"
      >
        <CarteProjet
          v-for="p in filtres"
          :key="p.id"
          v-bind="proprietesCarteProjet(p)"
        >
          <template #pied>
            <span class="cz-help cz-desktop">{{ echeancePied(p) }}</span>
            <span class="cz-help cz-mobile">{{ inscritsProjet(p) }} souscripteurs · {{ echeancePied(p, 'mobile') }}</span>
            <template v-if="alerteProjet(p)">
              <CzBadge
                :ton="alerteProjet(p)!.ton"
                class="cz-desktop"
              >
                {{ alerteProjet(p)!.texte }}
              </CzBadge>
              <CzBadge
                :ton="alerteProjet(p, true)!.ton"
                petit
                class="cz-mobile"
              >
                {{ alerteProjet(p, true)!.texte }}
              </CzBadge>
            </template>
          </template>
        </CarteProjet>
        <CarteNouveauProjet
          v-if="filtre === 'tous' && !lireQuery('q')"
          class="projets__fantome cz-desktop"
        />
      </div>

      <!-- Tableau (desktop) -->
      <CzTable
        v-if="vue === 'tableau'"
        v-model:tri="tri"
        :colonnes="COLONNES"
        :lignes="lignes"
        label="Projets"
        class="cz-desktop"
        @ligne="l => router.push(lienProjetGestionnaire(l.projet))"
      >
        <template #cell-nom="{ ligne }">
          <NuxtLink
            :to="lienProjetGestionnaire(ligne.projet)"
            class="projets__nom"
          >
            {{ ligne.nom }}
          </NuxtLink>
        </template>
        <template #cell-statut="{ ligne }">
          <BadgeStatut
            type="projet"
            :statut="ligne.statut"
          />
        </template>
        <template #cell-montant="{ ligne }">
          {{ formatFCFA(ligne.montant) }}
        </template>
        <template #cell-prochaine="{ ligne }">
          <span class="projets__muted">{{ prochaineTableau(ligne.projet) }}</span>
        </template>
        <template #cell-actions="{ ligne }">
          <CzMenu
            :elements="actions(ligne.projet)"
            :label="`Actions sur ${ligne.nom}`"
            @click.stop
          />
        </template>
      </CzTable>
    </template>
  </div>
</template>

<style scoped>
.projets {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.projets__outils .end {
  align-items: center;
  gap: var(--space-3);
}

.projets__recherche {
  width: 240px;
}

.projets__grille {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-4);
  align-items: start;
}

.projets__grille--mobile-seul {
  display: none;
}

.projets__fantome {
  min-height: 180px;
}

.projets__vide {
  padding: var(--space-12);
}

/* Menu ⋯ : la liste déroulante déborde du cadre du tableau (maquette : `overflow: visible`). */
.projets :deep(.cz-table-wrap) {
  overflow: visible;
}

.projets :deep(.cz-table th) {
  white-space: normal;
}

.projets__nom {
  font-weight: 600;
  color: var(--text-strong);
  text-decoration: none;
}

.projets__nom:hover {
  color: var(--brand-dark);
}

.projets__muted {
  color: var(--text-muted);
}

/* Mobile : la maquette montre les états vides sans pastille d'icône. */
.projets__vide-mobile :deep(.i) {
  display: none;
}

.projets__puces-mobile {
  display: flex;
  gap: var(--space-2);
  margin: 0 calc(-1 * var(--space-3));
  padding: 0 var(--space-3) var(--space-1);
  overflow-x: auto;
  scrollbar-width: none;
}

.projets__puces-mobile > * {
  flex-shrink: 0;
  min-height: 44px;
  white-space: nowrap;
}

@media (max-width: 1023px) {
  .projets__grille {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 767px) {
  .projets {
    gap: var(--space-4);
  }

  .projets__grille,
  .projets__grille--mobile-seul {
    display: flex;
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
