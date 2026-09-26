<!--
  Import, étape 4 — Envoi. Desktop : canal des invitations (SMS / Email / Les deux), « Importer 50 souscripteurs »,
  aperçu du message à droite ; progression pendant l'import, puis bilan « Import terminé » (« Voir les souscripteurs »).
  Mobile : « Prêt à importer 50 souscripteurs » (le bouton « Lancer l'import » est dans la barre d'action de la page),
  canal gardé visible ; bilan en carte de succès.
-->
<script setup lang="ts">
import type { CanalImport } from '~/composables/useImportSouscripteurs'
import { useImportSouscripteurs } from '~/composables/useImportSouscripteurs'
import { pluriel } from '~/utils/format'

const props = defineProps<{
  association: string
  projet: string
  lienSouscripteurs: string
}>()
const emit = defineEmits<{ importer: [] }>()

const { etat, aImporter } = useImportSouscripteurs()

const CANAUX: { valeur: CanalImport, label: string }[] = [
  { valeur: 'sms', label: 'SMS' },
  { valeur: 'email', label: 'Email' },
  { valeur: 'les_deux', label: 'Les deux' },
]
const LIBELLES_CANAL: Record<CanalImport, string> = { sms: 'par SMS', email: 'par email', les_deux: 'par SMS et email' }

const message = computed(() =>
  `${props.association} vous a inscrit au projet « ${props.projet} » sur Cotiz. Vos identifiants : [lien de connexion]. Mot de passe provisoire : [code].`)
const titreApercu = computed(() => (etat.canal === 'email' ? 'Aperçu de l’email' : 'Aperçu du SMS'))
</script>

<template>
  <div class="envoi">
    <!-- Desktop -->
    <div class="envoi__grille cz-desktop">
      <div class="envoi__reglages">
        <h2 class="envoi__titre">
          Envoi des invitations
        </h2>
        <div class="cz-field">
          <span class="cz-label">Canal</span>
          <CzSegmented
            v-model="etat.canal"
            :options="CANAUX"
            label="Canal des invitations"
            :disabled="etat.envoi || Boolean(etat.bilan)"
            class="envoi__canal"
          />
        </div>
        <CzAlert
          v-if="etat.bilan"
          ton="success"
          sans-icone
        >
          <b>Import terminé.</b> {{ pluriel(etat.bilan.importes, 'souscripteur inscrit', 'souscripteurs inscrits') }}
          au projet {{ projet }}, {{ pluriel(etat.bilan.invitations, 'invitation envoyée', 'invitations envoyées') }} {{ LIBELLES_CANAL[etat.bilan.canal] }}.
        </CzAlert>
        <CzButton
          v-if="etat.bilan"
          :to="lienSouscripteurs"
          class="envoi__bouton"
        >
          Voir les souscripteurs
        </CzButton>
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
          {{ titreApercu }}
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
      <p>Chacun recevra ses identifiants et une invitation à signer le contrat.</p>
      <CzSegmented
        v-model="etat.canal"
        :options="CANAUX"
        label="Canal des invitations"
        :disabled="etat.envoi"
        class="envoi__canal"
      />
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
      <p>{{ pluriel(etat.bilan.importes, 'souscripteur ajouté', 'souscripteurs ajoutés') }} · invitations envoyées.</p>
      <CzButton
        bloc
        :to="lienSouscripteurs"
      >
        Voir les souscripteurs
      </CzButton>
    </CzCard>
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

.envoi__canal,
.envoi__bouton {
  align-self: flex-start;
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

.envoi__pret .envoi__canal {
  align-self: center;
}
</style>
