<!--
  Aperçu du paiement sélectionné dans la file de validation (desktop, panneau de droite) :
  souscripteur (lien fiche), projet, badge de statut, montant en grand, date et moyen, miniature de la preuve,
  rappel de vérification, échéances couvertes, lien « Ouvrir le détail complet ».
  Paiement en attente : « Rejeter » et « Valider le paiement » (émis vers la page) ; traité : qui et quand.
-->
<script setup lang="ts">
import type { PaiementListe } from '~~/types'
import { couvertureFile } from '~/utils/echeances'
import { formatDate, formatFCFA, lireDate } from '~/utils/format'
import { MOYENS_PAIEMENT, MOTIFS_REJET, STATUTS_PAIEMENT } from '~/utils/statuts'

const props = withDefaults(defineProps<{
  paiement: PaiementListe
  /** Validation en cours (bouton en chargement). */
  envoi?: boolean
}>(), { envoi: false })

defineEmits<{ valider: [], rejeter: [] }>()

const nom = computed(() => `${props.paiement.souscripteur.prenom} ${props.paiement.souscripteur.nom}`)
const statut = computed(() => STATUTS_PAIEMENT[props.paiement.statut])
const dateVersement = computed(() => props.paiement.dateVirement ?? props.paiement.declareLe)
const couvre = computed(() => couvertureFile(props.paiement, props.paiement.echeancesCouvertes, formatFCFA, { annee: true }))
const traite = computed(() => {
  const p = props.paiement
  if (!p.traiteLe) return ''
  const verbe = p.statut === 'rejete' ? 'Rejeté' : 'Validé'
  const le = formatDate(lireDate(p.traiteLe.slice(0, 10)), 'numerique')
  return `${verbe} le ${le}${p.traiteParNom ? ` par ${p.traiteParNom}` : ''}`
})
</script>

<template>
  <section
    class="cz-card apercu"
    :aria-label="`Paiement de ${nom}`"
  >
    <div class="apercu__tete">
      <CzAvatar :nom="nom" />
      <div class="apercu__qui">
        <NuxtLink
          :to="`/asso/souscripteurs/${paiement.souscripteurId}`"
          class="apercu__nom"
        >
          {{ nom }}
        </NuxtLink>
        <div class="apercu__projet">
          {{ paiement.projet.nom }}
        </div>
      </div>
      <CzBadge :ton="statut.ton">
        {{ statut.libelle }}
      </CzBadge>
    </div>

    <div class="apercu__montant">
      {{ formatFCFA(paiement.montant) }}
    </div>
    <div class="apercu__meta">
      Déclaré le {{ formatDate(paiement.declareLe, 'numerique') }} · {{ MOYENS_PAIEMENT[paiement.moyen] }}
    </div>

    <div class="apercu__corps">
      <VisionneusePreuve
        :preuve="paiement.preuve"
        compact
        class="apercu__preuve"
      />
      <div class="apercu__infos">
        <div
          v-if="paiement.statut === 'en_attente'"
          class="cz-alert cz-alert--info apercu__rappel"
        >
          <div>Vérifiez sur votre relevé un versement de <b>{{ formatFCFA(paiement.montant) }}</b> vers le {{ formatDate(dateVersement, 'numerique') }}.</div>
        </div>
        <div class="apercu__couvre">
          <span class="apercu__libelle">Couvre :</span> <b>{{ couvre }}</b>
        </div>
        <p
          v-if="paiement.statut === 'rejete' && paiement.motifRejet"
          class="apercu__couvre"
        >
          <span class="apercu__libelle">Motif :</span> {{ MOTIFS_REJET[paiement.motifRejet] }}
        </p>
        <NuxtLink
          :to="`/asso/paiements/${paiement.id}`"
          class="apercu__lien"
        >
          Ouvrir le détail complet →
        </NuxtLink>
      </div>
    </div>

    <div
      v-if="paiement.statut === 'en_attente'"
      class="apercu__actions"
    >
      <CzButton
        variante="danger-contour"
        @click="$emit('rejeter')"
      >
        Rejeter
      </CzButton>
      <CzButton
        variante="succes"
        icone="coche"
        :chargement="envoi"
        libelle-chargement="Validation…"
        @click="$emit('valider')"
      >
        Valider le paiement
      </CzButton>
    </div>
    <p
      v-else-if="traite"
      class="apercu__traite"
    >
      {{ traite }}
    </p>
  </section>
</template>

<style scoped>
.apercu {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-6);
}

.apercu__tete {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.apercu__qui {
  flex: 1;
  min-width: 0;
}

.apercu__nom {
  font-weight: 600;
  color: var(--text-strong);
  text-decoration: none;
}

.apercu__nom:hover {
  color: var(--brand-dark);
}

.apercu__projet {
  font-size: 13px;
  color: var(--text-muted);
}

.apercu__montant {
  font-family: var(--font-display);
  font-size: 32px;
  font-weight: 600;
  color: var(--text-strong);
  font-variant-numeric: tabular-nums;
}

.apercu__meta {
  font-size: 13.5px;
  color: var(--text-muted);
}

.apercu__corps {
  display: flex;
  align-items: flex-start;
  gap: var(--space-4);
}

.apercu__preuve {
  flex-shrink: 0;
}

.apercu__infos {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
}

.apercu__rappel {
  font-size: 13px;
}

.apercu__couvre {
  margin: 0;
  font-size: 13.5px;
}

.apercu__libelle {
  color: var(--text-muted);
}

.apercu__lien {
  align-self: flex-start;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--brand-dark);
  text-decoration: none;
}

.apercu__lien:hover {
  color: var(--ink-title);
}

.apercu__actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding-top: 14px;
  border-top: 1px solid var(--divider);
}

.apercu__traite {
  margin: 0;
  padding-top: 14px;
  border-top: 1px solid var(--divider);
  font-size: 13.5px;
  color: var(--text-muted);
}
</style>
