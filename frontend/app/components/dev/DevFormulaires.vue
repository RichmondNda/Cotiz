<!-- Démonstration : ChampTexte, Selection, ZoneDepot. -->
<script setup lang="ts">
const vide = ref('')
const telephone = ref('+225 07 08 09')
const nom = ref('Construction du centre communautaire')
const email = ref('awa.kone@gmail')
const asso = ref('Entraide Yopougon')
const reference = ref('OM-20260912-4471')
const verif = ref('+225 01 22 33 44 55')
const montant = ref<number | null>(25000)
const tel = ref('07 08 09 10 11')
const frequence = ref<string | null>('mensuelle')
const date = ref('2026-10-01')
const recherche = ref('')
const description = ref('Fonds pour la construction du centre communautaire de Yopougon, ouvert à tous les membres.')
const motDePasse = ref('cotiz2026')
const FREQUENCES = [
  { valeur: 'mensuelle', label: 'Mensuelle' },
  { valeur: 'trimestrielle', label: 'Trimestrielle' },
  { valeur: 'semestrielle', label: 'Semestrielle' },
  { valeur: 'annuelle', label: 'Annuelle' },
]
const VILLES = ['Abidjan', 'Bouaké', 'Daloa', 'Korhogo', 'Man', 'San-Pédro', 'Yamoussoukro', 'Grand-Bassam', 'Gagnoa']
  .map(v => ({ valeur: v, label: v }))
const ville = ref<string | null>(null)
const montantTheme = ref<number | null>(75000)
const nomAsso = ref('Jeunesse solidaire de Bouaké')
const nomProjet = ref('Tontine solidaire 2027')

// Sélection
const virement = ref(true)
const mobile = ref(false)
const relances = ref(true)
const sms = ref(false)
const cal = ref('fixes')
const vue = ref('tableau')
const periode = ref('mensuel')
const requis = ref(30)
const requisMin = ref(1)

// Zone de dépôt
const fichier = ref<null | { nom: string, taille: number, type?: string }>(null)
const enCours = ref({ nom: 'capture_virement.jpg', taille: 1_258_291, type: 'image/jpeg' })
const depose = ref({ nom: 'capture_virement.jpg', taille: 1_258_291, type: 'image/jpeg' })
</script>

<template>
  <div class="dev-bloc">
    <DevSection
      id="champ-texte"
      titre="Champ de texte"
      source="CzField · CzInput · CzSelect"
    >
      <div class="pv pv-stack">
        <div>
          <div class="pv-h">
            États
          </div>
          <div class="dev-g4">
            <CzField
              label="Nom du projet"
              requis
              aide="Repos · vide"
            >
              <CzInput
                v-model="vide"
                placeholder="Ex. Centre communautaire"
              />
            </CzField>
            <CzField
              label="Nom du projet"
              requis
              aide="Survol"
            >
              <CzInput
                v-model="vide"
                placeholder="Ex. Centre communautaire"
                class="is-hover"
              />
            </CzField>
            <CzField
              label="Téléphone"
              requis
              aide="Focus — bordure brand + halo 3 px"
            >
              <CzInput
                v-model="telephone"
                class="is-focus"
              />
            </CzField>
            <CzField
              label="Nom du projet"
              requis
              aide="Rempli · visible par les souscripteurs"
            >
              <CzInput v-model="nom" />
            </CzField>
            <CzField
              label="Email"
              erreur="Adresse email incomplète"
            >
              <CzInput
                v-model="email"
                type="email"
              />
            </CzField>
            <CzField
              label="Association"
              aide="Désactivé · non modifiable"
            >
              <CzInput
                v-model="asso"
                disabled
              />
            </CzField>
            <CzField
              label="Référence de transaction"
              aide="Lecture seule · copiable"
            >
              <CzInput
                v-model="reference"
                readonly
                copiable
                mono
              />
            </CzField>
            <CzField
              label="Téléphone"
              requis
              aide="Chargement · vérification du numéro…"
            >
              <CzInput
                v-model="verif"
                chargement
              />
            </CzField>
          </div>
        </div>
        <div>
          <div class="pv-h">
            Types
          </div>
          <div class="dev-g4">
            <CzField
              label="Montant par échéance"
              requis
              aide="Milliers formatés à la saisie · clavier numérique"
            >
              <CzInput
                v-model="montant"
                type="montant"
              />
            </CzField>
            <CzField
              label="Téléphone"
              requis
              aide="Indicatif sélectionnable, +225 par défaut"
            >
              <CzInput
                v-model="tel"
                type="telephone"
              />
            </CzField>
            <CzField
              label="Fréquence"
              aide="Au-delà de 8 options : avec recherche"
            >
              <CzSelect
                v-model="frequence"
                :options="FREQUENCES"
              />
            </CzField>
            <CzField
              label="Date de début"
              aide="Sélecteur de date au clic"
            >
              <CzInput
                v-model="date"
                type="date"
                icone="echeance"
              />
            </CzField>
            <CzField
              label="Recherche"
              aide="Hauteur 40 dans les barres d'outils"
            >
              <CzInput
                v-model="recherche"
                type="search"
                placeholder="Nom, téléphone…"
              />
            </CzField>
            <CzField
              label="Description courte"
              aide="Zone de texte · 180 caractères maximum"
              class="dev-span-2"
            >
              <CzInput
                v-model="description"
                type="textarea"
                :maxlength="180"
              />
            </CzField>
            <CzField
              label="Ville (plus de 8 options)"
              aide="Liste avec recherche"
            >
              <CzSelect
                v-model="ville"
                :options="VILLES"
                placeholder="Choisir une ville"
              />
            </CzField>
            <CzField
              label="Mot de passe"
              aide="Bouton afficher / masquer"
            >
              <CzInput
                v-model="motDePasse"
                type="password"
              />
            </CzField>
          </div>
        </div>
        <div>
          <div class="pv-h">
            Focus dans les trois univers
          </div>
          <div class="pv-univ">
            <div data-theme="superadmin">
              <CzField label="Nom de l'association">
                <CzInput
                  v-model="nomAsso"
                  class="is-focus"
                />
              </CzField>
            </div>
            <div data-theme="manager">
              <CzField label="Nom du projet">
                <CzInput
                  v-model="nomProjet"
                  class="is-focus"
                />
              </CzField>
            </div>
            <div data-theme="member">
              <CzField label="Montant versé">
                <CzInput
                  v-model="montantTheme"
                  type="montant"
                  class="is-focus"
                />
              </CzField>
            </div>
          </div>
        </div>
      </div>
    </DevSection>

    <DevSection
      id="selection"
      titre="Sélection"
      source="CzCheckbox · CzToggle · CzSegmented · CzCounter"
    >
      <div class="pv pv-stack">
        <table class="pv-matrix">
          <thead>
            <tr>
              <th /><th>Repos</th><th>Survol</th><th>Focus</th><th>Coché / actif</th><th>Erreur</th><th>Désactivé</th><th>Désactivé actif</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>Case à cocher</th>
              <td><span class="cz-cb" /></td>
              <td><span class="cz-cb is-hover" /></td>
              <td><span class="cz-cb is-focus" /></td>
              <td>
                <CzCheckbox
                  :model-value="true"
                  label="Coché"
                />
              </td>
              <td>
                <CzCheckbox
                  erreur
                  label="Erreur"
                />
              </td>
              <td>
                <CzCheckbox
                  disabled
                  label="Désactivé"
                />
              </td>
              <td>
                <CzCheckbox
                  :model-value="true"
                  disabled
                  label="Désactivé coché"
                />
              </td>
            </tr>
            <tr>
              <th>Interrupteur</th>
              <td>
                <CzToggle label="Repos" />
              </td>
              <td><span class="cz-toggle dev-survol" /></td>
              <td><span class="cz-toggle is-focus" /></td>
              <td>
                <CzToggle
                  :model-value="true"
                  label="Actif"
                />
              </td>
              <td class="cz-help">
                —
              </td>
              <td>
                <CzToggle
                  disabled
                  label="Désactivé"
                />
              </td>
              <td>
                <CzToggle
                  :model-value="true"
                  disabled
                  label="Désactivé actif"
                />
              </td>
            </tr>
          </tbody>
        </table>
        <div class="pv-row dev-g40">
          <div class="pv-stack dev-g12">
            <div class="pv-h dev-m0">
              Lignes entièrement cliquables
            </div>
            <CzCheckbox v-model="virement">
              Virement bancaire
            </CzCheckbox>
            <CzCheckbox v-model="mobile">
              Mobile money
            </CzCheckbox>
            <CzCheckbox disabled>
              Espèces (bientôt)
            </CzCheckbox>
            <CzToggle v-model="relances">
              Relances automatiques
            </CzToggle>
            <CzToggle v-model="sms">
              Notifications par SMS
            </CzToggle>
          </div>
          <div class="pv-stack dev-g12">
            <div class="pv-h dev-m0">
              Contrôle segmenté — 2 à 4 choix exclusifs
            </div>
            <CzSegmented
              v-model="cal"
              label="Type de calendrier"
              :options="[{ valeur: 'fixes', label: 'Dates fixes' }, { valeur: 'cycle', label: 'Cycle roulant' }]"
            />
            <CzSegmented
              v-model="vue"
              label="Vue"
              :options="[{ valeur: 'cartes', label: 'Cartes' }, { valeur: 'tableau', label: 'Tableau' }, { valeur: 'grille', label: 'Grille' }]"
            />
            <CzSegmented
              v-model="periode"
              disabled
              label="Période"
              :options="[{ valeur: 'mensuel', label: 'Mensuel' }, { valeur: 'trimestriel', label: 'Trimestriel' }]"
            />
          </div>
          <div class="pv-stack dev-g12">
            <div class="pv-h dev-m0">
              Compteur — petites quantités
            </div>
            <div class="pv-row center">
              <CzCounter
                v-model="requis"
                :min="1"
                label="Souscripteurs requis"
              /><span class="cz-help">Repos</span>
            </div>
            <div class="pv-row center">
              <CzCounter
                v-model="requis"
                :min="1"
                class="is-focus"
                label="Souscripteurs requis"
              /><span class="cz-help">Focus</span>
            </div>
            <div class="pv-row center">
              <CzCounter
                v-model="requisMin"
                :min="1"
                label="Souscripteurs requis"
              /><span class="cz-help">Minimum atteint</span>
            </div>
          </div>
        </div>
      </div>
    </DevSection>

    <DevSection
      id="zone-depot"
      titre="Zone de dépôt"
      source="CzFileDrop"
    >
      <div class="pv">
        <div class="dev-g3">
          <div>
            <CzFileDrop v-model="fichier" /><div class="pv-cap">
              Repos (interactive)
            </div>
          </div>
          <div>
            <div class="cz-drop is-hover">
              <CzIcon nom="importer" /><div><strong>Déposez le fichier</strong></div><span class="fmt">JPG, PNG ou PDF · 5 Mo maximum</span>
            </div><div class="pv-cap">
              Survol / glisser au-dessus
            </div>
          </div>
          <div>
            <CzFileDrop
              erreur="Fichier trop volumineux (8,2 Mo)"
              aide-erreur="Choisissez un fichier de 5 Mo maximum"
            /><div class="pv-cap">
              Erreur
            </div>
          </div>
          <div>
            <CzFileDrop
              v-model="enCours"
              :progression="64"
            /><div class="pv-cap">
              Chargement
            </div>
          </div>
          <div>
            <CzFileDrop v-model="depose" /><div class="pv-cap">
              Fichier déposé
            </div>
          </div>
          <div>
            <CzFileDrop
              disabled
              aide-desactive="Le paiement a déjà été validé"
            /><div class="pv-cap">
              Désactivé
            </div>
          </div>
        </div>
        <p class="cz-help dev-note">
          Mobile : le toucher ouvre directement le choix appareil photo / galerie.
        </p>
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

.dev-g4 {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 18px var(--space-4);
}

.dev-g3 {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-4);
}

.dev-span-2 {
  grid-column: span 2;
}

.dev-g40 {
  gap: 40px;
}

.dev-g12 {
  gap: var(--space-3);
}

.dev-m0 {
  margin: 0;
}

.dev-survol {
  filter: brightness(.95);
}

.dev-note {
  margin: 14px 0 0;
}

@media (max-width: 767px) {
  .dev-g4,
  .dev-g3 {
    grid-template-columns: 1fr;
  }

  .dev-span-2 {
    grid-column: auto;
  }
}
</style>
