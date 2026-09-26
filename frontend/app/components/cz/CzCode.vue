<!--
  Saisie d'un code à N chiffres (6 par défaut) : une case par chiffre, passage automatique à la suivante,
  retour arrière vers la précédente, collage d'un code complet. `v-model` : chaîne de chiffres.
  Émet `complet` quand toutes les cases sont remplies.
-->
<script setup lang="ts">
const props = withDefaults(defineProps<{
  longueur?: number
  erreur?: boolean
  disabled?: boolean
  /** Préfixe des libellés accessibles (« Chiffre 1 »…). */
  label?: string
}>(), { longueur: 6, erreur: false, disabled: false, label: 'Chiffre' })

const modele = defineModel<string>({ default: '' })
const emit = defineEmits<{ complet: [code: string] }>()
const cases = ref<HTMLInputElement[]>([])

const chiffres = computed(() => Array.from({ length: props.longueur }, (_, i) => modele.value[i] ?? ''))

function ecrire(valeurs: string[]) {
  modele.value = valeurs.join('').slice(0, props.longueur)
  if (modele.value.length === props.longueur) emit('complet', modele.value)
}

function focaliser(i: number) {
  const c = cases.value[Math.max(0, Math.min(props.longueur - 1, i))]
  c?.focus()
  c?.select()
}

function saisir(e: Event, i: number) {
  const cible = e.target as HTMLInputElement
  const saisie = cible.value.replace(/\D/g, '')
  const valeurs = [...chiffres.value]
  if (!saisie) {
    valeurs[i] = ''
    cible.value = ''
    ecrire(valeurs)
    return
  }
  // Plusieurs chiffres d'un coup (saisie automatique du code SMS) : on répartit.
  for (const [k, c] of [...saisie].entries()) {
    if (i + k < props.longueur) valeurs[i + k] = c
  }
  cible.value = valeurs[i] ?? ''
  ecrire(valeurs)
  focaliser(i + saisie.length)
}

function touche(e: KeyboardEvent, i: number) {
  if (e.key === 'Backspace' && !chiffres.value[i] && i > 0) {
    e.preventDefault()
    const valeurs = [...chiffres.value]
    valeurs[i - 1] = ''
    ecrire(valeurs)
    focaliser(i - 1)
  }
  else if (e.key === 'ArrowLeft') {
    e.preventDefault()
    focaliser(i - 1)
  }
  else if (e.key === 'ArrowRight') {
    e.preventDefault()
    focaliser(i + 1)
  }
}

function coller(e: ClipboardEvent) {
  const texte = e.clipboardData?.getData('text')?.replace(/\D/g, '') ?? ''
  if (!texte) return
  e.preventDefault()
  ecrire([...texte.slice(0, props.longueur)])
  focaliser(texte.length)
}

defineExpose({ focaliser: () => focaliser(Math.min(modele.value.length, props.longueur - 1)) })
</script>

<template>
  <div
    class="cz-code"
    :style="{ gridTemplateColumns: `repeat(${longueur}, minmax(0, 1fr))` }"
    role="group"
    :aria-label="`Code à ${longueur} chiffres`"
  >
    <input
      v-for="(c, i) in chiffres"
      :key="i"
      ref="cases"
      class="cz-input cz-code__case"
      :class="{ 'is-error': erreur }"
      :value="c"
      :aria-label="`${label} ${i + 1}`"
      :aria-invalid="erreur || undefined"
      :disabled="disabled"
      :autocomplete="i === 0 ? 'one-time-code' : 'off'"
      inputmode="numeric"
      maxlength="6"
      @input="saisir($event, i)"
      @keydown="touche($event, i)"
      @paste="coller"
      @focus="($event.target as HTMLInputElement).select()"
    >
  </div>
</template>

<style scoped>
.cz-code {
  display: grid;
  gap: var(--space-2);
}

.cz-code__case {
  height: 56px;
  padding: 0;
  font-family: var(--font-display);
  font-size: 22px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.cz-code__case:focus {
  outline: none;
}
</style>
