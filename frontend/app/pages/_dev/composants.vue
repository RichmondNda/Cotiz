<!--
  Page de démonstration du design system (développement uniquement) : chaque composant avec ses variantes et états,
  dans l'ordre des fiches design/design-system/components/<Composant>/preview.html. Sélecteur de thème en tête.
-->
<script setup lang="ts">
definePageMeta({ middleware: 'dev-uniquement', layout: false })

type Theme = 'member' | 'manager' | 'superadmin'
const route = useRoute()
const router = useRouter()
const theme = ref<Theme>(['member', 'manager', 'superadmin'].includes(String(route.query.theme)) ? route.query.theme as Theme : 'manager')
watch(theme, t => router.replace({ query: { ...route.query, theme: t } }))
useHead({ title: 'Composants — Cotiz', bodyAttrs: { 'data-theme': theme } })

const SOMMAIRE = [
  ['icones', 'Icônes'], ['logo', 'Logo'], ['bouton', 'Bouton'], ['badge', 'Badge'], ['avatar', 'Avatar'],
  ['champ-texte', 'Champ de texte'], ['selection', 'Sélection'], ['zone-depot', 'Zone de dépôt'],
  ['carte', 'Carte'], ['carte-kpi', 'Carte KPI'], ['etats-vides', 'États vides'], ['retours', 'Retours'],
  ['navigation', 'Navigation'], ['tableau', 'Tableau'], ['superpositions', 'Superpositions'],
  ['grille-echeances', 'Grille d’échéances'], ['selecteur-echeances', 'Sélecteur d’échéances'],
  ['carte-projet', 'Carte projet'], ['carte-synthese', 'Carte synthèse'], ['carte-association', 'Carte association'],
  ['visionneuse-preuve', 'Visionneuse de preuve'], ['notification', 'Notification'], ['frise', 'Frise'], ['graphiques', 'Graphiques'],
] as const
</script>

<template>
  <div
    class="dev-page"
    :data-theme="theme"
  >
    <header class="dev-entete">
      <CzLogo />
      <h1 class="dev-titre">
        Composants du design system
      </h1>
      <CzSegmented
        v-model="theme"
        label="Thème"
        :options="[
          { valeur: 'member', label: 'Souscripteur' },
          { valeur: 'manager', label: 'Gestionnaire' },
          { valeur: 'superadmin', label: 'Super-admin' },
        ]"
      />
    </header>
    <nav
      class="dev-sommaire"
      aria-label="Sommaire"
    >
      <a
        v-for="[id, label] in SOMMAIRE"
        :key="id"
        :href="`#${id}`"
      >{{ label }}</a>
      <NuxtLink to="/_dev/gabarits">Gabarits →</NuxtLink>
    </nav>
    <main class="dev-contenu">
      <DevAtomes />
      <DevFormulaires />
      <DevContenus />
      <DevSuperpositions />
      <DevMetier />
    </main>
  </div>
</template>

<style scoped>
.dev-page {
  min-height: 100vh;
  background: var(--page);
}

.dev-entete {
  position: sticky;
  top: 0;
  z-index: 30;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-3) var(--space-8);
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}

.dev-titre {
  flex: 1;
  margin: 0;
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 600;
  color: var(--text-strong);
}

.dev-sommaire {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2) var(--space-4);
  padding: var(--space-3) var(--space-8);
  font-size: 13px;
}

.dev-sommaire a {
  color: var(--brand-dark);
  text-decoration: none;
}

.dev-contenu {
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
  padding: var(--space-4) var(--space-8) var(--space-12);
}

@media (max-width: 767px) {
  .dev-entete,
  .dev-sommaire,
  .dev-contenu {
    padding-inline: var(--space-4);
  }
}
</style>
