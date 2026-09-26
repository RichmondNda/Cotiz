<!--
  MgProjetPaiements — paiements d'un projet.
  Desktop : « À valider » (cartes, Examiner), barre d'outils (recherche, statut, période, légende, Grille / Liste des paiements),
  grille d'échéances (une ligne par souscripteur, 1re case = fonds d'entrée, mois courant surligné, tri par retards).
  Case cliquée → panneau (desktop) / feuille basse (mobile) : validation d'un paiement déclaré (flash des cases,
  compteurs mis à jour), relance d'une échéance en retard. Vue liste : paiements déclarés du projet.
  Mobile : Grille / Liste, légende, grille compacte défilante ; la liste résume la situation de chaque souscripteur.
  Scénarios : `beaucoup-de-retards` (+ `chargement`, `erreur`). Vue dans l'URL : `?vue=liste`.
-->
<script setup lang="ts">
import type { ColonneTable } from '~/components/cz/CzTable.vue'
import type { CelluleGrille, ColonneGrille, LigneGrille } from '~/components/metier/GrilleEcheances.vue'
import type { Echeance, LigneGrilleProjet, PaiementListe } from '~~/types'
import { maintenant } from '~/utils/date-reference'
import { formatDate, formatFCFA, formatMois, pluriel } from '~/utils/format'
import { couverturePaiement } from '~/utils/echeances'
import { libelleStatut } from '~/utils/statuts'

definePageMeta({ ongletProjet: 'paiements' })

const route = useRoute()
const router = useRouter()
const toast = useToast()
const id = computed(() => String(route.params.id))
const { data: projet, refresh: rechargerProjet } = useProjet(id)
const { data: grille, pending, error, refresh: rechargerGrille } = useGrilleProjet(id)
const { data: paiements, refresh: rechargerPaiements } = usePaiements(() => ({ projetId: id.value }))
const { refresh: rechargerCompteurs } = useCompteursNavigation()
const valider = useValidationPaiement()
const { relances, relancer } = useRelancesProjet(id)

// ---------------------------------------------------------------- Vue (URL) et filtres
const vue = computed<'grille' | 'liste'>({
  get: () => (route.query.vue === 'liste' ? 'liste' : 'grille'),
  set: v => router.replace({ query: { ...route.query, vue: v === 'grille' ? undefined : v } }),
})
const recherche = ref('')
const FILTRES = [
  { valeur: 'tous', label: 'Statut : tous' },
  { valeur: 'en_retard', label: 'Statut : en retard' },
  { valeur: 'a_valider', label: 'Statut : à valider' },
] as const
const filtre = ref(0)
const fenetre = ref(0)

// ---------------------------------------------------------------- Données
const lignesProjet = computed<LigneGrilleProjet[]>(() => grille.value ?? [])
const echeancesParId = computed(() => new Map(lignesProjet.value.flatMap(l => l.echeances.map(e => [e.id, e] as const))))
const aValider = computed(() => (paiements.value ?? [])
  .filter(p => p.statut === 'en_attente')
  .sort((a, b) => a.declareLe.localeCompare(b.declareLe)))
const couverture = (p: PaiementListe) => couverturePaiement(p, echeancesParId.value, formatFCFA)

/** Rangs du calendrier (0 = fonds d'entrée), d'après la ligne la plus complète. */
const reference = computed(() => [...lignesProjet.value].sort((a, b) => b.echeances.length - a.echeances.length)[0]?.echeances ?? [])
const TAILLE_FENETRE = 12
const fenetres = computed(() => {
  const mois = reference.value.filter(e => !e.estFondsEntree).sort((a, b) => a.rang - b.rang)
  const out: Echeance[][] = []
  for (let i = 0; i < mois.length; i += TAILLE_FENETRE) out.push(mois.slice(i, i + TAILLE_FENETRE))
  return out.length ? out : [[]]
})
const moisVisibles = computed(() => fenetres.value[Math.min(fenetre.value, fenetres.value.length - 1)] ?? [])
const fondsEntree = computed(() => reference.value.find(e => e.estFondsEntree))
const aujourdhui = maintenant()
const estMoisCourant = (d: string) => /^\d{4}-\d{2}/.test(d) && d.slice(0, 7) === `${aujourdhui.getFullYear()}-${String(aujourdhui.getMonth() + 1).padStart(2, '0')}`

const colonnes = computed<ColonneGrille[]>(() => [
  ...(fondsEntree.value ? [{ id: 'r0', label: 'Entrée', labelCourt: 'Ent.' }] : []),
  ...moisVisibles.value.map(e => ({ id: `r${e.rang}`, label: formatMois(e.date, 'court'), courante: estMoisCourant(e.date) })),
])
const rangsVisibles = computed(() => colonnes.value.map(c => Number(c.id.slice(1))))
const libellePeriode = computed(() => {
  const m = moisVisibles.value
  return m.length ? `Période : ${formatMois(m[0]!.date, 'long').toLowerCase()} → ${formatMois(m.at(-1)!.date, 'court-annee').toLowerCase()}` : 'Période'
})

const lignes = computed<(LigneGrille & { source: LigneGrilleProjet })[]>(() => lignesProjet.value.map((l) => {
  const parRang = new Map(l.echeances.map(e => [e.rang, e]))
  const enRetard = l.echeances.some(e => e.statut === 'en_retard')
  const verse = l.echeances.reduce((t, e) => t + e.montantPaye, 0)
  return {
    id: l.souscripteur.id,
    nom: `${l.souscripteur.prenom} ${l.souscripteur.nom}`,
    tonAvatar: enRetard ? 'danger' : l.souscription.statut === 'signature_attendue' ? 'warning' : 'brand',
    cellules: rangsVisibles.value.map((r) => {
      const e = parRang.get(r)
      return e ? { id: e.id, date: e.date, montant: e.montant, statut: e.statut, estFondsEntree: e.estFondsEntree } : null
    }),
    reste: l.echeances.length ? Math.max(0, l.souscription.engagement - verse) : l.souscription.reste,
    resteEnRetard: l.echeances.some(e => e.statut === 'en_retard' || e.statut === 'partielle'),
    source: l,
  }
}))
const lignesFiltrees = computed(() => {
  const q = recherche.value.trim().toLocaleLowerCase('fr')
  const f = FILTRES[filtre.value]!.valeur
  return lignes.value.filter(l => (!q || l.nom.toLocaleLowerCase('fr').includes(q))
    && (f === 'tous'
      || (f === 'en_retard' && l.source.echeances.some(e => e.statut === 'en_retard'))
      || (f === 'a_valider' && l.source.echeances.some(e => e.statut === 'declaree'))))
})
const autres = computed(() => {
  const n = typeof projet.value?.nbSouscripteurs === 'number' ? projet.value.nbSouscripteurs : 0
  return Math.max(0, n - lignes.value.length)
})

// ---------------------------------------------------------------- Panneau
interface Selection {
  nom: string
  souscripteurId: string
  echeance: Echeance | null
  paiement: PaiementListe | null
}
const selection = ref<Selection | null>(null)
const panneauOuvert = ref(false)
const validation = ref(false)
const flash = ref<string[]>([])

function ouvrirCellule(l: LigneGrille, c: CelluleGrille) {
  const e = echeancesParId.value.get(c.id) ?? null
  const paiement = aValider.value.find(p => p.repartition.some(r => r.echeanceId === c.id)) ?? null
  selection.value = { nom: l.nom, souscripteurId: l.id, echeance: e, paiement }
  panneauOuvert.value = true
}
function examiner(p: PaiementListe) {
  selection.value = { nom: `${p.souscripteur.prenom} ${p.souscripteur.nom}`, souscripteurId: p.souscripteurId, echeance: null, paiement: p }
  panneauOuvert.value = true
}

async function validerPaiement() {
  const p = selection.value?.paiement
  if (!p) return
  validation.value = true
  try {
    await valider(p.id)
    panneauOuvert.value = false
    toast.succes('Paiement validé', { message: `${formatFCFA(p.montant)} de ${p.souscripteur.prenom} ${p.souscripteur.nom}. Les cases sont passées au vert.` })
    await Promise.all([rechargerGrille(), rechargerPaiements(), rechargerProjet(), rechargerCompteurs()])
    flash.value = p.repartition.map(r => r.echeanceId)
    setTimeout(() => (flash.value = []), 900)
  }
  catch {
    toast.erreur('La validation a échoué', { message: 'Vérifiez votre connexion, puis réessayez.' })
  }
  finally {
    validation.value = false
  }
}

function relancerSelection() {
  const s = selection.value
  if (s) relancer([s.souscripteurId], { nom: s.nom })
}

// ---------------------------------------------------------------- Liste des paiements
const COLONNES_LISTE: ColonneTable[] = [
  { cle: 'date', label: 'Date', triable: true },
  { cle: 'souscripteur', label: 'Souscripteur', triable: true, squelette: 'personne' },
  { cle: 'montant', label: 'Montant', num: true, triable: true, squelette: 'montant' },
  { cle: 'couvre', label: 'Échéances couvertes' },
  { cle: 'preuve', label: 'Preuve' },
  { cle: 'statut', label: 'Statut', squelette: 'badge' },
  { cle: 'validePar', label: 'Validé par' },
]
const lignesListe = computed(() => [...(paiements.value ?? [])]
  .sort((a, b) => b.declareLe.localeCompare(a.declareLe))
  .map(p => ({
    id: p.id,
    date: p.declareLe,
    souscripteur: `${p.souscripteur.prenom} ${p.souscripteur.nom}`,
    souscripteurId: p.souscripteurId,
    montant: p.montant,
    couvre: couverture(p),
    preuve: p.preuve.type,
    statut: p.statut,
    validePar: p.statut === 'valide' ? p.traiteParNom ?? '—' : '—',
  })))
</script>

<template>
  <div
    v-if="projet"
    class="paiements"
  >
    <!-- À valider (desktop) -->
    <section
      v-if="aValider.length"
      class="paiements__a-valider cz-desktop"
      aria-labelledby="titre-a-valider"
    >
      <h2
        id="titre-a-valider"
        class="paiements__titre-a-valider"
      >
        À valider · {{ aValider.length }}
      </h2>
      <div class="paiements__cartes">
        <CartePaiementAValider
          v-for="p in aValider.slice(0, 4)"
          :key="p.id"
          :paiement="p"
          :couverture="couverture(p)"
          @examiner="examiner(p)"
        />
      </div>
    </section>

    <!-- Barre d'outils -->
    <div class="cz-toolbar paiements__outils cz-desktop">
      <CzInput
        v-model="recherche"
        type="search"
        placeholder="Souscripteur"
        label="Rechercher un souscripteur"
        class="paiements__recherche"
      />
      <CzChip
        :actif="filtre > 0"
        @click="filtre = (filtre + 1) % FILTRES.length"
      >
        {{ FILTRES[filtre]!.label }}
      </CzChip>
      <CzChip
        :disabled="fenetres.length < 2"
        @click="fenetre = (fenetre + 1) % fenetres.length"
      >
        {{ libellePeriode }}
      </CzChip>
      <LegendeGrille
        court
        class="paiements__legende"
      />
    </div>
    <div class="paiements__vue">
      <CzSegmented
        v-model="vue"
        :options="[{ valeur: 'grille', label: 'Grille' }, { valeur: 'liste', label: 'Liste des paiements' }]"
        label="Affichage"
        class="cz-desktop"
      />
      <CzSegmented
        v-model="vue"
        :options="[{ valeur: 'grille', label: 'Grille' }, { valeur: 'liste', label: 'Liste' }]"
        label="Affichage"
        class="paiements__vue-mobile cz-mobile"
      />
    </div>
    <LegendeGrille
      court
      class="cz-mobile"
    />

    <CzErreurChargement
      v-if="error"
      titre="Impossible d’afficher la grille"
      @reessayer="rechargerGrille()"
    />

    <!-- Grille -->
    <template v-else-if="vue === 'grille'">
      <CzEmpty
        v-if="!pending && !lignes.length"
        icone="souscripteurs"
        titre="Aucun souscripteur sur ce projet"
        description="La grille se remplit dès qu’un souscripteur est inscrit."
      >
        <template #action>
          <CzButton :to="{ path: `/asso/projets/${id}/souscripteurs`, query: { ajout: '1' } }">
            Ajouter un souscripteur
          </CzButton>
        </template>
      </CzEmpty>
      <div
        v-else
        class="paiements__grille"
      >
        <GrilleEcheances
          :colonnes="colonnes"
          :lignes="lignesFiltrees"
          :chargement="pending && !grille"
          :selection="panneauOuvert ? selection?.echeance?.id : null"
          :flash="flash"
          :legende="false"
          mobile="grille"
          :label="`Grille des échéances — ${projet.nom}`"
          @cellule="ouvrirCellule"
        />
        <p
          v-if="lignes.length"
          class="paiements__autres"
        >
          <span class="cz-desktop">… {{ autres ? `${pluriel(autres, 'autre souscripteur', 'autres souscripteurs')} · ` : '' }}triés par nombre de retards</span>
          <span class="cz-mobile">{{ lignesFiltrees.length }} affichés sur {{ projet.nbSouscripteurs }} · faites glisser pour voir tous les mois</span>
        </p>
      </div>
    </template>

    <!-- Liste -->
    <template v-else>
      <CzTable
        :colonnes="COLONNES_LISTE"
        :lignes="lignesListe"
        :chargement="!paiements"
        label="Paiements déclarés du projet"
        class="cz-desktop"
        @ligne="l => router.push(`/asso/paiements/${l.id}`)"
      >
        <template #cell-date="{ ligne }">
          <span class="paiements__muted">{{ formatDate(ligne.date, 'numerique') }}</span>
        </template>
        <template #cell-souscripteur="{ ligne }">
          <NuxtLink
            :to="`/asso/souscripteurs/${ligne.souscripteurId}`"
            class="paiements__nom"
            @click.stop
          >
            {{ ligne.souscripteur }}
          </NuxtLink>
        </template>
        <template #cell-montant="{ ligne }">
          {{ formatFCFA(ligne.montant) }}
        </template>
        <template #cell-preuve="{ ligne }">
          <span
            class="paiements__vignette"
            :aria-label="ligne.preuve === 'reference' ? 'Référence seule' : ligne.preuve === 'pdf' ? 'Preuve PDF' : 'Capture jointe'"
            role="img"
          />
        </template>
        <template #cell-statut="{ ligne }">
          <BadgeStatut
            type="paiement"
            :statut="ligne.statut"
          />
        </template>
        <template #cell-validePar="{ ligne }">
          <span class="paiements__muted">{{ ligne.validePar }}</span>
        </template>
      </CzTable>
      <CzCard class="paiements__liste-mobile cz-mobile">
        <ul class="paiements__situations">
          <li
            v-for="l in lignes"
            :key="l.id"
          >
            <div>
              <b>{{ l.nom }}</b>
              <span>Reste {{ formatFCFA(l.reste) }}</span>
            </div>
            <CzBadge
              :ton="libelleStatut('souscription', l.source.souscription.statut).ton"
              petit
            >
              {{ l.source.souscription.statut === 'signature_attendue' ? 'À signer' : libelleStatut('souscription', l.source.souscription.statut).libelle }}
            </CzBadge>
          </li>
        </ul>
      </CzCard>
    </template>

    <PanneauEcheance
      v-if="selection"
      v-model:ouvert="panneauOuvert"
      :nom="selection.nom"
      :projet="projet.nom"
      :echeance="selection.echeance"
      :paiement="selection.paiement"
      :couverture="selection.paiement ? couverture(selection.paiement) : undefined"
      :validation="validation"
      :relance="relances.includes(selection.souscripteurId)"
      @valider="validerPaiement"
      @relancer="relancerSelection"
    />
  </div>
</template>

<style scoped>
.paiements {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  min-width: 0;
}

.paiements__a-valider {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
  border-radius: var(--r-card);
  background: var(--warning-bg);
}

.paiements__titre-a-valider {
  margin: 0;
  font-family: var(--font-display);
  font-size: 15px;
  font-weight: 600;
  color: var(--warning-fg);
}

.paiements__cartes {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-3);
}

.paiements__recherche {
  width: 220px;
}

.paiements__legende {
  margin-left: var(--space-2);
}

.paiements__vue {
  display: flex;
  justify-content: flex-end;
}

.paiements__grille {
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  border-radius: var(--r-md);
  background: var(--surface);
  box-shadow: var(--shadow);
}

.paiements__grille :deep(.cz-grid-wrap) {
  border-radius: 0;
  box-shadow: none;
}

.paiements__autres {
  margin: 0;
  padding: var(--space-3) 14px;
  border-top: 1px solid var(--divider-row);
  font-size: 12.5px;
  color: var(--text-muted);
}

.paiements__muted {
  color: var(--text-muted);
}

.paiements__nom {
  font-weight: 600;
  color: var(--text-strong);
  text-decoration: none;
}

.paiements__vignette {
  display: inline-flex;
  width: 32px;
  height: 40px;
  border: 1px solid var(--border);
  border-radius: var(--r-xs);
  background: var(--info-bg);
}

.paiements__liste-mobile {
  padding: 0;
}

.paiements__situations {
  margin: 0;
  padding: 0;
  list-style: none;
}

.paiements__situations li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  min-height: 64px;
  padding: var(--space-2) var(--space-4);
  border-bottom: 1px solid var(--divider);
}

.paiements__situations li:last-child {
  border-bottom: 0;
}

.paiements__situations li > div {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.paiements__situations b {
  font-size: 14.5px;
  color: var(--text-strong);
}

.paiements__situations span {
  font-size: 13px;
  color: var(--text-muted);
}

@media (max-width: 1279px) {
  .paiements__cartes {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 767px) {
  .paiements {
    gap: var(--space-3);
  }

  .paiements__vue {
    justify-content: stretch;
  }

  .paiements__vue-mobile {
    display: flex;
    width: 100%;
  }

  .paiements__vue-mobile :deep([role="radio"]) {
    flex: 1;
    text-align: center;
  }

  .paiements__grille {
    border-radius: var(--r-card);
  }

  .paiements__autres {
    border-top: 0;
    padding-top: 0;
  }
}
</style>
