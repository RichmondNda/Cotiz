<!--
  En-tête des écrans souscripteur, une seule déclaration pour les deux rendus :
  - mobile (< 768 px) : bandeau blanc collant pleine largeur (EnTeteMobile), retour, actions, cloche éventuelle ;
  - desktop, variante `page` : lien « Retour » au-dessus du H1, sous-titre, actions à droite ;
  - desktop, variante `barre` (détail d'un projet) : barre blanche pleine largeur en haut du contenu.
  Le slot `actions` sert aux deux rendus ; `actions-mobile` le remplace en mobile (libellé plus court…).
-->
<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'

withDefaults(defineProps<{
  titre: string
  sousTitre?: string
  retour?: RouteLocationRaw
  variante?: 'page' | 'barre'
  /** Mobile : cloche des notifications avec le compteur de non lues (accueil). */
  cloche?: boolean
  /** Rendu mobile seulement : la page porte son propre en-tête desktop (fiche association). */
  mobileSeul?: boolean
}>(), { sousTitre: undefined, retour: undefined, variante: 'page', cloche: false, mobileSeul: false })

const { data: compteurs } = useCompteursNavigation()
const nonLues = computed(() => compteurs.value?.notificationsNonLues ?? 0)
</script>

<template>
  <div
    class="entete-mb"
    :class="`entete-mb--${variante}`"
  >
    <EnTeteMobile
      class="entete-mb__mobile"
      :titre="titre"
      :sous-titre="sousTitre"
      :retour="retour"
    >
      <template
        v-if="$slots.actions || $slots['actions-mobile'] || cloche"
        #actions
      >
        <slot name="actions-mobile">
          <slot name="actions" />
        </slot>
        <NuxtLink
          v-if="cloche"
          to="/notifications"
          class="cz-bell entete-mb__cloche"
          :aria-label="nonLues ? `Notifications, ${nonLues} non lues` : 'Notifications'"
        >
          <CzIcon nom="notification" />
          <CzCount
            v-if="nonLues"
            :valeur="nonLues"
            ton="danger"
            aria-hidden="true"
          />
        </NuxtLink>
      </template>
    </EnTeteMobile>

    <template v-if="mobileSeul" />
    <header
      v-else-if="variante === 'barre'"
      class="entete-mb__barre"
    >
      <NuxtLink
        v-if="retour"
        :to="retour"
        class="entete-mb__retour-icone"
        aria-label="Retour"
      >
        <CzIcon nom="chevron-gauche" />
      </NuxtLink>
      <div class="entete-mb__textes">
        <h1>{{ titre }}</h1>
        <p v-if="sousTitre">
          {{ sousTitre }}
        </p>
      </div>
      <div
        v-if="$slots.actions"
        class="entete-mb__actions"
      >
        <slot name="actions" />
      </div>
    </header>

    <EnTetePage
      v-else
      class="entete-mb__page"
      :titre="titre"
      :sous-titre="sousTitre"
    >
      <template
        v-if="retour"
        #avant
      >
        <NuxtLink
          :to="retour"
          class="entete-mb__retour"
        >
          <CzIcon
            nom="chevron-gauche"
            :taille="16"
          />Retour
        </NuxtLink>
      </template>
      <template
        v-if="$slots.actions"
        #actions
      >
        <slot name="actions" />
      </template>
    </EnTetePage>
  </div>
</template>

<style scoped>
.entete-mb__mobile {
  display: none;
}

.entete-mb__retour {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  margin-bottom: var(--space-2);
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text-muted);
  text-decoration: none;
}

.entete-mb__retour:hover {
  color: var(--text-strong);
}

.entete-mb__barre {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  /* Pleine largeur de la zone de contenu (hors barre latérale), quelle que soit la largeur de la colonne. */
  margin: calc(-1 * var(--space-8)) calc((100% - (100vw - var(--sidebar))) / 2) 0;
  padding: var(--space-3) var(--space-12);
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}

.entete-mb__retour-icone {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  margin-left: calc(-1 * var(--space-2));
  border-radius: var(--r-field);
  color: var(--text-strong);
}

.entete-mb__textes {
  flex: 1;
  min-width: 0;
}

.entete-mb__barre h1 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 600;
  color: var(--text-strong);
}

.entete-mb__barre p {
  margin: var(--space-1) 0 0;
  font-size: 12.5px;
  color: var(--text-muted);
}

.entete-mb__actions {
  display: flex;
  gap: var(--space-2);
}

.entete-mb__retour:focus-visible,
.entete-mb__retour-icone:focus-visible,
.entete-mb__cloche:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.entete-mb__cloche {
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: var(--r-field);
}

.entete-mb__cloche .cz-count {
  top: 4px;
  right: 4px;
}

@media (max-width: 767px) {
  .entete-mb__mobile {
    display: flex;
    position: sticky;
    top: 0;
    z-index: 15;
    /* Pleine largeur : annule le padding mobile du contenu (16 px / 12 px). */
    margin: calc(-1 * var(--space-4)) calc(-1 * var(--space-3)) 0;
  }

  .entete-mb__barre,
  .entete-mb__page {
    display: none;
  }

  .entete-mb__mobile :deep(.entete-mobile__titre) {
    overflow: hidden;
    font-size: 18px;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .entete-mb__mobile :deep(.entete-mobile__sous-titre) {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .entete-mb--barre .entete-mb__mobile :deep(.entete-mobile__titre) {
    font-size: 17px;
  }
}
</style>
