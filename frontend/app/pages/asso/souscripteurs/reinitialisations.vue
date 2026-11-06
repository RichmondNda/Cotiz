<!--
  MgResets — demandes « mot de passe oublié » des souscripteurs, traitées par l'association (as.resets, lot 3.1).
  Écran ajouté après la maquette (ui-deviations.md, mg-resets) : composants existants, même tableau et même modale que
  SaReinitialisations (DemandesReinitialisation). Gestionnaires qui inscrivent seulement (members.manage) : les autres
  reviennent à l'annuaire, sans appel à as.resets. Entrée : bouton « Réinitialisations » de l'annuaire et notification
  « demande de réinitialisation ».
-->
<script setup lang="ts">
definePageMeta({ middleware: 'espace-gestionnaire', layout: 'backoffice', espace: 'gestionnaire', titre: 'Réinitialisations' })
useHead({ title: 'Réinitialisations · Cotiz' })
useFilAriane(() => [{ label: 'Souscripteurs', to: '/asso/souscripteurs' }, { label: 'Réinitialisations' }])

const router = useRouter()
const { peut, pret } = usePermissions()
const { data, pending, error, refresh } = useReinitialisationsAssociation({ immediat: false })
watch(pret, (p) => {
  if (!p) return
  if (peut('members.manage')) refresh()
  else router.replace('/asso/souscripteurs')
}, { immediate: true })
const { emettre } = useEmissionCodeReinitialisationAssociation()
</script>

<template>
  <div class="mg-reinit">
    <EnTeteGestionnaireMobile
      titre="Réinitialisations"
      sous-titre="Mots de passe oubliés"
    />
    <EnTetePage
      titre="Réinitialisations"
      sous-titre="Souscripteurs qui ont oublié leur mot de passe. Vérifiez leur identité hors ligne (appel, en personne) avant de générer un code."
      class="cz-desktop"
    />

    <DemandesReinitialisation
      :demandes="data"
      :pending="pending"
      :erreur="!!error"
      :emettre="emettre"
      libelle-personne="Souscripteur"
      label="Demandes de réinitialisation des souscripteurs"
      description-vide="Les souscripteurs qui demandent un nouveau mot de passe apparaîtront ici."
      @rafraichir="refresh()"
    />
  </div>
</template>

<style scoped>
.mg-reinit {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
</style>
