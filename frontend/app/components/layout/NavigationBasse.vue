<!--
  Navigation basse mobile : gestionnaire (5 entrées : Accueil, Projets, Paiements, Membres, Plus)
  ou souscripteur (4 entrées : Accueil, Projets, Historique, Profil). Entrée active : pastille brand-pale, texte brand-dark.
  Cibles ≥ 44 px (48 px de haut).
-->
<script setup lang="ts">
import { estEntreeActive, type EntreeNavigation } from '~/config/navigation'

const props = withDefaults(defineProps<{
  entrees: EntreeNavigation[]
  /** Chemins supplémentaires qui activent une entrée (ex. /projets/** → « Projets » du souscripteur). */
  alias?: Record<string, string[]>
}>(), { alias: () => ({}) })

const route = useRoute()
const { data: compteurs } = useCompteursNavigation()

function actif(e: EntreeNavigation) {
  return estEntreeActive(e, route.path)
    || (props.alias[e.cle] ?? []).some(p => route.path === p || route.path.startsWith(`${p}/`))
}
function compteur(e: EntreeNavigation) {
  return e.compteur ? compteurs.value?.[e.compteur] || undefined : undefined
}
</script>

<template>
  <nav
    class="nav-basse"
    aria-label="Navigation principale"
  >
    <NuxtLink
      v-for="e in entrees"
      :key="e.cle"
      :to="e.to"
      class="nav-basse__it"
      :class="{ 'is-on': actif(e) }"
      :aria-current="actif(e) ? 'page' : undefined"
    >
      <span class="nav-basse__pastille">
        <CzIcon
          :nom="e.icone"
          :taille="22"
        />
        <CzCount
          v-if="compteur(e)"
          :valeur="compteur(e)!"
          :ton="e.tonCompteur ?? 'danger'"
          class="nav-basse__compte"
        />
      </span>
      {{ e.label }}
    </NuxtLink>
  </nav>
</template>

<style scoped>
.nav-basse {
  display: flex;
  justify-content: space-around;
  padding: 6px 0 calc(var(--space-3) + env(safe-area-inset-bottom));
  background: var(--surface);
  border-top: 1px solid var(--border);
  font-family: var(--font-text);
}

.nav-basse__it {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  min-width: 64px;
  min-height: 48px;
  font-size: 10.5px;
  font-weight: 600;
  color: var(--text-muted);
  text-decoration: none;
}

.nav-basse__it.is-on {
  color: var(--brand-dark);
}

.nav-basse__pastille {
  position: relative;
  display: inline-flex;
  padding: 3px 14px;
  border-radius: var(--r-pill);
}

.nav-basse__it.is-on .nav-basse__pastille {
  background: var(--brand-pale);
}

.nav-basse__it:focus-visible {
  outline: none;
}

.nav-basse__it:focus-visible .nav-basse__pastille {
  box-shadow: var(--focus-ring);
}

.nav-basse__compte {
  position: absolute;
  top: -4px;
  right: 4px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  font-size: 10px;
}
</style>
