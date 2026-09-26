<!--
  En-tête mobile (< 768 px) des écrans du gestionnaire : bandeau blanc pleine largeur (EnTeteMobile),
  retour éventuel, actions (« + Nouveau »), cloche des notifications avec le compteur de non lues.
  Masqué au-delà de 767 px : la barre supérieure et l'en-tête de page (EnTetePage) prennent le relais.
  Déborde du padding du contenu du gabarit back-office pour toucher les bords de l'écran.
-->
<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'

withDefaults(defineProps<{
  titre: string
  sousTitre?: string
  retour?: RouteLocationRaw
  cloche?: boolean
}>(), { sousTitre: undefined, retour: undefined, cloche: true })

const { data: compteurs } = useCompteursNavigation()
const nonLues = computed(() => compteurs.value?.notificationsNonLues ?? 0)
</script>

<template>
  <EnTeteMobile
    class="entete-gm"
    :titre="titre"
    :sous-titre="sousTitre"
    :retour="retour"
  >
    <template
      v-if="$slots.actions || cloche"
      #actions
    >
      <slot name="actions" />
      <NuxtLink
        v-if="cloche"
        to="/asso/notifications"
        class="cz-bell entete-gm__cloche"
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
</template>

<style scoped>
.entete-gm {
  display: none;
}

.entete-gm__cloche {
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
}

.entete-gm__cloche .cz-count {
  top: 5px;
  right: 3px;
}

@media (max-width: 767px) {
  .entete-gm {
    display: flex;
    margin: calc(-1 * var(--space-4)) calc(-1 * var(--space-3)) 0;
  }
}
</style>
