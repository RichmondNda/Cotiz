<!--
  Derniers paiements déclarés (tableau de bord gestionnaire) : avatar, nom, projet, montant, ancienneté.
  Desktop : lignes compactes avec bouton « Voir ». Mobile (< 768 px) : liste dont chaque ligne est un lien.
  `chargement` : squelettes de même forme.
-->
<script setup lang="ts">
import type { PaiementListe } from '~~/types'
import { formatFCFA, formatRelatif } from '~/utils/format'

withDefaults(defineProps<{
  paiements: PaiementListe[]
  chargement?: boolean
}>(), { chargement: false })

const nom = (p: PaiementListe) => `${p.souscripteur.prenom} ${p.souscripteur.nom}`
const lien = (p: PaiementListe) => `/asso/paiements/${p.id}`
</script>

<template>
  <ul
    v-if="chargement"
    class="recents"
    aria-busy="true"
  >
    <li
      v-for="i in 5"
      :key="i"
      class="recents__ligne"
    >
      <CzSkeleton
        :hauteur="32"
        :largeur="32"
        forme="rond"
      />
      <div class="recents__qui">
        <CzSkeleton
          :hauteur="12"
          largeur="60%"
        />
        <CzSkeleton
          :hauteur="10"
          largeur="40%"
          class="recents__skel"
        />
      </div>
      <CzSkeleton
        :hauteur="12"
        :largeur="64"
      />
    </li>
  </ul>
  <ul
    v-else
    class="recents"
  >
    <li
      v-for="p in paiements"
      :key="p.id"
      class="recents__ligne"
    >
      <NuxtLink
        :to="lien(p)"
        class="recents__lien"
      >
        <CzAvatar
          :nom="nom(p)"
          taille="sm"
        />
        <span class="recents__qui">
          <b class="recents__nom">{{ nom(p) }}</b>
          <span class="recents__sub">
            {{ p.projet.nom }}<span class="recents__mobile"> · {{ formatRelatif(p.declareLe) }}</span>
          </span>
        </span>
        <span class="recents__montant">
          <b>{{ formatFCFA(p.montant) }}</b>
          <span class="recents__sub recents__desktop">{{ formatRelatif(p.declareLe, { style: 'long' }) }}</span>
        </span>
      </NuxtLink>
      <CzButton
        variante="secondaire"
        taille="sm"
        :to="lien(p)"
        class="recents__desktop"
        :aria-label="`Voir le paiement de ${nom(p)}`"
      >
        Voir
      </CzButton>
    </li>
  </ul>
</template>

<style scoped>
.recents {
  margin: 0;
  padding: 0;
  list-style: none;
}

.recents__ligne {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  min-height: 58px;
  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--divider);
}

.recents__ligne:last-child {
  border-bottom: 0;
}

.recents__lien {
  display: flex;
  flex: 1;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
  color: inherit;
  text-decoration: none;
}

.recents__lien:focus-visible {
  outline: none;
  border-radius: var(--r-sm);
  box-shadow: var(--focus-ring);
}

.recents__qui {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.recents__skel {
  margin-top: var(--space-2);
}

.recents__nom {
  font-size: 13.5px;
  color: var(--text-strong);
}

.recents__sub {
  font-size: 12px;
  color: var(--text-muted);
}

.recents__montant {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  font-size: 13.5px;
  font-variant-numeric: tabular-nums;
  color: var(--text-strong);
  white-space: nowrap;
}

.recents__mobile {
  display: none;
}

@media (max-width: 767px) {
  .recents__ligne {
    min-height: 64px;
    padding: var(--space-2) var(--space-4);
  }

  .recents__lien {
    gap: var(--space-4);
  }

  .recents__nom,
  .recents__montant {
    font-size: 14px;
  }

  .recents__sub {
    font-size: 12.5px;
  }

  .recents__mobile {
    display: inline;
  }

  .recents__desktop {
    display: none;
  }
}
</style>
