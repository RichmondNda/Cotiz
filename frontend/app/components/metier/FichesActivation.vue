<!--
  Fiches d'activation A6 à imprimer (useImpressionFiches) : rendues hors de la page (Teleport), masquées à l'écran ;
  à l'impression, seules elles s'affichent, une par page A6 (page nommée, sans effet sur les autres impressions).
-->
<script setup lang="ts">
import type { FicheActivation } from '~/composables/useImpressionFiches'
import { formatDateHeure } from '~/utils/format'

defineProps<{ fiches: FicheActivation[], association: string }>()
</script>

<template>
  <Teleport
    v-if="fiches.length"
    to="body"
  >
    <div class="fiches-activation">
      <article
        v-for="f in fiches"
        :key="f.code"
        class="fiche-a6"
      >
        <header class="fiche-a6__tete">
          <CzAvatar
            :nom="association"
            org
          />
          <b>{{ association }}</b>
        </header>
        <p class="fiche-a6__pour">
          Accès de <b>{{ f.destinataire }}</b>
        </p>
        <img
          class="fiche-a6__qr"
          :src="f.qr"
          alt="QR du lien d’activation"
        >
        <p class="fiche-a6__lien">
          Scannez le QR ou ouvrez : {{ f.lien }}
        </p>
        <div class="fiche-a6__code">
          <span>Code d’activation</span>
          <b class="cz-mono">{{ f.code }}</b>
          <span>Valable jusqu’au {{ formatDateHeure(f.expireLe) }}</span>
        </div>
      </article>
    </div>
  </Teleport>
</template>

<style>
@page fiche-a6 {
  size: A6;
  margin: 8mm;
}

@media screen {
  .fiches-activation {
    display: none;
  }
}

@media print {
  body > *:not(.fiches-activation) {
    display: none !important;
  }

  .fiches-activation,
  .fiche-a6 {
    page: fiche-a6;
  }

  .fiche-a6 {
    break-after: page;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    font-family: var(--font-text);
    color: var(--text-strong);
    text-align: center;
  }

  .fiche-a6:last-child {
    break-after: auto;
  }

  .fiche-a6__tete {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-family: var(--font-display);
    font-size: 14px;
  }

  .fiche-a6__pour,
  .fiche-a6__lien {
    margin: 0;
    font-size: 11px;
  }

  .fiche-a6__lien {
    word-break: break-all;
    color: var(--text-muted);
  }

  .fiche-a6__qr {
    width: 40mm;
    height: 40mm;
  }

  .fiche-a6__code {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    font-size: 10px;
  }

  .fiche-a6__code b {
    font-size: 20px;
    letter-spacing: .08em;
  }
}
</style>
