<!-- Squelette de chargement, à la forme du contenu final. Jamais de spinner plein écran. -->
<script setup lang="ts">
const props = withDefaults(defineProps<{
  largeur?: string | number
  hauteur?: string | number
  forme?: 'ligne' | 'rond' | 'pilule'
  /** Aligné à droite (colonnes de montants). */
  droite?: boolean
}>(), { largeur: '100%', hauteur: 12, forme: 'ligne', droite: false })

const px = (v: string | number) => (typeof v === 'number' ? `${v}px` : v)
const style = computed(() => ({
  width: px(props.largeur),
  height: px(props.hauteur),
  borderRadius: props.forme === 'rond' ? '50%' : props.forme === 'pilule' ? 'var(--r-pill)' : undefined,
  marginLeft: props.droite ? 'auto' : undefined,
}))
</script>

<template>
  <span
    class="cz-skel cz-skel-bloc"
    :style="style"
    aria-hidden="true"
  />
</template>

<style scoped>
.cz-skel-bloc {
  display: block;
  flex-shrink: 0;
}
</style>
