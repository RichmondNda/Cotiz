<!--
  Filtre à choix unique dans une puce « Libellé : valeur ▾ » qui ouvre un menu (pays, plan…).
  Puce active (fond brand-pale) dès qu'une valeur autre que la première option (« tous ») est choisie.
-->
<script setup lang="ts" generic="V extends string">
import type { ElementMenu } from '~/components/cz/CzMenu.vue'

const props = defineProps<{
  libelle: string
  /** Première option = pas de filtre (« tous »). */
  options: { valeur: V, label: string }[]
}>()

const modele = defineModel<V>({ required: true })
const courante = computed(() => props.options.find(o => o.valeur === modele.value) ?? props.options[0])
const actif = computed(() => modele.value !== props.options[0]?.valeur)
const elements = computed<ElementMenu[]>(() => props.options.map(o => ({
  label: o.label,
  icone: o.valeur === modele.value ? 'coche' : undefined,
  action: () => (modele.value = o.valeur),
})))
</script>

<template>
  <CzMenu
    :elements="elements"
    alignement="gauche"
    :label="libelle"
  >
    <template #declencheur="{ basculer, attrs }">
      <CzChip
        :actif="actif"
        v-bind="attrs"
        class="filtre-menu"
        @click="basculer"
      >
        <span :class="{ 'filtre-menu__valeur': actif }">{{ libelle }} : {{ courante?.label }}</span>
        <CzIcon
          nom="chevron-bas"
          :taille="14"
        />
      </CzChip>
    </template>
  </CzMenu>
</template>

<style scoped>
.filtre-menu {
  gap: var(--space-1);
}

.filtre-menu__valeur {
  font-weight: 600;
}
</style>
