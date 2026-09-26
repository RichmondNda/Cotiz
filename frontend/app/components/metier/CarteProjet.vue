<!--
  Carte projet, deux vues :
  - gestionnaire : nom, fréquence et montant, statut, barre d'avancement (en cours : collecté en brand ;
    inscriptions ouvertes : inscrits / requis en info), avatars empilés, alerte (retards, signatures).
    Brouillon : pointillé neutre + message d'étape. Terminé : grisé, « Voir le bilan ».
  - souscripteur : le reste à payer domine. À jour : bordure standard ; en retard : bordure danger 2 px,
    montant en danger-fg ; signature attendue : pointillé warning, contenu masqué ; terminé : grisé.
  Toute la carte mène au détail (`to`) ; le bouton d'action a sa propre destination.
-->
<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'
import type { StatutProjet, StatutSouscription } from '~~/types'
import { formatFCFA } from '~/utils/format'

export interface ActionCarte {
  label: string
  to?: RouteLocationRaw
  variante?: 'primaire' | 'secondaire' | 'fantome'
}

const props = withDefaults(defineProps<{
  vue?: 'gestionnaire' | 'souscripteur'
  nom: string
  /** Gestionnaire : « Mensuel · 25 000 F · depuis mars 2026 ». Souscripteur : nom de l'association. */
  sousTitre?: string
  /** Statut du projet (gestionnaire) ou de la souscription (souscripteur) ; `termine` dans les deux vues. */
  statut: StatutProjet | StatutSouscription | 'termine'
  // Avancement
  progression?: number
  progressionGauche?: string
  progressionDroite?: string
  // Gestionnaire
  avatars?: { nom: string, ton?: 'brand' | 'success' | 'danger' | 'warning' }[]
  avatarsTotal?: number
  avatarsReste?: string
  alerte?: { texte: string, ton: 'danger' | 'warning' | 'success' | 'info' | 'neutral' }
  /** Texte d'aide en pied à gauche (« Démarre le 1ᵉʳ janvier », « Modifié il y a 2 j »). */
  aidePied?: string
  /** Message (brouillon, signature attendue). */
  message?: string
  // Souscripteur
  libelleMontant?: string
  montant?: number | string
  /** Bloc en pied à gauche : « Prochaine échéance / 25 000 F · 5 oct. ». */
  pied?: { libelle?: string, valeur: string }
  action?: ActionCarte
  to?: RouteLocationRaw
}>(), {
  vue: 'gestionnaire',
  sousTitre: undefined,
  progression: undefined,
  progressionGauche: undefined,
  progressionDroite: undefined,
  avatars: () => [],
  avatarsTotal: undefined,
  avatarsReste: undefined,
  alerte: undefined,
  aidePied: undefined,
  message: undefined,
  libelleMontant: 'Reste à payer',
  montant: undefined,
  pied: undefined,
  action: undefined,
  to: undefined,
})

const estMembre = computed(() => props.vue === 'souscripteur')
const variante = computed(() => {
  if (props.statut === 'termine') return 'done'
  if (!estMembre.value && props.statut === 'brouillon') return 'draft'
  if (estMembre.value && props.statut === 'en_retard') return 'late'
  if (estMembre.value && props.statut === 'signature_attendue') return 'sign'
  return null
})
const typeStatut = computed(() => (estMembre.value && props.statut !== 'termine' ? 'souscription' : 'projet'))
const tonBarre = computed(() => {
  if (variante.value === 'done') return 'muted'
  if (variante.value === 'late') return 'danger'
  if (props.statut === 'inscriptions_ouvertes') return 'info'
  return 'brand'
})
const contenuMasque = computed(() => variante.value === 'sign' || variante.value === 'draft')

const router = useRouter()
function ouvrir(e: MouseEvent | KeyboardEvent) {
  if (!props.to) return
  if ((e.target as HTMLElement).closest('a, button')) return
  router.push(props.to)
}
</script>

<template>
  <article
    class="cz-pcard"
    :class="[estMembre && 'cz-pcard--member', variante && `cz-pcard--${variante}`]"
    :tabindex="to ? 0 : undefined"
    :aria-label="nom"
    @click="ouvrir"
    @keydown.enter.self="ouvrir"
  >
    <div class="hd">
      <div>
        <h3 class="nm">
          {{ nom }}
        </h3>
        <div
          v-if="sousTitre"
          class="as"
        >
          {{ sousTitre }}
        </div>
      </div>
      <BadgeStatut
        :type="typeStatut"
        :statut="statut"
      />
    </div>

    <p
      v-if="message && contenuMasque"
      class="msg"
    >
      {{ message }}
    </p>

    <template v-if="!contenuMasque">
      <template v-if="estMembre && montant !== undefined">
        <div class="lbl">
          {{ libelleMontant }}
        </div>
        <div class="amt">
          {{ formatFCFA(montant) }}
        </div>
      </template>
      <template v-if="progression !== undefined">
        <CzProgress
          :valeur="progression"
          :ton="tonBarre"
          :label="progressionGauche"
        />
        <div class="row">
          <span>{{ progressionGauche }}</span><span>{{ progressionDroite }}</span>
        </div>
      </template>
    </template>

    <div class="ft">
      <CzAvatarPile
        v-if="avatars.length && !contenuMasque"
        :personnes="avatars"
        :total="avatarsTotal"
        :reste="avatarsReste"
      />
      <div
        v-else-if="pied && !contenuMasque"
        class="next"
      >
        <span v-if="pied.libelle">{{ pied.libelle }}</span><b>{{ pied.valeur }}</b>
      </div>
      <span
        v-else-if="aidePied"
        class="cz-help"
      >{{ aidePied }}</span>
      <span v-else />
      <CzBadge
        v-if="alerte && !contenuMasque"
        :ton="alerte.ton"
      >
        {{ alerte.texte }}
      </CzBadge>
      <CzButton
        v-else-if="action"
        taille="sm"
        :variante="action.variante ?? 'primaire'"
        :to="action.to"
      >
        {{ action.label }}
      </CzButton>
    </div>
  </article>
</template>

<style scoped>
.cz-pcard {
  width: auto;
}

.cz-pcard:not([tabindex]) {
  cursor: default;
}

.cz-pcard:focus-visible {
  outline: none;
  box-shadow: var(--shadow), 0 0 0 3px var(--brand);
}

.nm {
  margin: 0;
}

.next b {
  font-weight: 600;
  color: var(--text-strong);
}

.cz-pcard--late .next b {
  color: inherit;
}
</style>
