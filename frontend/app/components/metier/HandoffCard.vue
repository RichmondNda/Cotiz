<!--
  Message prêt à transmettre soi-même (docs/specs/ui-deviations.md, aucun fournisseur d'envoi) : titre, destinataire,
  code d'activation en police mono avec sa date d'expiration (s'il y en a un), message en lecture seule, puis
  « Copier le message », WhatsApp, SMS, messagerie (mailto) et « Partager » (partage natif, si le navigateur le permet).
  Les liens viennent du back (handoff) ; un lien absent masque son bouton. « Imprimer la fiche » (A6 avec QR du lien
  d'activation) si `lien` et `association` sont fournis ; case « Remis » si `v-model:remis` est lié.
-->
<script setup lang="ts">
import { formatDateHeure } from '~/utils/format'

const props = withDefaults(defineProps<{
  titre: string
  /** Nom de la personne à qui transmettre. */
  destinataire: string
  code?: string
  /** Expiration du code (instant ISO). */
  expireLe?: string
  message: string
  whatsapp?: string | null
  sms?: string | null
  mailto?: string | null
  /** Lien d'activation (QR de la fiche imprimable). */
  lien?: string | null
  /** Nom de l'association, en tête de la fiche imprimable. */
  association?: string
}>(), { code: undefined, expireLe: undefined, whatsapp: null, sms: null, mailto: null, lien: null, association: undefined })

/** Code remis à la personne (sans retour arrière) ; `undefined` : case masquée. */
const remis = defineModel<boolean | undefined>('remis', { default: undefined })
const { fiches, imprimer } = useImpressionFiches()
const imprimable = computed(() => Boolean(props.lien && props.code && props.expireLe && props.association))
function imprimerFiche() {
  imprimer([{
    destinataire: props.destinataire, code: props.code!, expireLe: props.expireLe!, message: props.message,
    whatsapp: props.whatsapp, sms: props.sms, mailto: props.mailto, lien: props.lien,
  }])
}

const toast = useToast()
const partageable = ref(false)
onMounted(() => (partageable.value = typeof navigator.share === 'function'))

async function copier() {
  try {
    await navigator.clipboard.writeText(props.message)
    toast.succes('Copié', { message: 'Message copié dans le presse-papiers.' })
  }
  catch {
    toast.erreur('Copie impossible', { message: 'Sélectionnez le texte pour le copier.' })
  }
}

async function partager() {
  try {
    await navigator.share({ text: props.message })
  }
  catch {
    // Partage annulé ou refusé : rien à faire, le message reste copiable.
  }
}
</script>

<template>
  <section
    class="cz-card handoff"
    :aria-label="titre"
  >
    <div class="handoff__tete">
      <h2 class="handoff__titre">
        {{ titre }}
      </h2>
      <p class="handoff__destinataire">
        À transmettre à <b>{{ destinataire }}</b>
      </p>
    </div>
    <div
      v-if="code"
      class="handoff__code"
    >
      <span class="handoff__surtitre">Code d’activation</span>
      <span class="cz-mono handoff__valeur">{{ code }}</span>
      <span
        v-if="expireLe"
        class="handoff__expiration"
      >Valable jusqu’au {{ formatDateHeure(expireLe) }}</span>
    </div>
    <CzField label="Message prêt">
      <CzInput
        :model-value="message"
        type="textarea"
        :lignes="5"
        readonly
      />
    </CzField>
    <div class="handoff__actions">
      <CzButton
        icone="copier"
        bloc
        @click="copier"
      >
        Copier le message
      </CzButton>
      <div class="handoff__canaux">
        <CzButton
          v-if="whatsapp"
          variante="secondaire"
          taille="sm"
          :href="whatsapp"
          target="_blank"
          rel="noopener"
        >
          WhatsApp
        </CzButton>
        <CzButton
          v-if="sms"
          variante="secondaire"
          taille="sm"
          icone="telephone"
          :href="sms"
        >
          SMS
        </CzButton>
        <CzButton
          v-if="mailto"
          variante="secondaire"
          taille="sm"
          icone="email"
          :href="mailto"
        >
          Messagerie
        </CzButton>
        <CzButton
          v-if="partageable"
          variante="secondaire"
          taille="sm"
          @click="partager"
        >
          Partager
        </CzButton>
        <CzButton
          v-if="imprimable"
          variante="secondaire"
          taille="sm"
          icone="imprimer"
          @click="imprimerFiche"
        >
          Imprimer la fiche
        </CzButton>
      </div>
      <CzCheckbox
        v-if="remis !== undefined"
        v-model="remis"
        :disabled="remis"
      >
        Remis à la personne
      </CzCheckbox>
    </div>
    <FichesActivation
      v-if="association"
      :fiches="fiches"
      :association="association"
    />
  </section>
</template>

<style scoped>
.handoff {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-6);
}

.handoff__tete {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.handoff__titre {
  margin: 0;
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 600;
  color: var(--text-strong);
}

.handoff__destinataire {
  margin: 0;
  font-size: 13.5px;
  color: var(--text-muted);
}

.handoff__code {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--r-field);
  background: var(--brand-pale);
}

.handoff__surtitre {
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: .04em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.handoff__valeur {
  font-size: 24px;
  font-weight: 600;
  letter-spacing: .08em;
  color: var(--brand-dark);
}

.handoff__expiration {
  font-size: 12.5px;
  color: var(--text-muted);
}

.handoff__actions {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.handoff__canaux {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

@media (max-width: 767px) {
  .handoff__canaux > * {
    flex: 1 1 auto;
    min-height: 44px;
  }
}
</style>
