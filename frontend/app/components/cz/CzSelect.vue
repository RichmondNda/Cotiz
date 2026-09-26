<!--
  Sélecteur `cz-input--select` : liste déroulante `cz-menu`, coche sur l'option choisie.
  Au-delà de 8 options, un champ de recherche filtre la liste.
  Clavier : ↑ ↓ pour naviguer, Entrée pour choisir, Échap pour fermer.
-->
<script setup lang="ts" generic="V extends string | number">
import { useChamp } from '~/composables/useChamp'
import { useClicExterieur } from '~/composables/useClicExterieur'

export interface OptionSelect<T> {
  valeur: T
  label: string
  disabled?: boolean
}

const props = withDefaults(defineProps<{
  options: OptionSelect<V>[]
  placeholder?: string
  erreur?: boolean
  disabled?: boolean
  id?: string
  label?: string
  /** Seuil au-delà duquel la recherche apparaît. */
  seuilRecherche?: number
}>(), { placeholder: 'Choisir…', erreur: false, disabled: false, id: undefined, label: undefined, seuilRecherche: 8 })

const modele = defineModel<V | null>({ default: null })

const champ = useChamp(props)
const racine = ref<HTMLElement | null>(null)
const liste = ref<HTMLElement | null>(null)
const ouvert = ref(false)
const recherche = ref('')
const actif = ref(-1)
const idListe = `${champ.id.value}-liste`

const avecRecherche = computed(() => props.options.length > props.seuilRecherche)
const filtrees = computed(() => {
  const q = recherche.value.trim().toLocaleLowerCase('fr')
  return q ? props.options.filter(o => o.label.toLocaleLowerCase('fr').includes(q)) : props.options
})
const selection = computed(() => props.options.find(o => o.valeur === modele.value))

function ouvrir() {
  if (props.disabled) return
  ouvert.value = true
  recherche.value = ''
  actif.value = Math.max(0, filtrees.value.findIndex(o => o.valeur === modele.value))
}
function fermer() {
  ouvert.value = false
}
function choisir(o: OptionSelect<V>) {
  if (o.disabled) return
  modele.value = o.valeur
  fermer()
  racine.value?.querySelector<HTMLElement>('button')?.focus()
}
function surTouche(e: KeyboardEvent) {
  if (!ouvert.value) {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
      e.preventDefault()
      ouvrir()
    }
    return
  }
  if (e.key === 'Escape') {
    e.preventDefault()
    fermer()
  }
  else if (e.key === 'ArrowDown') {
    e.preventDefault()
    actif.value = Math.min(filtrees.value.length - 1, actif.value + 1)
  }
  else if (e.key === 'ArrowUp') {
    e.preventDefault()
    actif.value = Math.max(0, actif.value - 1)
  }
  else if (e.key === 'Enter') {
    e.preventDefault()
    const o = filtrees.value[actif.value]
    if (o) choisir(o)
  }
  else if (e.key === 'Tab') {
    fermer()
  }
}

watch(actif, async (i) => {
  await nextTick()
  // Garde l'option active visible en ne faisant défiler que la liste.
  const l = liste.value
  const el = l?.querySelectorAll<HTMLElement>('.it')[i]
  if (!l || !el) return
  if (el.offsetTop < l.scrollTop) l.scrollTop = el.offsetTop
  else if (el.offsetTop + el.offsetHeight > l.scrollTop + l.clientHeight) l.scrollTop = el.offsetTop + el.offsetHeight - l.clientHeight
})
useClicExterieur([racine], ouvert, fermer)
</script>

<template>
  <div
    ref="racine"
    class="cz-select"
    @keydown="surTouche"
  >
    <button
      :id="champ.id.value"
      type="button"
      class="cz-input cz-input--select"
      :class="{ 'is-error': champ.enErreur.value, 'is-disabled': disabled, 'is-focus': ouvert }"
      :disabled="disabled"
      role="combobox"
      aria-haspopup="listbox"
      :aria-expanded="ouvert"
      :aria-controls="idListe"
      :aria-invalid="champ.enErreur.value || undefined"
      :aria-describedby="champ.decritPar.value"
      :aria-label="label"
      :aria-activedescendant="ouvert && actif >= 0 ? `${idListe}-${actif}` : undefined"
      @click="ouvert ? fermer() : ouvrir()"
    >
      <span
        class="grow"
        :class="{ ph: !selection }"
      >{{ selection?.label ?? placeholder }}</span>
      <CzIcon nom="chevron-bas" />
    </button>
    <div
      v-if="ouvert"
      class="cz-menu cz-select__menu"
    >
      <div
        v-if="avecRecherche"
        class="cz-select__recherche"
      >
        <CzInput
          v-model="recherche"
          type="search"
          placeholder="Rechercher…"
          label="Filtrer les options"
          @keydown.stop="surTouche"
        />
      </div>
      <div
        :id="idListe"
        ref="liste"
        role="listbox"
        class="cz-select__liste"
      >
        <div
          v-for="(o, i) in filtrees"
          :id="`${idListe}-${i}`"
          :key="String(o.valeur)"
          role="option"
          class="it"
          :class="{ 'is-hover': i === actif, 'is-disabled': o.disabled }"
          :aria-selected="o.valeur === modele"
          :aria-disabled="o.disabled || undefined"
          @mouseenter="actif = i"
          @click="choisir(o)"
        >
          {{ o.label }}
          <CzIcon
            v-if="o.valeur === modele"
            nom="coche"
            class="cz-select__coche"
          />
        </div>
        <div
          v-if="filtrees.length === 0"
          class="it is-disabled"
        >
          Aucun résultat
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cz-select {
  position: relative;
  width: 100%;
}

.cz-input--select {
  text-align: left;
  cursor: pointer;
}

.cz-select__menu {
  position: absolute;
  top: calc(100% + var(--space-1));
  left: 0;
  z-index: 30;
  width: 100%;
}

.cz-select__recherche {
  padding: var(--space-1) var(--space-1) var(--space-2);
}

.cz-select__liste {
  position: relative;
  max-height: 264px;
  overflow-y: auto;
}

.cz-select__coche {
  margin-left: auto;
  color: var(--brand);
}
</style>
