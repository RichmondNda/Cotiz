<!--
  Notifications groupées par période (Aujourd'hui · Cette semaine · Plus ancien), plus récentes d'abord.
  Chaque élément ouvre son écran d'action ; `ouvrir` est émis au clic (la page marque la notification lue).
  `apparence` : icône et ton imposés par type (l'espace gestionnaire classe différemment certains types).
-->
<script setup lang="ts">
import type { Notification } from '~~/types'
import type { NomIcone } from '~/utils/icons'
import { grouperNotifications, momentNotification } from '~/utils/notifications'

const props = withDefaults(defineProps<{
  notifications: Notification[]
  apparence?: (n: Notification) => { icone?: NomIcone, ton?: 'warning' | 'success' | 'danger' | 'info' | 'brand' }
}>(), { apparence: undefined })

defineEmits<{ ouvrir: [Notification] }>()

const groupes = computed(() => grouperNotifications(props.notifications))
</script>

<template>
  <section
    v-for="g in groupes"
    :key="g.titre"
    class="liste-notifs__groupe"
    :aria-label="g.titre"
  >
    <h2 class="cz-notif-group">
      {{ g.titre }}
    </h2>
    <ul class="liste-notifs__liste">
      <li
        v-for="n in g.notifications"
        :key="n.id"
      >
        <NotificationItem
          :type="n.type"
          :titre="n.titre"
          :message="n.message"
          :moment="momentNotification(n)"
          :lue="n.lue"
          :to="n.lien"
          :action="n.libelleAction"
          :icone="apparence?.(n).icone"
          :ton="apparence?.(n).ton"
          @ouvrir="$emit('ouvrir', n)"
        />
      </li>
    </ul>
  </section>
</template>

<style scoped>
.liste-notifs__groupe {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.liste-notifs__groupe .cz-notif-group {
  margin: 0;
}

.liste-notifs__liste {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.liste-notifs__liste :deep(.cz-notif) {
  padding: var(--space-4);
  box-shadow: var(--shadow);
}
</style>
