<!-- Démonstration : Superpositions (modale, confirmation renforcée, menu, infobulle, panneau latéral, feuille basse). -->
<script setup lang="ts">
import { formatFCFA } from '~/utils/format'

const toast = useToast()
const modale = ref(false)
const formulaire = ref(false)
const renforcee = ref(false)
const panneau = ref(false)
const feuille = ref(false)
const telephone = ref('07 12 34 56 78')
const retrait = ref(false)
const suspension = ref('')

async function retirer() {
  retrait.value = true
  await new Promise(r => setTimeout(r, 800))
  retrait.value = false
  modale.value = false
  toast.succes('Moussa Diarra a été retiré du projet', {
    action: { label: 'Annuler', rappel: () => toast.info('Retrait annulé') },
  })
}
</script>

<template>
  <DevSection
    id="superpositions"
    titre="Superpositions"
    source="CzModal · CzConfirmation · CzMenu · CzTooltip · CzPanel · CzSheet"
  >
    <div class="pv pv-stack">
      <div class="pv-h">
        Rendu statique (maquette)
      </div>
      <div class="cz-scrim">
        <div class="cz-modal">
          <div class="mh">
            Retirer Moussa Diarra du projet ?<CzIcon nom="fermer" />
          </div>
          <div class="mb">
            Son historique de paiement sera conservé, mais il ne recevra plus d'échéances ni de relances. Cette action est réversible.
          </div>
          <div class="mf">
            <CzButton
              variante="fantome"
              taille="sm"
            >
              Annuler
            </CzButton><CzButton
              variante="danger"
              taille="sm"
            >
              Retirer du projet
            </CzButton>
          </div>
        </div>
        <div
          class="cz-modal"
          data-theme="superadmin"
        >
          <div class="mh">
            Suspendre Association des ressortissants de Man ?
          </div>
          <div class="mb">
            Les 142 souscripteurs perdront l'accès. Tapez le nom de l'association pour confirmer.
            <CzField class="dev-mt12">
              <CzInput
                v-model="suspension"
                class="is-focus"
                label="Nom de l'association"
                placeholder="Association des ressortissants de Man"
              />
            </CzField>
          </div>
          <div class="mf">
            <CzButton
              variante="fantome"
              taille="sm"
            >
              Annuler
            </CzButton><CzButton
              variante="danger"
              taille="sm"
              :disabled="suspension !== 'Association des ressortissants de Man'"
            >
              Suspendre
            </CzButton>
          </div>
        </div>
        <div class="pv-stack dev-g14">
          <CzMenu
            :elements="[
              { label: 'Voir la fiche', icone: 'voir' },
              { label: 'Envoyer une relance', icone: 'relance' },
              { label: 'Modifier', icone: 'modifier' },
              { label: 'Renvoyer le contrat', icone: 'contrat', disabled: true },
              { label: 'Retirer du projet', icone: 'supprimer', danger: true, separe: true },
            ]"
            alignement="gauche"
            label="Actions du souscripteur"
          >
            <template #declencheur="{ basculer, attrs }">
              <CzButton
                variante="secondaire"
                taille="sm"
                icone-droite="chevron-bas"
                v-bind="attrs"
                @click="basculer"
              >
                Ouvrir le menu contextuel
              </CzButton>
            </template>
          </CzMenu>
          <CzTooltip texte="Juillet 2026 · 25 000 F · En retard depuis 58 jours">
            <span
              class="cz-cell cz-cell--late"
              tabindex="0"
              aria-label="Juillet 2026 · 25 000 F · En retard depuis 58 jours"
            />
          </CzTooltip>
          <span class="cz-tip">Juillet 2026 · 25 000 F · En retard depuis 58 jours</span>
        </div>
      </div>

      <div class="pv-h">
        Interactif — focus piégé, Échap, retour du focus ; modale → feuille basse sous 768 px
      </div>
      <div class="pv-row">
        <CzButton
          variante="danger-contour"
          @click="modale = true"
        >
          Modale de confirmation (420)
        </CzButton>
        <CzButton
          variante="secondaire"
          @click="formulaire = true"
        >
          Modale de formulaire (560)
        </CzButton>
        <CzButton
          variante="secondaire"
          @click="renforcee = true"
        >
          Confirmation renforcée
        </CzButton>
        <CzButton
          variante="secondaire"
          @click="panneau = true"
        >
          Panneau latéral (480)
        </CzButton>
        <CzButton
          variante="secondaire"
          @click="feuille = true"
        >
          Feuille basse
        </CzButton>
      </div>
      <p class="cz-help dev-m0">
        Modale 420 px (formulaire 560 px) · panneau 480 px depuis la droite, plein écran depuis le bas sur mobile · menu 220 px,
        destructif en dernier · infobulle délai 300 ms · feuille basse r-sheet 20 avec poignée.
      </p>
    </div>

    <CzModal
      v-model:ouvert="modale"
      titre="Retirer Moussa Diarra du projet ?"
      :fermable="!retrait"
    >
      Son historique de paiement sera conservé, mais il ne recevra plus d'échéances ni de relances. Cette action est réversible.
      <template #pied>
        <CzButton
          variante="fantome"
          taille="sm"
          :disabled="retrait"
          @click="modale = false"
        >
          Annuler
        </CzButton>
        <CzButton
          variante="danger"
          taille="sm"
          :chargement="retrait"
          libelle-chargement="Retrait…"
          @click="retirer"
        >
          Retirer du projet
        </CzButton>
      </template>
    </CzModal>

    <CzModal
      v-model:ouvert="formulaire"
      titre="Ajouter un souscripteur"
      taille="md"
    >
      <CzField
        label="Téléphone"
        aide="Nous vérifions si cette personne a déjà un compte Cotiz."
      >
        <CzInput
          v-model="telephone"
          type="telephone"
        />
      </CzField>
      <template #pied>
        <CzButton
          taille="sm"
          @click="formulaire = false"
        >
          Continuer
        </CzButton>
      </template>
    </CzModal>

    <CzConfirmation
      v-model:ouvert="renforcee"
      data-theme="superadmin"
      titre="Suspendre Association des ressortissants de Man ?"
      confirmer="Suspendre"
      texte-a-confirmer="Association des ressortissants de Man"
      label-saisie="Nom de l'association"
      @confirmer="renforcee = false"
    >
      Les 142 souscripteurs perdront l'accès. Tapez le nom de l'association pour confirmer.
    </CzConfirmation>

    <CzPanel
      v-model:ouvert="panneau"
      titre="Paiement déclaré"
    >
      <div class="cz-person">
        <CzAvatar nom="Awa Koné" />
        <div>
          <b>Awa Koné</b>
          <div class="sub">
            Centre communautaire · déclaré le 22 sept.
          </div>
        </div>
        <BadgeStatut
          type="paiement"
          statut="en_attente"
          class="dev-ml-auto"
        />
      </div>
      <div class="dev-montant">
        {{ formatFCFA(75000) }}
      </div>
      <div class="cz-help">
        Couvre septembre, octobre, novembre 2026 · Mobile money
      </div>
      <template #pied>
        <CzButton
          variante="danger-contour"
          taille="sm"
          @click="panneau = false"
        >
          Rejeter
        </CzButton>
        <CzButton
          variante="succes"
          taille="sm"
          icone="coche"
          @click="panneau = false"
        >
          Valider le paiement
        </CzButton>
      </template>
    </CzPanel>

    <CzSheet
      v-model:ouvert="feuille"
      titre="Pour quel projet ?"
    >
      <button
        v-for="p in ['Centre communautaire', 'Mutuelle santé', 'Voyage solidaire']"
        :key="p"
        type="button"
        class="opt dev-opt"
        @click="feuille = false"
      >
        <CzIcon nom="projet" />{{ p }}
        <CzBadge
          v-if="p === 'Centre communautaire'"
          ton="danger"
          petit
          class="dev-ml-auto"
        >
          En retard
        </CzBadge>
      </button>
    </CzSheet>
  </DevSection>
</template>

<style scoped>
.dev-mt12 { margin-top: var(--space-3); }
.dev-g14 { gap: 14px; }
.dev-m0 { margin: 0; }
.dev-ml-auto { margin-left: auto; }

.dev-montant {
  font-family: var(--font-display);
  font-size: 26px;
  font-weight: 600;
  color: var(--text-strong);
}

.dev-opt {
  width: 100%;
  border-top: 0;
  border-right: 0;
  border-left: 0;
  background: none;
  font: inherit;
  color: var(--text);
  text-align: left;
  cursor: pointer;
}
</style>
