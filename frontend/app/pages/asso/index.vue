<!--
  MgDashboard — tableau de bord gestionnaire : « Qu'est-ce que je dois faire aujourd'hui ? » puis
  « Comment se portent mes projets ? ». Fixe le style de l'espace gestionnaire.
  Desktop : en-tête, à faire (paiements à valider, contrats non signés depuis plus de 7 jours, sinon « Tout est à jour »),
  4 KPI cliquables, projets triés par retards + carte « Nouveau projet », collecte sur 6 mois, derniers paiements déclarés.
  Mobile : carte d'action « à valider », 4 KPI en 2 × 2, projets en cours (cartes compactes), dernières déclarations.
  Scénarios : `premier-usage`, `tout-est-a-jour` (+ `chargement`, `erreur`).
-->
<script setup lang="ts">
import type { Projet } from '~~/types'
import { maintenant } from '~/utils/date-reference'
import { formatDate, formatFCFA, formatMois, formatPourcent, formatRelatif, pluriel } from '~/utils/format'
import {
  alerteProjet,
  avancementProjet,
  echeancePied,
  lienProjetGestionnaire,
  proprietesCarteProjet,
  trierParRetards,
} from '~/utils/projets-gestionnaire'

definePageMeta({ middleware: 'espace-gestionnaire', layout: 'backoffice', espace: 'gestionnaire', titre: 'Tableau de bord' })
useHead({ title: 'Tableau de bord · Cotiz' })

const { data: moi } = useMoi()
const { data: tdb, pending, error, refresh } = useTableauDeBordGestionnaire()
const { data: projetsBruts, pending: projetsEnCours, error: erreurProjets, refresh: rechargerProjets } = useProjets()
const { data: aValider, pending: paiementsEnCours, error: erreurPaiements, refresh: rechargerPaiements } = usePaiements({ statut: 'en_attente' })

const titre = computed(() => (moi.value ? `Bonjour ${moi.value.prenom}` : 'Bonjour'))
const nomAssociation = computed(() => tdb.value?.association.nom ?? '')
const sousTitre = computed(() => [nomAssociation.value, formatDate(maintenant(), 'complet')].filter(Boolean).join(' · '))

const chargement = computed(() => (pending.value && !tdb.value) || (projetsEnCours.value && !projetsBruts.value))
const projets = computed(() => trierParRetards(projetsBruts.value ?? []))
/** Tableau de bord ou projets indisponibles : état d'erreur (et non « aucun projet »). */
const enErreur = computed(() => Boolean(error.value || erreurProjets.value))
const premierUsage = computed(() => !chargement.value && !enErreur.value && projets.value.length === 0)
const enCours = computed(() => projets.value.filter(p => p.statut === 'en_cours'))

/** Derniers paiements déclarés : les 5 plus anciens de la file, dans l'ordre de traitement. */
const recents = computed(() => [...(aValider.value ?? [])].sort((a, b) => a.declareLe.localeCompare(b.declareLe)).slice(0, 5))

const anciennete = computed(() => {
  const d = tdb.value?.paiementsAValider.plusAncienLe
  return d ? formatRelatif(d, { style: 'long' }).replace(/^il y a /, '') : undefined
})

const alerteContrats = computed(() => {
  const liste = tdb.value?.contratsNonSignes ?? []
  if (!liste.length) return undefined
  const noms = liste.map(c => `${c.nomSouscripteur}, ${c.nomProjet}`).join(' ; ')
  return {
    titre: `${pluriel(liste.length, 'contrat')} ${liste.length > 1 ? 'non signés' : 'non signé'} depuis plus de 7 jours`,
    detail: noms,
    to: `/asso/projets/${liste[0]!.projetId}/souscripteurs`,
  }
})
const toutAJour = computed(() => tdb.value && !tdb.value.paiementsAValider.nombre && !alerteContrats.value)

/** Rapports : projet de référence (le plus de retards). */
const lienRapports = computed(() => (projets.value[0] ? `${lienProjetGestionnaire(projets.value[0])}/rapports` : '/asso/projets'))

const collecte = computed(() => (tdb.value?.collecteMensuelle ?? []).map(m => ({
  label: formatMois(m.mois, 'court'),
  attendu: m.attendu,
  recu: m.recu,
  enCours: m.enCours,
})))
const moisEnCours = computed(() => tdb.value?.collecteMensuelle.find(m => m.enCours))

function carte(p: Projet) {
  const base = proprietesCarteProjet(p)
  if (p.statut === 'inscriptions_ouvertes') {
    return {
      ...base,
      aidePied: echeancePied(p),
      action: { label: 'Inscrire', variante: 'secondaire' as const, to: `${lienProjetGestionnaire(p)}/souscripteurs` },
    }
  }
  const avatars = p.apercuSouscripteurs ?? []
  return {
    ...base,
    avatars,
    avatarsTotal: typeof p.nbSouscripteurs === 'number' ? p.nbSouscripteurs : undefined,
    avatarsReste: typeof p.nbSouscripteurs === 'number' ? undefined : `+${p.nbSouscripteurs}`,
    aidePied: avatars.length ? undefined : echeancePied(p),
    alerte: alerteProjet(p),
  }
}

/** Carte compacte (mobile) : recouvrement à date quand il est connu, sinon collecté. */
function carteCompacte(p: Projet) {
  const connu = typeof p.montantCollecte === 'number' && typeof p.montantAttenduADate === 'number' && typeof p.tauxRecouvrement === 'number'
  return {
    nom: p.nom,
    alerte: alerteProjet(p),
    progression: connu ? Number(p.tauxRecouvrement) : avancementProjet(p).valeur,
    gauche: connu ? `${formatFCFA(p.montantCollecte)} / ${formatFCFA(p.montantAttenduADate)} à date` : `${formatFCFA(p.montantCollecte)} collectés`,
    droite: formatPourcent(connu ? p.tauxRecouvrement : p.avancement),
    to: lienProjetGestionnaire(p),
  }
}

function reessayer() {
  refresh()
  rechargerProjets()
}
</script>

<template>
  <div class="tdb">
    <EnTeteGestionnaireMobile
      :titre="titre"
      :sous-titre="nomAssociation"
    />
    <EnTetePage
      :titre="titre"
      :sous-titre="sousTitre"
      class="cz-desktop"
    >
      <template #actions>
        <CzButton
          taille="lg"
          icone="ajouter"
          to="/asso/projets/nouveau"
        >
          Créer un projet
        </CzButton>
      </template>
    </EnTetePage>

    <!-- Chargement -->
    <template v-if="chargement">
      <div class="tdb__kpis">
        <CzKpi
          v-for="i in 4"
          :key="i"
          chargement
        />
      </div>
      <div class="tdb__projets">
        <CarteProjet
          v-for="i in 3"
          :key="i"
          chargement
        />
      </div>
    </template>

    <CzEmpty
      v-else-if="enErreur"
      icone="alerte"
      ton="danger"
      titre="Impossible d’afficher le tableau de bord"
      description="Vérifiez votre connexion, puis réessayez."
    >
      <template #action>
        <CzButton
          variante="secondaire"
          @click="reessayer"
        >
          Réessayer
        </CzButton>
      </template>
    </CzEmpty>

    <!-- Premier usage : aucun projet -->
    <template v-else-if="premierUsage">
      <CzEmpty
        icone="projet"
        titre="Aucun projet pour l’instant"
        description="Créez votre premier projet pour commencer à inscrire des souscripteurs."
        class="tdb__premier cz-desktop"
      >
        <template #action>
          <CzButton
            taille="lg"
            to="/asso/projets/nouveau"
          >
            Créer un projet
          </CzButton>
        </template>
      </CzEmpty>
      <CzCard
        variante="lg"
        class="cz-mobile"
      >
        <CzEmpty
          icone="ajouter"
          titre="Créez votre premier projet"
          description="Définissez le fonds d’entrée, les échéances et le contrat, puis ajoutez vos souscripteurs."
          integre
        >
          <template #action>
            <CzButton
              to="/asso/projets/nouveau"
              class="tdb__premier-action"
            >
              Nouveau projet
            </CzButton>
          </template>
        </CzEmpty>
      </CzCard>
    </template>

    <template v-else-if="tdb">
      <!-- À faire (desktop) -->
      <div class="tdb__afaire cz-desktop">
        <CzAlert
          v-if="tdb.paiementsAValider.nombre"
          ton="warning"
          icone="en-attente"
        >
          <b>{{ pluriel(tdb.paiementsAValider.nombre, 'paiement') }} à valider</b>{{ anciennete ? `, le plus ancien depuis ${anciennete}.` : '.' }}
          <template #action>
            <CzButton
              taille="sm"
              to="/asso/paiements"
            >
              Traiter
            </CzButton>
          </template>
        </CzAlert>
        <CzAlert
          v-if="alerteContrats"
          ton="warning"
          icone="contrat"
        >
          <b>{{ alerteContrats.titre }}</b> — {{ alerteContrats.detail }}.
          <template #action>
            <CzButton
              taille="sm"
              variante="secondaire"
              :to="alerteContrats.to"
            >
              Voir
            </CzButton>
          </template>
        </CzAlert>
        <CzAlert
          v-if="toutAJour"
          ton="success"
        >
          <b>Tout est à jour</b> : aucun paiement à valider, tous les contrats sont signés.
        </CzAlert>
      </div>

      <!-- À faire (mobile) -->
      <ActionCard
        v-if="tdb.paiementsAValider.nombre"
        class="cz-mobile"
        icone="paiement"
        :titre="`${pluriel(tdb.paiementsAValider.nombre, 'paiement')} à valider`"
        :description="anciennete ? `Le plus ancien date de ${anciennete}` : undefined"
        to="/asso/paiements"
      />

      <!-- KPI -->
      <div class="tdb__kpis cz-desktop">
        <CzKpi
          icone="paiement"
          libelle="Collecté ce mois"
          :valeur="formatFCFA(tdb.collecteMois.collecte)"
          :detail="`sur ${formatFCFA(tdb.collecteMois.attendu)} attendus`"
          :to="lienRapports"
        />
        <CzKpi
          icone="en-attente"
          ton="warning"
          libelle="Paiements à valider"
          :valeur="tdb.paiementsAValider.nombre"
          :detail="anciennete ? `Le plus ancien : il y a ${anciennete}` : 'Aucun en attente'"
          ton-detail="warn"
          to="/asso/paiements"
        />
        <CzKpi
          icone="alerte"
          ton="danger"
          libelle="Souscripteurs en retard"
          :valeur="tdb.enRetard.nombre"
          :detail="`sur ${tdb.enRetard.actifs} actifs`"
          ton-detail="bad"
          :to="{ path: '/asso/souscripteurs', query: { statut: 'en_retard' } }"
        />
        <CzKpi
          icone="valide"
          ton="success"
          libelle="Taux de recouvrement"
          :valeur="formatPourcent(tdb.tauxRecouvrement)"
          detail="des échéances échues"
          :to="lienRapports"
        />
      </div>
      <div class="tdb__kpis-mobile cz-mobile">
        <CzKpi
          libelle="Collecté ce mois"
          :valeur="formatFCFA(tdb.collecteMois.collecte)"
        />
        <CzKpi
          libelle="Recouvrement"
          :valeur="formatPourcent(tdb.tauxRecouvrement)"
          detail="échéances échues"
          ton-detail="up"
        />
        <CzKpi
          libelle="En retard"
          detail="Relancer →"
          ton-detail="bad"
          to="/asso/relances"
        >
          <template #valeur>
            <span class="tdb__kpi-retard">{{ tdb.enRetard.nombre }}</span>
          </template>
        </CzKpi>
        <CzKpi
          libelle="Souscripteurs"
          :valeur="tdb.nbSouscripteurs"
          :detail="pluriel(tdb.nbProjets, 'projet')"
        />
      </div>

      <!-- Projets -->
      <div class="tdb__section">
        <h2 class="tdb__h2">
          <span class="cz-desktop">Mes projets</span><span class="cz-mobile">Projets en cours</span>
        </h2>
        <NuxtLink
          to="/asso/projets"
          class="tdb__lien"
        >
          <span class="cz-desktop">Tous les projets →</span><span class="cz-mobile">Tout voir</span>
        </NuxtLink>
      </div>
      <div class="tdb__projets cz-desktop">
        <CarteProjet
          v-for="p in projets"
          :key="p.id"
          v-bind="carte(p)"
        />
        <CarteNouveauProjet />
      </div>
      <div class="tdb__liste-mobile cz-mobile">
        <CarteProjetCompacte
          v-for="p in enCours"
          :key="p.id"
          v-bind="carteCompacte(p)"
        />
      </div>

      <!-- Collecte + derniers paiements -->
      <div class="tdb__bas">
        <CzCard class="tdb__carte cz-desktop">
          <div class="tdb__carte-entete">
            <h2 class="tdb__h3">
              Collecte mensuelle — attendu vs reçu
            </h2>
            <span class="tdb__muted">tous projets, 6 mois</span>
          </div>
          <GraphiqueCollecte
            :mois="collecte"
            :libelle-attendu="`Attendu ${formatFCFA(tdb.collecteMois.attendu)} / mois`"
            label="Collecte mensuelle attendue et reçue, 6 derniers mois"
          >
            <template
              v-if="moisEnCours"
              #legende
            >
              <span>{{ formatMois(moisEnCours.mois, 'seul') }} : {{ formatFCFA(moisEnCours.recu) }} (mois en cours)</span>
            </template>
          </GraphiqueCollecte>
        </CzCard>
        <div class="tdb__declarations">
          <div class="tdb__section cz-mobile">
            <h2 class="tdb__h2">
              Dernières déclarations
            </h2>
            <NuxtLink
              to="/asso/paiements"
              class="tdb__lien"
            >
              File
            </NuxtLink>
          </div>
          <CzCard class="tdb__carte tdb__carte--liste">
            <div class="tdb__carte-entete cz-desktop">
              <h2 class="tdb__h3">
                Derniers paiements déclarés
              </h2>
              <NuxtLink
                to="/asso/paiements"
                class="tdb__lien tdb__lien--petit"
              >
                Tout voir
              </NuxtLink>
            </div>
            <div
              v-if="erreurPaiements"
              class="tdb__rien tdb__erreur"
              role="alert"
            >
              <span>Impossible d’afficher les derniers paiements.</span>
              <CzButton
                variante="secondaire"
                taille="sm"
                @click="rechargerPaiements()"
              >
                Réessayer
              </CzButton>
            </div>
            <ListePaiementsRecents
              v-else-if="recents.length || paiementsEnCours"
              :paiements="recents"
              :chargement="paiementsEnCours && !aValider"
            />
            <p
              v-else
              class="tdb__muted tdb__rien"
            >
              Aucun paiement en attente de validation.
            </p>
          </CzCard>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.tdb {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.tdb__afaire {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.tdb__kpis {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-4);
}

.tdb__section {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: calc(-1 * var(--space-2));
}

.tdb__h2 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 600;
  color: var(--text-strong);
}

.tdb__h3 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 600;
  color: var(--text-strong);
}

.tdb__lien {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--brand-dark);
  text-decoration: none;
}

.tdb__lien--petit {
  font-size: 13px;
}

.tdb__lien:hover {
  color: var(--ink-title);
}

.tdb__kpis-mobile {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3);
}

.tdb__liste-mobile,
.tdb__declarations {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.tdb__projets {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-4);
}

.tdb__bas {
  display: grid;
  grid-template-columns: 1.2fr 1fr;
  gap: var(--space-4);
  align-items: start;
}

.tdb__carte {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.tdb__carte-entete {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-3);
}

.tdb__muted {
  font-size: 12px;
  color: var(--text-muted);
}

.tdb__rien {
  margin: 0;
  padding: var(--space-4) 0;
  font-size: 13.5px;
}

.tdb__premier {
  padding: var(--space-12);
}

.tdb__erreur {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  color: var(--danger-fg);
}

.tdb__premier :deep(.i) {
  width: 72px;
  height: 72px;
}

.tdb__premier :deep(.i .cz-icon) {
  width: 32px;
  height: 32px;
}

.tdb__premier :deep(.t) {
  font-size: 20px;
}

.tdb__kpi-retard {
  color: var(--danger-fg);
}

@media (max-width: 1279px) {
  .tdb__projets {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 1023px) {
  .tdb__kpis {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .tdb__projets {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .tdb__bas {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 767px) {
  .tdb {
    gap: var(--space-4);
  }

  .tdb__kpis-mobile :deep(.v) {
    font-size: 20px;
  }

  .tdb__h2 {
    font-size: 16px;
  }

  .tdb__section {
    margin-bottom: 0;
  }

  .tdb__carte--liste {
    padding: 0;
  }

  .tdb__premier-action {
    margin-top: var(--space-2);
  }
}
</style>
