<!--
  Champ de date « JJ/MM/AAAA » : saisie au clavier (masque `formatSaisieDate`) ou choix dans le calendrier natif du
  navigateur (bouton en fin de champ, `showPicker`), sans bibliothèque ni service tiers. Retours d'interface du
  2026-11-12 (écart à la maquette : docs/specs/ui-deviations.md). La valeur reste au format affiché « JJ/MM/AAAA ».
-->
<script setup lang="ts">
import { formatSaisieDate } from '~/utils/echeancier'

const props = withDefaults(defineProps<{
  modelValue: string | null
  placeholder?: string
  disabled?: boolean
  /** Bornes du calendrier, `AAAA-MM-JJ`. */
  min?: string
  max?: string
}>(), { placeholder: 'JJ/MM/AAAA', disabled: false, min: undefined, max: undefined })

const emit = defineEmits<{ 'update:modelValue': [string] }>()

const calendrier = ref<HTMLInputElement | null>(null)

/** « JJ/MM/AAAA » complet → « AAAA-MM-JJ » (valeur du calendrier), sinon vide. */
const iso = computed(() => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(props.modelValue ?? '')
  return m ? `${m[3]}-${m[2]}-${m[1]}` : ''
})

function saisir(v: string | number | null) {
  emit('update:modelValue', formatSaisieDate(String(v ?? '')))
}

function ouvrir() {
  const champ = calendrier.value
  if (!champ || props.disabled) return
  try {
    champ.showPicker()
  }
  catch {
    // Navigateur sans showPicker (ou refus hors geste) : le champ natif reçoit le focus.
    champ.focus()
  }
}

function choisir(e: Event) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((e.target as HTMLInputElement).value)
  if (m) emit('update:modelValue', `${m[3]}/${m[2]}/${m[1]}`)
}
</script>

<template>
  <CzInput
    :model-value="modelValue"
    :placeholder="placeholder"
    :disabled="disabled"
    inputmode="numeric"
    @update:model-value="saisir"
  >
    <template #fin>
      <span class="champ-date__ancre">
        <button
          type="button"
          class="cz-input__action cz-tap"
          aria-label="Choisir dans le calendrier"
          title="Choisir dans le calendrier"
          :disabled="disabled"
          @click="ouvrir"
        >
          <CzIcon nom="echeance" />
        </button>
        <input
          ref="calendrier"
          type="date"
          class="champ-date__natif"
          tabindex="-1"
          aria-hidden="true"
          :value="iso"
          :min="min"
          :max="max"
          @change="choisir"
        >
      </span>
    </template>
  </CzInput>
</template>

<style scoped>
/* Le sélecteur natif s'ouvre sous le champ caché : ancré au bouton, en fin de champ. */
.champ-date__ancre {
  position: relative;
  display: inline-flex;
}

/* Présent dans la page (showPicker l'exige), invisible et hors de l'ordre de tabulation. */
.champ-date__natif {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 1px;
  padding: 0;
  border: 0;
  opacity: 0;
  pointer-events: none;
}
</style>
