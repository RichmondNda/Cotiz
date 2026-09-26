<!--
  Visuel produit de la landing : téléphone de l'espace souscripteur (thème member) — total restant à payer,
  carte projet en retard, bouton « Déclarer un paiement ». Illustration statique : chiffres de Moussa Diarra
  (DONNEES-REFERENCE).
-->
<script setup lang="ts">
import { formatFCFA } from '~/utils/format'
</script>

<template>
  <div
    class="apercu-tel"
    data-theme="member"
    aria-hidden="true"
  >
    <div class="apercu-tel__total">
      <div class="apercu-tel__petit">
        Total restant à payer
      </div>
      <div class="apercu-tel__montant">
        {{ formatFCFA(395_000) }}
      </div>
      <div class="apercu-tel__petit">
        sur 3 projets · 2 associations
      </div>
    </div>
    <div class="apercu-tel__projet">
      <div class="apercu-tel__entete">
        <b>Centre communautaire</b>
        <span class="cz-badge cz-badge--danger cz-badge--sm">En retard</span>
      </div>
      <div class="apercu-tel__libelle">
        Régulariser
      </div>
      <div class="apercu-tel__du">
        {{ formatFCFA(30_000) }}
      </div>
    </div>
    <div class="apercu-tel__action">
      + Déclarer un paiement
    </div>
  </div>
</template>

<style scoped>
.apercu-tel {
  width: 220px;
  padding: var(--space-3);
  border: 7px solid var(--text-strong);
  border-radius: 28px;
  background: var(--page);
  box-shadow: var(--shadow-modal);
  font-family: var(--font-text);
}

.apercu-tel__total {
  padding: 14px;
  border-radius: var(--r-card);
  background: var(--brand);
  color: var(--on-brand);
}

.apercu-tel__petit {
  font-size: 11px;
  opacity: .92;
}

.apercu-tel__montant {
  font-family: var(--font-display);
  font-size: 24px;
  font-weight: 600;
}

.apercu-tel__projet {
  margin-top: 10px;
  padding: var(--space-3);
  border: 2px solid var(--danger);
  border-radius: var(--r-card);
  background: var(--surface);
}

.apercu-tel__entete {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-1);
}

.apercu-tel__entete b {
  font-family: var(--font-display);
  font-size: 13px;
  color: var(--text-strong);
}

.apercu-tel__libelle {
  margin-top: 6px;
  font-size: 11px;
  color: var(--text-muted);
}

.apercu-tel__du {
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 600;
  color: var(--danger-fg);
}

.apercu-tel__action {
  margin-top: 10px;
  padding: 10px 14px;
  border-radius: var(--r-pill);
  background: var(--brand);
  color: var(--on-brand);
  font-family: var(--font-display);
  font-size: 13px;
  font-weight: 500;
  text-align: center;
}

@media (max-width: 767px) {
  .apercu-tel {
    width: 250px;
  }
}
</style>
