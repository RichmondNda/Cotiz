<!--
  Message prêt à transmettre soi-même (docs/specs/ui-deviations.md, aucun fournisseur d'envoi) : titre, destinataire,
  code d'activation en police mono avec sa date d'expiration (s'il y en a un), message en lecture seule, puis
  « Copier le message », WhatsApp, SMS, messagerie (mailto) et « Partager » (partage natif, si le navigateur le permet).
  Les liens viennent du back (handoff) ; un lien absent masque son bouton. Fiche imprimable et case « Remis » : lot 2.3.
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
}>(), { code: undefined, expireLe: undefined, whatsapp: null, sms: null, mailto: null })

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
      </div>
    </div>
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
