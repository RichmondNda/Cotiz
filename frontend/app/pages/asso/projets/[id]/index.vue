<!--
  MgProjet — vue d'ensemble d'un projet : savoir immédiatement s'il se porte bien et ce qui cloche.
  KPI selon l'état (en cours · inscriptions ouvertes · terminé), points à traiter (retard le plus lourd, paiements
  à valider, contrats non signés) ou « Tous vos souscripteurs sont à jour », collecte par échéance, retardataires.
  Mobile : KPI 2 × 2, « Recouvrement par échéance », liste « En retard », raccourcis (grille, à valider, rapport).
  États : en-cours (Centre communautaire), aucun-retard et termine (scénarios), inscriptions-ouvertes (Tontine 2027).
-->
<script setup lang="ts">
import type { Retardataire } from '~~/types'
import { estDate, formatDate, formatFCFA, formatMois, formatPourcent, formatRelatif, pluriel } from '~/utils/format'

definePageMeta({ ongletProjet: 'apercu' })

const route = useRoute()
const id = computed(() => String(route.params.id))
const { data: projet } = useProjet(id)
const { data: synthese, pending, error, refresh } = useSyntheseProjet(id)
const { relances, envoi, relancer } = useRelancesProjet(id)

const base = computed(() => `/asso/projets/${id.value}`)
const inscrits = computed(() => (typeof projet.value?.nbSouscripteurs === 'number' ? projet.value.nbSouscripteurs : 0))

interface Kpi {
  libelle: string
  libelleMobile?: string
  valeur: string
  detail: string
  detailMobile?: string
  tonDetail?: 'up' | 'bad'
  danger?: boolean
  barre?: { valeur: number, ton: 'brand' | 'info' }
}

const kpis = computed<Kpi[]>(() => {
  const p = projet.value
  if (!p) return []
  if (p.statut === 'inscriptions_ouvertes') {
    const requis = p.souscripteursRequis
    const signes = inscrits.value - p.nbSignaturesAttendues
    return [
      { libelle: 'Remplissage', valeur: requis ? `${p.nbSouscripteurs} / ${requis}` : String(p.nbSouscripteurs), detail: 'souscripteurs inscrits', detailMobile: 'inscrits', barre: requis ? { valeur: (inscrits.value / requis) * 100, ton: 'info' } : undefined },
      { libelle: 'Contrats signés', valeur: String(signes), detail: `sur ${pluriel(inscrits.value, 'inscrit')}`, detailMobile: `sur ${inscrits.value}` },
      { libelle: 'Places restantes', valeur: requis ? String(Math.max(0, requis - inscrits.value)) : '—', detail: requis ? 'avant démarrage' : 'sans limite' },
      {
        libelle: 'Démarrage',
        valeur: estDate(p.dateDebut) ? formatMois(p.dateDebut, 'court-annee') : '—',
        detail: estDate(p.dateDebut) ? `première échéance le ${new Date(p.dateDebut).getDate()}` : '',
        detailMobile: estDate(p.dateDebut) ? `le ${new Date(p.dateDebut).getDate()}` : '',
      },
    ]
  }
  if (p.statut === 'termine') {
    return [
      { libelle: 'Total collecté', valeur: formatFCFA(p.montantCollecte), detail: `sur ${formatFCFA(p.montantAttenduADate)} attendus`, detailMobile: `sur ${formatFCFA(p.montantAttenduADate)}`, barre: { valeur: 100, ton: 'brand' } },
      { libelle: 'Taux de recouvrement final', libelleMobile: 'Recouvrement', valeur: formatPourcent(p.tauxRecouvrement), detail: p.nbEcheances ? pluriel(p.nbEcheances, 'échéance') : '', tonDetail: 'up' },
      { libelle: 'Souscripteurs', valeur: String(p.nbSouscripteurs), detail: 'tous soldés' },
      {
        libelle: 'Durée',
        valeur: p.nbEcheances && p.frequence === 'mensuelle' ? `${p.nbEcheances} mois` : pluriel(p.nbEcheances ?? 0, 'échéance'),
        detail: estDate(p.dateDebut) && estDate(p.dateFin) ? `${formatMois(p.dateDebut).toLowerCase()} → ${formatMois(p.dateFin).toLowerCase()}` : '',
      },
    ]
  }
  const collecte = typeof p.montantCollecte === 'number' && typeof p.montantAttenduADate === 'number' && p.montantAttenduADate
    ? (p.montantCollecte / p.montantAttenduADate) * 100
    : 0
  return [
    { libelle: 'Collecté / attendu à date', libelleMobile: 'Collecté à date', valeur: formatFCFA(p.montantCollecte), detail: `sur ${formatFCFA(p.montantAttenduADate)} attendus à date`, detailMobile: `sur ${formatFCFA(p.montantAttenduADate)}`, barre: { valeur: collecte, ton: 'brand' } },
    { libelle: 'Taux de recouvrement', libelleMobile: 'Recouvrement', valeur: formatPourcent(p.tauxRecouvrement), detail: 'des échéances échues', detailMobile: 'échéances échues', tonDetail: 'up' },
    p.nbEnRetard
      ? { libelle: 'En retard', valeur: String(p.nbEnRetard), detail: 'souscripteurs · [MONTANT] F dus', detailMobile: '[MONTANT] F dus', tonDetail: 'bad', danger: true }
      : { libelle: 'En retard', valeur: '0', detail: 'aucun souscripteur' },
    {
      libelle: 'Prochaine échéance',
      valeur: estDate(p.prochaineEcheance) ? formatDate(p.prochaineEcheance, 'jour-mois') : '—',
      detail: `${formatFCFA(inscrits.value * p.montantEcheance)} attendus`,
    },
  ]
})

// ---------------------------------------------------------------- Points à traiter
const retardataires = computed(() => synthese.value?.retardataires ?? [])
const aucunRetard = computed(() => !pending.value && retardataires.value.length === 0 && (projet.value?.nbEnRetard ?? 0) === 0)
const pire = computed(() => retardataires.value[0])
const moisRetard = (r: Retardataire) => r.mois.length > 1 ? `${r.mois.slice(0, -1).join(', ')} et ${r.mois.at(-1)}` : r.mois[0]
const anciennete = computed(() => {
  const d = synthese.value?.paiementsAValider.plusAncienLe
  return d ? formatRelatif(d, { style: 'long' }).replace(/^il y a /, '') : undefined
})

// ---------------------------------------------------------------- Collecte
const collecte = computed(() => synthese.value?.collecte ?? [])
const indexCourant = computed(() => collecte.value.findIndex(m => m.enCours))
const barresDesktop = computed(() => collecte.value.map((m, i) => ({
  label: i === indexCourant.value ? formatMois(m.mois, 'court') : `${formatMois(m.mois, 'court')} ${m.mois.slice(2, 4)}`,
  attendu: m.attendu,
  recu: m.recu,
  enCours: m.enCours,
})))
const etiquettes = computed(() => {
  const n = collecte.value.length
  return [...new Set([0, indexCourant.value, 12, n - 1].filter(i => i >= 0 && i < n))]
})
const barresMobile = computed(() => collecte.value.map((m, i) => ({
  label: formatMois(m.mois, 'court'),
  ratio: m.attendu ? m.recu / m.attendu : 0,
  enCours: m.enCours,
  aVenir: m.recu === 0 && (indexCourant.value < 0 || i > indexCourant.value),
})))
const periode = computed(() => {
  const c = collecte.value
  return c.length ? { debut: formatMois(c[0]!.mois).toLowerCase(), fin: formatMois(c.at(-1)!.mois).toLowerCase() } : null
})
const moisCourant = computed(() => (indexCourant.value >= 0 ? formatMois(collecte.value[indexCourant.value]!.mois, 'seul') : null))

// ---------------------------------------------------------------- Relances
function relancerRetardataire(r: Retardataire) {
  relancer([r.souscripteurId], { nom: r.nom })
}
</script>

<template>
  <div
    v-if="projet"
    class="apercu"
  >
    <CzAlert
      v-if="projet.statut === 'termine'"
      ton="info"
    >
      <b>Projet terminé<template v-if="estDate(projet.dateFin)"> le {{ formatDate(projet.dateFin, 'long') }}</template>.</b> Voici le bilan final de la collecte.
    </CzAlert>

    <!-- KPI -->
    <div class="apercu__kpis cz-desktop">
      <CzKpi
        v-for="k in kpis"
        :key="k.libelle"
        :libelle="k.libelle"
        :ton-detail="k.tonDetail"
      >
        <template #valeur>
          <span :class="{ apercu__danger: k.danger }">{{ k.valeur }}</span>
        </template>
        <template #detail>
          <CzProgress
            v-if="k.barre"
            :valeur="k.barre.valeur"
            :ton="k.barre.ton"
            :label="k.libelle"
            class="apercu__barre"
          />
          {{ k.detail }}
        </template>
      </CzKpi>
    </div>
    <div class="apercu__kpis-mobile cz-mobile">
      <CzKpi
        v-for="k in kpis"
        :key="k.libelle"
        :libelle="k.libelleMobile ?? k.libelle"
        :detail="k.detailMobile ?? k.detail"
        :ton-detail="k.tonDetail"
      >
        <template #valeur>
          <span :class="{ apercu__danger: k.danger }">{{ k.valeur }}</span>
        </template>
      </CzKpi>
    </div>

    <!-- Points à traiter -->
    <div
      v-if="synthese && !aucunRetard"
      class="apercu__alertes cz-desktop"
    >
      <CzAlert
        v-if="pire"
        ton="danger"
      >
        <b>{{ pire.nom }}</b> a {{ pluriel(pire.nbEcheances, 'échéance') }} en retard ({{ moisRetard(pire) }}).
        <template #action>
          <CzButton
            variante="secondaire"
            taille="sm"
            :to="`/asso/souscripteurs/${pire.souscripteurId}`"
          >
            Voir la fiche
          </CzButton>
        </template>
      </CzAlert>
      <CzAlert
        v-if="synthese.paiementsAValider.nombre"
        ton="warning"
        icone="en-attente"
      >
        <b>{{ pluriel(synthese.paiementsAValider.nombre, 'paiement') }} à valider</b> sur ce projet{{ anciennete ? `, le plus ancien depuis ${anciennete}` : '' }}.
        <template #action>
          <CzButton
            variante="secondaire"
            taille="sm"
            :to="`${base}/paiements`"
          >
            Traiter
          </CzButton>
        </template>
      </CzAlert>
      <CzAlert
        v-if="synthese.contratsNonSignes.length"
        ton="warning"
        icone="contrat"
      >
        <b>{{ pluriel(synthese.contratsNonSignes.length, 'contrat') }} {{ synthese.contratsNonSignes.length > 1 ? 'non signés' : 'non signé' }}</b>
        — {{ synthese.contratsNonSignes.map(c => estDate(c.inscritLe) ? `${c.nom}, inscription le ${formatDate(c.inscritLe, 'numerique')}` : c.nom).join(' ; ') }}.
        <template #action>
          <CzButton
            variante="secondaire"
            taille="sm"
            :to="`${base}/contrat`"
          >
            Voir
          </CzButton>
        </template>
      </CzAlert>
    </div>
    <CzAlert
      v-if="aucunRetard"
      ton="success"
      class="cz-desktop"
    >
      <b>Tous vos souscripteurs sont à jour.</b> Aucun retard sur ce projet.
    </CzAlert>

    <CzErreurChargement
      v-if="error"
      titre="Impossible d’afficher la synthèse du projet"
      @reessayer="refresh()"
    />

    <!-- Collecte + retardataires (desktop) -->
    <div
      v-else
      class="apercu__bas cz-desktop"
    >
      <CzCard class="apercu__carte">
        <div class="apercu__carte-entete">
          <h2 class="apercu__h2">
            Collecte par échéance
          </h2>
          <span
            v-if="periode"
            class="apercu__muted"
          >attendu vs reçu · {{ periode.debut }} → {{ periode.fin }}</span>
        </div>
        <CzSkeleton
          v-if="pending && !synthese"
          :hauteur="160"
        />
        <GraphiqueCollecte
          v-else-if="barresDesktop.length"
          :mois="barresDesktop"
          :etiquettes="etiquettes"
          :largeur-vue="640"
          label="Collecte par échéance, attendu et reçu"
        >
          <template #legende>
            <span v-if="moisCourant">{{ moisCourant }} en cours en transparence</span>
          </template>
        </GraphiqueCollecte>
        <CzEmpty
          v-else
          icone="echeance"
          ton="neutral"
          titre="Collecte pas encore commencée"
          :description="estDate(projet.dateDebut) ? `Première échéance le ${formatDate(projet.dateDebut, 'long')}.` : undefined"
          integre
        />
      </CzCard>
      <CzCard class="apercu__carte">
        <h2 class="apercu__h2">
          Retardataires
        </h2>
        <CzSkeleton
          v-if="pending && !synthese"
          :hauteur="160"
        />
        <template v-else-if="retardataires.length">
          <ListeRetardataires
            :retardataires="retardataires.slice(0, 5)"
            :relances="relances"
            :envoi="envoi"
            @relancer="relancerRetardataire"
          />
          <NuxtLink
            :to="{ path: `${base}/souscripteurs`, query: { statut: 'en_retard' } }"
            class="apercu__lien"
          >
            Voir les {{ projet.nbEnRetard }} souscripteurs en retard →
          </NuxtLink>
        </template>
        <CzEmpty
          v-else
          icone="valide"
          ton="success"
          titre="Aucun retard"
          integre
        />
      </CzCard>
    </div>

    <!-- Mobile -->
    <template v-if="!error">
      <CzCard class="apercu__carte cz-mobile">
        <div class="apercu__carte-entete">
          <h2 class="apercu__h2">
            Recouvrement par échéance
          </h2>
          <span
            v-if="projet.nbEcheances"
            class="apercu__muted"
          >{{ projet.frequence === 'mensuelle' ? `${projet.nbEcheances} mois` : pluriel(projet.nbEcheances, 'échéance') }}</span>
        </div>
        <BarresEcheances
          v-if="barresMobile.length"
          :barres="barresMobile"
          :debut="periode?.debut"
          :fin="periode?.fin"
          label="Recouvrement par échéance"
        />
        <p
          v-else
          class="apercu__muted"
        >
          La collecte n’a pas encore commencé.
        </p>
      </CzCard>
      <template v-if="retardataires.length">
        <div class="apercu__section cz-mobile">
          <h2 class="apercu__h2">
            En retard
          </h2>
          <NuxtLink
            :to="{ path: `${base}/souscripteurs`, query: { statut: 'en_retard' } }"
            class="apercu__lien"
          >
            Tous ({{ projet.nbEnRetard }})
          </NuxtLink>
        </div>
        <CzCard class="apercu__liste-mobile cz-mobile">
          <ListeRetardataires
            :retardataires="retardataires.slice(0, 5)"
            :relances="relances"
            :envoi="envoi"
            @relancer="relancerRetardataire"
          />
        </CzCard>
      </template>
      <CzAlert
        v-else-if="aucunRetard"
        ton="success"
        sans-icone
        class="cz-mobile"
      >
        Aucun souscripteur en retard sur ce projet.
      </CzAlert>
      <nav
        class="apercu__raccourcis cz-mobile"
        aria-label="Raccourcis du projet"
      >
        <NuxtLink :to="`${base}/paiements`">
          Grille des paiements<CzIcon nom="chevron-droite" />
        </NuxtLink>
        <NuxtLink
          v-if="projet.nbPaiementsAValider"
          :to="`${base}/paiements`"
        >
          {{ pluriel(projet.nbPaiementsAValider, 'paiement') }} à valider<CzCount
            :valeur="projet.nbPaiementsAValider"
            ton="danger"
          />
        </NuxtLink>
        <NuxtLink :to="`${base}/rapports`">
          Exporter un rapport<CzIcon nom="chevron-droite" />
        </NuxtLink>
      </nav>
    </template>
  </div>
</template>

<style scoped>
.apercu {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.apercu__kpis {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-4);
}

.apercu__kpis-mobile {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3);
}

.apercu__kpis-mobile :deep(.v) {
  font-size: 20px;
}

.apercu__danger {
  color: var(--danger-fg);
}

.apercu__kpis :deep(.d) {
  flex-wrap: wrap;
}

.apercu__barre {
  flex-basis: 100%;
  margin: var(--space-2) 0 6px;
}

.apercu__alertes {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.apercu__bas {
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr);
  gap: var(--space-4);
  align-items: start;
}

.apercu__carte {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.apercu__carte-entete {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-3);
}

.apercu__h2 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 600;
  color: var(--text-strong);
}

.apercu__muted {
  margin: 0;
  font-size: 12px;
  color: var(--text-muted);
}

.apercu__lien {
  font-size: 13px;
  font-weight: 600;
  color: var(--brand-dark);
  text-decoration: none;
}

.apercu__section {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.apercu__liste-mobile {
  padding: 0;
}

.apercu__raccourcis {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: var(--r-card);
  background: var(--surface);
  box-shadow: var(--shadow);
}

.apercu__raccourcis a {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 56px;
  padding: var(--space-2) var(--space-4);
  border-bottom: 1px solid var(--divider);
  font-size: 14px;
  color: var(--text);
  text-decoration: none;
}

.apercu__raccourcis a:last-child {
  border-bottom: 0;
}

.apercu__raccourcis a:focus-visible {
  outline: none;
  box-shadow: inset var(--focus-ring);
}

@media (max-width: 1023px) {
  .apercu__kpis {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .apercu__bas {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 767px) {
  .apercu {
    gap: var(--space-4);
  }

  .apercu__section .apercu__lien {
    font-size: 13.5px;
  }
}
</style>
