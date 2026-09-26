<!-- Démonstration : Carte, Carte KPI, États vides, Retours, Navigation, Tableau. -->
<script setup lang="ts">
import type { ColonneTable, TriTable } from '~/components/cz/CzTable.vue'
import { formatFCFA } from '~/utils/format'

const toast = useToast()
const selectionCarte = ref(false)

// Navigation
const onglet = ref('vue')
const puce = ref('mois')
const page = ref(1)
const etape = ref(3)

// Tableau
interface LigneDemo extends Record<string, unknown> {
  id: string
  nom: string
  inscrit: string
  telephone: string
  verse: number
  reste: number
  statut: 'a_jour' | 'en_retard' | 'signature_attendue' | 'partielle'
  ton: 'brand' | 'danger' | 'warning'
}
const LIGNES: LigneDemo[] = [
  { id: 'awa', nom: 'Awa Koné', inscrit: 'Inscrite le 12/03/2026', telephone: '+225 07 08 09 10 11', verse: 200000, reste: 300000, statut: 'a_jour', ton: 'brand' },
  { id: 'moussa', nom: 'Moussa Diarra', inscrit: 'Inscrit le 12/03/2026', telephone: '+225 05 44 21 87 90', verse: 175000, reste: 325000, statut: 'en_retard', ton: 'danger' },
  { id: 'fatou', nom: 'Fatou Traoré', inscrit: 'Inscrite le 02/09/2026', telephone: '+225 01 22 33 44 55', verse: 0, reste: 500000, statut: 'signature_attendue', ton: 'warning' },
  { id: 'jean', nom: 'Jean Kouassi', inscrit: 'Inscrit le 12/03/2026', telephone: '+225 07 55 66 77 88', verse: 212500, reste: 287500, statut: 'partielle', ton: 'brand' },
]
const COLONNES: ColonneTable[] = [
  { cle: 'nom', label: 'Souscripteur', triable: true, squelette: 'personne' },
  { cle: 'telephone', label: 'Téléphone' },
  { cle: 'verse', label: 'Versé', num: true, triable: true },
  { cle: 'reste', label: 'Reste', num: true, squelette: 'montant' },
  { cle: 'statut', label: 'Statut', squelette: 'badge' },
  { cle: 'actions', label: '', largeur: '56px' },
]
const selection = ref<string[]>(['fatou'])
const tri = ref<TriTable | null>({ cle: 'nom', sens: 'asc' })
const pageTable = ref(1)
const filtreTable = ref('tous')
const rechercheTable = ref('')
const lignesFiltrees = computed(() => LIGNES.filter(l => !rechercheTable.value || l.nom.toLowerCase().includes(rechercheTable.value.toLowerCase())))

function toastValidation() {
  toast.succes('Paiement validé', {
    message: '3 échéances de Awa Koné sont à jour',
    action: { label: 'Annuler', rappel: () => toast.info('Validation annulée', { message: 'Le paiement est de nouveau en attente' }) },
  })
}
</script>

<template>
  <div class="dev-bloc">
    <DevSection
      id="carte"
      titre="Carte"
      source="CzCard · CzTile"
    >
      <div class="pv pv-stack pv-band dev-sans-rayon">
        <div>
          <div class="pv-h">
            Variantes
          </div>
          <div class="dev-g5">
            <div>
              <CzCard
                titre="Standard"
                sous-titre="Blanc, r-card 16, ombre douce, padding 24 (16–18 sur mobile)."
                class="dev-carte"
              /><div class="pv-cap">
                cz-card
              </div>
            </div>
            <div>
              <CzCard
                variante="flat"
                titre="Contour"
                sous-titre="Bordure border, sans ombre — dans une carte ou un panneau."
                class="dev-carte"
              /><div class="pv-cap">
                --flat
              </div>
            </div>
            <div>
              <CzCard
                variante="tinted"
                class="dev-carte"
              >
                <p class="cz-card-t dev-marque">
                  Teintée
                </p><p class="cz-card-s">
                  Fond brand-pale — tuile d'identité, encart.
                </p>
              </CzCard><div class="pv-cap">
                --tinted
              </div>
            </div>
            <div data-theme="member">
              <CzCard
                variante="lg"
                titre="Grande"
                sous-titre="r-card-lg 18 — espace souscripteur, beaucoup d'air."
                class="dev-carte"
              /><div class="pv-cap">
                --lg
              </div>
            </div>
            <div>
              <CzCard
                variante="ghost"
                to="/_dev/composants#carte"
                class="dev-carte"
              >
                <CzIcon nom="ajouter" />Nouveau projet
              </CzCard><div class="pv-cap">
                --ghost (fin de grille)
              </div>
            </div>
          </div>
        </div>
        <div>
          <div class="pv-h">
            États d'une carte cliquable
          </div>
          <div class="dev-g5">
            <div>
              <CzCard
                cliquable
                titre="Repos"
                sous-titre="shadow"
                class="dev-carte"
              /><div class="pv-cap">
                Repos
              </div>
            </div>
            <div>
              <CzCard
                cliquable
                titre="Survol"
                sous-titre="shadow-hover"
                class="dev-carte is-hover"
              /><div class="pv-cap">
                Survol
              </div>
            </div>
            <div>
              <CzCard
                cliquable
                titre="Focus"
                sous-titre="anneau 3 px brand"
                class="dev-carte is-focus"
              /><div class="pv-cap">
                Focus clavier
              </div>
            </div>
            <div>
              <CzCard
                cliquable
                :selectionnee="!selectionCarte"
                titre="Sélectionnée"
                sous-titre="contour 2 px brand (carte de choix)"
                class="dev-carte"
                @click="selectionCarte = !selectionCarte"
              /><div class="pv-cap">
                Sélectionnée
              </div>
            </div>
            <div>
              <CzCard
                desactivee
                titre="Désactivée"
                sous-titre="opacité 55 %"
                class="dev-carte"
              /><div class="pv-cap">
                Désactivée
              </div>
            </div>
          </div>
        </div>
        <div>
          <div class="pv-h">
            Tuiles de chiffre (charte)
          </div>
          <div class="dev-g4">
            <CzTile
              titre="Cotisations reçues"
              :valeur="formatFCFA(1240000)"
            />
            <CzTile
              ton="success"
              titre="Souscripteurs à jour"
              valeur="38 / 52"
            />
            <CzTile
              ton="danger"
              titre="Retards"
              :valeur="14"
            />
            <CzTile
              ton="warning"
              titre="En attente"
              valeur="1 paiement"
            />
          </div>
        </div>
      </div>
    </DevSection>

    <DevSection
      id="carte-kpi"
      titre="Carte KPI"
      source="CzKpi"
    >
      <div class="pv pv-stack pv-band dev-sans-rayon">
        <div>
          <div class="pv-h">
            Tons — données de référence du tableau de bord gestionnaire
          </div>
          <div class="dev-g4">
            <CzKpi
              icone="paiement"
              libelle="Collecté ce mois"
              :valeur="formatFCFA(1240000)"
              :detail="`sur ${formatFCFA(1300000)} attendus`"
              to="/_dev/composants#carte-kpi"
            />
            <CzKpi
              icone="en-attente"
              ton="warning"
              libelle="Paiements à valider"
              :valeur="6"
              detail="Le plus ancien : il y a 3 jours"
              ton-detail="warn"
              to="/_dev/composants#carte-kpi"
            />
            <CzKpi
              icone="alerte"
              ton="danger"
              libelle="Souscripteurs en retard"
              :valeur="14"
              detail="sur 52 actifs"
              ton-detail="bad"
              to="/_dev/composants#carte-kpi"
            />
            <CzKpi
              icone="valide"
              ton="success"
              libelle="Taux de recouvrement"
              valeur="82 %"
              detail="+12 % vs mois dernier"
              ton-detail="up"
              icone-detail="tendance"
              to="/_dev/composants#carte-kpi"
            />
          </div>
        </div>
        <div>
          <div class="pv-h">
            États
          </div>
          <div class="dev-g4">
            <div>
              <CzKpi
                icone="projet"
                libelle="Projets actifs"
                :valeur="3"
                detail="Entraide Yopougon"
              /><div class="pv-cap">
                Repos
              </div>
            </div>
            <div>
              <CzKpi
                icone="projet"
                libelle="Projets actifs"
                :valeur="3"
                detail="Mène vers la liste filtrée"
                class="is-hover"
              /><div class="pv-cap">
                Survol
              </div>
            </div>
            <div>
              <CzKpi
                icone="projet"
                libelle="Projets actifs"
                :valeur="3"
                detail="Entrée = ouvrir"
                class="is-focus"
              /><div class="pv-cap">
                Focus
              </div>
            </div>
            <div>
              <CzKpi chargement /><div class="pv-cap">
                Chargement
              </div>
            </div>
          </div>
        </div>
        <div class="pv-univ">
          <div data-theme="superadmin">
            <CzKpi
              icone="association"
              libelle="Associations actives"
              :valeur="147"
              detail="+6 ce mois"
              ton-detail="up"
              icone-detail="tendance"
            />
          </div>
          <div data-theme="manager">
            <CzKpi
              icone="souscripteurs"
              libelle="Souscripteurs"
              :valeur="52"
              detail="sur 3 projets"
            />
          </div>
          <div data-theme="member">
            <CzKpi
              icone="echeance"
              libelle="Prochaine échéance"
              :valeur="formatFCFA(25000)"
              detail="le 5 octobre"
            />
          </div>
        </div>
      </div>
    </DevSection>

    <DevSection
      id="etats-vides"
      titre="États vides"
      source="CzEmpty · CzSkeleton · CzSoon"
    >
      <div class="pv pv-stack pv-band dev-sans-rayon">
        <div class="dev-g5 dev-vides">
          <CzEmpty
            icone="projet"
            titre="Aucun projet pour l'instant"
            description="Créez votre premier projet pour commencer à inscrire des souscripteurs."
          >
            <template #action>
              <CzButton taille="sm">
                Créer un projet
              </CzButton>
            </template>
          </CzEmpty>
          <CzEmpty
            icone="valide"
            ton="success"
            titre="Rien à valider"
            description="Tous les paiements déclarés ont été traités."
          />
          <CzEmpty
            icone="recherche"
            ton="neutral"
            titre="Aucun résultat"
            description="Aucun souscripteur ne correspond à « Kouadio »."
          >
            <template #action>
              <CzButton
                variante="fantome"
                taille="sm"
              >
                Effacer la recherche
              </CzButton>
            </template>
          </CzEmpty>
          <CzEmpty
            icone="alerte"
            ton="danger"
            titre="Une erreur est survenue"
            description="Nous n'avons pas pu charger les relances."
          >
            <template #action>
              <CzButton
                variante="secondaire"
                taille="sm"
              >
                Réessayer
              </CzButton>
            </template>
          </CzEmpty>
          <CzEmpty
            icone="relance"
            bientot
            description="Les relances automatiques par SMS et WhatsApp arrivent en V2."
          />
        </div>
        <div>
          <div class="pv-h">
            Chargement — squelettes à la forme du contenu, jamais de spinner plein écran
          </div>
          <div class="pv-row">
            <CzKpi
              chargement
              class="dev-l220"
            />
            <div class="cz-card dev-skel-carte">
              <CzSkeleton
                :hauteur="14"
                largeur="70%"
              />
              <CzSkeleton
                :hauteur="10"
                largeur="45%"
                class="dev-mt8"
              />
              <CzSkeleton
                :hauteur="8"
                forme="pilule"
                class="dev-mt16"
              />
              <CzSkeleton
                :hauteur="10"
                largeur="55%"
                class="dev-mt8"
              />
            </div>
            <div class="cz-card dev-skel-texte">
              <CzSkeleton
                :hauteur="14"
                class="dev-mb12"
              />
              <CzSkeleton
                :hauteur="14"
                largeur="90%"
                class="dev-mb12"
              />
              <CzSkeleton
                :hauteur="14"
                largeur="75%"
              />
            </div>
          </div>
        </div>
      </div>
    </DevSection>

    <DevSection
      id="retours"
      titre="Retours"
      source="CzToast · useToast · CzAlert"
    >
      <div class="pv pv-stack">
        <div>
          <div class="pv-h">
            Toasts — bas droite desktop, haut mobile, 5 s, pause au survol
          </div>
          <div class="pv-row">
            <CzToast
              titre="Paiement validé"
              message="3 échéances de Awa Koné sont à jour"
              action="Annuler"
            />
            <CzToast
              ton="danger"
              titre="Envoi impossible"
              message="Vérifiez votre connexion et réessayez"
              action="Réessayer"
            />
            <CzToast
              ton="warning"
              titre="Déclaration envoyée"
              message="En attente de validation par l'association"
            />
            <CzToast
              ton="info"
              titre="Relance programmée"
              message="14 souscripteurs recevront un SMS demain"
            />
          </div>
          <div class="pv-row center dev-mt16">
            <CzButton
              variante="secondaire"
              taille="sm"
              @click="toastValidation"
            >
              Déclencher un toast (avec « Annuler »)
            </CzButton>
            <CzButton
              variante="secondaire"
              taille="sm"
              @click="toast.erreur('Envoi impossible', { message: 'Vérifiez votre connexion et réessayez' })"
            >
              Toast d'erreur
            </CzButton>
          </div>
        </div>
        <div>
          <div class="pv-h">
            Bandeaux d'alerte
          </div>
          <div class="pv-stack dev-g10">
            <CzAlert
              ton="warning"
              lien="Les traiter"
              to="/_dev/composants#retours"
            >
              <b>6 paiements attendent votre validation</b>, dont 2 depuis plus de 5 jours.
            </CzAlert>
            <CzAlert
              ton="danger"
              lien="Régulariser"
              to="/_dev/composants#retours"
            >
              <b>Votre abonnement est impayé.</b> L'accès sera suspendu le 10 octobre.
            </CzAlert>
            <CzAlert ton="info">
              Ce contrat ne peut plus être modifié : 12 souscripteurs l'ont déjà signé.
            </CzAlert>
            <CzAlert ton="success">
              <b>Tous vos souscripteurs sont à jour.</b> Aucun retard sur ce projet.
            </CzAlert>
            <CzAlert
              ton="warning"
              icone="en-attente"
            >
              <b>6 paiements à valider</b>, le plus ancien depuis 3 jours.
              <template #action>
                <CzButton taille="sm">
                  Traiter
                </CzButton>
              </template>
            </CzAlert>
          </div>
        </div>
      </div>
    </DevSection>

    <DevSection
      id="navigation"
      titre="Navigation"
      source="CzTabs · CzSteps · CzCrumb · CzChip(s) · CzPagination"
    >
      <div class="pv pv-stack">
        <div>
          <div class="pv-h">
            Onglets de page — actif, compteur d'action, désactivé
          </div>
          <CzTabs
            v-model="onglet"
            label="Onglets de démonstration"
            :onglets="[
              { label: 'Vue d\'ensemble', valeur: 'vue' },
              { label: 'Souscripteurs', valeur: 'souscripteurs', compteur: 52, tonCompteur: 'neutral' },
              { label: 'Paiements', valeur: 'paiements', compteur: 6 },
              { label: 'Paramètres', valeur: 'parametres' },
              { label: 'Rapports', valeur: 'rapports' },
              { label: 'Contrat', valeur: 'contrat', disabled: true, bientot: true },
            ]"
          />
          <div class="cz-help dev-mt8">
            Onglets liés à la route : <code>{ label, to }</code> — l'onglet actif suit l'URL.
          </div>
        </div>
        <div class="pv-univ">
          <div
            data-theme="superadmin"
            class="dev-surface"
          >
            <CzTabs
              model-value="i"
              :onglets="[{ label: 'Informations', valeur: 'i' }, { label: 'Usage', valeur: 'u' }, { label: 'Facturation', valeur: 'f' }]"
            />
          </div>
          <div
            data-theme="manager"
            class="dev-surface"
          >
            <CzTabs
              model-value="v"
              :onglets="[{ label: 'Vue d\'ensemble', valeur: 'v' }, { label: 'Paiements', valeur: 'p', compteur: 6 }]"
            />
          </div>
          <div
            data-theme="member"
            class="dev-surface"
          >
            <CzTabs
              model-value="e"
              :onglets="[{ label: 'Échéancier', valeur: 'e' }, { label: 'Paiements', valeur: 'p' }, { label: 'Contrat', valeur: 'c' }]"
            />
          </div>
        </div>
        <div>
          <div class="pv-h">
            Indicateur d'étapes — terminée, en cours, à venir, en erreur
          </div>
          <CzSteps
            :etapes="['Informations', 'Financement', 'Calendrier', 'Paiement', 'Contrat', 'Récapitulatif']"
            :courante="etape"
            :erreurs="[4]"
            @aller="etape = $event"
          />
          <div class="pv-row center dev-mt16">
            <CzButton
              variante="secondaire"
              taille="sm"
              :disabled="etape >= 6"
              @click="etape++"
            >
              Étape suivante
            </CzButton>
            <span class="cz-help">Sous 768 px : « Étape 3 sur 6 — Calendrier » + barre de progression</span>
          </div>
        </div>
        <div class="pv-row dev-g40">
          <div>
            <div class="pv-h">
              Fil d'Ariane
            </div>
            <CzCrumb :elements="[{ label: 'Projets', to: '/_dev/composants' }, { label: 'Centre communautaire', to: '/_dev/composants' }, { label: 'Paiements' }]" />
          </div>
          <div>
            <div class="pv-h">
              Puces de filtre
            </div>
            <div class="pv-row center dev-g8">
              <CzChip
                actif
                retirable
              >
                Ce mois
              </CzChip>
              <CzChip>Repos</CzChip>
              <CzChip class="is-hover">
                Survol
              </CzChip>
              <CzChip class="is-focus">
                Focus
              </CzChip>
              <CzChip disabled>
                Désactivée
              </CzChip>
              <CzChip icone="ajouter">
                Filtre
              </CzChip>
            </div>
            <CzChips
              v-model="puce"
              class="dev-mt8"
              label="Période"
              :options="[{ valeur: 'mois', label: 'Ce mois' }, { valeur: 'trimestre', label: 'Ce trimestre' }, { valeur: 'annee', label: 'Cette année' }]"
            />
          </div>
          <div>
            <div class="pv-h">
              Pagination
            </div>
            <CzPagination
              v-model:page="page"
              :pages="8"
            />
          </div>
        </div>
      </div>
    </DevSection>

    <DevSection
      id="tableau"
      titre="Tableau"
      source="CzTable"
    >
      <div class="pv pv-stack pv-band dev-sans-rayon">
        <div class="cz-toolbar">
          <CzInput
            v-model="rechercheTable"
            type="search"
            placeholder="Nom, téléphone…"
            label="Rechercher un souscripteur"
            class="dev-l240"
          />
          <CzChips
            v-model="filtreTable"
            label="Filtrer"
            :options="[
              { valeur: 'tous', label: 'Tous', compteur: 52 },
              { valeur: 'retard', label: 'En retard', compteur: 14 },
              { valeur: 'signature', label: 'Signature attendue', compteur: 3 },
            ]"
          >
            <CzChip icone="filtre">
              Filtre
            </CzChip>
          </CzChips>
          <div class="end">
            <CzButton
              variante="secondaire"
              taille="sm"
              icone="telecharger"
            >
              Exporter
            </CzButton>
            <CzButton
              taille="sm"
              icone="ajouter"
            >
              Ajouter
            </CzButton>
          </div>
        </div>
        <CzTable
          v-model:selection="selection"
          v-model:tri="tri"
          v-model:page="pageTable"
          :colonnes="COLONNES"
          :lignes="lignesFiltrees"
          selectionnable
          :total="52"
          label="Souscripteurs du projet"
        >
          <template #actions-groupees>
            <CzButton
              variante="secondaire"
              taille="sm"
              icone="relance"
            >
              Relancer
            </CzButton>
            <CzButton
              variante="fantome"
              taille="sm"
            >
              Exporter
            </CzButton>
          </template>
          <template #cell-nom="{ ligne }">
            <div class="cz-person">
              <CzAvatar
                :nom="ligne.nom"
                taille="sm"
                :ton="ligne.ton"
              />
              <div>
                <b>{{ ligne.nom }}</b>
                <div class="sub">
                  {{ ligne.inscrit }}
                </div>
              </div>
            </div>
          </template>
          <template #cell-telephone="{ ligne }">
            <span class="cz-mono">{{ ligne.telephone }}</span>
          </template>
          <template #cell-verse="{ ligne }">
            {{ formatFCFA(ligne.verse) }}
          </template>
          <template #cell-reste="{ ligne }">
            <span :class="{ strong: ligne.statut === 'en_retard' }">{{ formatFCFA(ligne.reste) }}</span>
          </template>
          <template #cell-statut="{ ligne }">
            <BadgeStatut
              v-if="ligne.statut === 'partielle'"
              type="echeance"
              statut="partielle"
            />
            <BadgeStatut
              v-else
              type="souscription"
              :statut="ligne.statut"
              :complement="ligne.statut === 'en_retard' ? 2 : undefined"
            />
          </template>
          <template #cell-actions>
            <CzMenu
              :elements="[
                { label: 'Voir la fiche', icone: 'voir' },
                { label: 'Envoyer une relance', icone: 'relance' },
                { label: 'Modifier', icone: 'modifier' },
                { label: 'Renvoyer le contrat', icone: 'contrat', disabled: true },
                { label: 'Retirer du projet', icone: 'supprimer', danger: true, separe: true },
              ]"
              label="Actions de la ligne"
              @click.stop
            />
          </template>
          <template #carte="{ ligne }">
            <div class="top">
              <div class="cz-person">
                <CzAvatar
                  :nom="ligne.nom"
                  taille="sm"
                  :ton="ligne.ton"
                /><b>{{ ligne.nom }}</b>
              </div>
              <BadgeStatut
                type="souscription"
                :statut="ligne.statut === 'partielle' ? 'a_jour' : ligne.statut"
                petit
              />
            </div>
            <div class="figs">
              <div>Versé<b>{{ formatFCFA(ligne.verse) }}</b></div>
              <div>Reste<b :class="{ 'dev-danger': ligne.statut === 'en_retard' }">{{ formatFCFA(ligne.reste) }}</b></div>
            </div>
          </template>
          <template #vide>
            <CzEmpty
              icone="recherche"
              ton="neutral"
              titre="Aucun résultat"
              :description="`Aucun souscripteur ne correspond à « ${rechercheTable} ».`"
              integre
            >
              <template #action>
                <CzButton
                  variante="fantome"
                  taille="sm"
                  @click="rechercheTable = ''"
                >
                  Effacer la recherche
                </CzButton>
              </template>
            </CzEmpty>
          </template>
        </CzTable>
        <div class="pv-row dev-g16">
          <div class="dev-flex">
            <div class="pv-h">
              Vide de recherche
            </div>
            <CzTable
              :colonnes="[{ cle: 'n', label: 'Souscripteur' }, { cle: 's', label: 'Statut' }]"
              :lignes="[]"
            >
              <template #vide>
                <CzEmpty
                  icone="recherche"
                  ton="neutral"
                  titre="Aucun résultat"
                  description="Aucun souscripteur ne correspond à « Kouadio »."
                  integre
                >
                  <template #action>
                    <CzButton
                      variante="fantome"
                      taille="sm"
                    >
                      Effacer la recherche
                    </CzButton>
                  </template>
                </CzEmpty>
              </template>
            </CzTable>
          </div>
          <div class="dev-flex">
            <div class="pv-h">
              Chargement
            </div>
            <CzTable
              :colonnes="[{ cle: 'n', label: 'Souscripteur', squelette: 'personne' }, { cle: 'r', label: 'Reste', num: true }, { cle: 's', label: 'Statut', squelette: 'badge' }]"
              :lignes="[]"
              chargement
            />
          </div>
          <div class="dev-flex">
            <div class="pv-h">
              Erreur
            </div>
            <CzTable
              :colonnes="[{ cle: 'n', label: 'Souscripteur' }, { cle: 's', label: 'Statut' }]"
              :lignes="[]"
              erreur="La liste n'a pas pu être récupérée. Le reste de la page reste utilisable."
            />
          </div>
        </div>
      </div>
    </DevSection>
  </div>
</template>

<style scoped>
.dev-bloc {
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
}

.dev-sans-rayon {
  border-radius: 0;
}

.dev-g5 {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: var(--space-4);
}

.dev-g4 {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-4);
}

.dev-carte {
  min-height: 130px;
  padding: 18px;
}

.dev-marque {
  color: var(--brand-dark);
}

.dev-vides :deep(.cz-empty) {
  height: 100%;
  padding: var(--space-6) var(--space-4);
}

.dev-l220 {
  width: 220px;
}

.dev-l240 {
  width: 240px;
}

.dev-skel-carte {
  width: 300px;
  padding: 18px;
}

.dev-skel-texte {
  flex: 1;
  min-width: 260px;
  padding: 18px;
}

.dev-mt8 { margin-top: var(--space-2); }
.dev-mt16 { margin-top: var(--space-4); }
.dev-mb12 { margin-bottom: var(--space-3); }
.dev-g8 { gap: var(--space-2); }
.dev-g10 { gap: 10px; }
.dev-g16 { gap: var(--space-4); }
.dev-g40 { gap: 40px; }

.dev-surface {
  background: var(--surface) !important;
}

.dev-flex {
  flex: 1;
  min-width: 260px;
}

.dev-danger {
  color: var(--danger-fg) !important;
}

@media (max-width: 767px) {
  .dev-g5,
  .dev-g4 {
    grid-template-columns: 1fr;
  }
}
</style>
