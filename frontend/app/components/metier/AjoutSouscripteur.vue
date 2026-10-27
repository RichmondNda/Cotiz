<!--
  MgAjoutSouscripteur — ajout d'un souscripteur à un projet, identifié par son téléphone.
  Desktop : modale ; mobile : écran plein écran (en-tête avec retour, barre d'action au pouce).
  4 cas : saisie du téléphone → compte existant retrouvé (rattacher) · nouveau compte (créer et inscrire,
  échéances passées à rattraper) · déjà inscrit (voir sa fiche). Émet `inscrit` après une inscription ; un compte
  créé par l'association affiche ensuite son code d'activation (Terminer, ou ajouter un autre souscripteur).
-->
<script setup lang="ts">
import type { Projet, SouscriptionAvecSouscripteur } from '~~/types'
import { creerAjoutSouscripteur, fournirAjoutSouscripteur } from '~/composables/useAjoutSouscripteur'
import { useBreakpoint } from '~/composables/useBreakpoint'
import { useFocusTrap } from '~/composables/useFocusTrap'
import { useScrollLock } from '~/composables/useScrollLock'

const props = defineProps<{ projet: Projet }>()
const emit = defineEmits<{ inscrit: [s: SouscriptionAvecSouscripteur] }>()
const ouvert = defineModel<boolean>('ouvert', { default: false })

const ajout = creerAjoutSouscripteur(() => props.projet, (s, encore) => {
  emit('inscrit', s)
  if (!encore) ouvert.value = false
})
fournirAjoutSouscripteur(ajout)
const { etat, rechercher, inscrire, autreNumero, reinitialiser } = ajout

watch(ouvert, (o) => {
  if (!o) reinitialiser()
})

const { estMobile } = useBreakpoint()
const pleinEcran = ref<HTMLElement | null>(null)
const mobileOuvert = computed(() => ouvert.value && estMobile.value)
useScrollLock(mobileOuvert)
useFocusTrap(pleinEcran, mobileOuvert, () => (ouvert.value = false))

function retourMobile() {
  if (etat.etape === 'telephone' || etat.etape === 'code') ouvert.value = false
  else autreNumero()
}
const ficheDejaInscrit = computed(() => (etat.resultat?.cas === 'deja_inscrit' ? `/asso/souscripteurs/${etat.resultat.souscripteur.id}` : '/asso/souscripteurs'))
</script>

<template>
  <!-- Desktop : modale -->
  <CzModal
    v-if="!estMobile"
    v-model:ouvert="ouvert"
    titre="Ajouter un souscripteur"
    taille="md"
    sans-feuille
  >
    <AjoutSouscripteurCorps />
    <template #pied>
      <CzButton
        v-if="etat.etape === 'telephone'"
        taille="sm"
        :chargement="etat.envoi"
        libelle-chargement="Recherche…"
        @click="rechercher"
      >
        Continuer
      </CzButton>
      <template v-else-if="etat.etape === 'compte_existant'">
        <CzButton
          variante="fantome"
          taille="sm"
          @click="autreNumero"
        >
          Retour
        </CzButton>
        <CzButton
          taille="sm"
          :chargement="etat.envoi"
          libelle-chargement="Rattachement…"
          @click="inscrire()"
        >
          Rattacher au projet
        </CzButton>
      </template>
      <template v-else-if="etat.etape === 'nouveau'">
        <CzButton
          variante="fantome"
          taille="sm"
          @click="autreNumero"
        >
          Retour
        </CzButton>
        <CzButton
          variante="secondaire"
          taille="sm"
          :disabled="etat.envoi"
          @click="inscrire(true)"
        >
          Créer et ajouter un autre
        </CzButton>
        <CzButton
          taille="sm"
          :chargement="etat.envoi"
          libelle-chargement="Inscription…"
          @click="inscrire()"
        >
          Créer et inscrire
        </CzButton>
      </template>
      <template v-else-if="etat.etape === 'code'">
        <CzButton
          variante="secondaire"
          taille="sm"
          @click="reinitialiser"
        >
          Ajouter un autre
        </CzButton>
        <CzButton
          taille="sm"
          @click="ouvert = false"
        >
          Terminer
        </CzButton>
      </template>
      <template v-else>
        <CzButton
          variante="fantome"
          taille="sm"
          @click="autreNumero"
        >
          Saisir un autre numéro
        </CzButton>
        <CzButton
          variante="secondaire"
          taille="sm"
          :to="ficheDejaInscrit"
        >
          Voir sa fiche
        </CzButton>
      </template>
    </template>
  </CzModal>

  <!-- Mobile : plein écran -->
  <Teleport
    v-else-if="ouvert"
    to="body"
  >
    <div
      ref="pleinEcran"
      class="ajout-mobile"
      data-theme="manager"
      role="dialog"
      aria-modal="true"
      aria-label="Ajouter un souscripteur"
    >
      <EnTeteMobile
        titre="Ajouter un souscripteur"
        :sous-titre="projet.nom"
        bouton-retour
        :libelle-retour="etat.etape === 'telephone' || etat.etape === 'code' ? 'Fermer' : 'Saisir un autre numéro'"
        @retour="retourMobile"
      />
      <div class="ajout-mobile__corps">
        <AjoutSouscripteurCorps />
      </div>
      <BarreActionMobile>
        <CzButton
          v-if="etat.etape === 'telephone'"
          :chargement="etat.envoi"
          libelle-chargement="Recherche…"
          @click="rechercher"
        >
          Rechercher
        </CzButton>
        <CzButton
          v-else-if="etat.etape === 'compte_existant'"
          :chargement="etat.envoi"
          libelle-chargement="Ajout…"
          @click="inscrire()"
        >
          Ajouter au projet
        </CzButton>
        <CzButton
          v-else-if="etat.etape === 'nouveau'"
          :chargement="etat.envoi"
          libelle-chargement="Création…"
          @click="inscrire()"
        >
          Créer et inviter
        </CzButton>
        <CzButton
          v-else-if="etat.etape === 'code'"
          @click="ouvert = false"
        >
          Terminer
        </CzButton>
        <CzButton
          v-else
          variante="secondaire"
          :to="ficheDejaInscrit"
        >
          Voir sa fiche
        </CzButton>
      </BarreActionMobile>
    </div>
  </Teleport>
</template>

<style scoped>
.ajout-mobile {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  background: var(--page);
}

.ajout-mobile__corps {
  flex: 1;
  padding: var(--space-4) var(--space-3) 112px;
}
</style>
