<!--
  MgNotifications — ne rien rater. Mêmes données que la cloche de la barre supérieure (compteur de non lues).
  Filtres Toutes · Paiements · Retards · Contrats · Abonnement ; groupes Aujourd'hui · Cette semaine · Plus ancien ;
  chaque élément ouvre l'écran d'action et passe « lu ». « Tout marquer comme lu » (« Tout lire » en mobile)
  tant qu'il reste des non lues. Scénarios : `tout-lu`, `vide` (+ `chargement`, `erreur`).
-->
<script setup lang="ts">
import type { Notification, TypeNotification } from '~~/types'
import type { NomIcone } from '~/utils/icons'
import { pluriel } from '~/utils/format'

definePageMeta({ middleware: 'espace-gestionnaire', layout: 'backoffice', espace: 'gestionnaire', titre: 'Notifications' })
useHead({ title: 'Notifications · Cotiz' })

const { data: notifications, pending, error, refresh } = useNotifications()
const { ouvrir, toutLire, envoi } = useLectureNotifications(refresh)

type Categorie = 'paiements' | 'retards' | 'contrats' | 'abonnement'
type Filtre = 'toutes' | Categorie

/** Catégorie de filtre et apparence de chaque type, côté gestionnaire (MgNotifications). */
const CATEGORIES: Record<TypeNotification, { categorie: Categorie, icone: NomIcone, ton: 'warning' | 'danger' | 'success' | 'info' }> = {
  paiement_declare: { categorie: 'paiements', icone: 'paiement', ton: 'warning' },
  paiement_valide: { categorie: 'paiements', icone: 'paiement', ton: 'warning' },
  paiement_rejete: { categorie: 'paiements', icone: 'paiement', ton: 'warning' },
  relance: { categorie: 'retards', icone: 'alerte', ton: 'danger' },
  echeance_en_retard: { categorie: 'retards', icone: 'alerte', ton: 'danger' },
  echeance_proche: { categorie: 'retards', icone: 'alerte', ton: 'danger' },
  contrat_a_signer: { categorie: 'retards', icone: 'alerte', ton: 'danger' },
  contrat_signe: { categorie: 'contrats', icone: 'contrat', ton: 'success' },
  inscriptions: { categorie: 'contrats', icone: 'contrat', ton: 'success' },
  abonnement: { categorie: 'abonnement', icone: 'facturation', ton: 'info' },
}

const FILTRES: { valeur: Filtre, label: string }[] = [
  { valeur: 'toutes', label: 'Toutes' },
  { valeur: 'paiements', label: 'Paiements' },
  { valeur: 'retards', label: 'Retards' },
  { valeur: 'contrats', label: 'Contrats' },
  { valeur: 'abonnement', label: 'Abonnement' },
]
const filtre = ref<Filtre>('toutes')

const toutes = computed(() => notifications.value ?? [])
const nonLues = computed(() => toutes.value.filter(n => !n.lue).length)
const filtrees = computed(() => toutes.value.filter(n => filtre.value === 'toutes' || CATEGORIES[n.type].categorie === filtre.value))
const sousTitre = computed(() => {
  if (!notifications.value) return undefined
  if (!toutes.value.length) return 'Rien de nouveau'
  return nonLues.value ? `${pluriel(nonLues.value, 'non lue')}` : 'Tout est lu'
})

const apparence = (n: Notification) => CATEGORIES[n.type]
const chargement = computed(() => pending.value && !notifications.value)
</script>

<template>
  <div class="notifs">
    <EnTeteGestionnaireMobile
      titre="Notifications"
      :sous-titre="sousTitre"
      retour="/asso/plus"
      :cloche="false"
    >
      <template
        v-if="nonLues"
        #actions
      >
        <BoutonToutLire
          :envoi="envoi"
          @click="toutLire"
        />
      </template>
    </EnTeteGestionnaireMobile>
    <EnTetePage
      titre="Notifications"
      :sous-titre="sousTitre"
      class="cz-desktop"
    >
      <template
        v-if="nonLues"
        #actions
      >
        <CzButton
          variante="secondaire"
          :chargement="envoi"
          libelle-chargement="Enregistrement…"
          @click="toutLire"
        >
          Tout marquer comme lu
        </CzButton>
      </template>
    </EnTetePage>

    <div class="notifs__colonne">
      <div
        class="notifs__filtres"
        role="group"
        aria-label="Type de notification"
      >
        <CzChip
          v-for="f in FILTRES"
          :key="f.valeur"
          :actif="filtre === f.valeur"
          @click="filtre = f.valeur"
        >
          {{ f.label }}
        </CzChip>
      </div>

      <template v-if="chargement">
        <CzSkeleton
          v-for="n in 4"
          :key="n"
          :hauteur="88"
          class="notifs__skel"
        />
      </template>

      <CzErreurChargement
        v-else-if="error && !notifications"
        titre="Impossible d’afficher vos notifications"
        @reessayer="refresh()"
      />

      <div
        v-else-if="!toutes.length"
        class="cz-card notifs__vide"
      >
        <CzEmpty
          icone="notification"
          titre="Aucune notification"
          integre
        >
          <span class="cz-desktop">Déclarations de paiement, signatures et retards s’afficheront ici.</span>
          <span class="cz-mobile">Déclarations, signatures et retards s’afficheront ici.</span>
        </CzEmpty>
      </div>

      <div
        v-else-if="!filtrees.length"
        class="cz-card notifs__vide"
      >
        <CzEmpty
          icone="recherche"
          ton="neutral"
          titre="Rien dans cette catégorie"
          description="Choisissez « Toutes » pour voir l’ensemble de vos notifications."
          integre
        />
      </div>

      <ListeNotificationsGroupees
        v-else
        :notifications="filtrees"
        :apparence="apparence"
        @ouvrir="ouvrir"
      />
    </div>
  </div>
</template>

<style scoped>
.notifs {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.notifs__colonne {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  max-width: 860px;
}

.notifs__filtres {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.notifs__skel {
  border-radius: var(--r-md);
}

.notifs__vide {
  padding: var(--space-12) var(--space-4);
}

@media (max-width: 767px) {
  .notifs,
  .notifs__colonne {
    gap: var(--space-3);
  }

  /* Filtres sur une ligne, défilement horizontal. */
  .notifs__filtres {
    flex-wrap: nowrap;
    overflow-x: auto;
    margin: 0 calc(-1 * var(--space-3));
    padding: 0 var(--space-3) 2px;
    scrollbar-width: none;
  }

  .notifs__filtres > * {
    flex-shrink: 0;
  }

  /* La maquette mobile ne montre pas les liens d'action : l'élément entier ouvre l'écran. */
  .notifs__colonne :deep(.notif__action) {
    display: none;
  }
}
</style>
