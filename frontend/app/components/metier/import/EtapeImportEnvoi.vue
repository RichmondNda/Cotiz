<!--
  Import, étape 4 — Envoi. Desktop : « Inscription des souscripteurs », « Importer 50 souscripteurs », aperçu du message
  remis avec le code à droite ; progression pendant l'import (relue toutes les 2 s), puis bilan « Import terminé »
  (« Voir les souscripteurs », « Codes à remettre », « Imprimer les fiches »). Mobile : « Prêt à importer 50 souscripteurs »
  (le bouton « Lancer l'import » est dans la barre d'action de la page) ; bilan en carte de succès.
  Écart « sans fournisseur » (ui-deviations, lot 4.4) : pas de canal SMS / email ; les codes des nouveaux comptes sont
  remis par une personne (« Codes à remettre », fiches imprimées groupées).
-->
<script setup lang="ts">
import { useImportSouscripteurs } from '~/composables/useImportSouscripteurs'
import { pluriel } from '~/utils/format'

const props = defineProps<{
  association: string
  projet: string
  lienSouscripteurs: string
}>()
const emit = defineEmits<{ importer: [] }>()

const { etat, aImporter } = useImportSouscripteurs()
const { data: codes, refresh } = useCodesARemettre({ immediat: false })
const { fiches, imprimer } = useImpressionFiches()
const LIEN_CODES = '/asso/souscripteurs/codes'

const message = computed(() =>
  `${props.association} vous a inscrit au projet « ${props.projet} » sur Cotiz. Activez votre compte avec le code [code] : [lien d’activation].`)

/** Fiches des codes émis depuis le dépôt du fichier et pas encore remis (nouveaux comptes de l'import). */
async function imprimerFiches() {
  await refresh()
  const depuis = etat.analyse?.creeLe ?? ''
  await imprimer((codes.value ?? []).filter(c => !c.remisLe && c.emisLe >= depuis && c.acces?.lien).map(c => c.acces!))
}
const resume = computed(() => {
  const b = etat.bilan
  if (!b) return ''
  const echecs = b.echecs ? ` ${pluriel(b.echecs, 'ligne n’a pas pu être inscrite', 'lignes n’ont pas pu être inscrites')}.` : ''
  return `${pluriel(b.nouveaux, 'nouveau compte', 'nouveaux comptes')}, ${pluriel(b.rattaches, 'compte existant rattaché', 'comptes existants rattachés')}.${echecs}`
})
</script>

<template>
  <div class="envoi">
    <!-- Desktop -->
    <div class="envoi__grille cz-desktop">
      <div class="envoi__reglages">
        <h2 class="envoi__titre">
          Inscription des souscripteurs
        </h2>
        <p
          v-if="!etat.bilan"
          class="envoi__texte"
        >
          Chaque nouveau compte reçoit un code d’activation, à remettre en main propre depuis « Codes à remettre ».
        </p>
        <CzAlert
          v-if="etat.echecEnvoi"
          ton="danger"
          sans-icone
        >
          <b>L’import n’a pas abouti.</b> {{ etat.echecEnvoi }}
        </CzAlert>
        <template v-if="etat.bilan">
          <CzAlert
            ton="success"
            sans-icone
          >
            <b>Import terminé.</b> {{ pluriel(etat.bilan.importes, 'souscripteur inscrit', 'souscripteurs inscrits') }}
            au projet {{ projet }} : {{ resume }}
          </CzAlert>
          <div class="envoi__boutons">
            <CzButton :to="lienSouscripteurs">
              Voir les souscripteurs
            </CzButton>
            <CzButton
              v-if="etat.bilan.nouveaux"
              variante="secondaire"
              :to="LIEN_CODES"
            >
              Codes à remettre
            </CzButton>
            <CzButton
              v-if="etat.bilan.nouveaux"
              variante="fantome"
              icone="imprimer"
              @click="imprimerFiches"
            >
              Imprimer les fiches
            </CzButton>
          </div>
        </template>
        <template v-else>
          <CzButton
            taille="lg"
            class="envoi__bouton"
            :chargement="etat.envoi"
            libelle-chargement="Import en cours…"
            :disabled="!aImporter"
            @click="emit('importer')"
          >
            Importer {{ aImporter }} souscripteurs
          </CzButton>
          <CzProgress
            v-if="etat.envoi"
            :valeur="etat.progression"
            label="Progression de l’import"
          />
        </template>
      </div>
      <div class="envoi__apercu">
        <div class="envoi__apercu-titre">
          Message remis avec le code
        </div>
        {{ message }}
      </div>
    </div>

    <!-- Mobile -->
    <CzCard
      v-if="!etat.bilan"
      class="envoi__pret cz-mobile"
    >
      <h2 class="envoi__titre">
        Prêt à importer {{ aImporter }} souscripteurs
      </h2>
      <p>Chacun sera inscrit au projet ; les codes d’activation des nouveaux comptes seront dans « Codes à remettre ».</p>
      <CzAlert
        v-if="etat.echecEnvoi"
        ton="danger"
        sans-icone
      >
        {{ etat.echecEnvoi }}
      </CzAlert>
      <CzProgress
        v-if="etat.envoi"
        :valeur="etat.progression"
        label="Progression de l’import"
      />
    </CzCard>
    <CzCard
      v-else
      class="envoi__pret cz-mobile"
    >
      <CzIconeSucces />
      <h2 class="envoi__titre">
        Import terminé
      </h2>
      <p>{{ pluriel(etat.bilan.importes, 'souscripteur ajouté', 'souscripteurs ajoutés') }} · {{ resume }}</p>
      <CzButton
        bloc
        :to="lienSouscripteurs"
      >
        Voir les souscripteurs
      </CzButton>
      <CzButton
        v-if="etat.bilan.nouveaux"
        bloc
        variante="secondaire"
        :to="LIEN_CODES"
      >
        Codes à remettre
      </CzButton>
    </CzCard>

    <FichesActivation
      :fiches="fiches"
      :association="association"
    />
  </div>
</template>

<style scoped>
.envoi__grille {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-6);
}

.envoi__reglages {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.envoi__titre {
  margin: 0;
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 600;
  color: var(--text-strong);
}

.envoi__bouton {
  align-self: flex-start;
}

.envoi__texte {
  margin: 0;
  font-size: 14px;
  line-height: 1.55;
  color: var(--text-muted);
}

.envoi__boutons {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}

.envoi__apercu {
  padding: var(--space-4);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  background: var(--surface-subtle);
  font-size: 13.5px;
  line-height: 1.6;
}

.envoi__apercu-titre {
  margin-bottom: var(--space-2);
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.envoi__pret {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  text-align: center;
}

.envoi__pret .envoi__titre {
  font-size: 17px;
}

.envoi__pret p {
  margin: 0;
  font-size: 14px;
  line-height: 1.55;
  color: var(--text-muted);
}
</style>
