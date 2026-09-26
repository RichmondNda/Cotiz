<!--
  Onglets soulignés brand. Liés à la route (`to` sur chaque onglet : l'onglet actif suit l'URL)
  ou pilotés par v-model (`valeur`). Compteur orange quand une action attend, gris pour un total.
  Mobile : défilement horizontal, onglet actif centré.
-->
<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'

export interface Onglet {
  label: string
  to?: RouteLocationRaw
  valeur?: string
  compteur?: number | string
  tonCompteur?: 'warning' | 'neutral' | 'danger'
  disabled?: boolean
  bientot?: boolean
}

const props = withDefaults(defineProps<{
  onglets: Onglet[]
  label?: string
  /** Correspondance exacte de la route (défaut) ou par préfixe. */
  exact?: boolean
}>(), { label: undefined, exact: true })

const modele = defineModel<string | undefined>({ default: undefined })
const route = useRoute()
const router = useRouter()
const racine = ref<HTMLElement | null>(null)

function estActif(o: Onglet): boolean {
  if (o.to) {
    const cible = router.resolve(o.to).path.replace(/\/$/, '')
    const courant = route.path.replace(/\/$/, '')
    return props.exact ? courant === cible : courant === cible || courant.startsWith(`${cible}/`)
  }
  return o.valeur !== undefined && o.valeur === modele.value
}

function choisir(o: Onglet) {
  if (o.disabled || o.to) return
  modele.value = o.valeur
}

// Centre l'onglet actif en ne faisant défiler que la barre d'onglets (pas la page).
function centrerActif() {
  const nav = racine.value
  const actif = nav?.querySelector<HTMLElement>('.is-on')
  if (!nav || !actif || nav.scrollWidth <= nav.clientWidth) return
  nav.scrollLeft = actif.offsetLeft - (nav.clientWidth - actif.offsetWidth) / 2
}
onMounted(centrerActif)
watch(() => route.path, () => nextTick(centrerActif))
</script>

<template>
  <nav
    ref="racine"
    class="cz-tabs cz-tabs-defil"
    :aria-label="label"
  >
    <span
      v-for="o in onglets"
      :key="o.label"
      :class="{ 'is-on': estActif(o), 'is-disabled': o.disabled }"
    >
      <NuxtLink
        v-if="o.to && !o.disabled"
        :to="o.to"
        class="cz-tabs__lien"
        :aria-current="estActif(o) ? 'page' : undefined"
      >{{ o.label }}</NuxtLink>
      <button
        v-else
        type="button"
        class="cz-tabs__lien"
        :disabled="o.disabled"
        :aria-pressed="estActif(o)"
        @click="choisir(o)"
      >{{ o.label }}</button>
      <CzCount
        v-if="o.compteur !== undefined && o.compteur !== 0"
        :valeur="o.compteur"
        :ton="o.tonCompteur"
      />
      <CzSoon
        v-if="o.bientot"
        petit
      >Bientôt</CzSoon>
    </span>
  </nav>
</template>

<style scoped>
.cz-tabs-defil {
  position: relative;
  overflow-x: auto;
  scrollbar-width: none;
}

.cz-tabs-defil::-webkit-scrollbar {
  display: none;
}

.cz-tabs span {
  position: relative;
}

/* Lien étiré : toute la surface de l'onglet est cliquable. */
.cz-tabs__lien {
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  color: inherit;
  text-decoration: none;
  cursor: inherit;
}

.cz-tabs__lien::after {
  content: "";
  position: absolute;
  inset: 0;
}

.cz-tabs__lien:focus-visible {
  outline: none;
}

.cz-tabs span:has(.cz-tabs__lien:focus-visible) {
  box-shadow: var(--focus-ring);
  border-radius: var(--r-sm) var(--r-sm) 0 0;
}
</style>
