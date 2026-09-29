<!--
  Page d'erreur de l'application (404, 500…), aux couleurs du design system.
  En V0, les écrans des lots suivants mènent ici tant qu'ils ne sont pas construits.
-->
<script setup lang="ts">
import type { NuxtError } from '#app'

const props = defineProps<{ error: NuxtError }>()

const { role } = useSession()
const accueil = computed(() => (role.value ? ACCUEIL_PAR_ROLE[role.value] : '/'))
const introuvable = computed(() => props.error.statusCode === 404)
const theme = computed(() => (role.value === 'souscripteur' ? 'member' : role.value === 'superadmin' ? 'superadmin' : 'manager'))

useHead({ title: introuvable.value ? 'Page introuvable — Cotiz' : 'Erreur — Cotiz', bodyAttrs: { 'data-theme': theme } })

function retour() {
  clearError({ redirect: accueil.value })
}

/** Erreur serveur : recharge la page courante. */
function reessayer() {
  reloadNuxtApp({ force: true })
}
</script>

<template>
  <main
    class="page-erreur"
    :data-theme="theme"
  >
    <CzLogo />
    <CzEmpty
      class="page-erreur__carte"
      :icone="introuvable ? 'recherche' : 'alerte'"
      :ton="introuvable ? 'neutral' : 'danger'"
      :titre="introuvable ? 'Page introuvable' : 'Une erreur est survenue'"
      :description="introuvable
        ? 'Cette page n’existe pas ou n’est pas encore disponible.'
        : 'Nous n’avons pas pu afficher cette page. Réessayez dans un instant.'"
    >
      <template #action>
        <div class="page-erreur__actions">
          <CzButton
            v-if="!introuvable"
            @click="reessayer"
          >
            Réessayer
          </CzButton>
          <CzButton
            :variante="introuvable ? 'primaire' : 'secondaire'"
            @click="retour"
          >
            Retour à l’accueil
          </CzButton>
        </div>
      </template>
    </CzEmpty>
  </main>
</template>

<style scoped>
.page-erreur {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-6);
  min-height: 100vh;
  padding: var(--space-6) var(--space-4);
  background: var(--page);
}

.page-erreur__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--space-3);
}

.page-erreur__carte {
  width: 100%;
  max-width: 420px;
  box-shadow: var(--shadow);
}
</style>
