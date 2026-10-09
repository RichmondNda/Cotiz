<!--
  MgProjetRapports — vue d'ensemble partageable avec le bureau de l'association.
  Desktop : période (sélecteur), « Exporter CSV », « Exporter PDF » (V2) ; 4 KPI (attendu à date, reçu, reste, taux) ;
  graphiques (collecte par échéance, évolution du taux de recouvrement, souscripteurs par statut) ; tableau par
  souscripteur (attendu, versé, reste, retards, dernier paiement).
  Mobile : période en pastilles, 2 KPI, « Collecté par mois », liste « Exporter » (état des cotisations, retardataires,
  relevé imprimable). Scénario `graphiques-bientot-disponibles` : graphiques avancés remplacés par « Bientôt disponible ».
  La période s'applique aux KPI et aux barres ; le tableau reste « à date ».
-->
<script setup lang="ts">
import type { ColonneTable } from '~/components/cz/CzTable.vue'
import type { SegmentStatut } from '~/components/metier/AnneauStatuts.vue'
import type { LigneRapport } from '~~/types'
import { telechargerCsv } from '~/utils/csv'
import { estDate, formatDate, formatFCFA, formatMois, formatPourcent, pluriel } from '~/utils/format'

definePageMeta({ ongletProjet: 'rapports' })

type Periode = 'debut' | 'mois' | 'trois-mois'

const route = useRoute()
const id = computed(() => String(route.params.id))
const { data: projet } = useProjet(id)
const { data: rapport, pending, error, refresh } = useRapportProjet(id)
const { data: synthese, refresh: rechargerSynthese } = useSyntheseProjet(id)
const toast = useToast()

const nombre = (v: number | string | undefined) => (typeof v === 'number' ? v : 0)
const inscrits = computed(() => nombre(projet.value?.nbSouscripteurs))

// ---------------------------------------------------------------- Période
const periode = ref<Periode>('debut')
const OPTIONS = computed(() => [
  { valeur: 'debut' as const, label: estDate(projet.value?.dateDebut) ? `Depuis le début (${formatMois(projet.value.dateDebut).toLowerCase()})` : 'Depuis le début' },
  { valeur: 'mois' as const, label: 'Ce mois-ci' },
  { valeur: 'trois-mois' as const, label: '3 derniers mois' },
])
const PASTILLES = [
  { valeur: 'debut' as const, label: 'Depuis le début' },
  { valeur: 'mois' as const, label: 'Ce mois' },
  { valeur: 'trois-mois' as const, label: '3 derniers mois' },
]

/** Échéances échues ou en cours (les suivantes ne comptent pas encore). */
const echues = computed(() => {
  const c = synthese.value?.collecte ?? []
  const courant = c.findIndex(m => m.enCours)
  return courant >= 0 ? c.slice(0, courant + 1) : c.filter(m => m.recu > 0)
})
const moisPeriode = computed(() => {
  if (periode.value === 'mois') return echues.value.slice(-1)
  if (periode.value === 'trois-mois') return echues.value.slice(-3)
  return echues.value
})

// ---------------------------------------------------------------- KPI
type Valeur = number | string

/** Placeholders de la maquette (`[MONTANT]`, `[N]`) conservés tels quels : le reste n'est alors pas calculable. */
function indicateurs(attendu: Valeur, recu: Valeur, taux: Valeur, detailAttendu: string) {
  const calculable = typeof attendu === 'number' && typeof recu === 'number'
  return {
    attendu,
    recu,
    taux,
    reste: calculable ? Math.max(0, attendu - recu) : '[MONTANT]',
    manque: calculable && attendu > recu,
    detailAttendu,
  }
}

const kpis = computed(() => {
  const p = projet.value
  if (!p) return null
  if (periode.value === 'debut') {
    const attendu = p.montantAttenduADate
    const parSouscripteur = typeof attendu === 'number' && inscrits.value ? attendu / inscrits.value : null
    const nbEcheances = parSouscripteur !== null && p.montantEcheance
      ? Math.round((parSouscripteur - (p.fondsEntree ?? 0)) / p.montantEcheance)
      : null
    const detail = nbEcheances === null
      ? 'échéances échues'
      : `${p.fondsEntree ? 'entrée + ' : ''}${pluriel(nbEcheances, 'échéance')} × ${inscrits.value}`
    return indicateurs(attendu, p.montantCollecte, p.tauxRecouvrement, detail)
  }
  const attendu = moisPeriode.value.reduce((t, m) => t + m.attendu, 0)
  const recu = moisPeriode.value.reduce((t, m) => t + m.recu, 0)
  return indicateurs(attendu, recu, attendu ? Math.round((recu / attendu) * 100) : 0, `${pluriel(moisPeriode.value.length, 'échéance')} × ${inscrits.value}`)
})

// ---------------------------------------------------------------- Graphiques
const barresCollecte = computed(() => moisPeriode.value.map(m => ({
  label: formatMois(m.mois, 'court'),
  attendu: m.attendu,
  recu: m.recu,
  enCours: m.enCours,
})))
const moisCourant = computed(() => {
  const m = moisPeriode.value.find(x => x.enCours)
  return m ? formatMois(m.mois, 'seul') : null
})
const barresMobile = computed(() => moisPeriode.value.map(m => ({
  label: formatMois(m.mois, 'court'),
  ratio: m.attendu ? m.recu / m.attendu : 0,
})))
const pointsTaux = computed(() => (rapport.value?.tauxParEcheance ?? []).map(t => ({ label: formatMois(t.mois), taux: t.taux })))
const segments = computed<SegmentStatut[]>(() => {
  const s = rapport.value?.statuts
  return s
    ? [
        { libelle: 'À jour', valeur: s.aJour, ton: 'success' },
        { libelle: 'En retard', valeur: s.enRetard, ton: 'danger' },
        { libelle: 'Signature', valeur: s.signature, ton: 'warning' },
      ]
    : []
})

// ---------------------------------------------------------------- Tableau
const COLONNES: ColonneTable[] = [
  { cle: 'nom', label: 'Souscripteur', squelette: 'texte' },
  { cle: 'attenduADate', label: 'Attendu à date', num: true, squelette: 'montant' },
  { cle: 'verse', label: 'Versé', num: true, squelette: 'montant' },
  { cle: 'reste', label: 'Reste', num: true, squelette: 'montant' },
  { cle: 'retards', label: 'Retards', num: true, largeur: '96px' },
  { cle: 'dernierPaiement', label: 'Dernier paiement', largeur: '160px' },
]
/** Les plus en retard d'abord, puis le plus gros reste ; contrats non signés en fin de liste. */
const lignes = computed(() => [...(rapport.value?.lignes ?? [])]
  .sort((a, b) => b.retards - a.retards || (b.reste ?? -1) - (a.reste ?? -1))
  .map(l => ({ ...l, id: l.souscripteurId })))
const montantOuTiret = (v: number | null) => (v === null ? '—' : formatFCFA(v))
const date = (d?: string) => (estDate(d) ? formatDate(d, 'numerique') : '—')

// ---------------------------------------------------------------- Exports
function exporterCotisations() {
  telechargerCsv(`etat-cotisations-${id.value}.csv`, [
    ['Souscripteur', 'Attendu à date (F)', 'Versé (F)', 'Reste (F)', 'Retards', 'Dernier paiement'],
    ...lignes.value.map((l: LigneRapport) => [l.nom, l.attenduADate ?? '', l.verse, l.reste ?? '', l.retards, date(l.dernierPaiement)]),
  ])
  toast.succes('Export prêt', { message: 'État des cotisations exporté (CSV, lisible dans Excel).' })
}
function exporterRetardataires() {
  const retardataires = synthese.value?.retardataires ?? []
  telechargerCsv(`retardataires-${id.value}.csv`, [
    ['Souscripteur', 'Échéances en retard', 'Mois', 'Montant dû (F)'],
    ...retardataires.map(r => [r.nom, r.nbEcheances, r.mois.join(', '), r.montant]),
  ])
  toast.succes('Export prêt', { message: `${pluriel(retardataires.length, 'retardataire')} exportés (CSV, lisible dans Excel).` })
}
function exporterPdf() {
  toast.info('Bientôt disponible', { message: 'L’export PDF du rapport arrive en V2. En attendant, utilisez l’export CSV.' })
}
function imprimer() {
  // V0 : relevé imprimable via l'impression du navigateur (« Enregistrer en PDF »).
  window.print()
}

function recharger() {
  refresh()
  rechargerSynthese()
}
</script>

<template>
  <CzErreurChargement
    v-if="error"
    titre="Impossible d’afficher le rapport"
    @reessayer="recharger"
  />

  <div
    v-else-if="projet && kpis"
    class="rapports"
  >
    <!-- Barre d'outils -->
    <div class="cz-toolbar rapports__outils cz-desktop">
      <div class="rapports__periode">
        <span
          id="rapports-periode"
          class="cz-label"
        >Période</span>
        <CzSelect
          v-model="periode"
          :options="OPTIONS"
          label="Période"
          class="rapports__select"
        />
      </div>
      <div class="end">
        <CzButton
          variante="secondaire"
          taille="sm"
          icone="telecharger"
          @click="exporterCotisations"
        >
          Exporter CSV
        </CzButton>
        <CzButton
          variante="secondaire"
          taille="sm"
          @click="exporterPdf"
        >
          Exporter PDF <CzSoon petit>
            V2
          </CzSoon>
        </CzButton>
      </div>
    </div>
    <CzChips
      v-model="periode"
      :options="PASTILLES"
      label="Période"
      class="rapports__pastilles cz-mobile"
    />

    <!-- KPI -->
    <div class="cz-grid4 cz-desktop">
      <CzKpi
        libelle="Total attendu à date"
        :valeur="formatFCFA(kpis.attendu)"
        :detail="kpis.detailAttendu"
        :chargement="pending && !rapport"
      />
      <CzKpi
        libelle="Total reçu"
        :valeur="formatFCFA(kpis.recu)"
        detail="validé"
        ton-detail="up"
      />
      <CzKpi
        libelle="Reste à percevoir"
        detail="échéances échues"
        :ton-detail="kpis.manque ? 'bad' : undefined"
      >
        <template #valeur>
          <span :class="{ rapports__danger: kpis.manque }">{{ formatFCFA(kpis.reste) }}</span>
        </template>
      </CzKpi>
      <CzKpi
        libelle="Taux de recouvrement"
        :valeur="formatPourcent(kpis.taux)"
        detail="des échéances échues"
      />
    </div>
    <div class="rapports__kpis-mobile cz-mobile">
      <CzKpi
        libelle="Collecté"
        :valeur="formatFCFA(kpis.recu)"
        :detail="`sur ${formatFCFA(kpis.attendu)} à date`"
      />
      <CzKpi
        libelle="Recouvrement"
        :valeur="formatPourcent(kpis.taux)"
        detail="échéances échues"
        :ton-detail="typeof kpis.taux !== 'number' ? undefined : kpis.taux >= 80 ? 'up' : 'bad'"
      />
    </div>

    <!-- Graphiques : desktop -->
    <div class="rapports__graphiques cz-desktop">
      <CzCard
        tag="section"
        class="rapports__carte"
      >
        <h2 class="rapports__titre">
          Collecte par échéance
        </h2>
        <CzSkeleton
          v-if="!synthese"
          :hauteur="160"
        />
        <GraphiqueCollecte
          v-else-if="barresCollecte.length"
          :mois="barresCollecte"
          :largeur-vue="400"
          label="Collecte par échéance, attendu et reçu"
        >
          <template #legende>
            <span v-if="moisCourant">{{ moisCourant }} en cours en transparence</span>
          </template>
        </GraphiqueCollecte>
        <p
          v-else
          class="rapports__vide"
        >
          Aucune échéance échue sur la période.
        </p>
      </CzCard>
      <CzCard
        tag="section"
        class="rapports__carte"
      >
        <h2 class="rapports__titre">
          Taux de recouvrement
        </h2>
        <CzSkeleton
          v-if="!rapport"
          :hauteur="160"
        />
        <FeatureGate
          v-else
          feature="analytics"
        >
          <CourbeRecouvrement :points="pointsTaux" />
          <template #indisponible>
            <div class="rapports__bientot">
              <CzSoon />
              <span>Graphiques avancés en V2</span>
            </div>
          </template>
        </FeatureGate>
      </CzCard>
      <CzCard
        tag="section"
        class="rapports__carte"
      >
        <h2 class="rapports__titre">
          Souscripteurs par statut
        </h2>
        <CzSkeleton
          v-if="!rapport"
          :hauteur="100"
        />
        <FeatureGate
          v-else
          feature="analytics"
        >
          <AnneauStatuts :segments="segments" />
          <template #indisponible>
            <div class="rapports__bientot rapports__bientot--court">
              <CzSoon />
            </div>
          </template>
        </FeatureGate>
      </CzCard>
    </div>

    <!-- Graphique : mobile -->
    <FeatureGate feature="analytics">
      <CzCard
        tag="section"
        class="rapports__carte cz-mobile"
      >
        <h2 class="rapports__titre">
          Collecté par mois (F)
        </h2>
        <CzSkeleton
          v-if="!synthese"
          :hauteur="120"
        />
        <BarresEcheances
          v-else-if="barresMobile.length"
          :barres="barresMobile"
          etiquettes="toutes"
          label="Collecté par mois"
        />
        <p class="rapports__note">
          Montants mensuels : [MONTANT] F
        </p>
      </CzCard>
      <template #indisponible>
        <CzCard class="rapports__bientot-mobile cz-mobile">
          <CzSoon>V2</CzSoon>
          <span>Graphiques détaillés bientôt disponibles.</span>
        </CzCard>
      </template>
    </FeatureGate>

    <!-- Tableau : desktop -->
    <CzTable
      class="cz-desktop"
      :colonnes="COLONNES"
      :lignes="lignes"
      :cliquable="false"
      :chargement="pending && !rapport"
      :lignes-squelette="5"
      label="Situation par souscripteur"
    >
      <template #cell-nom="{ ligne }">
        <NuxtLink
          :to="`/asso/souscripteurs/${ligne.souscripteurId}`"
          class="rapports__nom"
        >
          {{ ligne.nom }}
        </NuxtLink>
      </template>
      <template #cell-attenduADate="{ ligne }">
        {{ montantOuTiret(ligne.attenduADate) }}
      </template>
      <template #cell-verse="{ ligne }">
        {{ formatFCFA(ligne.verse) }}
      </template>
      <template #cell-reste="{ ligne }">
        <b
          v-if="ligne.retards > 0 && ligne.reste"
          class="rapports__danger"
        >{{ formatFCFA(ligne.reste) }}</b>
        <template v-else>
          {{ montantOuTiret(ligne.reste) }}
        </template>
      </template>
      <template #cell-dernierPaiement="{ ligne }">
        <span class="rapports__date">{{ date(ligne.dernierPaiement) }}</span>
      </template>
    </CzTable>

    <!-- Exports : mobile -->
    <section
      class="rapports__exports cz-mobile"
      aria-labelledby="rapports-exporter"
    >
      <h2
        id="rapports-exporter"
        class="rapports__titre"
      >
        Exporter
      </h2>
      <div class="cz-card rapports__liste">
        <button
          type="button"
          @click="exporterCotisations"
        >
          <span><b>État des cotisations</b><span>Qui a payé, qui est en retard · Excel</span></span>
          <span class="rapports__action">Exporter</span>
        </button>
        <button
          type="button"
          @click="exporterRetardataires"
        >
          <span><b>Liste des retardataires</b><span>{{ pluriel(projet.nbEnRetard, 'souscripteur') }} · Excel</span></span>
          <span class="rapports__action">Exporter</span>
        </button>
        <button
          type="button"
          @click="imprimer"
        >
          <span><b>Relevé du projet</b><span>Synthèse imprimable · PDF</span></span>
          <span class="rapports__action">Exporter</span>
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.rapports {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.rapports__periode {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.rapports__periode .cz-label {
  margin: 0;
}

.rapports__select {
  width: 280px;
}

.rapports__danger {
  color: var(--danger-fg);
}

.rapports__graphiques {
  display: grid;
  grid-template-columns: 1.3fr 1fr 0.8fr;
  gap: var(--space-4);
}

.rapports__carte {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-6);
}

.rapports__titre {
  margin: 0;
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 600;
  color: var(--text-strong);
}

.rapports__bientot {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  min-height: 128px;
  border-radius: var(--r-md);
  background: var(--surface-subtle);
  font-size: 13px;
  color: var(--text-muted);
}

.rapports__bientot--court {
  min-height: 96px;
}

.rapports__vide,
.rapports__note {
  margin: 0;
  font-size: 12.5px;
  color: var(--text-muted);
}

.rapports__nom {
  font-weight: 600;
  color: var(--text-strong);
  text-decoration: none;
}

.rapports__nom:hover {
  text-decoration: underline;
}

.rapports__date {
  color: var(--text-muted);
}

.rapports__kpis-mobile {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
}

.rapports__bientot-mobile {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  font-size: 14px;
}

.rapports__exports {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.rapports__liste {
  padding: 0;
  overflow: hidden;
}

.rapports__liste button {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  min-height: 64px;
  padding: var(--space-3) var(--space-4);
  border: 0;
  border-top: 1px solid var(--divider);
  background: none;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.rapports__liste button:first-child {
  border-top: 0;
}

.rapports__liste button > span:first-child {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--space-1);
  font-size: 12.5px;
  color: var(--text-muted);
}

.rapports__liste b {
  font-size: 14px;
  color: var(--text-strong);
}

.rapports__action {
  font-size: 13px;
  font-weight: 600;
  color: var(--brand-dark);
}

@media (max-width: 1023px) {
  .rapports__graphiques {
    grid-template-columns: 1fr 1fr;
  }

  .rapports__graphiques > :first-child {
    grid-column: span 2;
  }
}

@media (max-width: 767px) {
  .rapports {
    gap: var(--space-4);
  }

  .rapports__carte {
    padding: var(--space-6);
  }

  .rapports__pastilles {
    overflow-x: auto;
  }
}
</style>
