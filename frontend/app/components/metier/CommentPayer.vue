<!--
  Moyens de paiement d'une association, coordonnées copiables (numéro mobile money, IBAN),
  puis rappel « Après votre versement, pensez à le déclarer avec votre preuve. ».
  Slot par défaut : action sous le rappel (« Déclarer un paiement » dans la fiche association).
-->
<script setup lang="ts">
import type { ModalitePaiement } from '~~/types'
import { MOYENS_PAIEMENT } from '~/utils/statuts'

const props = defineProps<{
  modalites: ModalitePaiement[]
}>()

const lignes = computed(() => props.modalites.map((m) => {
  const valeur = m.moyen === 'mobile_money'
    ? [m.numeroMobileMoney, m.operateur].filter(Boolean).join(' · ')
    : m.moyen === 'virement' ? m.iban : undefined
  return { moyen: m.moyen, libelle: MOYENS_PAIEMENT[m.moyen], valeur, instructions: m.instructions }
}))

const copie = ref<string | null>(null)
async function copier(moyen: string, valeur: string) {
  try {
    await navigator.clipboard.writeText(valeur)
    copie.value = moyen
    setTimeout(() => (copie.value = null), 1500)
  }
  catch {
    // Presse-papiers indisponible (contexte non sécurisé) : la valeur reste lisible et sélectionnable.
  }
}
</script>

<template>
  <div class="comment-payer">
    <div
      v-for="l in lignes"
      :key="l.moyen"
      class="comment-payer__moyen"
    >
      <span class="comment-payer__libelle">{{ l.libelle }}</span>
      <div
        v-if="l.valeur"
        class="comment-payer__valeur"
      >
        <span class="cz-mono">{{ l.valeur }}</span>
        <button
          type="button"
          class="comment-payer__copier"
          :aria-label="`Copier : ${l.libelle}`"
          @click="copier(l.moyen, l.valeur)"
        >
          {{ copie === l.moyen ? 'Copié' : 'Copier' }}
        </button>
      </div>
      <p
        v-if="l.instructions"
        class="comment-payer__instructions"
      >
        {{ l.instructions }}
      </p>
    </div>
    <p class="comment-payer__rappel">
      Après votre versement, pensez à le déclarer avec votre preuve.
    </p>
    <slot />
  </div>
</template>

<style scoped>
.comment-payer {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.comment-payer__moyen {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.comment-payer__libelle {
  font-size: 12.5px;
  color: var(--text-muted);
}

.comment-payer__valeur {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: 56px;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--r-field);
  background: var(--surface-subtle);
  font-size: 13px;
  color: var(--text-strong);
}

.comment-payer__valeur .cz-mono {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}

.comment-payer__copier {
  min-height: 44px;
  padding: 0 var(--space-3);
  border: 0;
  border-radius: var(--r-sm);
  background: transparent;
  font-family: var(--font-display);
  font-size: 13.5px;
  font-weight: 500;
  color: var(--brand-dark);
  cursor: pointer;
}

.comment-payer__copier:hover {
  background: var(--brand-pale);
}

.comment-payer__copier:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.comment-payer__instructions,
.comment-payer__rappel {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--text-muted);
}
</style>
