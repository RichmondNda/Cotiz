<!--
  MbHistorique — historique complet : « comprendre l'évolution de mes cotisations et retrouver n'importe quel paiement ».
  Filtres par projet (puces, `?projet=` dans l'URL), appliqués ensemble à la synthèse, au graphique et à la liste.
  Synthèse : total versé (paiements validés), reste à payer et retard, premier paiement (desktop).
  Graphique : versements validés par mois et par projet, cumul. Liste groupée par mois.
  Scénario : `aucun-paiement`.
-->
<script setup lang="ts">
import type { MoisVersements, SerieVersements } from '~/components/metier/GraphiqueVersements.vue'
import type { PaiementListe } from '~~/types'
import { maintenant } from '~/utils/date-reference'
import { libelleCouverture } from '~/utils/echeances'
import { formatDate, formatFCFA, formatMois, lireDate, pluriel } from '~/utils/format'
import { lienDeclarer } from '~/utils/souscriptions'

definePageMeta({ middleware: 'espace-souscripteur', layout: 'souscripteur' })
useHead({ title: 'Historique · Cotiz' })

const route = useRoute()
const router = useRouter()
const { data: paiements, pending, error, refresh } = usePaiements()
const { data: echeances } = useEcheances()
const { data: souscriptions } = useMesSouscriptions()
const { data: associations } = useMesAssociations()

/** Couleurs des projets, dans l'ordre d'inscription (Centre en corail, Mutuelle en violet). */
const COULEURS = ['var(--corail)', 'var(--violet)', 'var(--info)', 'var(--warning)']

const projets = computed(() => [...(souscriptions.value ?? [])]
  .filter(s => s.statut !== 'signature_attendue')
  .sort((a, b) => a.inscritLe.localeCompare(b.inscritLe))
  .map((s, i) => ({ id: s.projetId, nom: s.projet.nom, couleur: COULEURS[i % COULEURS.length]!, court: s.projet.nom.split(' ')[0]! })))
const couleur = (projetId: string) => projets.value.find(p => p.id === projetId)?.couleur ?? 'var(--brand)'

const filtre = computed({
  get: () => (typeof route.query.projet === 'string' ? route.query.projet : 'tous'),
  set: v => router.replace({ query: { ...route.query, projet: v === 'tous' ? undefined : v } }),
})
const options = computed(() => [{ valeur: 'tous', label: 'Tous' }, ...projets.value.map(p => ({ valeur: p.id, label: p.nom }))])

const selection = computed(() => (paiements.value ?? []).filter(p => filtre.value === 'tous' || p.projetId === filtre.value))
const valides = computed(() => selection.value.filter(p => p.statut === 'valide'))

const synthese = computed(() => {
  const engages = (souscriptions.value ?? [])
    .filter(s => s.statut !== 'signature_attendue' && (filtre.value === 'tous' || s.projetId === filtre.value))
  const premier = [...valides.value].sort((a, b) => a.declareLe.localeCompare(b.declareLe))[0]
  return {
    verse: valides.value.reduce((t, p) => t + p.montant, 0),
    nbValides: valides.value.length,
    reste: engages.reduce((t, s) => t + s.reste, 0),
    retard: engages.reduce((t, s) => t + s.montantEnRetard, 0),
    premier,
  }
})

// ---------------------------------------------------------------- Graphique
const moisAxe = computed(() => {
  const dates = (paiements.value ?? []).map(p => lireDate(p.declareLe))
  if (!dates.length) return []
  const debut = new Date(Math.min(...dates.map(d => d.getTime())))
  const fin = maintenant()
  const liste: Date[] = []
  for (let d = new Date(debut.getFullYear(), debut.getMonth(), 1); d <= fin; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) liste.push(d)
  return liste
})
const cleMois = (d: Date) => `${d.getFullYear()}-${d.getMonth()}`

const series = computed<SerieVersements[]>(() => projets.value
  .filter(p => filtre.value === 'tous' || p.id === filtre.value)
  .map(p => ({ cle: p.id, label: p.court, couleur: p.couleur })))

const moisGraphique = computed<MoisVersements[]>(() => moisAxe.value.map((d) => {
  const montants: Record<string, number> = {}
  for (const p of valides.value) {
    if (cleMois(lireDate(p.declareLe)) === cleMois(d)) montants[p.projetId] = (montants[p.projetId] ?? 0) + p.montant
  }
  return { label: formatMois(d, 'court'), montants }
}))
const debutCumul = computed(() => (moisAxe.value[0] ? formatMois(moisAxe.value[0], 'seul').toLowerCase() : ''))

// ---------------------------------------------------------------- Liste groupée par mois
const groupes = computed(() => {
  const g = new Map<string, { titre: string, total: number, paiements: PaiementListe[] }>()
  for (const p of selection.value) {
    const d = lireDate(p.declareLe)
    const cle = cleMois(d)
    if (!g.has(cle)) g.set(cle, { titre: formatMois(d), total: 0, paiements: [] })
    const groupe = g.get(cle)!
    groupe.total += p.montant
    groupe.paiements.push(p)
  }
  return [...g.values()]
})

// ---------------------------------------------------------------- Détail d'un paiement (feuille)
const choisi = ref<PaiementListe | null>(null)
const detailOuvert = ref(false)
function ouvrir(p: PaiementListe) {
  choisi.value = p
  detailOuvert.value = true
}
const nomAssociation = (id: string) => associations.value?.find(a => a.association.id === id)?.association.nom ?? ''

function couverture(p: PaiementListe) {
  const ids = new Set(p.repartition.map(r => r.echeanceId))
  return libelleCouverture((echeances.value ?? []).filter(e => ids.has(e.id)))
}
</script>

<template>
  <div class="historique">
    <EnTeteSouscripteur
      titre="Historique"
      sous-titre="Tous vos paiements, toutes associations"
    />

    <CzChips
      v-if="options.length > 2"
      v-model="filtre"
      :options="options"
      label="Filtrer par projet"
      class="historique__filtres"
    />

    <template v-if="pending && !paiements">
      <div class="historique__kpis">
        <CzSkeleton
          v-for="n in 3"
          :key="n"
          :hauteur="108"
          class="historique__skel"
        />
      </div>
      <CzSkeleton
        :hauteur="300"
        class="historique__skel"
      />
    </template>

    <CzEmpty
      v-else-if="error"
      icone="alerte"
      ton="danger"
      titre="Impossible d’afficher l’historique"
      description="Vérifiez votre connexion, puis réessayez."
      class="historique__vide"
    >
      <template #action>
        <CzButton
          variante="secondaire"
          @click="refresh()"
        >
          Réessayer
        </CzButton>
      </template>
    </CzEmpty>

    <CzEmpty
      v-else-if="!selection.length"
      icone="historique"
      titre="Aucun paiement pour l’instant"
      description="Vos paiements apparaîtront ici dès votre première déclaration."
      class="historique__vide"
    >
      <template #action>
        <CzButton :to="lienDeclarer(filtre === 'tous' ? undefined : filtre)">
          Déclarer un paiement
        </CzButton>
      </template>
    </CzEmpty>

    <template v-else>
      <div class="historique__kpis">
        <div class="cz-kpi">
          <div class="l">
            Total versé
          </div>
          <div class="v">
            {{ formatFCFA(synthese.verse) }}
          </div>
          <div class="d historique__succes">
            {{ pluriel(synthese.nbValides, 'paiement validé', 'paiements validés') }}
          </div>
        </div>
        <div class="cz-kpi">
          <div class="l">
            Reste à payer
          </div>
          <div class="v">
            {{ formatFCFA(synthese.reste) }}
          </div>
          <div
            v-if="synthese.retard"
            class="d historique__retard"
          >
            {{ formatFCFA(synthese.retard) }} en retard
          </div>
        </div>
        <div
          v-if="synthese.premier"
          class="cz-kpi historique__kpi-premier"
        >
          <div class="l">
            Premier paiement
          </div>
          <div class="v">
            {{ formatDate(synthese.premier.declareLe, 'numerique') }}
          </div>
          <div class="d">
            {{ synthese.premier.projet.nom }}
          </div>
        </div>
      </div>

      <CzCard
        variante="lg"
        class="historique__graphique"
      >
        <GraphiqueVersements
          titre="Mes versements par mois"
          :series="series"
          :mois="moisGraphique"
        >
          <p class="historique__cumul">
            Cumul versé depuis {{ debutCumul }} : {{ formatFCFA(synthese.verse) }}
          </p>
        </GraphiqueVersements>
      </CzCard>

      <section
        v-for="g in groupes"
        :key="g.titre"
        class="historique__groupe"
        :aria-label="g.titre"
      >
        <h2 class="cz-notif-group">
          {{ g.titre }} · {{ formatFCFA(g.total) }}
        </h2>
        <ul class="historique__liste">
          <li
            v-for="p in g.paiements"
            :key="p.id"
          >
            <button
              type="button"
              class="historique__ligne"
              @click="ouvrir(p)"
            >
              <span
                class="historique__point"
                :style="{ background: couleur(p.projetId) }"
                aria-hidden="true"
              />
              <span class="historique__texte">
                <b>{{ p.projet.nom }}</b>
                <span>{{ formatDate(p.declareLe, 'numerique') }}<template v-if="couverture(p)"> · {{ couverture(p) }}</template></span>
              </span>
              <span class="historique__montant">
                <b>{{ formatFCFA(p.montant) }}</b>
                <BadgeStatut
                  type="paiement"
                  :statut="p.statut"
                  petit
                />
              </span>
            </button>
          </li>
        </ul>
      </section>
    </template>

    <DetailPaiementSouscripteur
      v-if="choisi"
      v-model:ouvert="detailOuvert"
      :paiement="choisi"
      :association="nomAssociation(choisi.associationId)"
      :couverture="couverture(choisi)"
    />
  </div>
</template>

<style scoped>
.historique {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.historique__filtres {
  flex-wrap: wrap;
}

.historique__filtres :deep(.cz-chip) {
  min-height: 40px;
  padding-inline: var(--space-3);
  font-size: 13px;
}

.historique__kpis {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-4);
}

.historique__kpis .cz-kpi {
  padding: var(--space-4);
  border-radius: var(--r-card-lg);
}

.historique__succes {
  color: var(--success-fg);
}

.historique__retard {
  color: var(--danger-fg);
}

.historique__skel {
  border-radius: var(--r-card-lg);
}

.historique__vide {
  padding: var(--space-12) var(--space-6);
  border-radius: var(--r-card-lg);
  box-shadow: var(--shadow);
}

.historique__graphique {
  padding: var(--space-6);
}

.historique__cumul {
  margin: var(--space-3) 0 0;
  font-size: 12.5px;
  color: var(--text-muted);
}

.historique__groupe {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.historique__groupe .cz-notif-group {
  margin: var(--space-2) 0 0;
}

.historique__liste {
  margin: 0;
  padding: 0;
  list-style: none;
  border-radius: var(--r-md);
  background: var(--surface);
  box-shadow: var(--shadow);
}

.historique__liste li {
  border-bottom: 1px solid var(--divider-row);
}

.historique__ligne {
  width: 100%;
  font: inherit;
  text-align: left;
  color: inherit;
  background: none;
  border: 0;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: 66px;
  padding: var(--space-3) var(--space-4);
}

.historique__ligne:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: -2px;
}

.historique__liste li:last-child {
  border-bottom: 0;
}

.historique__point {
  flex-shrink: 0;
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.historique__texte {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  font-size: 12.5px;
  color: var(--text-muted);
}

.historique__texte b,
.historique__montant b {
  font-size: 14.5px;
  font-weight: 600;
  color: var(--text-strong);
}

.historique__montant {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--space-1);
  white-space: nowrap;
}

@media (max-width: 767px) {
  .historique {
    gap: var(--space-3);
  }

  .historique__kpis {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-3);
  }

  .historique__kpi-premier {
    display: none;
  }

  .historique__kpis .cz-kpi .v {
    font-size: 24px;
  }
}
</style>
