<!--
  Menu contextuel 220 px sous un déclencheur (slot `declencheur`, reçoit { ouvert, basculer, attrs }).
  Action destructive en dernier, séparée, en danger. Clavier : ↑ ↓, Entrée, Échap ; clic extérieur ferme.
-->
<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'
import type { NomIcone } from '~/utils/icons'
import { useClicExterieur } from '~/composables/useClicExterieur'

export interface ElementMenu {
  label: string
  icone?: NomIcone
  to?: RouteLocationRaw
  action?: () => void
  danger?: boolean
  disabled?: boolean
  /** Trait de séparation avant l'élément. */
  separe?: boolean
  /** Classe de l'icône (couleur propre, ex. menu de connexion du site public). */
  classeIcone?: string
}

const props = withDefaults(defineProps<{
  elements: ElementMenu[]
  alignement?: 'gauche' | 'droite'
  largeur?: string
  label?: string
}>(), { alignement: 'droite', largeur: undefined, label: 'Actions' })

const ouvert = ref(false)
const racine = ref<HTMLElement | null>(null)
const menu = ref<HTMLElement | null>(null)
const idMenu = `cz-menu-${useId()}`

async function ouvrir() {
  ouvert.value = true
  await nextTick()
  items()[0]?.focus()
}
function fermer(rendreFocus = true) {
  ouvert.value = false
  if (rendreFocus) racine.value?.querySelector<HTMLElement>('[aria-haspopup]')?.focus()
}
function basculer() {
  if (ouvert.value) fermer(false)
  else ouvrir()
}
function items() {
  return Array.from(menu.value?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? [])
}
function surTouche(e: KeyboardEvent) {
  if (!ouvert.value) return
  const liste = items()
  const i = liste.indexOf(document.activeElement as HTMLElement)
  if (e.key === 'Escape') {
    e.preventDefault()
    fermer()
  }
  else if (e.key === 'ArrowDown') {
    e.preventDefault()
    liste[(i + 1) % liste.length]?.focus()
  }
  else if (e.key === 'ArrowUp') {
    e.preventDefault()
    liste[(i - 1 + liste.length) % liste.length]?.focus()
  }
  else if (e.key === 'Tab') {
    fermer(false)
  }
}
function choisir(el: ElementMenu) {
  if (el.disabled) return
  el.action?.()
  fermer()
}

const attrsDeclencheur = computed(() => ({
  'aria-haspopup': 'menu' as const,
  'aria-expanded': ouvert.value,
  'aria-controls': idMenu,
}))

useClicExterieur([racine], ouvert, () => fermer(false))
defineExpose({ ouvrir, fermer })
</script>

<template>
  <div
    ref="racine"
    class="cz-menu-racine"
    @keydown="surTouche"
  >
    <slot
      name="declencheur"
      :ouvert="ouvert"
      :basculer="basculer"
      :attrs="attrsDeclencheur"
    >
      <CzButton
        variante="icone"
        taille="sm"
        icone="actions"
        nu
        :label="props.label"
        v-bind="attrsDeclencheur"
        @click="basculer"
      />
    </slot>
    <div
      v-if="ouvert"
      :id="idMenu"
      ref="menu"
      class="cz-menu cz-menu-flottant"
      :class="`is-${alignement}`"
      :style="largeur ? { width: largeur } : undefined"
      role="menu"
      :aria-label="props.label"
    >
      <template
        v-for="el in elements"
        :key="el.label"
      >
        <hr v-if="el.separe">
        <NuxtLink
          v-if="el.to && !el.disabled"
          :to="el.to"
          class="it"
          :class="{ danger: el.danger }"
          role="menuitem"
          tabindex="-1"
          @click="fermer(false)"
        >
          <CzIcon
            v-if="el.icone"
            :nom="el.icone"
            :class="el.classeIcone"
          />{{ el.label }}
        </NuxtLink>
        <div
          v-else
          class="it"
          :class="{ 'danger': el.danger, 'is-disabled': el.disabled }"
          role="menuitem"
          tabindex="-1"
          :aria-disabled="el.disabled || undefined"
          @click="choisir(el)"
          @keydown.enter.space.prevent="choisir(el)"
        >
          <CzIcon
            v-if="el.icone"
            :nom="el.icone"
            :class="el.classeIcone"
          />{{ el.label }}
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.cz-menu-racine {
  position: relative;
  display: inline-flex;
}

.cz-menu-flottant {
  position: absolute;
  top: calc(100% + var(--space-1));
  z-index: 40;
}

.cz-menu-flottant.is-droite {
  right: 0;
}

.cz-menu-flottant.is-gauche {
  left: 0;
}

.it {
  color: var(--text);
  text-decoration: none;
}

.it:focus-visible {
  outline: none;
  background: var(--surface-hover);
}
</style>
