<!--
  Carte association :
  - souscripteur : avatar carré, ville et ancienneté, projets actifs, reste à payer, statut, « Voir les projets → » ;
  - super-admin : avatar indigo, plan et volume, statut d'association, deux chiffres (projets, activité).
-->
<script setup lang="ts">
import { NuxtLink } from '#components'
import type { RouteLocationRaw } from 'vue-router'

withDefaults(defineProps<{
  vue?: 'souscripteur' | 'superadmin'
  /** Squelette de chargement à la forme de la carte. */
  chargement?: boolean
  nom?: string
  /** « Abidjan · membre depuis 2024 » / « Plan Pro · 142 souscripteurs ». */
  sousTitre?: string
  initiales?: string
  /** Deux chiffres clés. */
  chiffres?: { valeur: string, libelle: string }[]
  /** Badge : type de statut + statut. */
  statut?: { type: 'souscription' | 'association', valeur: string }
  lien?: { label: string, to: RouteLocationRaw }
  to?: RouteLocationRaw
}>(), { vue: 'souscripteur', chargement: false, nom: '', chiffres: () => [], sousTitre: undefined, initiales: undefined, statut: undefined, lien: undefined, to: undefined })
</script>

<template>
  <div
    v-if="chargement"
    class="cz-pcard carte-asso"
    :class="{ 'cz-pcard--member': vue === 'souscripteur' }"
    aria-busy="true"
  >
    <div class="carte-asso__entete">
      <CzSkeleton
        :largeur="44"
        :hauteur="44"
        class="carte-asso__skel-avatar"
      />
      <div class="carte-asso__nom">
        <CzSkeleton
          :hauteur="14"
          largeur="70%"
        />
        <CzSkeleton
          :hauteur="10"
          largeur="45%"
          class="carte-asso__skel"
        />
      </div>
    </div>
    <div class="carte-asso__chiffres">
      <CzSkeleton
        :hauteur="28"
        :largeur="60"
      />
      <CzSkeleton
        :hauteur="28"
        :largeur="90"
      />
    </div>
  </div>
  <component
    :is="to ? NuxtLink : 'article'"
    v-else
    :to="to"
    class="cz-pcard carte-asso"
    :class="{ 'cz-pcard--member': vue === 'souscripteur' }"
  >
    <div class="carte-asso__entete">
      <CzAvatar
        :nom="nom"
        :initiales="initiales"
        org
        :ton="vue === 'superadmin' ? 'sa' : 'brand'"
      />
      <div class="carte-asso__nom">
        <div class="nm">
          {{ nom }}
        </div>
        <div
          v-if="sousTitre"
          class="as"
        >
          {{ sousTitre }}
        </div>
      </div>
      <BadgeStatut
        v-if="statut && vue === 'superadmin'"
        :type="statut.type"
        :statut="statut.valeur"
      />
    </div>
    <div class="carte-asso__chiffres">
      <div
        v-for="c in chiffres"
        :key="c.libelle"
      >
        <b>{{ c.valeur }}</b>
        <span class="cz-muted">{{ c.libelle }}</span>
      </div>
    </div>
    <div
      v-if="vue === 'souscripteur' && (statut || lien)"
      class="ft"
    >
      <BadgeStatut
        v-if="statut"
        :type="statut.type"
        :statut="statut.valeur"
      />
      <span
        v-if="lien"
        class="carte-asso__lien"
      >{{ lien.label }} →</span>
    </div>
  </component>
</template>

<style scoped>
.carte-asso {
  display: block;
  width: auto;
  color: inherit;
  text-decoration: none;
}

.carte-asso:not(a) {
  cursor: default;
}

a.carte-asso:focus-visible {
  outline: none;
  box-shadow: var(--shadow), 0 0 0 3px var(--brand);
}

.carte-asso__entete {
  display: flex;
  gap: var(--space-3);
  align-items: center;
}

.carte-asso__nom {
  flex: 1;
  min-width: 0;
}

.carte-asso__chiffres {
  display: flex;
  gap: var(--space-6);
  margin-top: var(--space-3);
  font-size: 13px;
}

.carte-asso__chiffres b {
  display: block;
  font-family: var(--font-display);
  font-size: 17px;
  font-weight: 600;
  color: var(--text-strong);
}

.carte-asso__skel {
  margin-top: var(--space-2);
}

.carte-asso__skel-avatar {
  border-radius: var(--r-md);
}

.carte-asso__lien {
  font-size: 13px;
  font-weight: 600;
  color: var(--brand-dark);
}
</style>
