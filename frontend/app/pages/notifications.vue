<!--
  MbNotifications — savoir ce qui s'est passé et agir en un geste.
  Groupes Aujourd'hui · Cette semaine · Plus ancien ; chaque élément ouvre l'écran d'action et passe « lu ».
  « Tout marquer comme lu » (« Tout lire » en mobile) tant qu'il reste des non lues.
  Scénarios : `tout-lu`, `vide`.
-->
<script setup lang="ts">
import type { Notification } from '~~/types'
import { formatDate, formatJourSemaine, joursDepuis, lireDate } from '~/utils/format'

definePageMeta({ middleware: 'espace-souscripteur', layout: 'souscripteur' })
useHead({ title: 'Notifications · Cotiz' })

const { data: notifications, pending, error, refresh } = useNotifications()
const { refresh: rafraichirCompteurs } = useCompteursNavigation()
const appeler = useAppelApi()

const nonLues = computed(() => (notifications.value ?? []).filter(n => !n.lue).length)

const estDatee = (n: Notification) => /^\d{4}-/.test(n.creeeLe)
const groupes = computed(() => {
  const liste = [...(notifications.value ?? [])].sort((a, b) => b.creeeLe.localeCompare(a.creeeLe))
  const g = [
    { titre: 'Aujourd’hui', notifications: [] as Notification[] },
    { titre: 'Cette semaine', notifications: [] as Notification[] },
    { titre: 'Plus ancien', notifications: [] as Notification[] },
  ]
  for (const n of liste) {
    const jours = estDatee(n) ? joursDepuis(n.creeeLe) : Number.POSITIVE_INFINITY
    g[jours <= 0 ? 0 : jours <= 6 ? 1 : 2]!.notifications.push(n)
  }
  return g.filter(x => x.notifications.length)
})

/** Heure (aujourd'hui), jour de la semaine (cette semaine), sinon JJ/MM. */
function moment(n: Notification): string {
  if (!estDatee(n)) return n.creeeLe
  const jours = joursDepuis(n.creeeLe)
  if (jours <= 0) {
    const d = lireDate(n.creeeLe)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  if (jours <= 6) return formatJourSemaine(n.creeeLe)
  return formatDate(n.creeeLe, 'numerique').slice(0, 5)
}

async function ouvrir(n: Notification) {
  if (n.lue) return
  n.lue = true
  try {
    await appeler(`/notifications/${n.id}`, { method: 'PATCH' })
  }
  finally {
    rafraichirCompteurs()
  }
}

const envoi = ref(false)
async function toutLire() {
  envoi.value = true
  try {
    await appeler('/notifications/tout-lu')
    await Promise.all([refresh(), rafraichirCompteurs()])
  }
  finally {
    envoi.value = false
  }
}
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
        <button
          type="button"
          class="notifications__tout-lire"
          @click="toutLire"
        >
          Tout lire
        </button>
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
        <section
          v-for="g in groupes"
          :key="g.titre"
          class="notifications__groupe"
          :aria-label="g.titre"
        >
          <h2 class="cz-notif-group">
            {{ g.titre }}
          </h2>
          <ul class="notifications__liste">
            <li
              v-for="n in g.notifications"
              :key="n.id"
            >
              <NotificationItem
                :type="n.type"
                :titre="n.titre"
                :message="n.message"
                :moment="moment(n)"
                :lue="n.lue"
                :to="n.lien"
                :action="n.libelleAction"
                @ouvrir="ouvrir(n)"
              />
            </li>
          </ul>
        </section>
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

.notifications__groupe {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.notifications__groupe .cz-notif-group {
  margin: 0;
}

.notifications__liste {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.notifications__liste :deep(.cz-notif) {
  padding: var(--space-4);
  box-shadow: var(--shadow);
}

.notifications__tout-lire {
  min-height: 44px;
  padding: 0 var(--space-1);
  border: 0;
  background: transparent;
  font-family: var(--font-display);
  font-size: 14px;
  font-weight: 500;
  color: var(--brand-dark);
  cursor: pointer;
}

.notifications__tout-lire:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
  border-radius: var(--r-sm);
}

@media (max-width: 767px) {
  .notifications,
  .notifications__colonne {
    gap: var(--space-3);
  }
}
</style>
