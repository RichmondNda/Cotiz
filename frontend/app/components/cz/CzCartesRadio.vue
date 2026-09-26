<!--
  Choix exclusif présenté en cartes (plan souhaité à l'étape 3 de /demande) : titre en Poppins, détail, pastille radio.
  Carte choisie : fond brand-pale, bordure brand. Clavier : flèches pour changer, comme un groupe radio natif.
-->
<script setup lang="ts" generic="V extends string">
const props = withDefaults(defineProps<{
  options: { valeur: V, titre: string, detail?: string }[]
  label?: string
  erreur?: boolean
}>(), { label: undefined, erreur: false })

const modele = defineModel<V | null>({ default: null })
const racine = ref<HTMLElement | null>(null)

function surTouche(e: KeyboardEvent, i: number) {
  const n = props.options.length
  let j: number
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % n
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i - 1 + n) % n
  else return
  e.preventDefault()
  modele.value = props.options[j]!.valeur
  racine.value?.querySelectorAll<HTMLElement>('[role="radio"]')[j]?.focus()
}

const indexFocalisable = computed(() => Math.max(0, props.options.findIndex(o => o.valeur === modele.value)))
</script>

<template>
  <div
    ref="racine"
    class="cz-cartes-radio"
    role="radiogroup"
    :aria-label="label"
    :aria-invalid="erreur || undefined"
  >
    <button
      v-for="(o, i) in options"
      :key="o.valeur"
      type="button"
      role="radio"
      class="cz-carte-radio"
      :class="{ 'is-on': o.valeur === modele, 'is-error': erreur }"
      :aria-checked="o.valeur === modele"
      :tabindex="i === indexFocalisable ? 0 : -1"
      @click="modele = o.valeur"
      @keydown="surTouche($event, i)"
    >
      <span class="cz-carte-radio__haut">
        <b>{{ o.titre }}</b>
        <span
          class="cz-carte-radio__pastille"
          aria-hidden="true"
        />
      </span>
      <span
        v-if="o.detail"
        class="cz-carte-radio__detail"
      >{{ o.detail }}</span>
    </button>
  </div>
</template>

<style scoped>
.cz-cartes-radio {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: var(--space-3);
}

.cz-carte-radio {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-1);
  min-height: 72px;
  padding: var(--space-4);
  border: 2px solid var(--border);
  border-radius: var(--r-md);
  background: var(--surface);
  font-family: var(--font-text);
  text-align: left;
  cursor: pointer;
  transition: border-color .15s, background .15s;
}

.cz-carte-radio:hover {
  border-color: var(--text-disabled);
}

.cz-carte-radio.is-on {
  border-color: var(--brand);
  background: var(--brand-pale);
}

.cz-carte-radio.is-error {
  border-color: var(--danger);
}

.cz-carte-radio:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.cz-carte-radio__haut {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.cz-carte-radio__haut b {
  font-family: var(--font-display);
  font-size: 15px;
  font-weight: 600;
  color: var(--text-strong);
}

.cz-carte-radio__pastille {
  width: 18px;
  height: 18px;
  border: 1.5px solid var(--border);
  border-radius: 50%;
  background: var(--surface);
}

.is-on .cz-carte-radio__pastille {
  border: 6px solid var(--brand);
}

.cz-carte-radio__detail {
  font-size: 12.5px;
  color: var(--text-muted);
}

@media (max-width: 767px) {
  .cz-cartes-radio {
    grid-template-columns: 1fr;
  }
}
</style>
