<!--
  MbProjet — détail d'un projet vu par le souscripteur : « où j'en suis, et agir ».
  Carte de situation (reste à payer dominant, versé · total · échéances restantes), « Déclarer un paiement »,
  échéancier, comment payer (repliable), paiements déclarés (rejet : motif + « Déclarer à nouveau »).
  Scénarios : `a-jour`, `paiement-en-attente`, `paiement-rejete`, `termine` (défaut : en retard).
-->
<script setup lang="ts">
import { formatFCFA, nomCourtAssociation } from '~/utils/format'
import { lienDeclarer, progression } from '~/utils/souscriptions'

definePageMeta({ middleware: 'espace-souscripteur', layout: 'souscripteur', fab: false })

const route = useRoute()
const projetId = computed(() => String(route.params.id))
const { data: s, pending, error, refresh } = useMaSouscription(projetId)

useHead({ title: () => `${s.value?.projet.nom ?? 'Projet'} · Cotiz` })

const termine = computed(() => s.value?.projet.statut === 'termine')
const aSigner = computed(() => s.value?.statut === 'signature_attendue')
const enRetard = computed(() => !termine.value && s.value?.statut === 'en_retard')
const enAttente = computed(() => s.value?.paiements.some(p => p.statut === 'en_attente') ?? false)
const restantes = computed(() => s.value?.echeances.filter(e => e.statut !== 'payee').length ?? 0)
const commentPayerOuvert = ref(false)
</script>

<template>
  <div class="projet">
    <EnTeteSouscripteur
      variante="barre"
      :titre="s?.projet.nom ?? 'Projet'"
      :sous-titre="s ? nomCourtAssociation(s.association.nom) : undefined"
      retour="/accueil"
    >
      <template #actions>
        <CzButton
          variante="secondaire"
          taille="sm"
          icone="contrat"
          :to="`/projets/${projetId}/contrat`"
        >
          Contrat
        </CzButton>
      </template>
    </EnTeteSouscripteur>

    <div class="projet__colonne">
      <template v-if="pending && !s">
        <CzSkeleton
          :hauteur="190"
          class="projet__skel"
        />
        <CzSkeleton
          :hauteur="50"
          class="projet__skel"
        />
        <CzSkeleton
          :hauteur="420"
          class="projet__skel"
        />
      </template>

      <CzEmpty
        v-else-if="error || !s"
        icone="alerte"
        ton="danger"
        titre="Impossible d’afficher ce projet"
        description="Vérifiez votre connexion, puis réessayez."
        class="projet__vide"
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
        v-else-if="aSigner"
        icone="contrat"
        titre="Contrat à signer"
        description="Signez le contrat pour voir votre échéancier."
        class="projet__vide"
      >
        <template #action>
          <CzButton :to="`/projets/${projetId}/contrat`">
            Signer le contrat
          </CzButton>
        </template>
      </CzEmpty>

      <template v-else>
        <CzAlert
          v-if="termine"
          ton="success"
          sans-icone
        >
          <b>Projet terminé.</b> Toutes vos échéances sont payées. Merci !
        </CzAlert>

        <CzCard
          variante="lg"
          tag="section"
          class="projet__situation"
          aria-label="Ma situation"
        >
          <div class="projet__situation-haut">
            <span class="projet__libelle">Reste à payer</span>
            <BadgeStatut
              v-if="termine"
              type="projet"
              statut="termine"
            />
            <BadgeStatut
              v-else-if="enRetard"
              type="souscription"
              statut="en_retard"
            />
            <CzBadge
              v-else-if="enAttente"
              ton="warning"
            >
              Paiement en attente
            </CzBadge>
            <BadgeStatut
              v-else
              type="souscription"
              :statut="s.statut"
            />
          </div>
          <div
            class="projet__reste"
            :class="{ 'is-retard': enRetard }"
          >
            {{ formatFCFA(s.reste) }}
          </div>
          <CzProgress
            :valeur="progression(s)"
            :ton="enRetard ? 'danger' : 'brand'"
            :label="`${formatFCFA(s.verse)} versés sur ${formatFCFA(s.engagement)}`"
          />
          <dl class="projet__chiffres">
            <div>
              <dt>versé</dt>
              <dd>{{ formatFCFA(s.verse) }}</dd>
            </div>
            <div>
              <dt>total</dt>
              <dd>{{ formatFCFA(s.engagement) }}</dd>
            </div>
            <div>
              <dt>échéances restantes</dt>
              <dd>{{ restantes }}</dd>
            </div>
          </dl>
        </CzCard>

        <CzButton
          v-if="!termine"
          taille="lg"
          bloc
          :to="lienDeclarer(projetId)"
        >
          Déclarer un paiement
        </CzButton>

        <CzCard
          variante="lg"
          tag="section"
          class="projet__carte"
          aria-labelledby="titre-echeancier"
        >
          <h2
            id="titre-echeancier"
            class="projet__titre"
          >
            Échéancier
          </h2>
          <Echeancier
            :echeances="s.echeances"
            :complet="termine"
          />
        </CzCard>

        <CzAccordeon
          v-model:ouvert="commentPayerOuvert"
          titre="Comment payer"
          class="projet__comment"
        >
          <CommentPayer :modalites="s.association.modalitesPaiement" />
        </CzAccordeon>

        <CzCard
          v-if="s.paiements.length"
          variante="lg"
          tag="section"
          class="projet__carte"
          aria-labelledby="titre-paiements"
        >
          <h2
            id="titre-paiements"
            class="projet__titre"
          >
            Mes paiements déclarés
          </h2>
          <ListePaiementsDeclares
            :paiements="s.paiements"
            :echeances="s.echeances"
          />
        </CzCard>
      </template>
    </div>
  </div>
</template>

<style scoped>
.projet__colonne {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  max-width: 760px;
  margin: var(--space-6) auto 0;
}

.projet__skel {
  border-radius: var(--r-card-lg);
}

.projet__vide {
  padding: var(--space-12) var(--space-6);
  border-radius: var(--r-card-lg);
  box-shadow: var(--shadow);
}

.projet__situation {
  padding: var(--space-4);
}

.projet__situation-haut {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-2);
}

.projet__libelle {
  font-size: 13px;
  color: var(--text-muted);
}

.projet__reste {
  margin: var(--space-3) 0;
  font-family: var(--font-display);
  font-size: 32px;
  font-weight: 600;
  line-height: 1.2;
  color: var(--text-strong);
  font-variant-numeric: tabular-nums;
}

.projet__reste.is-retard {
  color: var(--danger-fg);
}

.projet__chiffres {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-2);
  margin: var(--space-3) 0 0;
  text-align: center;
}

.projet__chiffres div {
  display: flex;
  flex-direction: column-reverse;
}

.projet__chiffres dd {
  margin: 0;
  font-family: var(--font-display);
  font-size: 15px;
  font-weight: 600;
  color: var(--text-strong);
}

.projet__chiffres dt {
  margin-top: var(--space-1);
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-muted);
}

.projet__carte {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
}

.projet__titre {
  margin: var(--space-1) 0 0;
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 600;
  color: var(--text-strong);
}

.projet__comment {
  border: 0;
  border-radius: var(--r-card-lg);
  box-shadow: var(--shadow);
}

.projet__comment :deep(.q) {
  min-height: 56px;
  font-family: var(--font-display);
  font-size: 16px;
}

@media (max-width: 767px) {
  .projet__colonne {
    gap: var(--space-3);
    margin-top: var(--space-3);
  }

  .projet__reste {
    font-size: 30px;
  }
}
</style>
