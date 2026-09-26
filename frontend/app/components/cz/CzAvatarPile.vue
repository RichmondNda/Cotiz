<!-- Pile d'avatars : chevauchement −8 px avec liseré blanc, dernier élément « +N ». -->
<script setup lang="ts">
const props = withDefaults(defineProps<{
  personnes: { nom: string, ton?: 'brand' | 'success' | 'danger' | 'warning' }[]
  /** Nombre total ; au-delà des avatars affichés, un dernier avatar « +N ». */
  total?: number | string
  max?: number
  /** Texte imposé du dernier avatar (placeholder de maquette « +[N] »). */
  reste?: string
}>(), { total: undefined, max: 3, reste: undefined })

const visibles = computed(() => props.personnes.slice(0, props.max))
const surplus = computed(() => {
  if (props.reste) return props.reste
  if (typeof props.total !== 'number') return null
  const n = props.total - visibles.value.length
  return n > 0 ? `+${n}` : null
})
</script>

<template>
  <div class="cz-stack">
    <CzAvatar
      v-for="p in visibles"
      :key="p.nom"
      :nom="p.nom"
      :ton="p.ton"
      taille="sm"
    />
    <CzAvatar
      v-if="surplus"
      :initiales="surplus"
      ton="warning"
      taille="sm"
    />
  </div>
</template>
