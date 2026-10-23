<!--
  SaAssociation — comprendre la situation complète d'une association et agir dessus.
  En-tête : logo carré, nom, badge de statut, ville · plan · inscrite depuis ; « Se connecter en tant que » (V3) ;
  menu ⋯ (changer de plan, réactiver, suspendre). Bandeau orange si impayée, rouge + « Réactiver » si suspendue.
  Onglets (`?onglet=`) : Vue d'ensemble (KPI, contact principal, abonnement et quotas, événements) · Projets ·
  Souscripteurs (lecture seule) · Abonnement (historique de facturation, changer de plan) · Usage (V2) ·
  Paramètres (comptes gestionnaires autorisés, zone de danger : suspendre, confirmation renforcée).
  Scénarios : `etat-suspendue` (+ `chargement`, `erreur`).
-->
<script setup lang="ts">
import type { ColonneTable } from '~/components/cz/CzTable.vue'
import type { Definition } from '~/components/metier/ListeDefinitions.vue'
import type { ElementMenu } from '~/components/cz/CzMenu.vue'
import type { Onglet } from '~/components/cz/CzTabs.vue'
import type { ChiffreOuPlaceholder, FicheAssociationPlateforme } from '~~/types'
import { formatDate, formatFCFA, formatMois, formatPourcent } from '~/utils/format'
import { STATUTS_ASSOCIATION, STATUTS_FACTURE, STATUTS_PROJET, STATUTS_SOUSCRIPTION } from '~/utils/statuts'

definePageMeta({ middleware: 'espace-plateforme', layout: 'backoffice', espace: 'superadmin', titre: 'Association' })

type CleOnglet = 'apercu' | 'projets' | 'souscripteurs' | 'abonnement' | 'usage' | 'parametres'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const id = computed(() => String(route.params.id))
const { data: fiche, pending, error, refresh } = useFicheAssociation(id)
const { data: plans } = usePlans({ statut: 'actif' })
const { suspendre, reactiver, changerAbonnement } = useActionsAssociationPlateforme()

const f = computed(() => fiche.value)
const a = computed(() => f.value?.association)
useHead({ title: () => `${a.value?.nom ?? 'Association'} · Cotiz` })
useFilAriane(() => [{ label: 'Associations', to: '/plateforme/associations' }, { label: a.value?.nom ?? '…' }])

// ---------------------------------------------------------------- Onglets
const CLES: CleOnglet[] = ['apercu', 'projets', 'souscripteurs', 'abonnement', 'usage', 'parametres']
const onglet = computed<CleOnglet>({
  get: () => (CLES.includes(route.query.onglet as CleOnglet) ? route.query.onglet as CleOnglet : 'apercu'),
  set: v => router.replace({ query: { ...route.query, onglet: v === 'apercu' ? undefined : v } }),
})
const ONGLETS: Onglet[] = [
  { label: 'Vue d’ensemble', valeur: 'apercu' },
  { label: 'Projets', valeur: 'projets' },
  { label: 'Souscripteurs', valeur: 'souscripteurs' },
  { label: 'Abonnement', valeur: 'abonnement' },
  { label: 'Usage', valeur: 'usage', bientot: 'V2' },
  { label: 'Paramètres', valeur: 'parametres' },
]

// ---------------------------------------------------------------- Affichage
const inscriteDepuis = computed(() => (a.value ? formatMois(a.value.creeeLe).toLocaleLowerCase('fr') : ''))
const montant = (v: ChiffreOuPlaceholder) => formatFCFA(v)
const taux = (v: FicheAssociationPlateforme['kpi']['tauxRecouvrement']) => (v === null ? '—' : typeof v === 'number' ? formatPourcent(v) : `${v} %`)
const prix = (v: number | '[PRIX]') => `${formatFCFA(v)} / mois`

const contact = computed<Definition[]>(() => f.value
  ? [
      { cle: 'email', libelle: 'Email', valeur: f.value.contact.email },
      { cle: 'telephone', libelle: 'Téléphone', valeur: f.value.contact.telephone, mono: true },
    ]
  : [])
const abonnement = computed<Definition[]>(() => f.value
  ? [
      { cle: 'plan', libelle: 'Plan', valeur: f.value.plan.nom },
      { cle: 'prix', libelle: 'Prix', valeur: prix(f.value.abonnement.prixMensuel) },
      { cle: 'echeance', libelle: 'Prochaine échéance', valeur: formatDate(f.value.abonnement.prochaineEcheance, 'numerique') },
    ]
  : [])

const COLONNES_PROJETS: ColonneTable[] = [
  { cle: 'nom', label: 'Projet' },
  { cle: 'statut', label: 'Statut', squelette: 'badge' },
  { cle: 'souscripteurs', label: 'Souscripteurs', num: true },
  { cle: 'collecte', label: 'Collecté', num: true },
  { cle: 'creeLe', label: 'Créé le' },
]
const COLONNES_SOUSCRIPTEURS: ColonneTable[] = [
  { cle: 'nom', label: 'Souscripteur' },
  { cle: 'telephone', label: 'Téléphone' },
  { cle: 'projets', label: 'Projets', num: true },
  { cle: 'statut', label: 'Statut', squelette: 'badge' },
]
const COLONNES_FACTURES: ColonneTable[] = [
  { cle: 'periode', label: 'Période' },
  { cle: 'montant', label: 'Montant', num: true },
  { cle: 'statut', label: 'Statut', squelette: 'badge' },
  { cle: 'facture', label: 'Facture' },
]

// ---------------------------------------------------------------- Actions
const envoi = ref(false)
const modaleSuspension = ref(false)
const modalePlan = ref(false)
const planChoisi = ref<string | null>(null)
/** Comptes gestionnaires secondaires autorisés (écran Équipe du gestionnaire : « 2 sur 3 »). */
const comptesActuels = computed(() => f.value?.association.limiteComptesSecondaires ?? Math.max(1, (f.value?.association.nbGestionnaires ?? 1) - 1))
/** Valeur saisie, sinon la limite enregistrée (rendu serveur compris). */
const comptesSaisis = ref<number | null>(null)
const comptes = computed<number>({
  get: () => comptesSaisis.value ?? comptesActuels.value,
  set: v => (comptesSaisis.value = v),
})
const comptesModifies = computed(() => comptes.value !== comptesActuels.value)

const menu = computed<ElementMenu[]>(() => [
  { label: 'Changer de plan', action: ouvrirChangementPlan },
  ...(a.value?.statut === 'suspendue' ? [{ label: 'Réactiver', action: () => lancerReactivation() }] : []),
  { label: 'Suspendre l’association', danger: true, separe: true, disabled: a.value?.statut === 'suspendue', action: () => (modaleSuspension.value = true) },
])

async function executer(action: () => Promise<FicheAssociationPlateforme>, succes: { titre: string, message?: string }) {
  envoi.value = true
  try {
    fiche.value = await action()
    toast.succes(succes.titre, succes.message ? { message: succes.message } : undefined)
    return true
  }
  catch {
    toast.erreur('Action impossible', { message: 'Vérifiez votre connexion, puis réessayez.' })
    return false
  }
  finally {
    envoi.value = false
  }
}

async function lancerSuspension(motif: string, nomSaisi: string) {
  if (!a.value) return
  const nom = a.value.nom
  if (await executer(() => suspendre(id.value, { motif, nomSaisi }), { titre: 'Association suspendue', message: `${nom} n’a plus accès à son espace.` })) {
    modaleSuspension.value = false
  }
}
function lancerReactivation() {
  if (!a.value) return
  const nom = a.value.nom
  return executer(() => reactiver(id.value), { titre: 'Association réactivée', message: `${nom} retrouve l’accès à son espace.` })
}
function ouvrirChangementPlan() {
  planChoisi.value = f.value?.plan.id ?? null
  modalePlan.value = true
}
async function confirmerPlan() {
  if (!planChoisi.value) return
  const nom = plans.value?.find(p => p.id === planChoisi.value)?.nom ?? ''
  if (await executer(() => changerAbonnement(id.value, { planId: planChoisi.value! }), { titre: 'Plan modifié', message: `Nouveau plan : ${nom}.` })) {
    modalePlan.value = false
  }
}
async function enregistrerComptes() {
  const n = comptes.value
  if (await executer(() => changerAbonnement(id.value, { comptesGestionnaires: n }), { titre: 'Limite enregistrée', message: `${n} comptes gestionnaires autorisés.` })) {
    comptesSaisis.value = null
  }
}
function connexionEnTantQue() {
  toast.info('Bientôt disponible', { message: 'La connexion en tant qu’association arrive en V3.' })
}

const introuvable = computed(() => (error.value as { statusCode?: number } | null)?.statusCode === 404)
</script>

<template>
  <div class="sa-asso">
    <!-- Chargement -->
    <template v-if="pending && !f">
      <div class="sa-asso__tete">
        <CzSkeleton
          :largeur="56"
          :hauteur="56"
        />
        <CzSkeleton
          :hauteur="28"
          largeur="40%"
        />
      </div>
      <div class="sa-asso__kpis">
        <CzKpi
          v-for="i in 4"
          :key="i"
          chargement
        />
      </div>
    </template>

    <CzEmpty
      v-else-if="introuvable"
      icone="association"
      ton="neutral"
      titre="Association introuvable"
      description="Cette association n’existe pas ou a été supprimée."
    >
      <template #action>
        <CzButton
          variante="secondaire"
          to="/plateforme/associations"
        >
          Retour aux associations
        </CzButton>
      </template>
    </CzEmpty>

    <CzErreurChargement
      v-else-if="error || !f || !a"
      titre="Impossible d’afficher l’association"
      @reessayer="refresh()"
    />

    <template v-else>
      <header class="sa-asso__tete">
        <CzAvatar
          :nom="a.nom"
          :initiales="a.sigle"
          org
          ton="sa"
          class="sa-asso__logo"
        />
        <div class="sa-asso__identite">
          <h1 class="sa-asso__titre">
            {{ a.nom }}
            <CzBadge :ton="STATUTS_ASSOCIATION[a.statut].ton">
              {{ STATUTS_ASSOCIATION[a.statut].libelle }}
            </CzBadge>
          </h1>
          <p class="sa-asso__meta">
            {{ a.ville }} · Plan {{ f.plan.nom }} · inscrite depuis {{ inscriteDepuis }}
          </p>
        </div>
        <div class="sa-asso__actions">
          <CzButton
            variante="secondaire"
            title="Disponible en V3"
            @click="connexionEnTantQue"
          >
            Se connecter en tant que <CzSoon petit>
              V3
            </CzSoon>
          </CzButton>
          <CzMenu
            :elements="menu"
            label="Plus d’actions"
          >
            <template #declencheur="{ basculer, attrs }">
              <CzButton
                variante="icone"
                icone="actions"
                label="Plus d’actions"
                v-bind="attrs"
                @click="basculer"
              />
            </template>
          </CzMenu>
        </div>
      </header>

      <CzAlert
        v-if="a.statut === 'impayee' && f.impaye"
        ton="warning"
        icone="en-attente"
        lien="Voir la facturation"
        @lien="onglet = 'abonnement'"
      >
        <b>Abonnement impayé depuis le {{ formatDate(f.impaye.depuis, 'long') }}.</b>
        L’accès sera suspendu le {{ formatDate(f.impaye.suspensionLe, 'jour-mois-long') }} sans régularisation.
      </CzAlert>
      <CzAlert
        v-if="a.statut === 'suspendue'"
        ton="danger"
        icone="rejete"
      >
        <b>Association suspendue le {{ f.suspendueLe ? formatDate(f.suspendueLe, 'numerique') : '—' }}.</b>
        Ses gestionnaires et souscripteurs n’ont plus accès à leur espace.
        <template #action>
          <CzButton
            taille="sm"
            :chargement="envoi"
            @click="lancerReactivation"
          >
            Réactiver
          </CzButton>
        </template>
      </CzAlert>

      <CzTabs
        v-model="onglet"
        :onglets="ONGLETS"
        label="Sections de l’association"
      />

      <!-- Vue d'ensemble -->
      <div
        v-if="onglet === 'apercu'"
        class="sa-asso__section"
      >
        <div class="sa-asso__kpis">
          <CzKpi
            libelle="Projets actifs"
            :valeur="f.kpi.projetsActifs"
          />
          <CzKpi
            libelle="Souscripteurs"
            :valeur="f.kpi.souscripteurs"
          />
          <CzKpi
            libelle="Collecté cumulé"
            :valeur="montant(f.kpi.collecteCumule)"
          />
          <CzKpi
            libelle="Taux de recouvrement"
            :valeur="taux(f.kpi.tauxRecouvrement)"
          />
        </div>
        <div class="sa-asso__cartes">
          <section class="cz-card sa-asso__carte">
            <h2 class="sa-asso__h2">
              Contact principal
            </h2>
            <div class="cz-person sa-asso__contact">
              <CzAvatar
                :nom="f.contact.nom"
                :initiales="f.contact.initiales"
              />
              <div>
                <b>{{ f.contact.nom }}</b>
                <div class="sub">
                  {{ f.contact.role }}
                </div>
              </div>
            </div>
            <ListeDefinitions
              :elements="contact"
              largeur-libelle="144px"
            />
          </section>
          <section class="cz-card sa-asso__carte">
            <h2 class="sa-asso__h2">
              Abonnement
            </h2>
            <ListeDefinitions
              :elements="abonnement"
              largeur-libelle="144px"
            />
            <div class="sa-asso__quotas">
              <BarreQuota
                libelle="Projets"
                :quota="f.quotas.projets"
              />
              <BarreQuota
                libelle="Souscripteurs"
                :quota="f.quotas.souscripteurs"
              />
              <BarreQuota
                libelle="Gestionnaires"
                :quota="f.quotas.gestionnaires"
              />
            </div>
          </section>
          <section class="cz-card sa-asso__carte">
            <h2 class="sa-asso__h2">
              Événements du compte
            </h2>
            <Frise
              :evenements="f.evenements"
              label="Événements du compte"
            />
          </section>
        </div>
      </div>

      <!-- Projets -->
      <CzTable
        v-else-if="onglet === 'projets'"
        :colonnes="COLONNES_PROJETS"
        :lignes="f.projets"
        :cliquable="false"
        label="Projets de l’association"
      >
        <template #cell-nom="{ ligne }">
          <b class="sa-asso__fort">{{ ligne.nom }}</b>
        </template>
        <template #cell-statut="{ ligne }">
          <CzBadge :ton="ligne.statut ? STATUTS_PROJET[ligne.statut].ton : 'neutral'">
            {{ ligne.statut ? STATUTS_PROJET[ligne.statut].libelle : '—' }}
          </CzBadge>
        </template>
        <template #cell-creeLe="{ ligne }">
          <span class="sa-asso__muted">{{ ligne.creeLe }}</span>
        </template>
        <template #vide>
          <CzEmpty
            icone="projet"
            ton="neutral"
            titre="Aucun projet pour l’instant"
            description="Les projets créés par l’association apparaîtront ici."
            integre
          />
        </template>
      </CzTable>

      <!-- Souscripteurs -->
      <CzTable
        v-else-if="onglet === 'souscripteurs'"
        :colonnes="COLONNES_SOUSCRIPTEURS"
        :lignes="f.souscripteurs"
        :cliquable="false"
        label="Souscripteurs de l’association"
      >
        <template #cell-nom="{ ligne }">
          <b class="sa-asso__fort">{{ ligne.nom }}</b>
        </template>
        <template #cell-telephone="{ ligne }">
          <span class="cz-mono">{{ ligne.telephone }}</span>
        </template>
        <template #cell-statut="{ ligne }">
          <CzBadge :ton="ligne.statut ? STATUTS_SOUSCRIPTION[ligne.statut].ton : 'neutral'">
            {{ ligne.statut ? STATUTS_SOUSCRIPTION[ligne.statut].libelle : '—' }}
          </CzBadge>
        </template>
        <template #vide>
          <CzEmpty
            icone="souscripteurs"
            ton="neutral"
            titre="Aucun souscripteur pour l’instant"
            description="Les membres inscrits aux projets de l’association apparaîtront ici."
            integre
          />
        </template>
      </CzTable>

      <!-- Abonnement -->
      <section
        v-else-if="onglet === 'abonnement'"
        class="cz-card sa-asso__carte sa-asso__section"
      >
        <div class="sa-asso__carte-tete">
          <h2 class="sa-asso__h2 sa-asso__h2--seul">
            Historique de facturation
          </h2>
          <CzButton
            variante="secondaire"
            taille="sm"
            @click="ouvrirChangementPlan"
          >
            Changer de plan
          </CzButton>
        </div>
        <CzTable
          :colonnes="COLONNES_FACTURES"
          :lignes="f.factures"
          :cliquable="false"
          label="Historique de facturation"
          class="sa-asso__factures"
        >
          <template #cell-periode="{ ligne }">
            {{ formatMois(ligne.periode) }}
          </template>
          <template #cell-montant="{ ligne }">
            {{ formatFCFA(ligne.montant) }}
          </template>
          <template #cell-statut="{ ligne }">
            <CzBadge :ton="STATUTS_FACTURE[ligne.statut].ton">
              {{ STATUTS_FACTURE[ligne.statut].libelle }}
            </CzBadge>
          </template>
          <template #cell-facture="{ ligne }">
            <span
              v-if="ligne.statut === 'a_venir'"
              class="sa-asso__muted"
            >—</span>
            <CzButton
              v-else
              variante="fantome"
              taille="sm"
              icone="telecharger"
              @click="toast.info('Bientôt disponible', { message: 'Le téléchargement des factures arrive en V2.' })"
            >
              PDF
            </CzButton>
          </template>
        </CzTable>
      </section>

      <!-- Usage (V2) -->
      <section
        v-else-if="onglet === 'usage'"
        class="cz-card sa-asso__carte sa-asso__section"
      >
        <div class="sa-asso__carte-tete sa-asso__carte-tete--gauche">
          <h2 class="sa-asso__h2 sa-asso__h2--seul">
            Usage
          </h2>
          <CzSoon />
        </div>
        <p class="sa-asso__texte">
          Cet onglet montrera les connexions des 30 derniers jours, les paiements traités par mois et le délai moyen de validation des paiements.
        </p>
        <div
          class="sa-asso__usage"
          aria-hidden="true"
        >
          <CzSkeleton
            v-for="i in 3"
            :key="i"
            :hauteur="120"
          />
        </div>
      </section>

      <!-- Paramètres -->
      <div
        v-else
        class="sa-asso__section sa-asso__parametres"
      >
        <section class="cz-card sa-asso__carte">
          <h2 class="sa-asso__h2">
            Comptes gestionnaires autorisés
          </h2>
          <p class="sa-asso__texte sa-asso__texte--aide">
            Surcharge la limite du plan pour cette association.
          </p>
          <div class="sa-asso__comptes">
            <CzCounter
              v-model="comptes"
              :min="1"
              label="Comptes gestionnaires autorisés"
            />
            <CzButton
              v-if="comptesModifies"
              taille="sm"
              :chargement="envoi"
              libelle-chargement="Enregistrement…"
              @click="enregistrerComptes"
            >
              Enregistrer
            </CzButton>
          </div>
        </section>
        <section class="cz-card sa-asso__carte sa-asso__danger">
          <h2 class="sa-asso__h2 sa-asso__h2--danger">
            Zone de danger
          </h2>
          <div class="sa-asso__danger-ligne">
            <div>
              <b>Suspendre l’association</b>
              <div class="sa-asso__muted sa-asso__petit">
                Les gestionnaires et souscripteurs perdent l’accès. Les données sont conservées.
              </div>
            </div>
            <CzButton
              v-if="a.statut === 'suspendue'"
              :chargement="envoi"
              @click="lancerReactivation"
            >
              Réactiver
            </CzButton>
            <CzButton
              v-else
              variante="danger"
              @click="modaleSuspension = true"
            >
              Suspendre
            </CzButton>
          </div>
        </section>
      </div>

      <ModaleSuspensionAssociation
        v-model:ouvert="modaleSuspension"
        :association="a.nom"
        :souscripteurs="a.nbSouscripteurs"
        :envoi="envoi"
        @suspendre="lancerSuspension"
      />
      <CzModal
        v-model:ouvert="modalePlan"
        :titre="`Changer le plan de ${a.nom} ?`"
      >
        <CzField
          label="Nouveau plan"
          aide="Le nouveau plan s’applique à la prochaine échéance d’abonnement."
        >
          <CzSelect
            v-model="planChoisi"
            :options="(plans ?? []).map(p => ({ valeur: p.id, label: p.nom }))"
          />
        </CzField>
        <template #pied>
          <CzButton
            variante="fantome"
            taille="sm"
            @click="modalePlan = false"
          >
            Annuler
          </CzButton>
          <CzButton
            taille="sm"
            :disabled="!planChoisi || planChoisi === f.plan.id"
            :chargement="envoi"
            libelle-chargement="Enregistrement…"
            @click="confirmerPlan"
          >
            Changer de plan
          </CzButton>
        </template>
      </CzModal>
    </template>
  </div>
</template>

<style scoped>
.sa-asso {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.sa-asso__tete {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.sa-asso__logo {
  flex-shrink: 0;
  width: 56px;
  height: 56px;
  font-size: 18px;
}

.sa-asso__identite {
  min-width: 0;
}

.sa-asso__titre {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
  margin: 0;
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 28px;
  color: var(--text-strong);
}

.sa-asso__meta {
  margin: 0;
  font-size: 14px;
  color: var(--text-muted);
}

.sa-asso__actions {
  display: flex;
  gap: var(--space-3);
  margin-left: auto;
}

.sa-asso__section {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.sa-asso__kpis {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-4);
}

.sa-asso__cartes {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-4);
}

.sa-asso__carte {
  min-width: 0;
  padding: var(--space-6);
}

.sa-asso__h2 {
  margin: 0 0 var(--space-4);
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 16px;
  color: var(--text-strong);
}

.sa-asso__h2--seul {
  margin: 0;
}

.sa-asso__h2--danger {
  color: var(--danger-fg);
}

.sa-asso__contact {
  margin-bottom: var(--space-3);
}

.sa-asso__quotas {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin-top: var(--space-4);
}

.sa-asso__carte-tete {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-3);
}

.sa-asso__carte-tete--gauche {
  justify-content: flex-start;
}

.sa-asso__factures :deep(.cz-table-wrap) {
  box-shadow: none;
}

.sa-asso__fort {
  color: var(--text-strong);
}

.sa-asso__muted {
  color: var(--text-muted);
}

.sa-asso__petit {
  font-size: 13px;
}

.sa-asso__texte {
  margin: 0;
  font-size: 14px;
  color: var(--text-muted);
}

.sa-asso__texte--aide {
  margin-bottom: var(--space-3);
  font-size: 13.5px;
}

.sa-asso__usage {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-3);
  opacity: 0.6;
}

.sa-asso__parametres {
  max-width: 760px;
}

.sa-asso__comptes {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.sa-asso__danger {
  border: 1px solid var(--danger);
  box-shadow: none;
}

.sa-asso__danger-ligne {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-4);
  font-size: 14px;
}

@media (max-width: 1023px) {
  .sa-asso__cartes {
    grid-template-columns: minmax(0, 1fr);
  }

  .sa-asso__kpis {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 767px) {
  .sa-asso__tete {
    flex-wrap: wrap;
  }

  .sa-asso__titre {
    font-size: 24px;
  }

  .sa-asso__actions {
    width: 100%;
    margin-left: 0;
  }

  .sa-asso__kpis {
    grid-template-columns: minmax(0, 1fr);
  }

  .sa-asso__danger-ligne {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
