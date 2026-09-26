<!--
  MgImport — inscrire des dizaines de souscripteurs d'un coup, en corrigeant les erreurs avant validation (V2).
  Page plein écran (sans l'en-tête du projet). Desktop : titre + « V2 », « Annuler », indicateur 4 étapes
  (Fichier · Colonnes · Vérification · Envoi), carte de l'étape, pied « Retour » / « Continuer ».
  Mobile : en-tête « Étape n sur 4 », segments, barre d'action fixe (précédent + continuer / lancer l'import),
  sans navigation basse. États : 1-fichier, fichier-invalide, 2-colonnes, 3-verification, 4-envoi, import-termine.
-->
<script setup lang="ts">
import EtapeImportColonnes from '~/components/metier/import/EtapeImportColonnes.vue'
import EtapeImportEnvoi from '~/components/metier/import/EtapeImportEnvoi.vue'
import EtapeImportFichier from '~/components/metier/import/EtapeImportFichier.vue'
import EtapeImportVerification from '~/components/metier/import/EtapeImportVerification.vue'
import { creerImport, ETAPES_IMPORT, fournirImport } from '~/composables/useImportSouscripteurs'

definePageMeta({ ongletProjet: 'import', enTeteProjet: false, navBasse: false })

const route = useRoute()
const id = computed(() => String(route.params.id))
const { data: projet } = useProjet(id)
const { data: association } = useAssociationGestionnaire()
const toast = useToast()

useHead({ title: 'Importer des souscripteurs · Cotiz' })

const imp = creerImport(() => id.value)
fournirImport(imp)
const { etat } = imp

const lienSouscripteurs = computed(() => `/asso/projets/${id.value}/souscripteurs`)
const etapes = [...ETAPES_IMPORT]
const COMPOSANTS = [EtapeImportFichier, EtapeImportColonnes, EtapeImportVerification]

function continuer() {
  imp.continuer()
  window.scrollTo({ top: 0 })
}
async function importer() {
  if (await imp.lancer()) {
    await refreshNuxtData()
  }
  else {
    toast.erreur('L’import n’a pas abouti', { message: 'Aucun souscripteur n’a été inscrit. Vérifiez votre connexion, puis réessayez.' })
  }
}
</script>

<template>
  <div class="import">
    <EnTeteGestionnaireMobile
      titre="Importer des souscripteurs"
      :sous-titre="`Étape ${etat.etape} sur ${etapes.length} · ${etapes[etat.etape - 1]}`"
      :retour="lienSouscripteurs"
      libelle-retour="Retour aux souscripteurs"
      :cloche="false"
    />

    <EnTetePage
      titre="Importer des souscripteurs"
      class="cz-desktop"
    >
      <template #apres-titre>
        <CzSoon class="import__v2">
          V2
        </CzSoon>
      </template>
      <template #actions>
        <CzButton
          variante="fantome"
          :to="lienSouscripteurs"
        >
          {{ etat.bilan ? 'Fermer' : 'Annuler' }}
        </CzButton>
      </template>
    </EnTetePage>

    <div class="import__etapes cz-desktop">
      <CzSteps
        :etapes="etapes"
        :courante="etat.bilan ? etapes.length : etat.etape"
        :navigable="!etat.bilan"
        @aller="imp.aller"
      />
    </div>
    <CzEtapesSegments
      :total="etapes.length"
      :courante="etat.etape"
      class="cz-mobile"
    />

    <CzCard
      class="import__carte"
    >
      <component
        :is="COMPOSANTS[etat.etape - 1]"
        v-if="etat.etape < 4"
      />
      <EtapeImportEnvoi
        v-else
        :association="association?.nom ?? '[ASSOCIATION]'"
        :projet="projet?.nom ?? '[PROJET]'"
        :lien-souscripteurs="lienSouscripteurs"
        @importer="importer"
      />

      <div
        v-if="(etat.etape === 1 && etat.analyse && !etat.analyseEnCours) || etat.etape === 2 || etat.etape === 3"
        class="import__pied cz-desktop"
      >
        <CzButton
          v-if="etat.etape > 1"
          variante="fantome"
          @click="imp.retour()"
        >
          Retour
        </CzButton>
        <span class="import__espace" />
        <CzButton @click="continuer">
          Continuer
        </CzButton>
      </div>
    </CzCard>

    <BarreActionMobile
      v-if="!etat.bilan"
      :precedent="etat.etape > 1"
      @precedent="imp.retour()"
    >
      <CzButton
        v-if="etat.etape < 4"
        :disabled="etat.etape === 1 && (!etat.analyse || etat.analyseEnCours)"
        @click="continuer"
      >
        Continuer
      </CzButton>
      <CzButton
        v-else
        :chargement="etat.envoi"
        libelle-chargement="Import en cours…"
        :disabled="!imp.aImporter.value"
        @click="importer"
      >
        Lancer l’import
      </CzButton>
    </BarreActionMobile>
  </div>
</template>

<style scoped>
.import {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.import__v2 {
  margin-left: var(--space-3);
  vertical-align: middle;
}

.import__etapes {
  padding: var(--space-3) var(--space-4);
  border-radius: var(--r-tile);
  background: var(--surface);
}

.import__carte {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-8) var(--space-8) var(--space-6);
}

.import__pied {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding-top: var(--space-4);
  border-top: 1px solid var(--divider);
}

.import__espace {
  flex: 1;
}

@media (max-width: 767px) {
  .import {
    gap: var(--space-3);
    padding-bottom: 96px;
  }

  /* Mobile : les étapes portent leurs propres cartes ; la carte de page s'efface. */
  .import__carte {
    padding: 0;
    border: 0;
    background: none;
    box-shadow: none;
  }
}
</style>
