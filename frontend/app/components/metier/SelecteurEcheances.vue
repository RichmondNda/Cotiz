<!--
  Sélecteur d'échéances couvertes par un paiement déclaré.
  - Pré-sélection à la saisie du montant : de la plus ancienne non payée à la plus récente (allocate).
  - Montant insuffisant : la dernière couverte passe en « partielle » avec le montant affecté.
  - Ajustement manuel : cocher / décocher ; « Reste à répartir » en direct, danger si négatif.
  - Ordre : retards en premier (fond danger-bg), puis échéance courante, puis futures (non cochées à 55 %).
  `lectureSeule` : même composant dans le détail d'un paiement déclaré (gestionnaire).
  v-model:repartition expose le résultat ; `valide` = reste nul et montant saisi.
  Slots `entete` et `pied` (reçoivent { repartition, montant }) pour les variantes d'écran.
-->
<script setup lang="ts">
import { allocate, repartitionManuelle, type EcheanceARepartir, type Repartition } from '~/utils/allocate'
import { formatFCFA } from '~/utils/format'

export interface EcheanceSelecteur extends EcheanceARepartir {
  label: string
  enRetard?: boolean
}

const props = withDefaults(defineProps<{
  /** Montant déclaré ; null = à saisir. */
  montant: number | null
  /** Échéances non soldées, de la plus ancienne à la plus récente. */
  echeances: EcheanceSelecteur[]
  lectureSeule?: boolean
}>(), { lectureSeule: false })

const repartition = defineModel<Repartition | null>('repartition', { default: null })
const cochees = ref<Set<string>>(new Set())
const manuel = ref(false)

// Nouvelle saisie du montant : on repart de la pré-sélection automatique.
watch(() => [props.montant, props.echeances] as const, ([m]) => {
  manuel.value = false
  cochees.value = new Set(m ? allocate(m, props.echeances).lignes.filter(l => l.affecte > 0).map(l => l.id) : [])
}, { immediate: true, deep: true })

const resultat = computed<Repartition | null>(() => {
  if (!props.montant) return null
  return manuel.value
    ? repartitionManuelle(props.montant, props.echeances, cochees.value)
    : allocate(props.montant, props.echeances)
})
watch(resultat, r => (repartition.value = r), { immediate: true })

function basculer(id: string) {
  if (props.lectureSeule || !props.montant) return
  const s = new Set(cochees.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  cochees.value = s
  manuel.value = true
}

const aPartielle = computed(() => resultat.value?.lignes.some(l => l.etat === 'partial') ?? false)
const entete = computed(() => {
  const r = resultat.value
  if (!r) return { texte: 'À saisir', ton: 'neutral' as const }
  if (r.reste < 0) return { texte: 'Dépasse le montant', ton: 'danger' as const }
  if (r.reste > 0) return { texte: 'Montant non réparti', ton: 'warning' as const }
  if (aPartielle.value) return { texte: 'Dernière partielle', ton: 'warning' as const }
  return { texte: 'Réparti entièrement', ton: 'success' as const }
})
const resume = computed(() => {
  const r = resultat.value
  if (!r) return 'Aucune échéance couverte'
  const pleines = r.lignes.filter(l => l.etat === 'full').length
  if (manuel.value) return `${cochees.value.size} échéance${cochees.value.size > 1 ? 's' : ''} cochée${cochees.value.size > 1 ? 's' : ''}`
  if (aPartielle.value) return `${pleines} couverte${pleines > 1 ? 's' : ''} + 1 partielle`
  return `${pleines} échéance${pleines > 1 ? 's' : ''} couverte${pleines > 1 ? 's' : ''}`
})

function ligne(e: EcheanceSelecteur) {
  return resultat.value?.lignes.find(l => l.id === e.id)
}
function estCochee(e: EcheanceSelecteur) {
  return props.montant ? cochees.value.has(e.id) : false
}
function classeLigne(e: EcheanceSelecteur) {
  const l = ligne(e)
  if (!props.montant) return e.enRetard ? 'is-late is-attente' : 'is-off'
  if (!estCochee(e)) return 'is-off'
  if (l?.etat === 'partial') return 'is-partial'
  return e.enRetard ? 'is-late' : ''
}
</script>

<template>
  <div class="cz-alloc">
    <div class="hd">
      <slot
        name="entete"
        :repartition="resultat"
        :montant="montant"
      >
        <b>Montant déclaré : {{ montant ? formatFCFA(montant) : '—' }}</b>
        <CzBadge
          :ton="entete.ton"
          petit
        >
          {{ entete.texte }}
        </CzBadge>
      </slot>
    </div>
    <div
      class="rows"
      role="group"
      aria-label="Échéances couvertes"
    >
      <div
        v-for="e in echeances"
        :key="e.id"
        class="row"
        :class="classeLigne(e)"
        :role="lectureSeule ? undefined : 'checkbox'"
        :aria-checked="lectureSeule ? undefined : estCochee(e)"
        :aria-disabled="!montant || undefined"
        :tabindex="lectureSeule || !montant ? undefined : 0"
        @click="basculer(e.id)"
        @keydown.space.prevent="basculer(e.id)"
        @keydown.enter.prevent="basculer(e.id)"
      >
        <span
          class="cz-cb"
          :class="{ 'is-on': estCochee(e) }"
          aria-hidden="true"
        ><CzIcon
          v-if="estCochee(e)"
          nom="coche"
        /></span>
        <div class="lbl">
          <b>{{ e.label }}</b>
          <template v-if="montant && estCochee(e)">
            <CzBadge
              v-if="ligne(e)?.etat === 'partial'"
              ton="warning"
              petit
            >
              Partielle
            </CzBadge>
            <CzBadge
              v-else-if="e.enRetard"
              ton="danger"
              petit
            >
              En retard
            </CzBadge>
            <CzBadge
              v-else
              ton="info"
              petit
            >
              À venir
            </CzBadge>
          </template>
          <CzBadge
            v-else-if="!montant && e.enRetard"
            ton="danger"
            petit
          >
            En retard
          </CzBadge>
        </div>
        <span class="amt">
          <template v-if="ligne(e)?.etat === 'partial'">
            {{ formatFCFA(ligne(e)!.affecte) }}<small>sur {{ formatFCFA(e.montant) }}</small>
          </template>
          <template v-else>{{ formatFCFA(e.montant) }}</template>
        </span>
      </div>
    </div>
    <div class="ft">
      <slot
        name="pied"
        :repartition="resultat"
        :montant="montant"
      >
        <span>{{ resume }}</span>
        <b
          v-if="!resultat"
          class="pos"
        >Saisissez le montant versé</b>
        <b
          v-else
          :class="{ neg: resultat.reste < 0 }"
          aria-live="polite"
        >Reste à répartir : {{ formatFCFA(resultat.reste) }}</b>
      </slot>
    </div>
  </div>
</template>

<style scoped>
.row[role="checkbox"]:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.row.is-attente {
  opacity: .8;
  cursor: default;
}

.row[aria-disabled="true"] {
  cursor: default;
}
</style>
