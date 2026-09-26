<!--
  MbDeclarerOk — confirmation de déclaration : rassurer et expliquer la suite.
  Icône de succès, « Déclaration envoyée ! », mini-récapitulatif (projet, montant, échéances, statut),
  « Retour au projet » / « Accueil ». Lit le paiement créé (`?paiement=`).
-->
<script setup lang="ts">
import { libelleCouverture } from '~/utils/echeances'
import { formatFCFA } from '~/utils/format'

definePageMeta({ middleware: 'espace-souscripteur', layout: 'souscripteur', fab: false })
useHead({ title: 'Déclaration envoyée · Cotiz' })

const route = useRoute()
const id = computed(() => (typeof route.query.paiement === 'string' ? route.query.paiement : ''))
const { data: paiement, pending, error } = usePaiement(id)
</script>

<template>
  <div class="ok">
    <CzCard
      variante="lg"
      tag="section"
      class="ok__carte"
    >
      <template v-if="pending && !paiement">
        <CzSkeleton
          :largeur="84"
          :hauteur="84"
          forme="rond"
        />
        <CzSkeleton
          :hauteur="24"
          largeur="60%"
        />
        <CzSkeleton
          :hauteur="120"
          class="ok__skel"
        />
      </template>

      <CzEmpty
        v-else-if="!id || error || !paiement"
        icone="paiement"
        ton="neutral"
        titre="Déclaration introuvable"
        description="Retrouvez vos déclarations dans l’historique."
        integre
      >
        <template #action>
          <CzButton to="/historique">
            Voir l’historique
          </CzButton>
        </template>
      </CzEmpty>

      <template v-else>
        <CzIconeSucces :taille="84" />
        <h1 class="ok__titre">
          Déclaration envoyée !
        </h1>
        <p class="ok__texte">
          {{ paiement.association.nom }} va vérifier la réception de vos {{ formatFCFA(paiement.montant) }}.
          Vous serez notifié dès la validation.
        </p>
        <dl class="ok__recap">
          <div>
            <dt>Projet</dt>
            <dd>{{ paiement.projet.nom }}</dd>
          </div>
          <div>
            <dt>Montant</dt>
            <dd>{{ formatFCFA(paiement.montant) }}</dd>
          </div>
          <div>
            <dt>Échéances</dt>
            <dd>{{ libelleCouverture(paiement.echeances, 'long') }}</dd>
          </div>
          <div>
            <dt>Statut</dt>
            <dd>
              <CzBadge
                ton="warning"
                petit
              >
                En attente de validation
              </CzBadge>
            </dd>
          </div>
        </dl>
        <div class="ok__actions">
          <CzButton
            taille="lg"
            bloc
            :to="`/projets/${paiement.projetId}`"
          >
            Retour au projet
          </CzButton>
          <CzButton
            variante="secondaire"
            bloc
            to="/accueil"
          >
            Accueil
          </CzButton>
        </div>
      </template>
    </CzCard>
  </div>
</template>

<style scoped>
.ok__carte {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-4);
  max-width: 560px;
  margin: var(--space-12) auto 0;
  padding: var(--space-8) var(--space-8) var(--space-8);
  text-align: center;
}

.ok__skel {
  border-radius: var(--r-md);
}

.ok__titre {
  margin: var(--space-2) 0 0;
  font-family: var(--font-display);
  font-size: 26px;
  font-weight: 600;
  color: var(--text-strong);
}

.ok__texte {
  max-width: 460px;
  margin: 0;
  font-size: 15px;
  line-height: 1.6;
  color: var(--text-muted);
}

.ok__recap {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  width: 100%;
  margin: 0;
  padding: var(--space-4);
  border-radius: var(--r-md);
  background: var(--page);
  text-align: left;
}

.ok__recap div {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-3);
  font-size: 14px;
}

.ok__recap dt {
  color: var(--text-muted);
}

.ok__recap dd {
  margin: 0;
  font-weight: 600;
  color: var(--text-strong);
  text-align: right;
}

.ok__actions {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  width: 100%;
}

@media (max-width: 767px) {
  .ok__carte {
    margin-top: var(--space-6);
    padding: var(--space-6) var(--space-2);
    background: transparent;
    box-shadow: none;
  }

  .ok__titre {
    font-size: 28px;
  }

  .ok__recap {
    padding: var(--space-2) var(--space-6);
    background: transparent;
  }
}
</style>
