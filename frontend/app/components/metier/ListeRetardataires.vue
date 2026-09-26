<!--
  Retardataires : avatar, nom (lien vers la fiche), nombre d'échéances en retard, montant dû, bouton « Relancer »
  (« Relancé ✓ » une fois la relance envoyée). Desktop : lignes compactes ; mobile : « 2 échéances · 50 000 F ».
-->
<script setup lang="ts">
import type { Retardataire } from '~~/types'
import { formatFCFA, pluriel } from '~/utils/format'

defineProps<{
  retardataires: Retardataire[]
  /** Identifiants déjà relancés. */
  relances?: string[]
  /** Relance en cours d'envoi. */
  envoi?: string | null
}>()

defineEmits<{ relancer: [r: Retardataire] }>()
</script>

<template>
  <ul class="retards">
    <li
      v-for="r in retardataires"
      :key="r.souscripteurId"
      class="retards__ligne"
    >
      <CzAvatar
        :nom="r.nom"
        ton="danger"
        taille="sm"
      />
      <div class="retards__qui">
        <NuxtLink
          :to="`/asso/souscripteurs/${r.souscripteurId}`"
          class="retards__nom"
        >
          {{ r.nom }}
        </NuxtLink>
        <span class="retards__sub cz-desktop">{{ pluriel(r.nbEcheances, 'échéance') }} en retard</span>
        <span class="retards__sub cz-mobile">{{ pluriel(r.nbEcheances, 'échéance') }} · <b class="retards__du">{{ formatFCFA(r.montant) }}</b></span>
      </div>
      <b class="retards__montant retards__du cz-desktop">{{ formatFCFA(r.montant) }}</b>
      <CzButton
        variante="secondaire"
        taille="sm"
        :chargement="envoi === r.souscripteurId"
        :disabled="relances?.includes(r.souscripteurId)"
        :aria-label="relances?.includes(r.souscripteurId) ? `${r.nom} relancé` : `Relancer ${r.nom}`"
        @click="$emit('relancer', r)"
      >
        {{ relances?.includes(r.souscripteurId) ? 'Relancé ✓' : 'Relancer' }}
      </CzButton>
    </li>
  </ul>
</template>

<style scoped>
.retards {
  margin: 0;
  padding: 0;
  list-style: none;
}

.retards__ligne {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: 58px;
  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--divider);
}

.retards__ligne:last-child {
  border-bottom: 0;
}

.retards__qui {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.retards__nom {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text-strong);
  text-decoration: none;
}

.retards__nom:hover {
  color: var(--brand-dark);
}

.retards__sub {
  font-size: 12px;
  color: var(--text-muted);
}

.retards__montant {
  width: 88px;
  font-size: 13.5px;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.retards__du {
  color: var(--danger-fg);
}

@media (max-width: 767px) {
  .retards__ligne {
    min-height: 66px;
    padding: var(--space-2) var(--space-4);
  }

  .retards__nom {
    font-size: 14.5px;
  }

  .retards__sub {
    font-size: 13px;
  }
}
</style>
