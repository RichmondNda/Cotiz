<!-- Tuile de chiffre de la charte, sur fond clair d'identité (brand) ou de statut. -->
<script setup lang="ts">
withDefaults(defineProps<{
  titre: string
  valeur: string | number
  ton?: 'brand' | 'success' | 'danger' | 'warning' | 'info'
}>(), { ton: 'brand' })
</script>

<template>
  <div
    class="cz-tile"
    :class="`cz-tile--${ton}`"
  >
    <div class="t">
      {{ titre }}
    </div>
    <div class="v cz-num">
      {{ valeur }}
    </div>
  </div>
</template>

<style scoped>
.cz-tile--brand { background: var(--brand-pale); }
.cz-tile--brand .t { color: var(--brand-dark); }
.cz-tile--brand .v { color: var(--ink-title); }
.cz-tile--success { background: var(--success-bg); color: var(--success-fg); }
.cz-tile--danger { background: var(--danger-bg); color: var(--danger-fg); }
.cz-tile--warning { background: var(--warning-bg); color: var(--warning-fg); }
.cz-tile--info { background: var(--info-bg); color: var(--info-fg); }
</style>
