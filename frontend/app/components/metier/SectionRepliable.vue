<!--
  Section de formulaire numérotée et repliable (SaNouvelleAssociation) : carte, en-tête cliquable
  (pastille du numéro, titre, chevron qui pivote), contenu masqué quand la section est repliée.
-->
<script setup lang="ts">
defineProps<{
  numero: number
  titre: string
}>()

const ouvert = defineModel<boolean>('ouvert', { default: true })
const id = `section-${useId()}`
</script>

<template>
  <section class="cz-card section-rep">
    <h2 class="section-rep__h2">
      <button
        type="button"
        class="section-rep__tete"
        :aria-expanded="ouvert"
        :aria-controls="id"
        @click="ouvert = !ouvert"
      >
        <span
          class="section-rep__num"
          aria-hidden="true"
        >{{ numero }}</span>
        <span class="section-rep__titre">{{ titre }}</span>
        <CzIcon
          nom="chevron-bas"
          :taille="18"
          class="section-rep__chevron"
          :class="{ 'is-ouvert': ouvert }"
        />
      </button>
    </h2>
    <div
      v-show="ouvert"
      :id="id"
      class="section-rep__corps"
    >
      <slot />
    </div>
  </section>
</template>

<style scoped>
.section-rep {
  padding: var(--space-4) var(--space-6) var(--space-6);
}

.section-rep__h2 {
  margin: 0;
}

.section-rep__tete {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  min-height: 44px;
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.section-rep__tete:focus-visible {
  outline: none;
  border-radius: var(--r-field);
  box-shadow: var(--focus-ring);
}

.section-rep__num {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--r-pill);
  background: var(--brand-pale);
  color: var(--brand-dark);
  font-family: var(--font-display);
  font-size: 13px;
  font-weight: 600;
}

.section-rep__titre {
  flex: 1;
  font-family: var(--font-display);
  font-size: 17px;
  font-weight: 600;
  color: var(--text-strong);
}

.section-rep__chevron {
  color: var(--text-muted);
  transition: transform 0.15s;
}

.section-rep__chevron.is-ouvert {
  transform: rotate(180deg);
  color: var(--brand);
}

.section-rep__corps {
  margin-top: var(--space-3);
}
</style>
