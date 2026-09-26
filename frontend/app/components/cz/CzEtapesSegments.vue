<!-- Progression d'un parcours en segments (mobile) : un trait par étape, les étapes atteintes en brand. -->
<script setup lang="ts">
const props = defineProps<{
  total: number
  /** Étape courante (à partir de 1). */
  courante: number
}>()

const label = computed(() => `Étape ${props.courante} sur ${props.total}`)
</script>

<template>
  <div
    class="cz-segments"
    role="progressbar"
    :aria-valuenow="courante"
    aria-valuemin="1"
    :aria-valuemax="total"
    :aria-label="label"
  >
    <span
      v-for="i in total"
      :key="i"
      class="cz-segments__trait"
      :class="{ 'is-on': i <= courante }"
    />
  </div>
</template>

<style scoped>
.cz-segments {
  display: flex;
  gap: 6px;
}

.cz-segments__trait {
  flex: 1;
  height: 4px;
  border-radius: var(--r-pill);
  background: var(--border);
}

.cz-segments__trait.is-on {
  background: var(--brand);
}
</style>
