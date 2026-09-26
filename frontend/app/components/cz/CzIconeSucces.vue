<!--
  Grande icône de succès (coche dans un cercle vert pâle) des écrans de confirmation, avec apparition animée
  (désactivée si l'utilisateur réduit les animations). Décorative : le titre voisin porte le message.
-->
<script setup lang="ts">
withDefaults(defineProps<{ taille?: number }>(), { taille: 80 })
</script>

<template>
  <span
    class="cz-icone-succes"
    :style="{ width: `${taille}px`, height: `${taille}px` }"
    aria-hidden="true"
  >
    <svg
      :width="Math.round(taille * .55)"
      :height="Math.round(taille * .55)"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    ><path d="M6 12.5l4 4L18 8.5" /></svg>
  </span>
</template>

<style scoped>
@keyframes cz-pop {
  0% { transform: scale(.6); opacity: 0; }
  70% { transform: scale(1.08); opacity: 1; }
  100% { transform: scale(1); }
}

@keyframes cz-trace {
  from { stroke-dashoffset: 30; }
  to { stroke-dashoffset: 0; }
}

.cz-icone-succes {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--success-bg);
  color: var(--success);
  animation: cz-pop .5s ease-out both;
}

.cz-icone-succes path {
  stroke-dasharray: 30;
  animation: cz-trace .45s .35s ease-out both;
}

@media (prefers-reduced-motion: reduce) {
  .cz-icone-succes,
  .cz-icone-succes path {
    animation: none;
  }
}
</style>
