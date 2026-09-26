<!--
  Démonstration des composants métier : grille d'échéances, sélecteur, cartes projet, synthèse, association,
  preuve, notification, frise, graphiques. Données de référence (DONNEES-REFERENCE.md) saisies ici en dur :
  la page de démonstration ne passe pas par l'API.
-->
<script setup lang="ts">
import type { CelluleGrille, ColonneGrille, LigneGrille } from '~/components/metier/GrilleEcheances.vue'
import type { EcheanceSelecteur } from '~/components/metier/SelecteurEcheances.vue'
import type { StatutEcheance } from '~~/types'
import { formatFCFA, formatRelatif } from '~/utils/format'

// ---- Grille (extrait : entrée, mai → nov.)
const MOIS = ['2026-05-05', '2026-06-05', '2026-07-05', '2026-08-05', '2026-09-05', '2026-10-05', '2026-11-05']
const COLONNES: ColonneGrille[] = [
  { id: 'entree', label: 'Entrée', labelCourt: 'Entr.' },
  { id: 'mai', label: 'Mai' }, { id: 'juin', label: 'Juin' }, { id: 'juil', label: 'Juil.' }, { id: 'aout', label: 'Août' },
  { id: 'sept', label: 'Sept.', courante: true }, { id: 'oct', label: 'Oct.' }, { id: 'nov', label: 'Nov.' },
]
const CODES: Record<string, StatutEcheance> = { o: 'payee', l: 'en_retard', W: 'declaree', P: 'partielle', f: 'a_venir' }
function ligne(id: string, nom: string, seq: string, reste: number, extra: Partial<LigneGrille> = {}): LigneGrille {
  return {
    id, nom, reste,
    cellules: seq.split('').map((c, i): CelluleGrille | null => c === '-'
      ? null
      : { id: `${id}-${i}`, date: i === 0 ? '2026-03-05' : MOIS[i - 1]!, montant: i === 0 ? 50000 : 25000, statut: CODES[c]!, estFondsEntree: i === 0 }),
    ...extra,
  }
}
const LIGNES: LigneGrille[] = [
  ligne('jk', 'Jean Kouassi', 'ooooPoff', 187500),
  ligne('md', 'Moussa Diarra', 'oooollff', 250000, { tonAvatar: 'danger', resteEnRetard: true }),
  ligne('ak', 'Awa Koné', 'oooooWff', 150000),
  ligne('ft', 'Fatou Traoré', 'f----fff', 400000, { tonAvatar: 'warning', badge: { texte: 'Signature attendue', ton: 'warning' } }),
]
const celluleChoisie = ref<string | null>('ak-5')
const detail = ref<{ ligne: LigneGrille, cellule: CelluleGrille } | null>(null)
const motifs = ref(false)

// ---- Sélecteur d'échéances (Moussa, Centre communautaire)
const ECHEANCES: EcheanceSelecteur[] = [
  { id: 'aout', label: 'Août 2026', montant: 25000, enRetard: true },
  { id: 'sept', label: 'Sept. 2026', montant: 25000, enRetard: true },
  { id: 'oct', label: 'Oct. 2026', montant: 25000 },
  { id: 'nov', label: 'Nov. 2026', montant: 25000 },
]
const montantLibre = ref<number | null>(75000)

// ---- Graphiques
const COLLECTE = [
  { label: 'Avr.', attendu: 1300000, recu: 1200000 },
  { label: 'Mai', attendu: 1300000, recu: 1250000 },
  { label: 'Juin', attendu: 1300000, recu: 1080000 },
  { label: 'Juil.', attendu: 1300000, recu: 1000000 },
  { label: 'Août', attendu: 1300000, recu: 1150000 },
  { label: 'Sept.', attendu: 1300000, recu: 1240000, enCours: true },
]
const CUMUL = [
  { label: 'Mars', valeur: 75000 }, { label: 'Avr.', valeur: 100000 }, { label: 'Mai', valeur: 125000 },
  { label: 'Juin', valeur: 150000 }, { label: 'Juil.', valeur: 205000 }, { label: 'Août', valeur: 215000 }, { label: 'Sept.', valeur: 225000 },
]
</script>

<template>
  <div class="dev-bloc">
    <DevSection
      id="grille-echeances"
      titre="Grille d'échéances"
      source="GrilleEcheances"
    >
      <div class="pv pv-stack pv-band dev-sans-rayon">
        <div class="pv-h">
          Grille — Centre communautaire · tri par retards · mois courant surligné · colonne souscripteur figée
        </div>
        <GrilleEcheances
          v-model:motifs="motifs"
          :colonnes="COLONNES"
          :lignes="LIGNES"
          :selection="celluleChoisie"
          @cellule="(l, c) => { celluleChoisie = c.id; detail = { ligne: l, cellule: c } }"
        />
        <div class="pv-row dev-g24">
          <div class="cz-card dev-p18">
            <div class="pv-h">
              Case — 5 états × 4 interactions
            </div>
            <table class="pv-matrix">
              <thead>
                <tr>
                  <th /><th>Repos</th><th>Survol</th><th>Focus</th><th>Sélection</th><th>Motif</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="[nom, cls, motif] in [['Payée', 'ok', '✓'], ['Déclarée', 'wait', '…'], ['Partielle', 'part', '◔'], ['En retard', 'late', '!'], ['À venir', 'fut', '']]"
                  :key="nom"
                >
                  <th>{{ nom }}</th>
                  <td><span :class="`cz-cell cz-cell--${cls}`" /></td>
                  <td><span :class="`cz-cell cz-cell--${cls} is-hover`" /></td>
                  <td><span :class="`cz-cell cz-cell--${cls} is-focus`" /></td>
                  <td><span :class="`cz-cell cz-cell--${cls} is-selected`" /></td>
                  <td><span :class="`cz-cell cz-cell--${cls}`">{{ motif }}</span></td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="pv-stack dev-flex">
            <div>
              <div class="pv-h">
                Survol d'une case
              </div>
              <span class="cz-tip">Août 2026 · 25 000 F · En retard depuis 51 jours</span>
            </div>
            <div>
              <div class="pv-h">
                Clic sur une case — panneau latéral (aperçu)
              </div>
              <div
                v-if="detail"
                class="cz-card dev-detail"
              >
                <div class="dev-entre">
                  <b class="dev-display">{{ detail.cellule.estFondsEntree ? 'Fonds d\'entrée' : detail.cellule.date }} · {{ detail.ligne.nom }}</b>
                  <BadgeStatut
                    type="echeance"
                    :statut="detail.cellule.statut"
                    petit
                  />
                </div>
                <div class="cz-help dev-my">
                  {{ formatFCFA(detail.cellule.montant) }}
                </div>
                <div
                  v-if="detail.cellule.statut === 'declaree'"
                  class="pv-row dev-g8"
                >
                  <CzButton
                    variante="danger-contour"
                    taille="sm"
                  >
                    Rejeter
                  </CzButton>
                  <CzButton
                    variante="succes"
                    taille="sm"
                    icone="coche"
                  >
                    Valider
                  </CzButton>
                </div>
              </div>
              <div
                v-else
                class="cz-card dev-detail"
              >
                <div class="dev-entre">
                  <b class="dev-display">Septembre 2026 · Awa Koné</b>
                  <CzBadge
                    ton="warning"
                    petit
                  >
                    Déclarée
                  </CzBadge>
                </div>
                <div class="cz-help dev-my">
                  25 000 F · paiement de 75 000 F déclaré le 22 sept., preuve jointe
                </div>
                <div class="pv-row dev-g8">
                  <CzButton
                    variante="danger-contour"
                    taille="sm"
                  >
                    Rejeter
                  </CzButton>
                  <CzButton
                    variante="succes"
                    taille="sm"
                    icone="coche"
                  >
                    Valider
                  </CzButton>
                </div>
              </div>
              <p class="cz-help dev-m6">
                Case orange : accès direct à la validation.
              </p>
            </div>
          </div>
        </div>
      </div>
    </DevSection>

    <DevSection
      id="selecteur-echeances"
      titre="Sélecteur d'échéances"
      source="SelecteurEcheances · allocate()"
    >
      <div
        class="pv pv-stack dev-page"
        data-theme="member"
      >
        <div class="dev-g4">
          <div class="pv-stack dev-g8">
            <div class="pv-h dev-m0">
              1 · Réparti entièrement
            </div>
            <SelecteurEcheances
              :montant="75000"
              :echeances="ECHEANCES"
            />
            <CzButton
              taille="lg"
              bloc
            >
              Envoyer la déclaration
            </CzButton>
          </div>
          <div class="pv-stack dev-g8">
            <div class="pv-h dev-m0">
              2 · Montant insuffisant
            </div>
            <SelecteurEcheances
              :montant="60000"
              :echeances="ECHEANCES"
            />
            <CzButton
              taille="lg"
              bloc
            >
              Envoyer la déclaration
            </CzButton>
          </div>
          <div class="pv-stack dev-g8">
            <div class="pv-h dev-m0">
              3 · Interactif (cochez / décochez)
            </div>
            <CzField label="Montant versé">
              <CzInput
                v-model="montantLibre"
                type="montant"
              />
            </CzField>
            <SelecteurEcheances
              :montant="montantLibre"
              :echeances="ECHEANCES"
            />
          </div>
          <div class="pv-stack dev-g8">
            <div class="pv-h dev-m0">
              4 · Montant non saisi / preuve absente
            </div>
            <SelecteurEcheances
              :montant="null"
              :echeances="ECHEANCES"
            />
            <CzButton
              taille="lg"
              bloc
              disabled
            >
              Envoyer la déclaration
            </CzButton>
          </div>
        </div>
        <div
          class="pv-univ dev-univ-1"
        >
          <div
            data-theme="manager"
            class="dev-page"
          >
            <div class="pv-h">
              Univers gestionnaire — même composant en lecture dans le détail d'un paiement déclaré
            </div>
            <SelecteurEcheances
              :montant="50000"
              :echeances="ECHEANCES.slice(0, 2)"
              lecture-seule
            />
          </div>
        </div>
      </div>
    </DevSection>

    <DevSection
      id="carte-projet"
      titre="Carte projet"
      source="CarteProjet"
    >
      <div class="pv pv-stack">
        <div
          class="pv-band dev-page"
          data-theme="manager"
        >
          <div class="pv-h">
            Vue gestionnaire — statut du projet
          </div>
          <div class="dev-g4">
            <div class="pv-item dev-etire">
              <CarteProjet
                nom="Centre communautaire"
                sous-titre="Mensuel · 25 000 F · depuis mars 2026"
                statut="en_cours"
                :progression="37"
                :progression-gauche="`${formatFCFA(9594000)} collectés`"
                progression-droite="37 %"
                :avatars="[{ nom: 'Awa Koné' }, { nom: 'Moussa Diarra', ton: 'danger' }]"
                :avatars-total="52"
                :alerte="{ texte: '14 en retard', ton: 'danger' }"
                to="/_dev/composants#carte-projet"
              />
              <div class="pv-cap">
                En cours · collecte / attendu
              </div>
            </div>
            <div class="pv-item dev-etire">
              <CarteProjet
                nom="Tontine solidaire 2027"
                sous-titre="Cycle roulant · 10 000 F"
                statut="inscriptions_ouvertes"
                :progression="40"
                progression-gauche="12 / 30 souscripteurs"
                progression-droite="40 %"
                aide-pied="Démarre en janvier 2027"
                :action="{ label: 'Inscrire', variante: 'secondaire', to: '/_dev/composants#carte-projet' }"
              />
              <div class="pv-cap">
                Inscriptions ouvertes · remplissage (info)
              </div>
            </div>
            <div class="pv-item dev-etire">
              <CarteProjet
                nom="Voyage solidaire 2028"
                sous-titre="Dates fixes · 10 000 F · 12 mois"
                statut="brouillon"
                message="Étape 3 sur 6 — calendrier à compléter."
                aide-pied="Modifié il y a 2 j"
                :action="{ label: 'Reprendre', variante: 'fantome' }"
              />
              <div class="pv-cap">
                Brouillon
              </div>
            </div>
            <div class="pv-item dev-etire">
              <CzCard
                variante="ghost"
                to="/_dev/composants#carte-projet"
                class="dev-fantome"
              >
                <CzIcon
                  nom="ajouter"
                  :taille="26"
                />Nouveau projet
              </CzCard>
              <div class="pv-cap">
                Carte fantôme, fin de grille
              </div>
            </div>
          </div>
          <div class="dev-g4 dev-mt14">
            <div class="pv-item dev-etire">
              <CarteProjet
                nom="Voyage solidaire"
                sous-titre="Mensuel · 10 000 F · 12 mois"
                statut="en_cours"
                :progression="30"
                progression-gauche="[MONTANT] F collectés"
                progression-droite="[N] %"
                :avatars="[{ nom: 'Moussa Diarra', ton: 'danger' }]"
                avatars-reste="+[N]"
                :alerte="{ texte: '1 signature attendue', ton: 'warning' }"
                class="is-hover"
              />
              <div class="pv-cap">
                Survol
              </div>
            </div>
            <div class="pv-item dev-etire">
              <CarteProjet
                nom="Voyage solidaire"
                sous-titre="Mensuel · 10 000 F · 12 mois"
                statut="en_cours"
                :progression="30"
                progression-gauche="[MONTANT] F collectés"
                progression-droite="[N] %"
                :alerte="{ texte: 'Tous à jour', ton: 'success' }"
                class="is-focus"
              />
              <div class="pv-cap">
                Focus
              </div>
            </div>
            <div class="pv-item dev-etire">
              <CarteProjet
                nom="Fête de fin d'année 2025"
                sous-titre="Mensuel · 5 000 F · terminé en déc. 2025"
                statut="termine"
                :progression="100"
                progression-gauche="[MONTANT] F collectés"
                progression-droite="100 %"
                aide-pied="[N] souscripteurs"
                :action="{ label: 'Voir le bilan', variante: 'fantome' }"
              />
              <div class="pv-cap">
                Terminé
              </div>
            </div>
          </div>
        </div>
        <div
          class="pv-band dev-page"
          data-theme="member"
        >
          <div class="pv-h">
            Vue souscripteur — le reste à payer domine · tri : retard, signature, prochaine échéance
          </div>
          <div class="dev-g4">
            <div class="pv-item dev-etire">
              <CarteProjet
                vue="souscripteur"
                nom="Mutuelle santé"
                sous-titre="Assoc. des ressortissants de Man"
                statut="a_jour"
                :montant="70000"
                :progression="42"
                :progression-gauche="`${formatFCFA(50000)} versés`"
                :progression-droite="`sur ${formatFCFA(120000)}`"
                :pied="{ libelle: 'Prochaine échéance', valeur: `${formatFCFA(10000)} · 5 oct.` }"
                :action="{ label: 'Déclarer', to: '/_dev/composants#carte-projet' }"
                to="/_dev/composants#carte-projet"
              />
              <div class="pv-cap">
                À jour · bordure standard
              </div>
            </div>
            <div class="pv-item dev-etire">
              <CarteProjet
                vue="souscripteur"
                nom="Centre communautaire"
                sous-titre="Entraide Yopougon"
                statut="en_retard"
                :montant="325000"
                :progression="35"
                progression-gauche="2 échéances en retard"
                progression-droite="depuis le 5 août"
                :pied="{ libelle: 'À régulariser', valeur: formatFCFA(50000) }"
                :action="{ label: 'Déclarer' }"
              />
              <div class="pv-cap">
                En retard · bordure rouge 2 px
              </div>
            </div>
            <div class="pv-item dev-etire">
              <CarteProjet
                vue="souscripteur"
                nom="Voyage solidaire"
                sous-titre="Entraide Yopougon"
                statut="signature_attendue"
                message="Vous avez été ajouté à ce projet. Signez le contrat pour accéder à votre échéancier."
                :action="{ label: 'Signer le contrat' }"
              />
              <div class="pv-cap">
                Signature attendue · pointillé orange, contenu masqué
              </div>
            </div>
            <div class="pv-item dev-etire">
              <CarteProjet
                vue="souscripteur"
                nom="Fête de fin d'année 2025"
                sous-titre="Entraide Yopougon"
                statut="termine"
                libelle-montant="Total versé"
                montant="[MONTANT]"
                :progression="100"
                progression-gauche="[N] échéances payées"
                progression-droite="100 %"
                :action="{ label: 'Voir le bilan', variante: 'fantome' }"
              />
              <div class="pv-cap">
                Terminé · grisé
              </div>
            </div>
          </div>
        </div>
      </div>
    </DevSection>

    <DevSection
      id="carte-synthese"
      titre="Carte synthèse"
      source="CarteSynthese · ActionCard · ProchaineEcheance · ListeMouvements"
    >
      <div
        class="pv pv-stack dev-page"
        data-theme="member"
      >
        <div class="dev-g3">
          <div class="pv-item dev-etire">
            <CarteSynthese
              :total="395000"
              detail="sur 3 projets · 2 associations"
              :retard="50000"
              lien-retard="/_dev/composants#carte-synthese"
            /><div class="pv-cap">
              Avec retard
            </div>
          </div>
          <div class="pv-item dev-etire">
            <CarteSynthese
              :total="70000"
              detail="sur 1 projet · 1 association"
            /><div class="pv-cap">
              Nominal
            </div>
          </div>
          <div class="pv-item dev-etire">
            <CarteSynthese
              :total="0"
              detail="Tout est payé"
              tout-paye
            /><div class="pv-cap">
              Tout est payé
            </div>
          </div>
        </div>
        <div class="dev-g3">
          <div class="pv-item dev-etire">
            <ActionCard
              titre="Signez le contrat du projet Voyage solidaire"
              description="Entraide Yopougon"
              to="/_dev/composants#carte-synthese"
            /><div class="pv-cap">
              Carte d'action (une par contrat)
            </div>
          </div>
          <div class="pv-item dev-etire">
            <ProchaineEcheance
              :montant="25000"
              projet="Centre communautaire"
              date="2026-10-05"
              to="/_dev/composants#carte-synthese"
            /><div class="pv-cap">
              Prochaine échéance
            </div>
          </div>
          <div class="pv-item dev-etire">
            <ListeMouvements
              :mouvements="[
                { id: '1', montant: 10000, date: '2026-09-05', projet: 'Mutuelle santé', statut: 'valide' },
                { id: '2', montant: 10000, date: '2026-08-05', projet: 'Mutuelle santé', statut: 'valide' },
              ]"
              lien-tout="/_dev/composants#carte-synthese"
            /><div class="pv-cap">
              Liste compacte
            </div>
          </div>
        </div>
      </div>
    </DevSection>

    <DevSection
      id="carte-association"
      titre="Carte association"
      source="CarteAssociation"
    >
      <div class="pv pv-row dev-g24">
        <div
          class="pv-band dev-page"
          data-theme="member"
        >
          <div class="pv-h">
            Souscripteur
          </div>
          <CarteAssociation
            nom="Entraide Yopougon"
            sous-titre="Abidjan · membre depuis 2024"
            initiales="EY"
            :chiffres="[{ valeur: '2', libelle: 'projets actifs' }, { valeur: formatFCFA(325000), libelle: 'reste à payer' }]"
            :statut="{ type: 'souscription', valeur: 'en_retard' }"
            :lien="{ label: 'Voir les projets', to: '/_dev/composants#carte-association' }"
            to="/_dev/composants#carte-association"
            class="dev-l320"
          />
        </div>
        <div
          class="pv-band dev-page"
          data-theme="superadmin"
        >
          <div class="pv-h">
            Super-admin
          </div>
          <div class="pv-row">
            <CarteAssociation
              vue="superadmin"
              nom="Assoc. des ressortissants de Man"
              sous-titre="Plan Pro · 142 souscripteurs"
              initiales="AR"
              :chiffres="[{ valeur: '5', libelle: 'projets' }, { valeur: 'il y a 2 j', libelle: 'dernière activité' }]"
              :statut="{ type: 'association', valeur: 'impayee' }"
              class="dev-l320"
            />
            <CarteAssociation
              vue="superadmin"
              nom="Jeunesse solidaire de Bouaké"
              sous-titre="Plan Découverte · 0 souscripteur"
              initiales="JS"
              :chiffres="[{ valeur: '0', libelle: 'projets' }, { valeur: 'aujourd’hui', libelle: 'création' }]"
              :statut="{ type: 'association', valeur: 'onboarding' }"
              class="dev-l320"
            />
          </div>
        </div>
      </div>
    </DevSection>

    <DevSection
      id="visionneuse-preuve"
      titre="Visionneuse de preuve"
      source="VisionneusePreuve"
    >
      <div class="pv pv-row dev-g28">
        <div class="pv-item">
          <VisionneusePreuve :preuve="{ type: 'image', nomFichier: 'capture_virement.jpg', url: '/cotiz-logo.png' }" />
          <div class="pv-cap">
            Image · clic = plein écran, zoom, rotation
          </div>
        </div>
        <div class="pv-item">
          <VisionneusePreuve :preuve="{ type: 'pdf', nomFichier: 'recu_banque.pdf', url: '/cotiz-logo.png' }" />
          <div class="pv-cap">
            PDF · aperçu page 1
          </div>
        </div>
        <div class="pv-stack dev-g8 dev-l320">
          <div class="pv-h dev-m0">
            Référence seule (pas de fichier)
          </div>
          <VisionneusePreuve
            :preuve="{ type: 'reference', reference: 'OM-20260912-4471' }"
            detail="Mobile money · Orange · 10 sept. 2026"
          />
        </div>
      </div>
    </DevSection>

    <DevSection
      id="notification"
      titre="Notification"
      source="NotificationItem"
    >
      <div class="pv pv-row dev-g24 dev-debut">
        <div
          class="pv-band dev-page dev-flex"
          data-theme="member"
        >
          <div class="pv-h">
            Souscripteur
          </div>
          <div class="pv-stack dev-g8">
            <div class="cz-notif-group">
              Aujourd'hui
            </div>
            <NotificationItem
              type="echeance_proche"
              titre="Échéance dans 10 jours"
              message="Centre communautaire · 25 000 F le 5 octobre"
              :moment="formatRelatif('2026-09-25T08:00:00')"
            />
            <NotificationItem
              type="paiement_valide"
              titre="Paiement validé"
              message="Mutuelle santé · vos 10 000 F ont été validés"
              :moment="formatRelatif('2026-09-25T05:00:00')"
            />
            <div class="cz-notif-group">
              Cette semaine
            </div>
            <NotificationItem
              type="contrat_a_signer"
              titre="Nouveau contrat à signer"
              message="Vous avez été ajouté au projet Voyage solidaire"
              moment="lun."
              lue
              class="is-hover"
            />
            <NotificationItem
              type="paiement_rejete"
              titre="Paiement rejeté"
              message="Preuve illisible — merci de déclarer à nouveau"
              moment="3 sept."
              lue
            />
          </div>
        </div>
        <div
          class="pv-band dev-page dev-flex"
          data-theme="manager"
        >
          <div class="pv-h">
            Gestionnaire
          </div>
          <div class="pv-stack dev-g8">
            <NotificationItem
              type="paiement_declare"
              titre="Nouveau paiement déclaré"
              message="Awa Koné · 75 000 F · Centre communautaire"
              moment="il y a 1 h"
              to="/_dev/composants#notification"
            />
            <NotificationItem
              type="inscriptions"
              titre="12 / 30 inscrits"
              message="Tontine solidaire 2027 progresse"
              moment="hier"
              lue
            />
            <p class="cz-help dev-m4">
              Non lue : fond brand-pale · icône colorée selon le type · clic = marque comme lue et ouvre l'écran d'action.
            </p>
          </div>
        </div>
      </div>
    </DevSection>

    <DevSection
      id="frise"
      titre="Frise"
      source="Frise"
    >
      <div class="pv pv-row dev-g40 dev-debut">
        <div class="cz-card dev-flex">
          <div class="pv-h">
            Fiche souscripteur · Moussa Diarra
          </div>
          <Frise
            label="Historique de Moussa Diarra"
            :evenements="[
              { titre: 'Paiement validé — 25 000 F', detail: '7 juil. 2026 · couvre juillet', ton: 'success' },
              { titre: 'Paiement déclaré — 25 000 F', detail: '5 juil. 2026 · preuve jointe', ton: 'warning' },
              { titre: 'Échéance d\'août en retard', detail: '5 août 2026 · relance automatique envoyée', ton: 'danger' },
              { titre: 'Contrat signé', detail: '12 mars 2026', ton: 'success' },
            ]"
          />
        </div>
        <div
          class="cz-card dev-flex"
          data-theme="superadmin"
        >
          <div class="pv-h">
            Activité plateforme
          </div>
          <Frise
            :evenements="[
              { titre: 'Nouvelle association', detail: 'Jeunesse solidaire de Bouaké · aujourd\'hui', ton: 'info' },
              { titre: 'Abonnement impayé', detail: 'Assoc. des ressortissants de Man · il y a 3 j', ton: 'warning' },
              { titre: 'Changement de plan', detail: 'Entraide Yopougon · Découverte → Essentiel', ton: 'brand' },
            ]"
          />
          <p class="cz-help dev-m0">
            Vert validé · orange en attente · rouge retard · bleu information · brand événement neutre de l'espace.
          </p>
        </div>
      </div>
    </DevSection>

    <DevSection
      id="graphiques"
      titre="Graphiques"
      source="GraphiqueCollecte · AnneauTaux · CourbeCumul · CzProgress"
    >
      <div class="pv pv-row dev-g18 dev-etire-row">
        <div
          class="cz-card dev-f14"
          data-theme="manager"
        >
          <div class="dev-ttl">
            Collecte mensuelle — attendu vs reçu
          </div>
          <GraphiqueCollecte :mois="COLLECTE" />
        </div>
        <div class="cz-card dev-f12">
          <div class="dev-ttl">
            Taux de recouvrement — couleur selon seuil
          </div>
          <div class="pv-row dev-autour">
            <div class="pv-item">
              <AnneauTaux :taux="82" /><div class="pv-cap">
                ≥ 80 % vert
              </div>
            </div>
            <div class="pv-item">
              <AnneauTaux :taux="64" /><div class="pv-cap">
                50–80 % orange
              </div>
            </div>
            <div class="pv-item">
              <AnneauTaux :taux="38" /><div class="pv-cap">
                &lt; 50 % rouge
              </div>
            </div>
          </div>
          <div class="pv-h dev-mt14">
            Barre de progression
          </div>
          <div class="pv-stack dev-g8">
            <CzProgress :valeur="68" />
            <CzProgress
              :valeur="40"
              ton="info"
            />
            <CzProgress
              :valeur="35"
              ton="danger"
            />
            <CzProgress
              :valeur="100"
              ton="muted"
            />
          </div>
        </div>
        <div
          class="cz-card dev-f1"
          data-theme="member"
        >
          <div class="dev-ttl">
            Cumul versé (souscripteur)
          </div>
          <CourbeCumul
            :points="CUMUL"
            :objectif="620000"
          />
          <div class="cz-help">
            Pointillé : objectif restant · infobulle au survol de chaque point
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

.dev-sans-rayon { border-radius: 0; }
.dev-page { background: var(--page); }
.dev-g4 { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; }
.dev-g3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-4); }
.dev-g8 { gap: var(--space-2); }
.dev-g18 { gap: 18px; }
.dev-g24 { gap: var(--space-6); }
.dev-g28 { gap: 28px; }
.dev-g40 { gap: 40px; }
.dev-m0 { margin: 0; }
.dev-m4 { margin: var(--space-1) 0 0; }
.dev-m6 { margin: 6px 0 0; }
.dev-my { margin: 6px 0 var(--space-3); }
.dev-mt14 { margin-top: 14px; }
.dev-p18 { padding: 18px; }
.dev-l320 { width: 320px; }
.dev-flex { flex: 1; min-width: 300px; }
.dev-debut { align-items: flex-start; }
.dev-etire { align-items: stretch; }
.dev-etire-row { align-items: stretch; }
.dev-autour { justify-content: space-around; }
.dev-f14 { flex: 1.4; min-width: 340px; }
.dev-f12 { flex: 1.2; min-width: 330px; }
.dev-f1 { flex: 1; min-width: 250px; }
.dev-univ-1 { grid-template-columns: minmax(0, 560px); }

.dev-fantome {
  min-height: 196px;
  height: 100%;
}

.dev-detail {
  max-width: 360px;
  padding: var(--space-4);
}

.dev-entre {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.dev-display { font-family: var(--font-display); }

.dev-ttl {
  margin-bottom: 10px;
  font-family: var(--font-display);
  font-size: 14px;
  font-weight: 600;
  color: var(--text-strong);
}

@media (max-width: 767px) {
  .dev-g4,
  .dev-g3 {
    grid-template-columns: 1fr;
  }
}
</style>
