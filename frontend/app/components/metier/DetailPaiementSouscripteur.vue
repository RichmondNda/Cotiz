<!--
  Détail d'un paiement du souscripteur (MbHistorique, clic sur une ligne : feuille « Détail du paiement » de la maquette
  source) : montant et statut, projet, association, échéances couvertes, date du versement, moyen, puis la preuve
  envoyée. Modale sur desktop, feuille basse sur mobile (CzModal).
  Preuve fichier : lue à la demande (« Voir la preuve », fl.get, lot 3.4), affichée par VisionneusePreuve, URL locale
  libérée à la fermeture ; référence seule : affichée directement.
-->
<script setup lang="ts">
import type { PaiementListe, Preuve } from '~~/types'
import { formatDate, formatFCFA } from '~/utils/format'
import { MOYENS_PAIEMENT } from '~/utils/statuts'

const props = defineProps<{
  paiement: PaiementListe
  association: string
  /** Échéances couvertes, en clair (« entrée + juillet »). */
  couverture: string
}>()

const ouvert = defineModel<boolean>('ouvert', { default: false })
const lire = useLectureFichier()
const toast = useToast()

const url = ref<string | null>(null)
const chargement = ref(false)

const preuveAffichee = computed<Preuve | null>(() => {
  const p = props.paiement.preuve
  if (p.type === 'reference') return p
  return url.value ? { ...p, url: url.value } : null
})

function liberer() {
  if (url.value) URL.revokeObjectURL(url.value)
  url.value = null
}

async function voirPreuve() {
  const p = props.paiement.preuve
  if (p.type === 'reference' || !p.fichierId || chargement.value) return
  chargement.value = true
  const id = props.paiement.id
  try {
    const lue = await lire(p.fichierId)
    // Feuille fermée ou autre paiement entre-temps : l'URL n'est plus affichée, elle est libérée tout de suite.
    if (!ouvert.value || props.paiement.id !== id) URL.revokeObjectURL(lue)
    else url.value = lue
  }
  catch (e) {
    toast.erreur('La preuve n’a pas pu être ouverte', { message: messageRefus(e) ?? 'Vérifiez votre connexion, puis réessayez.' })
  }
  finally {
    chargement.value = false
  }
}

watch(ouvert, (o) => {
  if (!o) liberer()
})
watch(() => props.paiement.id, liberer)
onBeforeUnmount(liberer)
</script>

<template>
  <CzModal
    v-model:ouvert="ouvert"
    titre="Détail du paiement"
  >
    <div class="detail">
      <div class="detail__tete">
        <div class="detail__montant">
          {{ formatFCFA(paiement.montantRecu ?? paiement.montant) }}
        </div>
        <span
          v-if="paiement.statut === 'valide' && paiement.traiteLe"
          class="cz-badge cz-badge--success"
        >Validé le {{ formatDate(paiement.traiteLe, 'numerique') }}</span>
        <BadgeStatut
          v-else
          type="paiement"
          :statut="paiement.statut"
        />
      </div>
      <dl class="detail__lignes">
        <div>
          <dt>Projet</dt><dd>
            {{ paiement.projet.nom }}<template v-if="paiement.inscriptionRetiree">
              · inscription retirée
            </template>
          </dd>
        </div>
        <div><dt>Association</dt><dd>{{ association }}</dd></div>
        <div v-if="couverture">
          <dt>Échéances couvertes</dt><dd>{{ couverture }}</dd>
        </div>
        <div v-if="paiement.dateVirement">
          <dt>Date du versement</dt><dd>{{ formatDate(paiement.dateVirement, 'numerique') }}</dd>
        </div>
        <div><dt>Moyen</dt><dd>{{ MOYENS_PAIEMENT[paiement.moyen] }}</dd></div>
      </dl>
      <VisionneusePreuve
        v-if="preuveAffichee"
        :preuve="preuveAffichee"
      />
      <CzButton
        v-else
        variante="secondaire"
        bloc
        :chargement="chargement"
        @click="voirPreuve"
      >
        Voir la preuve
      </CzButton>
    </div>
  </CzModal>
</template>

<style scoped>
.detail {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.detail__tete {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) 0 var(--space-3);
  border-bottom: 1px solid var(--divider-row);
}

.detail__montant {
  font-family: var(--font-display);
  font-size: 30px;
  font-weight: 600;
  color: var(--text-strong);
}

.detail__lignes {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin: 0;
  font-size: 14px;
}

.detail__lignes div {
  display: flex;
  justify-content: space-between;
  gap: var(--space-3);
}

.detail__lignes dt {
  color: var(--text-muted);
}

.detail__lignes dd {
  margin: 0;
  font-weight: 600;
  color: var(--text-strong);
  text-align: right;
}
</style>
