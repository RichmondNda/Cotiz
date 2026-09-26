<!--
  Tableau de données : en-tête overline, colonnes triables, montants alignés à droite (`num`),
  sélection multiple avec barre d'actions groupées (`cz-bulk`), pied avec pagination,
  états vide / chargement (squelettes) / erreur (« Réessayer ») dans le cadre du tableau.
  Mobile (< 768 px) : si le slot `carte` est fourni, la liste devient des cartes `cz-rowcard`.

  Slots : `cell-<cle>` (cellule, reçoit { ligne, valeur }), `actions` (colonne ⋯), `actions-groupees`,
  `vide`, `carte` ({ ligne }), `pied`.
-->
<script setup lang="ts" generic="T extends Record<string, unknown>">
export interface ColonneTable {
  cle: string
  label: string
  /** Montant / nombre : aligné à droite, chiffres tabulaires. */
  num?: boolean
  triable?: boolean
  largeur?: string
  classe?: string
  /** Squelette de chargement de la cellule. */
  squelette?: 'texte' | 'personne' | 'badge' | 'montant'
}

export interface TriTable {
  cle: string
  sens: 'asc' | 'desc'
}

const props = withDefaults(defineProps<{
  colonnes: ColonneTable[]
  lignes: T[]
  /** Clé d'identifiant d'une ligne. */
  cleLigne?: string
  selectionnable?: boolean
  /** Lignes cliquables (émettent `ligne`). */
  cliquable?: boolean
  chargement?: boolean
  lignesSquelette?: number
  /** Message d'erreur : affiche l'état d'erreur. */
  erreur?: string
  /** Le tri est fait par le parent (ex. côté serveur) : on émet seulement. */
  triExterne?: boolean
  /** Pagination : total de lignes, taille de page. */
  total?: number
  parPage?: number
  label?: string
}>(), {
  cleLigne: 'id',
  selectionnable: false,
  cliquable: true,
  chargement: false,
  lignesSquelette: 3,
  erreur: undefined,
  triExterne: false,
  total: undefined,
  parPage: 20,
  label: undefined,
})

const emit = defineEmits<{ ligne: [T], reessayer: [] }>()

const selection = defineModel<string[]>('selection', { default: () => [] })
const tri = defineModel<TriTable | null>('tri', { default: null })
const page = defineModel<number>('page', { default: 1 })

const idLigne = (l: T) => String(l[props.cleLigne])

const lignesTriees = computed(() => {
  if (!tri.value || props.triExterne) return props.lignes
  const { cle, sens } = tri.value
  const facteur = sens === 'asc' ? 1 : -1
  return [...props.lignes].sort((a, b) => {
    const va = a[cle]
    const vb = b[cle]
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * facteur
    return String(va ?? '').localeCompare(String(vb ?? ''), 'fr') * facteur
  })
})

function trier(c: ColonneTable) {
  if (!c.triable) return
  tri.value = tri.value?.cle === c.cle
    ? { cle: c.cle, sens: tri.value.sens === 'asc' ? 'desc' : 'asc' }
    : { cle: c.cle, sens: 'asc' }
}

const toutSelectionne = computed(() => props.lignes.length > 0 && props.lignes.every(l => selection.value.includes(idLigne(l))))
const partiel = computed(() => selection.value.length > 0 && !toutSelectionne.value)

function basculerTout(v: boolean) {
  selection.value = v ? props.lignes.map(idLigne) : []
}
function basculer(l: T, v: boolean) {
  const id = idLigne(l)
  selection.value = v ? [...selection.value, id] : selection.value.filter(x => x !== id)
}

const pages = computed(() => (props.total ? Math.max(1, Math.ceil(props.total / props.parPage)) : 1))
const plage = computed(() => {
  if (!props.total) return ''
  const debut = (page.value - 1) * props.parPage + 1
  const fin = Math.min(props.total, page.value * props.parPage)
  return `${debut}–${fin} sur ${props.total}`
})

const etat = computed(() => (props.erreur ? 'erreur' : props.chargement ? 'chargement' : props.lignes.length === 0 ? 'vide' : 'donnees'))
</script>

<template>
  <div class="cz-table-bloc">
    <div
      v-if="selectionnable && selection.length > 0"
      class="cz-bulk"
      role="region"
      aria-label="Actions groupées"
    >
      <CzCheckbox
        :model-value="true"
        label="Tout désélectionner"
        @update:model-value="basculerTout(false)"
      />
      {{ selection.length }} sélectionné{{ selection.length > 1 ? 's' : '' }}
      <div class="end">
        <slot name="actions-groupees" />
      </div>
    </div>

    <div
      class="cz-table-wrap"
      :class="{ 'a-cartes': $slots.carte && etat === 'donnees' }"
    >
      <table
        class="cz-table"
        :aria-label="label"
        :aria-busy="chargement || undefined"
      >
        <thead>
          <tr>
            <th
              v-if="selectionnable"
              class="cz-table__case"
            >
              <CzCheckbox
                :model-value="toutSelectionne"
                :indetermine="partiel"
                label="Tout sélectionner"
                :disabled="etat !== 'donnees'"
                @update:model-value="basculerTout"
              />
            </th>
            <th
              v-for="c in colonnes"
              :key="c.cle"
              :class="[c.classe, { 'num': c.num, 'is-sortable': c.triable, 'is-sorted': tri?.cle === c.cle }]"
              :style="c.largeur ? { width: c.largeur } : undefined"
              :aria-sort="tri?.cle === c.cle ? (tri.sens === 'asc' ? 'ascending' : 'descending') : undefined"
            >
              <button
                v-if="c.triable"
                type="button"
                class="cz-table__tri"
                @click="trier(c)"
              >
                {{ c.label }}
                <span
                  class="sort"
                  :class="{ 'is-desc': tri?.cle === c.cle && tri.sens === 'desc' }"
                ><CzIcon nom="tri" /></span>
              </button>
              <template v-else>
                {{ c.label }}
              </template>
            </th>
          </tr>
        </thead>
        <tbody v-if="etat === 'chargement'">
          <tr
            v-for="n in lignesSquelette"
            :key="n"
            class="cz-table__squelette"
          >
            <td v-if="selectionnable">
              <CzSkeleton
                :largeur="20"
                :hauteur="20"
              />
            </td>
            <td
              v-for="c in colonnes"
              :key="c.cle"
            >
              <div
                v-if="c.squelette === 'personne'"
                class="cz-person"
              >
                <CzSkeleton
                  :largeur="30"
                  :hauteur="30"
                  forme="rond"
                />
                <CzSkeleton
                  :largeur="90 + (n % 3) * 15"
                  :hauteur="12"
                />
              </div>
              <CzSkeleton
                v-else-if="c.squelette === 'badge'"
                :largeur="60 + (n % 3) * 10"
                :hauteur="20"
                forme="pilule"
              />
              <CzSkeleton
                v-else
                :largeur="c.num ? 70 : 80 + (n % 3) * 15"
                :hauteur="12"
                :droite="c.num"
              />
            </td>
          </tr>
        </tbody>
        <tbody v-else-if="etat === 'donnees'">
          <tr
            v-for="l in lignesTriees"
            :key="idLigne(l)"
            :class="{ 'is-selected': selection.includes(idLigne(l)) }"
            :tabindex="cliquable ? 0 : undefined"
            @click="cliquable && emit('ligne', l)"
            @keydown.enter="cliquable && emit('ligne', l)"
          >
            <td
              v-if="selectionnable"
              @click.stop
            >
              <CzCheckbox
                :model-value="selection.includes(idLigne(l))"
                label="Sélectionner la ligne"
                @update:model-value="basculer(l, $event)"
              />
            </td>
            <td
              v-for="c in colonnes"
              :key="c.cle"
              :class="[c.classe, { num: c.num }]"
            >
              <slot
                :name="`cell-${c.cle}`"
                :ligne="l"
                :valeur="l[c.cle]"
              >
                {{ l[c.cle] }}
              </slot>
            </td>
          </tr>
        </tbody>
        <tfoot v-if="$slots.pied && etat === 'donnees'">
          <slot name="pied" />
        </tfoot>
      </table>

      <CzEmpty
        v-if="etat === 'erreur'"
        icone="alerte"
        ton="danger"
        titre="Chargement impossible"
        :description="erreur"
        integre
      >
        <template #action>
          <CzButton
            variante="secondaire"
            taille="sm"
            @click="emit('reessayer')"
          >
            Réessayer
          </CzButton>
        </template>
      </CzEmpty>
      <slot
        v-else-if="etat === 'vide'"
        name="vide"
      >
        <CzEmpty
          icone="recherche"
          ton="neutral"
          titre="Aucun résultat"
          integre
        />
      </slot>
    </div>

    <!-- Mobile : liste de cartes -->
    <div
      v-if="$slots.carte && etat === 'donnees'"
      class="cz-table-cartes"
    >
      <div
        v-for="l in lignesTriees"
        :key="idLigne(l)"
        class="cz-rowcard"
        :class="{ 'is-clickable': cliquable }"
        :role="cliquable ? 'button' : undefined"
        :tabindex="cliquable ? 0 : undefined"
        @click="cliquable && emit('ligne', l)"
        @keydown.enter="cliquable && emit('ligne', l)"
      >
        <slot
          name="carte"
          :ligne="l"
        />
      </div>
    </div>

    <div
      v-if="total && etat === 'donnees'"
      class="cz-tfoot"
    >
      <span>{{ plage }}</span>
      <CzPagination
        v-if="pages > 1"
        v-model:page="page"
        :pages="pages"
      />
    </div>
  </div>
</template>

<style scoped>
.cz-table-bloc {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-width: 0;
}

.cz-table-wrap {
  overflow-x: auto;
}

.cz-table__case {
  width: 44px;
}

.cz-table__tri {
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  letter-spacing: inherit;
  text-transform: inherit;
  color: inherit;
  cursor: pointer;
}

.cz-table__tri:focus-visible {
  outline: none;
  border-radius: var(--r-xs);
  box-shadow: var(--focus-ring);
}

.cz-table th.is-sortable:has(.cz-table__tri:hover) .sort,
.cz-table th.is-sortable:has(.cz-table__tri:focus-visible) .sort {
  opacity: .5;
}

.cz-table th.is-sorted .sort {
  opacity: 1;
}

.sort.is-desc {
  transform: rotate(180deg);
}

.cz-table tbody tr:focus-visible {
  outline: none;
  box-shadow: inset 3px 0 0 var(--brand);
  background: var(--surface-subtle);
}

.cz-table__squelette {
  cursor: default;
}

.cz-table-cartes {
  display: none;
  flex-direction: column;
  gap: var(--space-2);
}

.cz-rowcard.is-clickable {
  cursor: pointer;
}

.cz-rowcard:focus-visible {
  outline: none;
  box-shadow: var(--shadow), 0 0 0 3px var(--brand);
}

@media (max-width: 767px) {
  .cz-table-wrap.a-cartes {
    display: none;
  }

  .cz-table-cartes {
    display: flex;
  }

  .cz-tfoot {
    flex-direction: column;
    gap: var(--space-2);
  }
}
</style>
