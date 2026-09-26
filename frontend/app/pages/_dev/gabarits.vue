<!-- Index des gabarits de démonstration (développement uniquement). -->
<script setup lang="ts">
definePageMeta({ middleware: 'dev-uniquement', layout: false })
useHead({ title: 'Gabarits — Cotiz' })

const GABARITS = [
  { to: '/_dev/gabarit-public', label: 'Site public (PublicHeader, PublicFooter)', role: null },
  { to: '/_dev/gabarit-connexion', label: 'Connexion (écran scindé, panneau du profil)', role: null },
  { to: '/_dev/gabarit-gestionnaire', label: 'Back-office gestionnaire (MgSidebar, MgTopbar, MgMobNav)', role: 'gestionnaire' },
  { to: '/_dev/gabarit-plateforme', label: 'Back-office super-admin (SaSidebar, SaTopbar, tiroir mobile)', role: 'superadmin' },
  { to: '/_dev/gabarit-souscripteur', label: 'Souscripteur (MbNav, bouton flottant, barre latérale desktop)', role: 'souscripteur' },
  { to: '/_dev/donnees', label: 'Données mockées (composables/api, ?scenario=)', role: 'gestionnaire' },
] as const

const { connecter } = useSession()
</script>

<template>
  <main class="dev-gabarits">
    <h1 class="cz-h2">
      Gabarits
    </h1>
    <p class="cz-help">
      Les gabarits protégés lisent la session mockée (cookie <code>cotiz_role</code>) : le lien ouvre la page avec le bon rôle.
    </p>
    <ul>
      <li
        v-for="g in GABARITS"
        :key="g.to"
      >
        <CzButton
          v-if="g.role"
          variante="fantome"
          @click="connecter(g.role, g.to)"
        >
          {{ g.label }}
        </CzButton>
        <CzButton
          v-else
          variante="fantome"
          :to="g.to"
        >
          {{ g.label }}
        </CzButton>
      </li>
    </ul>
    <NuxtLink to="/_dev/composants">
      ← Composants
    </NuxtLink>
  </main>
</template>

<style scoped>
.dev-gabarits {
  max-width: 720px;
  margin: 0 auto;
  padding: var(--space-8) var(--space-4);
}

ul {
  padding: 0;
  list-style: none;
}
</style>
