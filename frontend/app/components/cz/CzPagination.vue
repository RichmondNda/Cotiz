<!-- Pagination : précédent, pages (avec « … »), suivant. -->
<script setup lang="ts">
const props = defineProps<{
  pages: number
}>()

const page = defineModel<number>('page', { default: 1 })

const elements = computed<(number | '…')[]>(() => {
  const n = props.pages
  const p = page.value
  if (n <= 7) return Array.from({ length: n }, (_, i) => i + 1)
  const set = new Set([1, n, p - 1, p, p + 1].filter(x => x >= 1 && x <= n))
  const tri = [...set].sort((a, b) => a - b)
  const out: (number | '…')[] = []
  tri.forEach((x, i) => {
    if (i > 0 && x - tri[i - 1]! > 1) out.push('…')
    out.push(x)
  })
  return out
})

function aller(n: number) {
  if (n >= 1 && n <= props.pages) page.value = n
}
</script>

<template>
  <nav
    class="cz-pagin"
    aria-label="Pagination"
  >
    <span
      role="button"
      :tabindex="page <= 1 ? -1 : 0"
      :class="{ 'is-disabled': page <= 1 }"
      :aria-disabled="page <= 1 || undefined"
      aria-label="Page précédente"
      @click="aller(page - 1)"
      @keydown.enter.space.prevent="aller(page - 1)"
    ><CzIcon nom="chevron-gauche" /></span>
    <template
      v-for="(e, i) in elements"
      :key="i"
    >
      <span
        v-if="e === '…'"
        class="gap"
        aria-hidden="true"
      >…</span>
      <span
        v-else
        role="button"
        tabindex="0"
        :class="{ 'is-on': e === page }"
        :aria-current="e === page ? 'page' : undefined"
        :aria-label="`Page ${e}`"
        @click="aller(e)"
        @keydown.enter.space.prevent="aller(e)"
      >{{ e }}</span>
    </template>
    <span
      role="button"
      :tabindex="page >= pages ? -1 : 0"
      :class="{ 'is-disabled': page >= pages }"
      :aria-disabled="page >= pages || undefined"
      aria-label="Page suivante"
      @click="aller(page + 1)"
      @keydown.enter.space.prevent="aller(page + 1)"
    ><CzIcon nom="chevron-droite" /></span>
  </nav>
</template>

<style scoped>
.cz-pagin [role="button"]:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}
</style>
