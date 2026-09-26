<!--
  Résumé de l'engagement en tête du contrat : « 50 000 F à l’entrée, puis 10 000 F par mois pendant 12 mois. »
  et le total en couleur d'identité. Contour 2 px brand : c'est ce que le souscripteur signe.
-->
<script setup lang="ts">
import type { Projet } from '~~/types'
import { formatFCFA } from '~/utils/format'

const props = defineProps<{
  projet: Projet
  total: number
}>()

const PERIODES: Record<Projet['frequence'], string> = {
  hebdomadaire: 'par semaine', mensuelle: 'par mois', trimestrielle: 'par trimestre', semestrielle: 'par semestre', annuelle: 'par an',
}
const UNITES: Record<Projet['frequence'], [string, string]> = {
  hebdomadaire: ['semaine', 'semaines'], mensuelle: ['mois', 'mois'], trimestrielle: ['trimestre', 'trimestres'],
  semestrielle: ['semestre', 'semestres'], annuelle: ['an', 'ans'],
}

const phrase = computed(() => {
  const p = props.projet
  const echeance = `${formatFCFA(p.montantEcheance)} ${PERIODES[p.frequence]}`
  const duree = p.nbEcheances ? ` pendant ${p.nbEcheances} ${UNITES[p.frequence][p.nbEcheances > 1 ? 1 : 0]}` : ''
  return p.fondsEntree
    ? `${formatFCFA(p.fondsEntree)} à l’entrée, puis ${echeance}${duree}.`
    : `${echeance.charAt(0).toUpperCase()}${echeance.slice(1)}${duree}.`
})
</script>

<template>
  <section
    class="engagement"
    aria-label="Votre engagement"
  >
    <div class="engagement__label">
      Votre engagement
    </div>
    <p class="engagement__phrase">
      {{ phrase }}
    </p>
    <div class="engagement__total">
      <span>Total</span>
      <b>{{ formatFCFA(total) }}</b>
    </div>
  </section>
</template>

<style scoped>
.engagement {
  padding: var(--space-6);
  border: 2px solid var(--brand);
  border-radius: var(--r-card-lg);
  background: var(--surface);
}

.engagement__label {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: .04em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.engagement__phrase {
  margin: var(--space-2) 0 var(--space-3);
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 600;
  line-height: 1.5;
  color: var(--text-strong);
}

.engagement__total {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: var(--space-3);
  border-top: 1px solid var(--border);
  font-size: 13.5px;
  color: var(--text-muted);
}

.engagement__total b {
  font-family: var(--font-display);
  font-size: 19px;
  font-weight: 600;
  color: var(--brand-dark);
  font-variant-numeric: tabular-nums;
}

@media (max-width: 767px) {
  .engagement {
    padding: var(--space-6) var(--space-6) var(--space-4);
  }
}
</style>
