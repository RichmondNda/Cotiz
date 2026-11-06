<!--
  SaReinitialisations — demandes « mot de passe oublié » des gestionnaires, traitées par le super-admin (pf.resets).
  Écran ajouté après la maquette (ui-deviations.md, sa-resets) : composants existants, calqué sur SaDemandes ; tableau
  et modale dans DemandesReinitialisation (partagé avec MgResets).
  Owner et admin plateforme seulement (`platform.associations.manage`) : le support n'a pas l'entrée du menu.
-->
<script setup lang="ts">
definePageMeta({ middleware: 'espace-plateforme', layout: 'backoffice', espace: 'superadmin', titre: 'Réinitialisations' })
useHead({ title: 'Réinitialisations · Cotiz' })

const router = useRouter()
// Owner et admin seulement : le support (sans l'entrée du menu) qui ouvre l'adresse revient au tableau de bord.
const { peut, pret } = usePermissions()
watchEffect(() => {
  if (pret.value && !peut('platform.associations.manage')) router.replace('/plateforme')
})
const { data, pending, error, refresh } = useReinitialisations()
const { emettre } = useEmissionCodeReinitialisation()
</script>

<template>
  <div class="sa-reinit">
    <EnTetePage
      titre="Réinitialisations"
      sous-titre="Gestionnaires qui ont oublié leur mot de passe. Vérifiez leur identité hors ligne avant de générer un code."
    />

    <DemandesReinitialisation
      :demandes="data"
      :pending="pending"
      :erreur="!!error"
      :emettre="emettre"
      libelle-personne="Gestionnaire"
      label="Demandes de réinitialisation des gestionnaires"
      description-vide="Les gestionnaires qui demandent un nouveau mot de passe apparaîtront ici."
      @rafraichir="refresh()"
    />
  </div>
</template>

<style scoped>
.sa-reinit {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
</style>
