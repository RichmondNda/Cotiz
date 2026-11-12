<!--
  En-tête du détail d'un projet (commun aux 6 onglets).
  Desktop : bandeau de couverture (motif par défaut sans image), nom, badge de statut, ligne de synthèse,
  « Ajouter un souscripteur » (primaire ; brouillon : « Ouvrir les inscriptions », écart ui-deviations), menu ⋯
  (dupliquer, exporter, clôturer ou, pour un brouillon, ouvrir les inscriptions), onglets liés à l'URL avec compteurs
  (souscripteurs : total gris ; paiements : à valider, orange).
  Mobile : en-tête avec retour vers la liste et sous-titre propre à l'onglet, onglets défilants (actif centré).
-->
<script setup lang="ts">
import type { Onglet } from '~/components/cz/CzTabs.vue'
import type { ElementMenu } from '~/components/cz/CzMenu.vue'
import type { Projet } from '~~/types'
import { libelleStatut } from '~/utils/statuts'
import { sousTitreDetailProjet } from '~/utils/projets-gestionnaire'

type CleOnglet = 'apercu' | 'souscripteurs' | 'paiements' | 'contrat' | 'parametres' | 'rapports'

const props = defineProps<{
  projet: Projet
  onglet: CleOnglet
}>()

const base = computed(() => `/asso/projets/${props.projet.id}`)
const brouillon = computed(() => props.projet.statut === 'brouillon')
/** Publication d'un brouillon : confirmée dans les paramètres du projet. */
const lienPublication = computed(() => ({ path: `${base.value}/parametres`, query: { publication: '1' } }))

const onglets = computed<Onglet[]>(() => [
  { label: 'Vue d’ensemble', to: base.value },
  { label: 'Souscripteurs', to: `${base.value}/souscripteurs`, compteur: props.projet.nbSouscripteurs, tonCompteur: 'neutral' },
  { label: 'Paiements', to: `${base.value}/paiements`, compteur: props.projet.nbPaiementsAValider || undefined, tonCompteur: 'warning' },
  { label: 'Contrat', to: `${base.value}/contrat` },
  { label: 'Paramètres', to: `${base.value}/parametres` },
  { label: 'Rapports', to: `${base.value}/rapports` },
])

const menu = computed<ElementMenu[]>(() => [
  { label: 'Dupliquer', icone: 'copier', to: { path: '/asso/projets/nouveau', query: { modele: props.projet.id } } },
  { label: 'Exporter', icone: 'telecharger', to: `${base.value}/rapports` },
  ...(brouillon.value
    ? [{ label: 'Ouvrir les inscriptions', icone: 'valide' as const, to: lienPublication.value, separe: true }]
    : props.projet.statut === 'termine'
      ? []
      : [{ label: 'Clôturer le projet', icone: 'supprimer' as const, to: { path: `${base.value}/parametres`, query: { cloture: '1' } }, danger: true, separe: true }]),
])

const sousTitreMobile = computed(() => {
  switch (props.onglet) {
    case 'apercu': return `${libelleStatut('projet', props.projet.statut).libelle} · ${props.projet.nbSouscripteurs} souscripteurs`
    case 'souscripteurs': return `Souscripteurs · ${props.projet.nbSouscripteurs}`
    case 'paiements': return 'Paiements · grille des échéances'
    case 'contrat': return 'Contrat'
    case 'parametres': return 'Paramètres du projet'
    default: return 'Rapports'
  }
})
</script>

<template>
  <div class="projet-entete">
    <EnTeteGestionnaireMobile
      :titre="projet.nom"
      :sous-titre="sousTitreMobile"
      retour="/asso/projets"
      libelle-retour="Retour aux projets"
      :cloche="false"
    />

    <div class="projet-entete__desktop cz-desktop">
      <div
        class="projet-entete__couverture"
        :style="projet.imageCouvertureUrl ? { backgroundImage: `url(${projet.imageCouvertureUrl})` } : undefined"
      >
        <template v-if="!projet.imageCouvertureUrl">
          <span
            class="projet-entete__anneau"
            aria-hidden="true"
          />
          <span
            class="projet-entete__point"
            aria-hidden="true"
          />
          <span class="projet-entete__legende">Image de couverture</span>
        </template>
      </div>
      <div class="projet-entete__ligne">
        <div class="projet-entete__textes">
          <div class="projet-entete__titre">
            <h1>{{ projet.nom }}</h1>
            <BadgeStatut
              type="projet"
              :statut="projet.statut"
            />
          </div>
          <p>{{ sousTitreDetailProjet(projet) }}</p>
        </div>
        <CzButton
          v-if="brouillon"
          taille="lg"
          :to="lienPublication"
        >
          Ouvrir les inscriptions
        </CzButton>
        <CzButton
          v-else-if="projet.statut !== 'termine'"
          taille="lg"
          icone="ajouter"
          :to="{ path: `${base}/souscripteurs`, query: { ajout: '1' } }"
        >
          Ajouter un souscripteur
        </CzButton>
        <CzMenu
          :elements="menu"
          label="Plus d’actions"
        >
          <template #declencheur="{ basculer, attrs }">
            <CzButton
              variante="icone"
              icone="actions"
              label="Plus d’actions"
              v-bind="attrs"
              @click="basculer"
            />
          </template>
        </CzMenu>
      </div>
    </div>

    <CzTabs
      :onglets="onglets"
      label="Sections du projet"
      class="projet-entete__onglets"
    />
  </div>
</template>

<style scoped>
.projet-entete {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.projet-entete__desktop {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.projet-entete__couverture {
  position: relative;
  height: 88px;
  overflow: hidden;
  border-radius: var(--r-card);
  background: var(--brand-pale) center / cover no-repeat;
}

.projet-entete__anneau {
  position: absolute;
  top: -60px;
  right: 60px;
  width: 220px;
  height: 220px;
  border: 18px solid var(--brand);
  border-radius: 50%;
  opacity: 0.18;
}

.projet-entete__point {
  position: absolute;
  top: 36px;
  right: 150px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--corail);
}

.projet-entete__legende {
  position: absolute;
  bottom: var(--space-3);
  left: 18px;
  font-size: 11.5px;
  color: var(--brand-dark);
}

.projet-entete__ligne {
  display: flex;
  align-items: flex-end;
  gap: var(--space-4);
}

.projet-entete__textes {
  flex: 1;
  min-width: 0;
}

.projet-entete__titre {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
}

.projet-entete__titre h1 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 28px;
  font-weight: 600;
  color: var(--text-strong);
}

.projet-entete__textes p {
  margin: 2px 0 0;
  font-size: 14px;
  color: var(--text-muted);
}

/* Desktop : onglets répartis sur toute la largeur (maquette). */
@media (min-width: 768px) {
  .projet-entete__onglets :deep(> span) {
    flex: 1;
    justify-content: center;
  }
}

@media (max-width: 767px) {
  .projet-entete {
    gap: 0;
  }

  /* Onglets pleine largeur sous l'en-tête, sans compteurs (comme les captures mobiles). */
  .projet-entete__onglets {
    margin: 0 calc(-1 * var(--space-3));
    padding: 0 var(--space-2);
    background: var(--surface);
  }

  .projet-entete__onglets :deep(.cz-count) {
    display: none;
  }
}
</style>
