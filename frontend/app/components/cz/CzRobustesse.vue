<!--
  Indicateur de robustesse d'un mot de passe : 4 segments (danger → warning → success) et libellé,
  puis, avec `regles`, la liste des règles cochées en vert quand elles sont satisfaites.
-->
<script setup lang="ts">
import { reglesMotDePasse, robustesse } from '~/utils/mot-de-passe'

const props = withDefaults(defineProps<{
  motDePasse: string
  regles?: boolean
}>(), { regles: false })

const etat = computed(() => robustesse(props.motDePasse))
const ton = computed(() => ({ vide: '', faible: 'danger', correcte: 'warning', bonne: 'success', excellente: 'success' })[etat.value.niveau])
const liste = computed(() => reglesMotDePasse(props.motDePasse))
</script>

<template>
  <div class="cz-robustesse">
    <div
      class="cz-robustesse__jauge"
      :class="ton && `cz-robustesse--${ton}`"
      aria-hidden="true"
    >
      <span
        v-for="i in 4"
        :key="i"
        :class="{ 'is-on': i <= etat.segments }"
      />
    </div>
    <span
      v-if="etat.niveau !== 'vide'"
      class="cz-robustesse__libelle"
      :class="`cz-robustesse--${ton}`"
      aria-live="polite"
    >Robustesse : {{ etat.niveau }}</span>
    <ul
      v-if="regles"
      class="cz-robustesse__regles"
    >
      <li
        v-for="r in liste"
        :key="r.libelle"
        :class="{ 'is-ok': r.ok }"
      >
        <svg
          v-if="!r.ok"
          class="cz-icon"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.75"
          aria-hidden="true"
        ><circle
          cx="12"
          cy="12"
          r="8"
        /></svg>
        <CzIcon
          v-else
          nom="coche"
          :taille="16"
        />
        {{ r.libelle }}<span class="sr-only">{{ r.ok ? ' : respecté' : ' : non respecté' }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.cz-robustesse {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.cz-robustesse__jauge {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
}

.cz-robustesse__jauge span {
  height: 6px;
  border-radius: var(--r-pill);
  background: var(--track);
}

.cz-robustesse--danger .is-on {
  background: var(--danger);
}

.cz-robustesse--warning .is-on {
  background: var(--warning);
}

.cz-robustesse--success .is-on {
  background: var(--success);
}

.cz-robustesse__libelle {
  font-size: 12.5px;
  font-weight: 600;
}

.cz-robustesse__libelle.cz-robustesse--danger {
  color: var(--danger-fg);
}

.cz-robustesse__libelle.cz-robustesse--warning {
  color: var(--warning-fg);
}

.cz-robustesse__libelle.cz-robustesse--success {
  color: var(--success-fg);
}

.cz-robustesse__regles {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: var(--space-2) 0 0;
  padding: 0;
  list-style: none;
  font-size: 13.5px;
  color: var(--text-muted);
}

.cz-robustesse__regles li {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.cz-robustesse__regles li.is-ok {
  color: var(--success-fg);
}

.cz-robustesse__regles .cz-icon {
  flex-shrink: 0;
}
</style>
