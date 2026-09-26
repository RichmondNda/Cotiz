<!--
  MbAssociations — « Projets » de la navigation : les projets du souscripteur regroupés par association.
  Scénario : `une-seule-association` (message d'information sous la carte).
-->
<script setup lang="ts">
definePageMeta({ middleware: 'espace-souscripteur', layout: 'souscripteur' })
useHead({ title: 'Mes associations · Cotiz' })

const { data: associations, pending, error, refresh } = useMesAssociations()
</script>

<template>
  <div class="associations">
    <EnTeteSouscripteur
      titre="Mes associations"
      sous-titre="Vos projets, regroupés par association"
    />

    <div
      v-if="pending && !associations"
      class="associations__grille"
    >
      <CarteAssociation
        v-for="n in 2"
        :key="n"
        chargement
      />
    </div>

    <CzEmpty
      v-else-if="error"
      icone="alerte"
      ton="danger"
      titre="Impossible d’afficher vos associations"
      description="Vérifiez votre connexion, puis réessayez."
      class="associations__vide"
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
      v-else-if="!associations?.length"
      icone="association"
      titre="Aucune association pour l’instant"
      description="Votre association vous inscrira à ses projets. Vous recevrez une notification."
      class="associations__vide"
    />

    <template v-else>
      <div class="associations__grille">
        <CarteAssociationMembre
          v-for="g in associations"
          :key="g.association.id"
          :groupe="g"
        />
      </div>
      <CzAlert
        v-if="associations.length === 1"
        ton="info"
        sans-icone
      >
        Vous ne faites partie que d’une association pour l’instant. Si une autre association vous inscrit sur Cotiz,
        elle apparaîtra ici.
      </CzAlert>
    </template>
  </div>
</template>

<style scoped>
.associations {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.associations__grille {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: start;
  gap: var(--space-4);
}

.associations__vide {
  padding: var(--space-12) var(--space-6);
  border-radius: var(--r-card-lg);
  box-shadow: var(--shadow);
}

@media (max-width: 767px) {
  .associations__grille {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-3);
  }
}
</style>
