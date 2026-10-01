<!--
  MbContrat — lire et signer son contrat, ou le consulter une fois signé.
  - Lecture : résumé de l'engagement, texte intégral, signature de l'association ; pied de signature
    (case « J'ai lu et j'accepte… », « Signer le contrat » désactivé tant qu'elle n'est pas cochée).
    En mobile, ce pied est collant et remplace la navigation basse.
  - Signé : écran de succès (« Voir mon échéancier », « Télécharger le contrat signé »).
  - Consultation : contrat déjà signé, bandeau de confirmation et téléchargement.
  Scénario : `consultation` (le contrat de Voyage solidaire apparaît signé).
-->
<script setup lang="ts">
import type { ContratDetaille } from '~~/types'
import type { Signature } from '~/components/metier/TexteContrat.vue'
import { formatDate, formatDateHeure, formatFCFA } from '~/utils/format'

definePageMeta({ middleware: 'espace-souscripteur', layout: 'souscripteur', fab: false })

const route = useRoute()
const projetId = computed(() => String(route.params.id))
const { data: contrats, pending, error, refresh } = useContrats(() => ({ projetId: projetId.value }))

const signeMaintenant = ref<ContratDetaille | null>(null)
const contrat = computed(() => signeMaintenant.value ?? contrats.value?.[0])
const accepte = ref(false)
const envoi = ref(false)
const erreurSignature = ref(false)

const aSigner = computed(() => contrat.value?.statut === 'a_signer')
const titre = computed(() => (contrat.value ? `Contrat · ${contrat.value.projet.nom}` : 'Contrat'))
useHead({ title: () => `${titre.value} · Cotiz` })

// Lecture en mobile : la barre de signature collante remplace la navigation basse.
useGabaritSouscripteur().masquerNavBasse(() => aSigner.value && !signeMaintenant.value)

const signatures = computed<Signature[]>(() => {
  const c = contrat.value
  if (!c) return []
  const date = (d?: string) => (d && /^\d{4}-/.test(d) ? formatDate(d, 'numerique') : d ?? '[DATE]')
  return [
    { role: 'Pour l’association', nom: c.signataireAssociation ?? '[SIGNATAIRE]', mention: `Signé le ${date(c.signeParAssociationLe)}` },
    {
      role: 'Le souscripteur',
      nom: `${c.souscripteur.prenom} ${c.souscripteur.nom}`,
      mention: c.signeLe ? `Signé le ${formatDateHeure(c.signeLe)}` : 'En attente de votre signature',
    },
  ]
})

const signerContrat = useSignatureContrat()
async function signer() {
  if (!contrat.value || !accepte.value) return
  envoi.value = true
  erreurSignature.value = false
  try {
    signeMaintenant.value = await signerContrat(contrat.value.projetId)
    // Accueil, compteurs et liste des contrats changent : on rafraîchit les données déjà chargées.
    await refreshNuxtData()
  }
  catch {
    erreurSignature.value = true
  }
  finally {
    envoi.value = false
  }
}

function telecharger() {
  // V0 : pas de PDF généré côté serveur ; l'impression du navigateur permet d'enregistrer le contrat en PDF.
  window.print()
}
</script>

<template>
  <div class="page-contrat">
    <EnTeteSouscripteur
      :titre="titre"
      :sous-titre="contrat?.association.nom"
      :retour="aSigner ? '/accueil' : `/projets/${projetId}`"
    />

    <div class="page-contrat__colonne">
      <template v-if="pending && !contrat">
        <CzSkeleton
          :hauteur="150"
          class="page-contrat__skel"
        />
        <CzSkeleton
          :hauteur="520"
          class="page-contrat__skel"
        />
      </template>

      <CzEmpty
        v-else-if="error || !contrat"
        icone="alerte"
        ton="danger"
        :titre="error ? 'Impossible d’afficher le contrat' : 'Aucun contrat pour ce projet'"
        :description="error ? 'Vérifiez votre connexion, puis réessayez.' : undefined"
        class="page-contrat__vide"
      >
        <template
          v-if="error"
          #action
        >
          <CzButton
            variante="secondaire"
            @click="refresh()"
          >
            Réessayer
          </CzButton>
        </template>
      </CzEmpty>

      <!-- Signé à l'instant -->
      <CzCard
        v-else-if="signeMaintenant"
        variante="lg"
        tag="section"
        class="page-contrat__succes"
      >
        <CzIconeSucces :taille="72" />
        <h2>Contrat signé !</h2>
        <p>
          Vous êtes engagé sur le projet {{ contrat.projet.nom }}.
          <template v-if="contrat.projet.fondsEntree">
            Votre première échéance — le fonds d’entrée de {{ formatFCFA(contrat.projet.fondsEntree) }} — est maintenant dans votre échéancier.
          </template>
          <template v-else>
            Votre première échéance est maintenant dans votre échéancier.
          </template>
        </p>
        <p
          v-if="contrat.signeLe"
          class="page-contrat__horodatage"
        >
          Signé électroniquement le {{ formatDateHeure(contrat.signeLe) }}
        </p>
        <div class="page-contrat__actions">
          <CzButton
            taille="lg"
            bloc
            :to="`/projets/${projetId}`"
          >
            Voir mon échéancier
          </CzButton>
          <CzButton
            variante="secondaire"
            bloc
            @click="telecharger"
          >
            Télécharger le contrat signé
          </CzButton>
        </div>
      </CzCard>

      <template v-else>
        <CzAlert
          v-if="!aSigner && contrat.signeLe"
          ton="success"
          sans-icone
        >
          <b>Contrat signé le {{ formatDate(contrat.signeLe, 'numerique') }}.</b>
          Vous pouvez le relire ou le télécharger à tout moment.
        </CzAlert>

        <CarteEngagement
          :projet="contrat.projet"
          :total="contrat.engagement"
        />

        <TexteContrat
          titre="Contrat de souscription"
          :sous-titre="`Projet ${contrat.projet.nom} · ${contrat.association.nom}, ${contrat.association.ville}`"
          :texte="contrat.texte"
          :signatures="signatures"
        />

        <CzButton
          v-if="!aSigner"
          variante="secondaire"
          bloc
          @click="telecharger"
        >
          Télécharger le contrat signé
        </CzButton>

        <div
          v-else
          class="page-contrat__signature"
        >
          <CzCheckbox v-model="accepte">
            J’ai lu et j’accepte les termes du contrat.
          </CzCheckbox>
          <p
            v-if="erreurSignature"
            class="cz-error"
            role="alert"
          >
            La signature n’a pas pu être enregistrée. Réessayez.
          </p>
          <div class="page-contrat__signer">
            <span class="page-contrat__mention">Signature électronique horodatée</span>
            <CzButton
              taille="lg"
              :disabled="!accepte"
              :chargement="envoi"
              libelle-chargement="Signature…"
              class="page-contrat__bouton"
              @click="signer"
            >
              Signer le contrat
            </CzButton>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.page-contrat {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.page-contrat__colonne {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  width: 100%;
  max-width: 760px;
  margin: 0 auto;
}

.page-contrat :deep(.entete-mb__page) {
  max-width: 760px;
  width: 100%;
  margin: 0 auto;
}

.page-contrat__skel {
  border-radius: var(--r-card-lg);
}

.page-contrat__vide {
  padding: var(--space-12) var(--space-6);
  border-radius: var(--r-card-lg);
  box-shadow: var(--shadow);
}

.page-contrat__succes {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-8) var(--space-6);
  text-align: center;
}

.page-contrat__succes h2 {
  margin: var(--space-2) 0 0;
  font-family: var(--font-display);
  font-size: 24px;
  font-weight: 600;
  color: var(--text-strong);
}

.page-contrat__succes p {
  max-width: 400px;
  margin: 0;
  font-size: 15px;
  line-height: 1.6;
  color: var(--text-muted);
}

.page-contrat__succes .page-contrat__horodatage {
  font-size: 12.5px;
}

.page-contrat__actions {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  width: 100%;
  max-width: 360px;
  margin-top: var(--space-2);
}

.page-contrat__signature {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
  padding: var(--space-6);
  border-radius: var(--r-card-lg);
  background: var(--surface);
  box-shadow: var(--shadow);
}

.page-contrat__signer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-4);
}

.page-contrat__mention {
  font-size: 12.5px;
  color: var(--text-muted);
}

@media (max-width: 767px) {
  .page-contrat {
    gap: var(--space-3);
  }

  .page-contrat__colonne {
    gap: var(--space-3);
  }

  .page-contrat__succes {
    padding: var(--space-6);
  }

  /* Pied de signature collant : remplace la navigation basse. */
  .page-contrat__signature {
    position: sticky;
    bottom: 0;
    z-index: 10;
    gap: var(--space-4);
    margin: 0 calc(-1 * var(--space-3)) calc(-1 * var(--space-4));
    padding: var(--space-4) var(--space-4) calc(var(--space-3) + env(safe-area-inset-bottom));
    border-top: 1px solid var(--border);
    border-radius: 0;
    box-shadow: none;
  }

  .page-contrat__signer {
    flex-direction: column-reverse;
    align-items: stretch;
    gap: var(--space-3);
    text-align: center;
  }
}
</style>
