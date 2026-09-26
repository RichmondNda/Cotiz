<!-- Démonstration : Icônes, Bouton, Badge, Avatar (fiches Icones, Bouton, Badge, Avatar). -->
<script setup lang="ts">
import { NOMS_ICONES } from '~/utils/icons'
import type { VarianteBouton } from '~/components/cz/CzButton.vue'

const ETATS = ['Repos', 'Survol', 'Focus', 'Pressé', 'Chargement', 'Désactivé'] as const
const CLASSES_ETAT = ['', 'is-hover', 'is-focus', 'is-active', '', '']

const LIGNES: { nom: string, variante: VarianteBouton, texte: string, chargement: string, icone?: 'coche' }[] = [
  { nom: 'Primaire', variante: 'primaire', texte: 'Créer un projet', chargement: 'Enregistrement…' },
  { nom: 'Secondaire', variante: 'secondaire', texte: 'Exporter', chargement: 'Export…' },
  { nom: 'Fantôme', variante: 'fantome', texte: 'Annuler', chargement: 'Annulation…' },
  { nom: 'Succès', variante: 'succes', texte: 'Valider le paiement', chargement: 'Validation…', icone: 'coche' },
  { nom: 'Danger', variante: 'danger', texte: 'Supprimer', chargement: 'Suppression…' },
  { nom: 'Danger contour', variante: 'danger-contour', texte: 'Rejeter', chargement: 'Rejet…' },
]
</script>

<template>
  <div class="dev-bloc">
    <DevSection
      id="icones"
      titre="Icônes"
      source="CzIcon"
    >
      <div class="pv">
        <div class="dev-icones">
          <div
            v-for="n in NOMS_ICONES"
            :key="n"
            class="pv-item"
          >
            <CzIcon :nom="n" />
            <div class="pv-cap">
              {{ n }}
            </div>
          </div>
        </div>
      </div>
    </DevSection>

    <DevSection
      id="logo"
      titre="Logo"
      source="CzLogo"
    >
      <div class="pv pv-row center">
        <CzLogo
          variante="complet"
          :taille="160"
        />
        <CzLogo
          variante="symbole"
          :taille="32"
        />
        <CzLogo />
        <div class="dev-fond-marque">
          <CzLogo inverse />
        </div>
      </div>
    </DevSection>

    <DevSection
      id="bouton"
      titre="Bouton"
      source="CzButton"
    >
      <div class="pv pv-stack">
        <table class="pv-matrix">
          <thead>
            <tr>
              <th />
              <th
                v-for="e in ETATS"
                :key="e"
              >
                {{ e }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="l in LIGNES"
              :key="l.nom"
            >
              <th>{{ l.nom }}</th>
              <td
                v-for="(e, i) in ETATS"
                :key="e"
              >
                <CzButton
                  :variante="l.variante"
                  :class="CLASSES_ETAT[i]"
                  :icone="l.icone"
                  :chargement="e === 'Chargement'"
                  :libelle-chargement="l.chargement"
                  :disabled="e === 'Désactivé'"
                >
                  {{ l.texte }}
                </CzButton>
              </td>
            </tr>
            <tr>
              <th>Icône</th>
              <td
                v-for="(e, i) in ETATS"
                :key="e"
              >
                <div class="pv-row center dev-serre">
                  <CzButton
                    variante="icone"
                    icone="actions"
                    label="Actions"
                    :class="CLASSES_ETAT[i]"
                    :chargement="e === 'Chargement'"
                    :disabled="e === 'Désactivé'"
                  />
                  <CzButton
                    v-if="i === 0"
                    variante="icone"
                    icone="modifier"
                    label="Modifier"
                  />
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <div>
          <div class="pv-h">
            Tailles et icône
          </div>
          <div class="pv-row center">
            <CzButton taille="lg">
              Déclarer un paiement
            </CzButton>
            <CzButton icone="ajouter">
              Créer un projet
            </CzButton>
            <CzButton taille="sm">
              Inscrire
            </CzButton>
            <CzButton
              variante="secondaire"
              taille="sm"
              icone="telecharger"
            >
              Exporter
            </CzButton>
            <CzButton
              variante="secondaire"
              to="/_dev/composants#bouton"
            >
              Lien (NuxtLink)
            </CzButton>
            <span class="cz-help">Grand 50 · Moyen 42 · Petit 34 — icône 18 px à gauche, écart 8 px</span>
          </div>
        </div>
        <div>
          <div class="pv-h">
            Même composant dans les trois univers
          </div>
          <div class="pv-univ">
            <div data-theme="superadmin">
              <div class="pv-h">
                Super-admin
              </div>
              <div class="pv-row">
                <CzButton>Valider la demande</CzButton><CzButton variante="secondaire">
                  Voir le détail
                </CzButton>
              </div>
            </div>
            <div data-theme="manager">
              <div class="pv-h">
                Gestionnaire
              </div>
              <div class="pv-row">
                <CzButton>Créer un projet</CzButton><CzButton variante="secondaire">
                  Importer
                </CzButton>
              </div>
            </div>
            <div data-theme="member">
              <div class="pv-h">
                Souscripteur
              </div>
              <div class="pv-row">
                <CzButton>Déclarer un paiement</CzButton><CzButton variante="fantome">
                  Historique
                </CzButton>
              </div>
            </div>
          </div>
        </div>
        <div
          class="pv-row center"
          data-theme="member"
        >
          <div class="pv-band pv-row center dev-flex">
            <CzButton
              taille="lg"
              bloc
              class="dev-max-340"
            >
              Déclarer un paiement
            </CzButton>
            <button
              type="button"
              class="cz-fab"
            >
              <CzIcon nom="ajouter" />Déclarer un paiement
            </button>
            <span class="cz-help">Mobile : primaire pleine largeur en bas d'écran · bouton flottant corail au-dessus de la navigation basse</span>
          </div>
        </div>
      </div>
    </DevSection>

    <DevSection
      id="badge"
      titre="Badge"
      source="CzBadge · CzCount · BadgeStatut"
    >
      <div class="pv pv-stack">
        <table class="pv-matrix">
          <thead>
            <tr>
              <th /><th>Succès</th><th>Alerte</th><th>Erreur</th><th>Information</th><th>Neutre</th><th>Identité</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>Avec pastille</th>
              <td>
                <CzBadge
                  ton="success"
                  point
                >
                  Validé
                </CzBadge>
              </td>
              <td>
                <CzBadge
                  ton="warning"
                  point
                >
                  Déclaré
                </CzBadge>
              </td>
              <td>
                <CzBadge
                  ton="danger"
                  point
                >
                  En retard
                </CzBadge>
              </td>
              <td>
                <CzBadge
                  ton="info"
                  point
                >
                  À venir
                </CzBadge>
              </td>
              <td>
                <CzBadge point>
                  Brouillon
                </CzBadge>
              </td>
              <td>
                <CzBadge
                  ton="brand"
                  point
                >
                  Fonds d'entrée
                </CzBadge>
              </td>
            </tr>
            <tr>
              <th>Texte seul</th>
              <td>
                <CzBadge ton="success">
                  Payée
                </CzBadge>
              </td>
              <td>
                <CzBadge ton="warning">
                  En attente
                </CzBadge>
              </td>
              <td>
                <CzBadge ton="danger">
                  Rejeté
                </CzBadge>
              </td>
              <td>
                <CzBadge ton="info">
                  Onboarding
                </CzBadge>
              </td>
              <td><CzBadge>Terminé</CzBadge></td>
              <td>
                <CzBadge ton="brand">
                  Fonds d'entrée
                </CzBadge>
              </td>
            </tr>
            <tr>
              <th>Petit (11 px)</th>
              <td>
                <CzBadge
                  ton="success"
                  petit
                >
                  À jour
                </CzBadge>
              </td>
              <td>
                <CzBadge
                  ton="warning"
                  petit
                >
                  Partielle
                </CzBadge>
              </td>
              <td>
                <CzBadge
                  ton="danger"
                  petit
                >
                  En retard
                </CzBadge>
              </td>
              <td>
                <CzBadge
                  ton="info"
                  petit
                >
                  À venir
                </CzBadge>
              </td>
              <td>
                <CzBadge petit>
                  Brouillon
                </CzBadge>
              </td>
              <td>
                <CzBadge
                  ton="brand"
                  petit
                >
                  Nouveau
                </CzBadge>
              </td>
            </tr>
            <tr>
              <th>Compteurs</th>
              <td colspan="6">
                <div class="pv-row center">
                  <CzCount :valeur="6" /><CzCount
                    :valeur="52"
                    ton="neutral"
                  /><CzCount
                    :valeur="3"
                    ton="danger"
                  />
                  <span class="cz-help">Orange = action en attente · gris = simple total · rouge plein = notifications non lues</span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <div class="pv-univ">
          <div data-theme="superadmin">
            <div class="pv-row">
              <CzBadge ton="brand">
                Plan Pro
              </CzBadge><BadgeStatut
                type="association"
                statut="active"
              />
            </div>
          </div>
          <div data-theme="manager">
            <div class="pv-row">
              <CzBadge ton="brand">
                Fonds d'entrée
              </CzBadge><BadgeStatut
                type="paiement"
                statut="valide"
              />
            </div>
          </div>
          <div data-theme="member">
            <div class="pv-row">
              <CzBadge ton="brand">
                Membre
              </CzBadge><BadgeStatut
                type="souscription"
                statut="a_jour"
              />
            </div>
          </div>
        </div>
        <div>
          <div class="pv-h">
            Table de correspondance — à respecter partout (BadgeStatut)
          </div>
          <div class="dev-grille-3">
            <div class="cz-card cz-card--flat dev-carte-carte">
              <div class="dev-o">
                Échéance
              </div>
              <div class="pv-row dev-serre">
                <BadgeStatut
                  v-for="s in ['a_venir', 'declaree', 'payee', 'partielle', 'en_retard']"
                  :key="s"
                  type="echeance"
                  :statut="s"
                />
              </div>
            </div>
            <div class="cz-card cz-card--flat dev-carte-carte">
              <div class="dev-o">
                Paiement déclaré
              </div>
              <div class="pv-row dev-serre">
                <BadgeStatut
                  v-for="s in ['en_attente', 'valide', 'rejete']"
                  :key="s"
                  type="paiement"
                  :statut="s"
                />
              </div>
            </div>
            <div class="cz-card cz-card--flat dev-carte-carte">
              <div class="dev-o">
                Projet
              </div>
              <div class="pv-row dev-serre">
                <BadgeStatut
                  v-for="s in ['brouillon', 'inscriptions_ouvertes', 'en_cours', 'termine']"
                  :key="s"
                  type="projet"
                  :statut="s"
                />
              </div>
            </div>
            <div class="cz-card cz-card--flat dev-carte-carte">
              <div class="dev-o">
                Souscripteur sur projet
              </div>
              <div class="pv-row dev-serre">
                <BadgeStatut
                  type="souscription"
                  statut="signature_attendue"
                /><BadgeStatut
                  type="souscription"
                  statut="a_jour"
                /><BadgeStatut
                  type="souscription"
                  statut="en_retard"
                  :complement="2"
                />
              </div>
            </div>
            <div class="cz-card cz-card--flat dev-carte-carte">
              <div class="dev-o">
                Association
              </div>
              <div class="pv-row dev-serre">
                <BadgeStatut
                  v-for="s in ['active', 'impayee', 'suspendue', 'onboarding']"
                  :key="s"
                  type="association"
                  :statut="s"
                />
              </div>
            </div>
            <div class="cz-card cz-card--flat dev-carte-carte">
              <div class="dev-o">
                Demande de création
              </div>
              <div class="pv-row dev-serre">
                <BadgeStatut
                  v-for="s in ['a_traiter', 'approuvee', 'refusee']"
                  :key="s"
                  type="demande"
                  :statut="s"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </DevSection>

    <DevSection
      id="avatar"
      titre="Avatar"
      source="CzAvatar · CzAvatarPile"
    >
      <div class="pv pv-stack">
        <div class="pv-row center dev-large">
          <div class="pv-item">
            <CzAvatar
              nom="Awa Koné"
              taille="lg"
            /><div class="pv-cap">
              56 · profil
            </div>
          </div>
          <div class="pv-item">
            <CzAvatar nom="Awa Koné" /><div class="pv-cap">
              36 · défaut
            </div>
          </div>
          <div class="pv-item">
            <CzAvatar
              nom="Awa Koné"
              taille="sm"
            /><div class="pv-cap">
              30 · tableau
            </div>
          </div>
          <div class="pv-item">
            <CzAvatar
              nom="Entraide Yopougon"
              org
            /><div class="pv-cap">
              44 · association
            </div>
          </div>
          <div class="pv-item">
            <CzAvatar
              nom="Association des ressortissants de Man"
              org
              ton="sa"
            /><div class="pv-cap">
              vue super-admin
            </div>
          </div>
          <div class="pv-item">
            <CzAvatarPile
              :personnes="[{ nom: 'Awa Koné' }, { nom: 'Moussa Diarra', ton: 'success' }]"
              :total="50"
              :max="2"
            /><div class="pv-cap">
              pile
            </div>
          </div>
          <div class="pv-item">
            <div class="pv-row dev-serre">
              <CzAvatar
                nom="Awa Koné"
                taille="sm"
                ton="success"
              /><CzAvatar
                nom="Moussa Diarra"
                taille="sm"
                ton="danger"
              /><CzAvatar
                nom="Fatou Traoré"
                taille="sm"
                ton="warning"
              />
            </div><div class="pv-cap">
              teinte de statut
            </div>
          </div>
          <div class="pv-univ dev-flex">
            <div data-theme="superadmin">
              <CzAvatar initiales="RN" />
            </div>
            <div data-theme="manager">
              <CzAvatar nom="Awa Koné" />
            </div>
            <div data-theme="member">
              <CzAvatar nom="Moussa Diarra" />
            </div>
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

.dev-icones {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  gap: var(--space-4);
}

.dev-fond-marque {
  padding: var(--space-3) var(--space-4);
  border-radius: var(--r-md);
  background: var(--brand);
}

.dev-serre {
  gap: 6px;
}

.dev-large {
  gap: 22px;
}

.dev-flex {
  flex: 1;
  min-width: 280px;
}

.dev-max-340 {
  max-width: 340px;
}

.dev-grille-3 {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
}

.dev-carte-carte {
  padding: 14px var(--space-4);
}

.dev-o {
  margin-bottom: var(--space-2);
  font-family: var(--font-display);
  font-size: 13px;
  font-weight: 600;
  color: var(--text-strong);
}
</style>
