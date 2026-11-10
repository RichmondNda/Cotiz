<!--
  MbAccueil — tableau de bord souscripteur : « Combien je dois, pour quoi, et quand ? ».
  Synthèse (montant restant dominant, retard à régulariser), prochaine échéance, contrats à signer,
  projets triés (retard, signature, prochaine échéance), derniers mouvements.
  Scénarios : `tout-est-paye`, `aucun-projet` (+ `chargement`, `erreur`).
-->
<script setup lang="ts">
import type { ActionCarte } from '~/components/metier/CarteProjet.vue'
import type { SouscriptionMembre } from '~~/types'
import { formatDate, formatFCFA, nomCourtAssociation, pluriel } from '~/utils/format'
import { associationsSuspendues, estSuspendue, estTermine, lienDeclarer, lienProjet, progression, statutCarte, trierSouscriptions } from '~/utils/souscriptions'

definePageMeta({ middleware: 'espace-souscripteur', layout: 'souscripteur' })
useHead({ title: 'Accueil · Cotiz' })

const { data: moi } = useMoi()
const { data: souscriptions, pending, error, refresh } = useMesSouscriptions()
const { data: paiements } = usePaiements()

const titre = computed(() => (moi.value ? `Bonjour ${moi.value.prenom}` : 'Bonjour'))
const projets = computed(() => trierSouscriptions(souscriptions.value ?? []))
const engages = computed(() => projets.value.filter(s => s.statut !== 'signature_attendue'))
const aSigner = computed(() => projets.value.filter(s => s.statut === 'signature_attendue'))

const synthese = computed(() => {
  const liste = projets.value
  const associations = new Set(liste.map(s => s.association.id)).size
  const retard = engages.value.reduce((t, s) => t + s.montantEnRetard, 0)
  const enRetard = engages.value.find(s => s.montantEnRetard > 0 && !estSuspendue(s))
  return {
    total: engages.value.reduce((t, s) => t + s.reste, 0),
    detail: `sur ${pluriel(liste.length, 'projet')} · ${pluriel(associations, 'association')}`,
    retard,
    lienRetard: enRetard ? lienDeclarer(enRetard.projetId) : undefined,
    toutPaye: retard === 0 && engages.value.length > 0,
  }
})

const prochaine = computed(() => {
  const candidates = engages.value.filter(s => s.prochaine && !estTermine(s) && !estSuspendue(s))
  const s = [...candidates].sort((a, b) => a.prochaine!.date.localeCompare(b.prochaine!.date))[0]
  return s ? { ...s.prochaine!, projet: s.projet.nom, projetId: s.projetId } : undefined
})

const suspendues = computed(() => associationsSuspendues(projets.value))

const mouvements = computed(() => (paiements.value ?? []).slice(0, 3).map(p => ({
  id: p.id, montant: p.montant, date: p.declareLe, projet: p.projet.nom, statut: p.statut,
})))

/** Propriétés de la carte projet, selon la situation de la souscription. */
function carte(s: SouscriptionMembre) {
  const declarer: ActionCarte | undefined = estSuspendue(s) ? undefined : { label: 'Déclarer', to: lienDeclarer(s.projetId) }
  const base = { nom: s.projet.nom, sousTitre: nomCourtAssociation(s.association.nom), statut: statutCarte(s), to: lienProjet(s) }
  if (s.statut === 'signature_attendue') {
    return {
      ...base,
      message: 'Vous avez été ajouté à ce projet. Signez le contrat pour accéder à votre échéancier.',
      action: { label: 'Signer le contrat', to: `/projets/${s.projetId}/contrat` },
    }
  }
  const commun = { ...base, montant: s.reste, progression: progression(s) }
  if (s.statut === 'en_retard') {
    return {
      ...commun,
      progressionGauche: `${pluriel(s.nbEcheancesEnRetard, 'échéance')} en retard`,
      progressionDroite: s.retardDepuis ? `depuis le ${formatDate(s.retardDepuis, 'jour-mois-long')}` : undefined,
      pied: { libelle: 'À régulariser', valeur: formatFCFA(s.montantEnRetard) },
      action: declarer,
    }
  }
  return {
    ...commun,
    progressionGauche: `${formatFCFA(s.verse)} versés`,
    progressionDroite: `sur ${formatFCFA(s.engagement)}`,
    pied: s.prochaine
      ? { libelle: 'Prochaine échéance', valeur: `${formatFCFA(s.prochaine.montant)} · ${formatDate(s.prochaine.date, 'jour-mois')}` }
      : undefined,
    action: estTermine(s) ? undefined : declarer,
  }
}
</script>

<template>
  <div class="accueil">
    <EnTeteSouscripteur
      :titre="titre"
      cloche
    />

    <template v-if="pending && !souscriptions">
      <div class="accueil__haut">
        <CzSkeleton
          :hauteur="170"
          class="accueil__skel"
        />
        <CzSkeleton
          :hauteur="170"
          class="accueil__skel"
        />
      </div>
      <div class="accueil__grille">
        <CarteProjet
          vue="souscripteur"
          chargement
        />
        <CarteProjet
          vue="souscripteur"
          chargement
        />
      </div>
    </template>

    <CzEmpty
      v-else-if="error"
      icone="alerte"
      ton="danger"
      titre="Impossible d’afficher vos projets"
      description="Vérifiez votre connexion, puis réessayez."
      class="accueil__vide"
    >
      <template #action>
        <CzButton
          variante="secondaire"
          @click="refresh()"
        >
          Réessayer
        </CzButton>
      </template>
    </CzEmpty>

    <CzEmpty
      v-else-if="!projets.length"
      icone="projet"
      titre="Aucun projet pour l’instant"
      description="Votre association vous inscrira à ses projets. Vous recevrez une notification."
      class="accueil__vide"
    />

    <template v-else>
      <BandeauSuspension :noms="suspendues" />
      <div class="accueil__haut">
        <CarteSynthese
          :total="synthese.total"
          :detail="synthese.detail"
          :retard="synthese.retard"
          :lien-retard="synthese.lienRetard"
          :tout-paye="synthese.toutPaye"
        />
        <ProchaineEcheance
          v-if="prochaine"
          :montant="prochaine.montant"
          :projet="prochaine.projet"
          :date="prochaine.date"
          :to="lienDeclarer(prochaine.projetId)"
        />
      </div>

      <ActionCard
        v-for="s in aSigner"
        :key="s.id"
        :titre="`Signez le contrat du projet ${s.projet.nom}`"
        :description="s.association.nom"
        :to="`/projets/${s.projetId}/contrat`"
      />

      <section class="accueil__section">
        <TitreSection titre="Mes projets" />
        <div class="accueil__grille">
          <CarteProjet
            v-for="s in projets"
            :key="s.id"
            vue="souscripteur"
            v-bind="carte(s)"
          />
        </div>
      </section>

      <ListeMouvements
        v-if="mouvements.length"
        :mouvements="mouvements"
      />
    </template>
  </div>
</template>

<style scoped>
.accueil {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.accueil__haut,
.accueil__grille {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-4);
}

.accueil__section {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.accueil__skel {
  border-radius: var(--r-card-lg);
}

.accueil__vide {
  padding: var(--space-12) var(--space-6);
  border-radius: var(--r-card-lg);
  box-shadow: var(--shadow);
}

@media (max-width: 767px) {
  .accueil {
    gap: var(--space-3);
  }

  .accueil__haut,
  .accueil__grille {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-3);
  }
}
</style>
