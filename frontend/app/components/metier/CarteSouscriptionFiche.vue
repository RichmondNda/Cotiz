<!--
  Carte d'un projet dans la fiche souscripteur (gestionnaire) : nom du projet (lien), badge de situation,
  rangée de cases d'échéances, versé et reste.
  En retard : bordure danger, badge « En retard · 2 », reste en danger. Signature attendue : bordure pointillée
  warning et « Contrat envoyé, en attente de signature. L'échéancier démarre après la signature. »
  Mobile : badges courts (« Retard · 2 », « À signer »), versé à gauche, reste à droite.
-->
<script setup lang="ts">
import type { Echeance, SouscriptionAvecProjet } from '~~/types'
import { formatFCFA } from '~/utils/format'
import { lienProjetGestionnaire } from '~/utils/projets-gestionnaire'

const props = defineProps<{
  souscription: SouscriptionAvecProjet & { echeances: Echeance[] }
}>()

const nbRetards = computed(() => props.souscription.echeances.filter(e => e.statut === 'en_retard').length)
const situation = computed(() => {
  const s = props.souscription
  if (s.statut === 'signature_attendue') return { long: 'Signature attendue', court: 'À signer', ton: 'warning' as const }
  if (s.statut === 'en_retard') {
    const n = nbRetards.value || 1
    return { long: `En retard · ${n}`, court: `Retard · ${n}`, ton: 'danger' as const }
  }
  return { long: 'À jour', court: 'À jour', ton: 'success' as const }
})
</script>

<template>
  <article
    class="cz-card fiche-projet"
    :class="{
      'is-retard': souscription.statut === 'en_retard',
      'is-signature': souscription.statut === 'signature_attendue',
    }"
  >
    <div class="fiche-projet__tete">
      <NuxtLink
        :to="lienProjetGestionnaire(souscription.projet)"
        class="fiche-projet__nom"
      >
        {{ souscription.projet.nom }}
      </NuxtLink>
      <CzBadge
        :ton="situation.ton"
        class="cz-desktop"
      >
        {{ situation.long }}
      </CzBadge>
      <CzBadge
        :ton="situation.ton"
        petit
        class="cz-mobile"
      >
        {{ situation.court }}
      </CzBadge>
    </div>

    <template v-if="souscription.statut === 'signature_attendue'">
      <p class="fiche-projet__attente cz-desktop">
        Contrat envoyé, en attente de signature. L’échéancier démarre après la signature.
      </p>
      <p class="fiche-projet__attente cz-mobile">
        Contrat envoyé · en attente de signature
      </p>
    </template>
    <template v-else>
      <RangeeEcheances
        v-if="souscription.echeances.length"
        :echeances="souscription.echeances"
      />
      <div class="fiche-projet__montants">
        <span>Versé <b>{{ formatFCFA(souscription.verse) }}</b></span>
        <span :class="{ 'is-du': souscription.statut === 'en_retard' }">Reste <b>{{ formatFCFA(souscription.reste) }}</b></span>
      </div>
    </template>
  </article>
</template>

<style scoped>
.fiche-projet {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: 20px;
  border: 2px solid transparent;
}

.fiche-projet.is-retard {
  border-color: var(--danger);
}

.fiche-projet.is-signature {
  border-style: dashed;
  border-color: var(--warning);
}

.fiche-projet__tete {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-3);
}

.fiche-projet__nom {
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 600;
  color: var(--text-strong);
  text-decoration: none;
}

.fiche-projet__nom:hover {
  color: var(--brand-dark);
}

.fiche-projet__attente {
  margin: 0;
  font-size: 13.5px;
  color: var(--text-muted);
}

.fiche-projet__montants {
  display: flex;
  gap: var(--space-6);
  font-size: 13.5px;
}

.fiche-projet__montants b {
  font-weight: 600;
  color: var(--text-strong);
}

.fiche-projet__montants .is-du b {
  color: var(--danger-fg);
}

@media (max-width: 767px) {
  .fiche-projet {
    padding: var(--space-6);
  }

  .fiche-projet__nom {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
  }

  .fiche-projet__tete {
    margin: -10px 0;
  }

  .fiche-projet__montants {
    justify-content: space-between;
    color: var(--text-muted);
  }

  .fiche-projet__montants b {
    font-weight: 400;
    color: var(--text-muted);
  }

  .fiche-projet__montants .is-du,
  .fiche-projet__montants .is-du b {
    font-weight: 600;
    color: var(--danger-fg);
  }
}
</style>
