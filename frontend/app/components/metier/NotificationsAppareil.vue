<!--
  Notifications push sur cet appareil (me.push, lot 4.2) : un interrupteur, l'état du navigateur (refusées, iPhone à
  installer). Rien n'est affiché tant que le push n'est pas disponible (fonctionnalité `web_push`, navigateur sans push).
  `carte` : bloc autonome avec son titre (espace souscripteur) ; sinon une ligne dans une liste de préférences.
  Écart avec la maquette (ui-deviations, lot 4.2) : bloc ajouté aux profils.
-->
<script setup lang="ts">
import type { Espace } from '~/utils/bascule'
import { codeErreur, champsErreur, messageRefus } from '~/composables/api/client'

const props = withDefaults(defineProps<{ espace: Espace, carte?: boolean }>(), { carte: false })
const toast = useToast()
const { etat, envoi, activer, desactiver } = usePushAppareil(props.espace)

const visible = computed(() => etat.value !== 'chargement' && etat.value !== 'indisponible')
const detail = computed(() => {
  switch (etat.value) {
    case 'actif': return 'Activées : vous êtes prévenu même application fermée'
    case 'refuse': return 'Bloquées dans les réglages du navigateur'
    case 'a-installer': return 'Ajoutez d’abord Cotiz à l’écran d’accueil'
    default: return 'Soyez prévenu même application fermée'
  }
})

async function basculer(valeur: boolean) {
  try {
    if (!valeur) await desactiver()
    else if (!(await activer())) toast.info('Notifications non autorisées', { message: 'Vous pourrez les autoriser plus tard dans les réglages du navigateur.' })
  }
  catch (e) {
    // 404 de me.push › vapidKey : push non configuré ; 422 : service push du navigateur non accepté par Cotiz.
    if (codeErreur(e) === 'not_found') toast.erreur('Notifications push indisponibles', { message: 'Elles ne sont pas encore proposées. Réessayez plus tard.' })
    else if (champsErreur(e).endpoint === 'unsupported_push_service') toast.erreur('Navigateur non pris en charge', { message: 'Les notifications push de ce navigateur ne sont pas acceptées. Essayez avec Chrome, Firefox, Edge ou Safari.' })
    else toast.erreur('Réglage non enregistré', { message: messageRefus(e) ?? 'Vérifiez votre connexion, puis réessayez.' })
  }
}
</script>

<template>
  <component
    :is="props.carte ? 'section' : 'div'"
    v-if="visible"
    :class="props.carte ? 'cz-card appareil appareil--carte' : 'appareil'"
    :aria-labelledby="props.carte ? 'titre-appareil' : undefined"
  >
    <h2
      v-if="props.carte"
      id="titre-appareil"
      class="appareil__titre"
    >
      Notifications sur cet appareil
    </h2>
    <div class="appareil__ligne">
      <span class="appareil__texte">
        <b>{{ props.carte ? 'Notifications push' : 'Notifications sur cet appareil' }}</b>
        <span>{{ detail }}</span>
      </span>
      <CzToggle
        :model-value="etat === 'actif'"
        :disabled="envoi || etat === 'refuse' || etat === 'a-installer'"
        label="Notifications sur cet appareil"
        @update:model-value="basculer"
      />
    </div>
    <p
      v-if="etat === 'a-installer'"
      class="appareil__aide"
    >
      Sur iPhone : touchez Partager, puis « Sur l’écran d’accueil », et ouvrez Cotiz depuis l’icône.
    </p>
    <p
      v-else-if="etat === 'refuse'"
      class="appareil__aide"
    >
      Autorisez les notifications pour ce site dans les réglages du navigateur, puis revenez ici.
    </p>
  </component>
</template>

<style scoped>
.appareil {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3) 0;
  border-bottom: 1px solid var(--divider);
}

.appareil--carte {
  gap: var(--space-3);
  padding: var(--space-6);
  border-bottom: none;
}

.appareil__titre {
  margin: 0;
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 600;
  color: var(--text-strong);
}

.appareil__ligne {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: 44px;
}

.appareil__texte {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.appareil__texte b {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-strong);
}

.appareil__texte span,
.appareil__aide {
  font-size: 12.5px;
  color: var(--text-muted);
}

.appareil__aide {
  margin: 0;
}
</style>
