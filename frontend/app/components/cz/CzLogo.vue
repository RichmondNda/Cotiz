<!--
  Logo Cotiz. Jamais recoloré ni redessiné :
  - `complet` : logo PNG (mot-symbole + slogan), copie de design/assets/logos/cotiz-logo.png ;
  - `symbole` : symbole seul (SVG repris de `Cotiz.mark`) ;
  - `marque` : symbole + « Cotiz » (barres latérales, en-têtes).
  `inverse` : version blanche monochrome, uniquement sur fond de couleur d'espace
  (panneau des écrans de connexion, telle qu'elle figure dans la maquette).
-->
<script setup lang="ts">
const props = withDefaults(defineProps<{
  variante?: 'complet' | 'symbole' | 'marque'
  taille?: number
  inverse?: boolean
  /** Taille du mot « Cotiz » (variante `marque`) ; surchargeable en CSS par `--cz-logo-texte`. */
  tailleTexte?: number
}>(), { variante: 'marque', taille: 28, inverse: false, tailleTexte: 18 })

const idMasque = `cz-mark-${useId()}`
// Couleurs du logo (charte) : violet et corail, fixes quel que soit l'espace ; blanc en version inverse.
const couleurs = computed(() => props.inverse
  ? { anneau: 'var(--on-brand)', point: 'var(--on-brand)' }
  : { anneau: 'var(--violet)', point: 'var(--corail)' })
</script>

<template>
  <img
    v-if="variante === 'complet'"
    src="/cotiz-logo.png"
    alt="Cotiz"
    class="cz-logo-png"
    :style="{ width: `${taille}px` }"
  >
  <span
    v-else
    class="cz-logo"
    :class="{ 'is-inverse': inverse }"
    :style="{ fontSize: `var(--cz-logo-texte, ${tailleTexte}px)` }"
  >
    <svg
      :width="taille"
      :height="taille"
      viewBox="0 0 100 100"
      :aria-hidden="variante === 'marque' ? 'true' : undefined"
      :role="variante === 'symbole' ? 'img' : undefined"
      :aria-label="variante === 'symbole' ? 'Cotiz' : undefined"
    >
      <defs>
        <mask :id="idMasque">
          <rect
            width="100"
            height="100"
            fill="#fff"
          />
          <path
            d="M 61.9 29.3 A 23.9 23.9 0 1 0 61.9 70.7"
            fill="none"
            stroke="#000"
            stroke-width="9"
            stroke-linecap="round"
          />
        </mask>
      </defs>
      <circle
        cx="50"
        cy="50"
        r="40"
        :style="{ fill: couleurs.anneau }"
        :mask="`url(#${idMasque})`"
      />
      <circle
        cx="75.5"
        cy="50"
        r="5"
        :style="{ fill: couleurs.point }"
      />
    </svg>
    <span v-if="variante === 'marque'">Cotiz</span>
  </span>
</template>

<style scoped>
.cz-logo {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-family: var(--font-display);
  font-weight: 600;
  line-height: 1;
  color: var(--ink-title);
}

.cz-logo.is-inverse {
  color: var(--on-brand);
}

.cz-logo svg {
  flex-shrink: 0;
}

.cz-logo-png {
  height: auto;
}
</style>
