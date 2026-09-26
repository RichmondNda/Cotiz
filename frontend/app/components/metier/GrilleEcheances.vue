<!--
  Grille d'échéances : une ligne par souscripteur, une case par échéance (22×22, r-xs).
  Payée success · déclarée warning · partielle demi success / demi cell-future · en retard danger · à venir cell-future.
  Survol / focus : infobulle « Août 2026 · 25 000 F · En retard depuis 51 jours ». Clic : événement `cellule`
  (la page ouvre le panneau latéral ; case orange = accès direct à la validation).
  Colonne souscripteur figée, défilement horizontal positionné sur le mois courant (surligné brand-pale).
  Tri par défaut : plus grand nombre de retards en haut. Option « Afficher les motifs » (✓ ! ◔ …).
  Mobile : une carte par souscripteur, cases qui passent à la ligne.
-->
<script setup lang="ts">
import type { StatutEcheance } from '~~/types'
import { formatFCFA, formatMois, joursDepuis } from '~/utils/format'
import { STATUTS_ECHEANCE } from '~/utils/statuts'

export interface CelluleGrille {
  id: string
  date: string
  montant: number
  statut: StatutEcheance
  estFondsEntree?: boolean
}

export interface ColonneGrille {
  id: string
  /** En-tête : « Entrée », « Mai », « Sept. »… */
  label: string
  /** Libellé court sous la case en mobile (« Entr. »). */
  labelCourt?: string
  courante?: boolean
}

export interface LigneGrille {
  id: string
  nom: string
  tonAvatar?: 'brand' | 'success' | 'danger' | 'warning'
  /** Badge sous le nom (« Signature attendue »). */
  badge?: { texte: string, ton: 'warning' | 'danger' | 'info' | 'success' | 'neutral' }
  /** Une entrée par colonne ; null = pas d'échéance (case vide). */
  cellules: (CelluleGrille | null)[]
  reste: number | string
  /** Reste en danger-fg gras. */
  resteEnRetard?: boolean
}

const props = withDefaults(defineProps<{
  colonnes: ColonneGrille[]
  lignes: LigneGrille[]
  /** Case sélectionnée (panneau ouvert). */
  selection?: string | null
  /** Trie les lignes par nombre de retards décroissant. */
  trierParRetards?: boolean
  legende?: boolean
  label?: string
}>(), { selection: null, trierParRetards: true, legende: true, label: 'Grille des échéances' })

const emit = defineEmits<{ cellule: [ligne: LigneGrille, cellule: CelluleGrille] }>()
const motifs = defineModel<boolean>('motifs', { default: false })

const CLASSES: Record<StatutEcheance, string> = {
  payee: 'cz-cell--ok',
  declaree: 'cz-cell--wait',
  partielle: 'cz-cell--part',
  en_retard: 'cz-cell--late',
  a_venir: 'cz-cell--fut',
}
const MOTIFS: Record<StatutEcheance, string> = { payee: '✓', declaree: '…', partielle: '◔', en_retard: '!', a_venir: '' }

const lignesTriees = computed(() => {
  if (!props.trierParRetards) return props.lignes
  const retards = (l: LigneGrille) => l.cellules.filter(c => c?.statut === 'en_retard').length
  return [...props.lignes].sort((a, b) => retards(b) - retards(a))
})

function infobulle(c: CelluleGrille): string {
  const periode = c.estFondsEntree ? 'Fonds d\'entrée' : formatMois(c.date)
  let etat = STATUTS_ECHEANCE[c.statut].libelle
  if (c.statut === 'en_retard') {
    const j = joursDepuis(c.date)
    etat = `En retard depuis ${j} jour${j > 1 ? 's' : ''}`
  }
  else if (c.statut === 'declaree') etat = 'Déclarée, à valider'
  return `${periode} · ${formatFCFA(c.montant)} · ${etat}`
}

const wrap = ref<HTMLElement | null>(null)
onMounted(() => {
  const el = wrap.value
  const cur = el?.querySelector<HTMLElement>('th.cur')
  const premiere = el?.querySelector<HTMLElement>('th')
  if (el && cur && premiere && el.scrollWidth > el.clientWidth) {
    el.scrollLeft = Math.max(0, cur.offsetLeft - premiere.offsetWidth - el.clientWidth / 3)
  }
})

const LEGENDE: { statut: StatutEcheance, texte: string }[] = [
  { statut: 'payee', texte: 'Payée' },
  { statut: 'declaree', texte: 'Déclarée, à valider' },
  { statut: 'partielle', texte: 'Partielle' },
  { statut: 'en_retard', texte: 'En retard' },
  { statut: 'a_venir', texte: 'À venir' },
]
</script>

<template>
  <div class="grille">
    <!-- Desktop / tablette -->
    <div
      ref="wrap"
      class="cz-grid-wrap grille__tableau"
    >
      <table
        class="cz-grid"
        :aria-label="label"
      >
        <thead>
          <tr>
            <th scope="col">
              Souscripteur
            </th>
            <th
              v-for="col in colonnes"
              :key="col.id"
              scope="col"
              :class="{ cur: col.courante }"
            >
              {{ col.label }}
            </th>
            <th
              scope="col"
              class="rest"
            >
              Reste
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="l in lignesTriees"
            :key="l.id"
          >
            <td>
              <div class="cz-person">
                <CzAvatar
                  :nom="l.nom"
                  :ton="l.tonAvatar"
                  taille="sm"
                />
                <div v-if="l.badge">
                  <b>{{ l.nom }}</b>
                  <div class="sub">
                    <CzBadge
                      :ton="l.badge.ton"
                      petit
                    >
                      {{ l.badge.texte }}
                    </CzBadge>
                  </div>
                </div>
                <b v-else>{{ l.nom }}</b>
              </div>
            </td>
            <td
              v-for="(c, i) in l.cellules"
              :key="colonnes[i]?.id ?? i"
              :class="{ cur: colonnes[i]?.courante }"
            >
              <CzTooltip
                v-if="c"
                :texte="infobulle(c)"
              >
                <button
                  type="button"
                  class="cz-cell"
                  :class="[CLASSES[c.statut], { 'is-selected': selection === c.id }]"
                  :aria-label="`${l.nom} — ${infobulle(c)}`"
                  :aria-pressed="selection === c.id"
                  @click="emit('cellule', l, c)"
                >
                  <span
                    v-if="motifs"
                    aria-hidden="true"
                  >{{ MOTIFS[c.statut] }}</span>
                </button>
              </CzTooltip>
            </td>
            <td
              class="rest"
              :class="{ late: l.resteEnRetard }"
            >
              {{ formatFCFA(l.reste) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Mobile : une carte par souscripteur -->
    <div class="grille__cartes">
      <div
        v-for="l in lignesTriees"
        :key="l.id"
        class="cz-gridcard"
      >
        <div class="hd">
          <div class="cz-person">
            <CzAvatar
              :nom="l.nom"
              :ton="l.tonAvatar"
              taille="sm"
            />
            <b>{{ l.nom }}</b>
          </div>
          <b
            class="grille__reste-carte"
            :class="{ late: l.resteEnRetard }"
          >{{ formatFCFA(l.reste) }}</b>
        </div>
        <div class="cells">
          <template
            v-for="(c, i) in l.cellules"
            :key="colonnes[i]?.id ?? i"
          >
            <div v-if="c">
              <button
                type="button"
                class="cz-cell"
                :class="[CLASSES[c.statut], { 'is-selected': selection === c.id }]"
                :aria-label="`${l.nom} — ${infobulle(c)}`"
                @click="emit('cellule', l, c)"
              >
                <span
                  v-if="motifs"
                  aria-hidden="true"
                >{{ MOTIFS[c.statut] }}</span>
              </button>
              <b
                v-if="colonnes[i]?.courante"
                class="grille__mois-courant"
              >{{ colonnes[i]?.label }}</b>
              <template v-else>
                {{ colonnes[i]?.labelCourt ?? colonnes[i]?.label }}
              </template>
            </div>
          </template>
        </div>
      </div>
    </div>

    <div
      v-if="legende"
      class="grille__pied"
    >
      <div
        class="cz-grid-legend"
        aria-label="Légende"
      >
        <span
          v-for="e in LEGENDE"
          :key="e.statut"
        ><span
          class="cz-cell cz-cell--sm"
          :class="CLASSES[e.statut]"
        />{{ e.texte }}<template v-if="motifs && MOTIFS[e.statut]"> ({{ MOTIFS[e.statut] }})</template></span>
      </div>
      <CzToggle
        v-model="motifs"
        class="grille__motifs"
      >
        Afficher les motifs
      </CzToggle>
    </div>
  </div>
</template>

<style scoped>
.grille {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-width: 0;
}

.cz-cell {
  padding: 0;
  border: 0;
  font-family: var(--font-text);
}

.cz-cell:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--surface), 0 0 0 4px var(--text-strong);
}

.grille__cartes {
  display: none;
  flex-direction: column;
  gap: var(--space-2);
}

.grille__reste-carte {
  font-size: 13px;
}

.grille__reste-carte.late {
  color: var(--danger-fg);
}

.grille__mois-courant {
  color: var(--brand-dark);
}

.grille__pied {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  justify-content: space-between;
  align-items: center;
}

.grille__motifs {
  font-size: 13px;
}

@media (max-width: 767px) {
  .grille__tableau {
    display: none;
  }

  .grille__cartes {
    display: flex;
  }
}
</style>
