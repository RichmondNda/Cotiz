<!--
  Détail d'une case de la grille (ou d'un paiement « À valider ») : panneau latéral en desktop, feuille basse en mobile.
  - Déclarée / partielle avec paiement en attente : preuve, lien vers le détail, « Rejeter » et « Valider le paiement ».
  - En retard : « Aucun paiement rattaché… En retard depuis N jours », « Envoyer une relance ».
  - Autres : « Fermer ». Après validation : bandeau succès.
-->
<script setup lang="ts">
import type { Echeance, PaiementListe } from '~~/types'
import { useBreakpoint } from '~/composables/useBreakpoint'
import { formatDate, formatFCFA, formatMois, joursDepuis } from '~/utils/format'
import { libelleStatut } from '~/utils/statuts'

const props = withDefaults(defineProps<{
  nom: string
  projet: string
  /** Échéance cliquée dans la grille (absente quand on examine un paiement de la section « À valider »). */
  echeance?: Pick<Echeance, 'date' | 'montant' | 'montantPaye' | 'statut' | 'estFondsEntree'> | null
  /** Paiement en attente rattaché (case déclarée / partielle, ou section « À valider »). */
  paiement?: PaiementListe | null
  couverture?: string
  valide?: boolean
  validation?: boolean
  relance?: boolean
}>(), { echeance: null, paiement: null, couverture: undefined, valide: false, validation: false, relance: false })

const emit = defineEmits<{ valider: [], relancer: [] }>()
const ouvert = defineModel<boolean>('ouvert', { default: false })
const { estMobile } = useBreakpoint()

const periode = computed(() => {
  const e = props.echeance
  if (!e) return null
  return e.estFondsEntree ? 'Fonds d’entrée' : formatMois(e.date)
})
const titre = computed(() => (periode.value ? `Échéance · ${periode.value}` : 'Paiement déclaré'))
const statut = computed(() => {
  if (props.valide) return { libelle: 'Validé', ton: 'success' as const }
  if (props.echeance) return libelleStatut('echeance', props.echeance.statut)
  return { libelle: 'En attente', ton: 'warning' as const }
})
const enRetard = computed(() => props.echeance?.statut === 'en_retard')
const validable = computed(() => Boolean(props.paiement) && !props.valide)
const jours = computed(() => (props.echeance ? joursDepuis(props.echeance.date) : 0))
const detail = computed(() => {
  const e = props.echeance
  const p = props.paiement
  const quand = e && !e.estFondsEntree ? `Échéance de ${formatMois(e.date).toLowerCase()}` : e ? 'Fonds d’entrée' : null
  if (p && !props.valide) {
    const declaration = `paiement de ${formatFCFA(p.montant)} déclaré le ${formatDate(p.declareLe, 'numerique')}`
    return quand ? `${quand} · ${declaration}` : `Déclaré le ${formatDate(p.declareLe, 'numerique')} · ${p.moyen === 'virement' ? 'virement' : 'mobile money'} · couvre ${props.couverture?.toLowerCase() ?? ''}`
  }
  return e && !e.estFondsEntree ? `${quand} · le ${new Date(e.date).getDate()}` : quand ?? ''
})
const montant = computed(() => (props.echeance ? props.echeance.montant : props.paiement?.montant ?? 0))
</script>

<template>
  <!-- Desktop : panneau latéral -->
  <CzPanel
    v-if="!estMobile"
    v-model:ouvert="ouvert"
    :titre="titre"
  >
    <div class="cz-person panneau__qui">
      <CzAvatar :nom="nom" />
      <div>
        <b>{{ nom }}</b>
        <div class="sub">
          {{ projet }}
        </div>
      </div>
      <CzBadge
        :ton="statut.ton"
        class="panneau__badge"
      >
        {{ statut.libelle }}
      </CzBadge>
    </div>
    <div class="panneau__montant">
      {{ formatFCFA(montant) }}
    </div>
    <p class="panneau__detail">
      {{ detail }}
    </p>
    <div
      v-if="paiement && !valide"
      class="panneau__preuve"
    >
      <div
        class="cz-proof"
        :class="{ 'cz-proof--pdf': paiement.preuve.type === 'pdf' }"
      >
        <span class="glyph"><CzIcon :nom="paiement.preuve.type === 'reference' ? 'copier' : paiement.preuve.type === 'pdf' ? 'contrat' : 'image'" /></span>
        {{ paiement.preuve.type === 'reference' ? paiement.preuve.reference : paiement.preuve.nomFichier }}
      </div>
      <NuxtLink
        :to="`/asso/paiements/${paiement.id}`"
        class="panneau__lien"
      >
        Ouvrir le détail complet →
      </NuxtLink>
    </div>
    <CzAlert
      v-if="enRetard"
      ton="danger"
      sans-icone
    >
      Aucun paiement rattaché à cette échéance. <b>En retard depuis {{ jours }} jour{{ jours > 1 ? 's' : '' }}.</b>
    </CzAlert>
    <CzAlert
      v-if="valide"
      ton="success"
      sans-icone
    >
      <b>Paiement validé.</b> Les cases sont passées au vert dans la grille.
    </CzAlert>
    <template #pied>
      <template v-if="validable">
        <CzButton
          variante="danger-contour"
          taille="sm"
          :to="{ path: `/asso/paiements/${paiement!.id}`, query: { rejet: '1' } }"
        >
          Rejeter
        </CzButton>
        <CzButton
          variante="succes"
          taille="sm"
          icone="valide"
          :chargement="validation"
          libelle-chargement="Validation…"
          @click="emit('valider')"
        >
          Valider le paiement
        </CzButton>
      </template>
      <CzButton
        v-else-if="enRetard"
        variante="secondaire"
        taille="sm"
        :disabled="relance"
        @click="emit('relancer')"
      >
        {{ relance ? 'Relance envoyée ✓' : 'Envoyer une relance' }}
      </CzButton>
      <CzButton
        v-else
        variante="secondaire"
        taille="sm"
        @click="ouvert = false"
      >
        Fermer
      </CzButton>
    </template>
  </CzPanel>

  <!-- Mobile : feuille basse -->
  <CzSheet
    v-else
    v-model:ouvert="ouvert"
  >
    <div class="feuille__entete">
      <div>
        <div class="feuille__nom">
          {{ nom }}
        </div>
        <h2 class="feuille__titre">
          {{ periode ?? 'Paiement déclaré' }}
        </h2>
      </div>
      <CzBadge
        :ton="statut.ton"
        petit
      >
        {{ statut.libelle }}
      </CzBadge>
    </div>
    <dl class="feuille__lignes">
      <div>
        <dt>Montant attendu</dt><dd>{{ formatFCFA(montant) }}</dd>
      </div>
      <div v-if="echeance">
        <dt>Payé</dt><dd>{{ formatFCFA(echeance.montantPaye) }}</dd>
      </div>
      <div v-if="paiement && !valide">
        <dt>Déclaré</dt><dd>{{ formatFCFA(paiement.montant) }} · {{ formatDate(paiement.declareLe, 'jour-mois') }}</dd>
      </div>
      <div v-if="echeance && !echeance.estFondsEntree">
        <dt>Échéance</dt><dd>{{ formatDate(echeance.date, 'long') }}</dd>
      </div>
    </dl>
    <CzAlert
      v-if="valide"
      ton="success"
      sans-icone
    >
      <b>Paiement validé.</b>
    </CzAlert>
    <!-- Pied de feuille : empilé à l'envers (action principale en haut, dernière dans le DOM). -->
    <template #pied>
      <CzButton
        variante="fantome"
        bloc
        @click="ouvert = false"
      >
        Fermer
      </CzButton>
      <CzButton
        v-if="validable"
        variante="succes"
        bloc
        :chargement="validation"
        libelle-chargement="Validation…"
        @click="emit('valider')"
      >
        Valider le paiement
      </CzButton>
      <CzButton
        v-else-if="enRetard"
        bloc
        :disabled="relance"
        @click="emit('relancer')"
      >
        {{ relance ? 'Relance envoyée ✓' : 'Relancer' }}
      </CzButton>
    </template>
  </CzSheet>
</template>

<style scoped>
.panneau__qui {
  align-items: center;
}

.panneau__badge {
  margin-left: auto;
}

.panneau__montant {
  font-family: var(--font-display);
  font-size: 32px;
  font-weight: 600;
  color: var(--text-strong);
}

.panneau__detail {
  margin: 0;
  font-size: 13.5px;
  color: var(--text-muted);
}

.panneau__preuve {
  display: flex;
  align-items: flex-end;
  gap: 14px;
}

.panneau__lien {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--brand-dark);
  text-decoration: none;
}

.feuille__entete {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
}

.feuille__nom {
  font-size: 12.5px;
  color: var(--text-muted);
}

.feuille__titre {
  margin: 2px 0 0;
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 600;
  color: var(--text-strong);
}

.feuille__lignes {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin: var(--space-2) 0 0;
}

.feuille__lignes > div {
  display: flex;
  justify-content: space-between;
  gap: var(--space-3);
  font-size: 14px;
}

.feuille__lignes dt {
  color: var(--text-muted);
}

.feuille__lignes dd {
  margin: 0;
  font-weight: 700;
  color: var(--text-strong);
}
</style>
