<!--
  Détail d'un projet (gestionnaire) : page parente des onglets (vue d'ensemble, souscripteurs, paiements, contrat,
  paramètres, rapports) et de l'import. Charge le projet, porte l'en-tête et le fil d'Ariane, affiche l'onglet (<NuxtPage />).
  Les onglets déclarent `ongletProjet` ; l'import déclare `enTeteProjet: false` (page plein écran).
  Scénarios (vue d'ensemble) : `aucun-retard`, `termine`.
-->
<script setup lang="ts">
definePageMeta({ middleware: 'espace-gestionnaire', layout: 'backoffice', espace: 'gestionnaire' })

const route = useRoute()
const id = computed(() => String(route.params.id))
const { data: projet, pending, error, refresh } = useProjet(id)

const LIBELLES = {
  apercu: '',
  souscripteurs: 'Souscripteurs',
  paiements: 'Paiements',
  contrat: 'Contrat',
  parametres: 'Paramètres',
  rapports: 'Rapports',
  import: 'Import Excel',
} as const
const onglet = computed(() => route.meta.ongletProjet ?? 'apercu')
const avecEnTete = computed(() => route.meta.enTeteProjet !== false)

useHead(() => ({ title: projet.value ? `${projet.value.nom} · Cotiz` : 'Projet · Cotiz' }))
useFilAriane(() => {
  const nom = projet.value?.nom ?? '…'
  const base = `/asso/projets/${id.value}`
  if (onglet.value === 'import') {
    return [{ label: nom, to: base }, { label: 'Souscripteurs', to: `${base}/souscripteurs` }, { label: 'Import Excel' }]
  }
  const libelle = LIBELLES[onglet.value]
  return [
    { label: 'Projets', to: '/asso/projets' },
    libelle ? { label: nom, to: base } : { label: nom },
    ...(libelle ? [{ label: libelle }] : []),
  ]
})
</script>

<template>
  <div class="detail-projet">
    <template v-if="avecEnTete">
      <div
        v-if="pending && !projet"
        class="detail-projet__squelette"
        aria-busy="true"
      >
        <CzSkeleton
          :hauteur="88"
          class="cz-desktop"
        />
        <CzSkeleton
          :hauteur="28"
          largeur="40%"
        />
        <CzSkeleton
          :hauteur="14"
          largeur="30%"
        />
        <CzSkeleton :hauteur="44" />
      </div>
      <CzErreurChargement
        v-else-if="error"
        :titre="error.statusCode === 404 ? 'Projet introuvable' : 'Impossible d’afficher le projet'"
        :description="error.statusCode === 404 ? 'Ce projet n’existe pas ou a été supprimé.' : undefined"
        @reessayer="refresh()"
      >
        <template
          v-if="error.statusCode === 404"
          #action
        >
          <CzButton
            variante="secondaire"
            to="/asso/projets"
          >
            Voir les projets
          </CzButton>
        </template>
      </CzErreurChargement>
      <ProjetHeader
        v-else-if="projet"
        :projet="projet"
        :onglet="onglet === 'import' ? 'souscripteurs' : onglet"
      />
    </template>
    <NuxtPage v-if="!avecEnTete || projet" />
  </div>
</template>

<style scoped>
.detail-projet {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.detail-projet__squelette {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

@media (max-width: 767px) {
  .detail-projet {
    gap: var(--space-4);
  }
}
</style>
