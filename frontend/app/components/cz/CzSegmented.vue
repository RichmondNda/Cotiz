<!-- Contrôle segmenté : 2 à 4 choix exclusifs visibles (dates fixes / cycle roulant, cartes / tableau). -->
<script setup lang="ts" generic="V extends string | number">
const props = withDefaults(defineProps<{
  options: { valeur: V, label: string }[]
  disabled?: boolean
  label?: string
}>(), { disabled: false, label: undefined })

const modele = defineModel<V>({ required: true })
const racine = ref<HTMLElement | null>(null)

function choisir(v: V) {
  if (!props.disabled) modele.value = v
}
function surTouche(e: KeyboardEvent, i: number) {
  const n = props.options.length
  let j = i
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % n
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i - 1 + n) % n
  else if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault()
    choisir(props.options[i]!.valeur)
    return
  }
  else return
  e.preventDefault()
  choisir(props.options[j]!.valeur)
  racine.value?.querySelectorAll<HTMLElement>('[role="radio"]')[j]?.focus()
}
</script>

<template>
  <div
    ref="racine"
    class="cz-seg"
    :class="{ 'is-disabled': disabled }"
    role="radiogroup"
    :aria-label="label"
    :aria-disabled="disabled || undefined"
  >
    <span
      v-for="(o, i) in options"
      :key="String(o.valeur)"
      role="radio"
      :aria-checked="o.valeur === modele"
      :tabindex="disabled ? -1 : o.valeur === modele ? 0 : -1"
      :class="{ 'is-on': o.valeur === modele }"
      @click="choisir(o.valeur)"
      @keydown="surTouche($event, i)"
    >{{ o.label }}</span>
  </div>
</template>

<style scoped>
[role="radio"]:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.cz-seg.is-disabled span {
  cursor: not-allowed;
}
</style>
