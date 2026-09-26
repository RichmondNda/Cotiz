<!--
  MbNotifications — savoir ce qui s'est passé et agir en un geste.
  Groupes Aujourd'hui · Cette semaine · Plus ancien ; chaque élément ouvre l'écran d'action et passe « lu ».
  « Tout marquer comme lu » (« Tout lire » en mobile) tant qu'il reste des non lues.
  Scénarios : `tout-lu`, `vide`.
-->
<script setup lang="ts">
definePageMeta({ middleware: 'espace-souscripteur', layout: 'souscripteur' })
useHead({ title: 'Notifications · Cotiz' })

const { data: notifications, pending, error, refresh } = useNotifications()
const { ouvrir, toutLire, envoi } = useLectureNotifications(refresh)

const nonLues = computed(() => (notifications.value ?? []).filter(n => !n.lue).length)
</script>

<template>
  <div class="notifications">
    <EnTeteSouscripteur
      titre="Notifications"
      retour="/accueil"
    >
      <template
        v-if="nonLues"
        #actions
      >
        <CzButton
          variante="secondaire"
          taille="sm"
          :chargement="envoi"
          @click="toutLire"
        >
          Tout marquer comme lu
        </CzButton>
      </template>
      <template
        v-if="nonLues"
        #actions-mobile
      >
        <BoutonToutLire
          :envoi="envoi"
          @click="toutLire"
        />
      </template>
    </EnTeteSouscripteur>

    <div class="notifications__colonne">
      <template v-if="pending && !notifications">
        <CzSkeleton
          v-for="n in 3"
          :key="n"
          :hauteur="88"
          class="notifications__skel"
        />
      </template>

      <CzEmpty
        v-else-if="error"
        icone="alerte"
        ton="danger"
        titre="Impossible d’afficher vos notifications"
        description="Vérifiez votre connexion, puis réessayez."
        class="notifications__vide"
      >
        <template #action>
          <CzButton
            variante="secondaire"
            @click="refresh()"
          >
            Réessayer
          </CzButton>
        </template>
      </CzEmpty>

      <CzEmpty
        v-else-if="!notifications?.length"
        icone="notification"
        titre="Aucune notification"
        description="Rappels d’échéance, validations et contrats à signer s’afficheront ici."
        class="notifications__vide"
      />

      <template v-else>
        <ListeNotificationsGroupees
          :notifications="notifications ?? []"
          @ouvrir="ouvrir"
        />
      </template>
    </div>
  </div>
</template>

<style scoped>
.notifications {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.notifications :deep(.entete-mb__page),
.notifications__colonne {
  width: 100%;
  max-width: 760px;
  margin: 0 auto;
}

.notifications__colonne {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.notifications__skel {
  border-radius: var(--r-md);
}

.notifications__vide {
  padding: var(--space-12) var(--space-6);
  border-radius: var(--r-card-lg);
  box-shadow: var(--shadow);
}

@media (max-width: 767px) {
  .notifications,
  .notifications__colonne {
    gap: var(--space-3);
  }
}
</style>
