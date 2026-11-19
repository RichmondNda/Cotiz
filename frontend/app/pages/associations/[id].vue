<!--
  MbAssociation — fiche d'une association du souscripteur : identité et contacts (appeler, écrire),
  ses projets dans cette association (cartes projet), comment payer (coordonnées copiables).
-->
<script setup lang="ts">
import type { SouscriptionMembre } from '~~/types'
import { formatDate, formatFCFA, formatMois, pluriel } from '~/utils/format'
import { lienDeclarer, lienProjet, peutDeclarer, progression, statutCarte } from '~/utils/souscriptions'

definePageMeta({ middleware: 'espace-souscripteur', layout: 'souscripteur' })

const route = useRoute()
const { data: groupe, pending, error, refresh } = useMonAssociation(() => String(route.params.id))
const association = computed(() => groupe.value?.association)
const logo = useImageFichier(() => association.value?.logoFichierId)
useHead({ title: () => `${association.value?.nom ?? 'Association'} · Cotiz` })

const membreDepuis = computed(() => (groupe.value ? formatMois(groupe.value.membreDepuis).toLowerCase() : ''))
const suspendue = computed(() => association.value?.statut === 'suspendue')
// Aucun projet où déclarer dans cette association (terminés, contrats à signer, suspendue, rien à régler) : pas de bouton.
const projetDeclarable = computed(() => groupe.value?.souscriptions.find(peutDeclarer)?.projetId)

function carte(s: SouscriptionMembre) {
  const duree = s.projet.nbEcheances ? ` · ${s.projet.nbEcheances} mois` : ''
  const base = { nom: s.projet.nom, sousTitre: `${formatFCFA(s.engagement)}${duree}`, statut: statutCarte(s), to: lienProjet(s) }
  if (s.statut === 'signature_attendue') return { ...base, message: 'Signez le contrat pour voir votre échéancier.' }
  return { ...base, montant: s.reste, progression: progression(s) }
}

function pied(s: SouscriptionMembre): [string, string] {
  const p = s.projet
  if (s.statut === 'signature_attendue') {
    const echeance = `${formatFCFA(p.montantEcheance)} / mois`
    return p.fondsEntree ? [`${formatFCFA(p.fondsEntree)} à l’entrée`, `puis ${echeance}`] : [echeance, '']
  }
  const gauche = s.nbEcheancesEnRetard
    ? `${pluriel(s.nbEcheancesEnRetard, 'échéance')} en retard`
    : s.prochaine ? `Prochaine : ${formatDate(s.prochaine.date, 'jour-mois')}` : 'À jour'
  return [gauche, 'Contrat signé']
}
</script>

<template>
  <div class="asso">
    <EnTeteSouscripteur
      :titre="association?.nom ?? 'Association'"
      retour="/associations"
      mobile-seul
    />

    <template v-if="pending && !groupe">
      <CzSkeleton
        :hauteur="136"
        class="asso__skel"
      />
      <div class="asso__grille">
        <CarteProjet
          v-for="n in 2"
          :key="n"
          vue="souscripteur"
          chargement
        />
      </div>
    </template>

    <CzErreurChargement
      v-else-if="error || !groupe || !association"
      titre="Impossible d’afficher cette association"
      :erreur="error"
      :introuvable="{ titre: 'Association introuvable', description: 'Vous n’êtes inscrit à aucun projet de cette association.', retour: { label: 'Retour à l’accueil', to: '/accueil' } }"
      class="asso__vide"
      @reessayer="refresh()"
    />

    <template v-else>
      <BandeauSuspension :noms="suspendue ? [association.nom] : []" />
      <CzCard
        variante="lg"
        tag="section"
        class="asso__identite"
      >
        <CzAvatar
          :nom="association.nom"
          :initiales="association.sigle"
          :src="logo ?? undefined"
          org
          class="asso__avatar"
        />
        <div class="asso__nom">
          <NuxtLink
            to="/associations"
            class="asso__retour"
          >
            ← Mes associations
          </NuxtLink>
          <h1>{{ association.nom }}</h1>
          <p>{{ association.ville }} · membre depuis {{ membreDepuis }}</p>
        </div>
        <div class="asso__contacts">
          <CzButton
            v-if="association.telephoneContact"
            variante="secondaire"
            icone="appeler"
            :href="`tel:${association.telephoneContact.replace(/\s/g, '')}`"
          >
            Appeler
          </CzButton>
          <CzButton
            v-if="association.emailContact"
            variante="secondaire"
            icone="email"
            :href="`mailto:${association.emailContact}`"
          >
            Écrire
          </CzButton>
        </div>
      </CzCard>

      <section class="asso__section">
        <TitreSection titre="Mes projets dans cette association" />
        <div class="asso__grille">
          <CarteProjet
            v-for="s in groupe.souscriptions"
            :key="s.id"
            vue="souscripteur"
            v-bind="carte(s)"
          >
            <template #pied>
              <span class="asso__pied">{{ pied(s)[0] }}</span>
              <span class="asso__pied">{{ pied(s)[1] }}</span>
            </template>
          </CarteProjet>
        </div>
      </section>

      <CzCard
        variante="lg"
        tag="section"
        class="asso__payer"
        aria-labelledby="titre-comment-payer"
      >
        <h2 id="titre-comment-payer">
          Comment payer {{ association.nom }}
        </h2>
        <CommentPayer :modalites="association.modalitesPaiement">
          <CzButton
            v-if="projetDeclarable"
            bloc
            :to="lienDeclarer(projetDeclarable)"
          >
            Déclarer un paiement
          </CzButton>
        </CommentPayer>
      </CzCard>
    </template>
  </div>
</template>

<style scoped>
.asso {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
  max-width: 860px;
  margin: 0 auto;
}

.asso__skel {
  border-radius: var(--r-card-lg);
}

.asso__vide {
  padding: var(--space-12) var(--space-6);
  border-radius: var(--r-card-lg);
  box-shadow: var(--shadow);
}

.asso__identite {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-6);
}

.asso__avatar {
  width: 64px;
  height: 64px;
  font-size: 22px;
}

.asso__nom {
  flex: 1;
  min-width: 0;
}

.asso__retour {
  display: inline-flex;
  margin-bottom: var(--space-1);
  font-size: 13px;
  font-weight: 600;
  color: var(--text-muted);
  text-decoration: none;
}

.asso__nom h1 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 26px;
  font-weight: 600;
  line-height: 1.3;
  color: var(--text-strong);
}

.asso__nom p {
  margin: var(--space-1) 0 0;
  font-size: 14px;
  color: var(--text-muted);
}

.asso__contacts {
  display: flex;
  gap: var(--space-2);
}

.asso__section {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.asso__grille {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: start;
  gap: var(--space-4);
}

.asso__pied {
  font-size: 14px;
  color: var(--text-strong);
}

.asso__payer {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-6);
}

.asso__payer h2 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 600;
  color: var(--text-strong);
}

@media (max-width: 767px) {
  .asso {
    gap: var(--space-4);
  }

  .asso__identite {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-3);
  }

  .asso__retour {
    display: none;
  }

  .asso__nom h1 {
    font-size: 24px;
  }

  .asso__grille {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-3);
  }
}
</style>
