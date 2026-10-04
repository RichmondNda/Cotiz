<!--
  Répartition d'un paiement déclaré sur les échéances (détail d'un paiement, gestionnaire).
  Part de la répartition proposée par le souscripteur (SelecteurEcheances en lecture seule) ; « Ajuster » rend les
  lignes cochables, « Terminer l'ajustement » les fige. Lignes : échéances non soldées jusqu'à la dernière couverte,
  plus la suivante. Pied : « Total réparti x / montant », en danger quand il diffère du montant déclaré.
  Mobile : titre « Échéances couvertes », pas de badges, « Total affecté », alerte d'écart sous la carte.
  v-model:repartition → répartition à envoyer à la validation (null tant qu'elle n'a pas été ajustée).
-->
<script setup lang="ts">
import type { PaiementDetail, RepartitionEcheance } from '~~/types'
import type { EcheanceSelecteur } from '~/components/metier/SelecteurEcheances.vue'
import type { Repartition } from '~/utils/allocate'
import { maintenant } from '~/utils/date-reference'
import { libelleEcheance } from '~/utils/echeances'
import { formatFCFA } from '~/utils/format'
import { STATUTS_ECHEANCE, type LibelleStatut } from '~/utils/statuts'

const props = withDefaults(defineProps<{
  paiement: PaiementDetail
  /** Répartition modifiable (paiement en attente). */
  modifiable?: boolean
}>(), { modifiable: true })

const ajustement = defineModel<boolean>('ajustement', { default: false })
const repartitionAjustee = defineModel<RepartitionEcheance[] | null>('repartition', { default: null })

const aujourdhui = maintenant().toISOString().slice(0, 10)
const affecte = computed(() => new Map(props.paiement.repartition.map(r => [r.echeanceId, r.montantAffecte])))

function badge(e: PaiementDetail['echeancier'][number]): LibelleStatut {
  if (e.statut === 'payee') return STATUTS_ECHEANCE.payee
  if (!e.estFondsEntree && e.date > aujourdhui) return STATUTS_ECHEANCE.a_venir
  return STATUTS_ECHEANCE[e.statut]
}

const lignes = computed<EcheanceSelecteur[]>(() => {
  const p = props.paiement
  const source = p.echeancier.length ? p.echeancier : p.echeancesCouvertes
  const couvertes = affecte.value
  const dernier = Math.max(-1, ...source.filter(e => couvertes.has(e.id)).map(e => e.rang))
  const ouvertes = source.filter(e => couvertes.has(e.id) || e.statut !== 'payee')
  const suivante = ouvertes.find(e => e.rang > dernier && !couvertes.has(e.id))
  return ouvertes
    .filter(e => e.rang <= dernier || e === suivante)
    .map(e => ({
      id: e.id,
      label: libelleEcheance(e),
      montant: e.montant,
      // Paiement déjà validé : on retire sa part pour retrouver ce qui restait dû au moment de la déclaration.
      montantPaye: p.statut === 'valide' ? e.montantPaye - (couvertes.get(e.id) ?? 0) : e.montantPaye,
      enRetard: e.statut === 'en_retard',
      fermee: e.fermee,
      badge: badge(e),
    }))
})
const selectionInitiale = computed(() => props.paiement.repartition.map(r => r.echeanceId))

const resultat = ref<Repartition | null>(null)
// Avant tout ajustement : total de la répartition déclarée (identique au rendu serveur, sans attendre le sélecteur).
const total = computed(() => (ajustement.value || repartitionAjustee.value) && resultat.value
  ? resultat.value.lignes.reduce((t, l) => t + l.affecte, 0)
  : props.paiement.repartition.reduce((t, r) => t + r.montantAffecte, 0))
const ecart = computed(() => total.value !== props.paiement.montant)

watch(resultat, (r) => {
  if (!r || !ajustement.value) return
  repartitionAjustee.value = r.lignes.filter(l => l.affecte > 0).map(l => ({ echeanceId: l.id, montantAffecte: l.affecte }))
})
watch(() => props.paiement.id, () => {
  ajustement.value = false
  repartitionAjustee.value = null
})
</script>

<template>
  <section
    class="cz-card repartition"
    :class="{ 'is-verrouille': !ajustement }"
    aria-labelledby="titre-repartition"
  >
    <div class="repartition__tete">
      <h2
        id="titre-repartition"
        class="t"
      >
        <span class="cz-desktop">Répartition</span><span class="cz-mobile">Échéances couvertes</span>
      </h2>
      <CzButton
        v-if="modifiable"
        variante="fantome"
        taille="sm"
        :aria-pressed="ajustement"
        @click="ajustement = !ajustement"
      >
        <template v-if="ajustement">
          <span class="cz-desktop">Terminer l’ajustement</span><span class="cz-mobile">Terminer</span>
        </template>
        <template v-else>
          Ajuster
        </template>
      </CzButton>
    </div>
    <SelecteurEcheances
      v-model:repartition="resultat"
      class="repartition__selecteur"
      :montant="paiement.montant"
      :echeances="lignes"
      :selection-initiale="selectionInitiale"
      :lecture-seule="!ajustement"
      sans-entete
    >
      <template #pied>
        <span><span class="cz-desktop">Total réparti</span><span class="cz-mobile">Total affecté</span></span>
        <b
          :class="{ neg: ecart }"
          aria-live="polite"
        >{{ formatFCFA(total) }} / {{ formatFCFA(paiement.montant) }}</b>
      </template>
    </SelecteurEcheances>
  </section>
  <div
    v-if="ecart && modifiable"
    class="cz-alert cz-alert--warning cz-mobile"
    role="status"
  >
    <div>La répartition ne correspond pas au montant déclaré. L’écart restera en avoir.</div>
  </div>
</template>

<style scoped>
.repartition {
  padding: 22px;
}

.repartition__tete {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
}

.repartition__tete .t {
  margin: 0;
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 600;
  color: var(--text-strong);
}

.repartition__selecteur {
  padding: 0;
  box-shadow: none;
}

.repartition__selecteur :deep(.rows) {
  margin-top: 0;
}

.repartition__selecteur :deep(.ft b) {
  font-variant-numeric: tabular-nums;
}

@media (min-width: 768px) {
  /* Répartition figée : lignes en texte atténué, comme la maquette. */
  .is-verrouille .repartition__selecteur :deep(.row .lbl b),
  .is-verrouille .repartition__selecteur :deep(.row .amt) {
    color: var(--text-muted);
  }
}

@media (max-width: 767px) {
  .repartition {
    padding: var(--space-4);
  }

  .repartition__selecteur :deep(.row .cz-badge) {
    display: none;
  }
}
</style>
