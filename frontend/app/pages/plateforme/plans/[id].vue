<!--
  SaPlan — créer (`/plateforme/plans/nouveau`) ou modifier une formule tarifaire (formulaire : FormulairePlan).
  Scénarios : `chargement`, `erreur` ; avertissement abonnés : interaction réelle (scripts/parcours).
-->
<script setup lang="ts">
definePageMeta({ middleware: 'espace-plateforme', layout: 'backoffice', espace: 'superadmin', titre: 'Plan' })

const route = useRoute()
const id = computed(() => String(route.params.id))
const creation = computed(() => id.value === 'nouveau')
const { data: plan, pending, error, refresh } = usePlan(id, { immediat: !creation.value })

useHead({ title: () => `${creation.value ? 'Nouveau plan' : plan.value?.nom ?? 'Plan'} · Cotiz` })
useFilAriane(() => [{ label: 'Plans', to: '/plateforme/plans' }, { label: creation.value ? 'Nouveau plan' : plan.value?.nom ?? '…' }])

const introuvable = computed(() => (error.value as { statusCode?: number } | null)?.statusCode === 404)
</script>

<template>
  <FormulairePlan
    v-if="creation"
    :plan="null"
  />
  <div
    v-else-if="pending && !plan"
    class="sa-plan-chargement"
  >
    <CzSkeleton
      :hauteur="32"
      largeur="40%"
    />
    <div class="cz-card">
      <CzSkeleton :hauteur="320" />
    </div>
  </div>
  <CzEmpty
    v-else-if="introuvable"
    icone="plans"
    ton="neutral"
    titre="Plan introuvable"
    description="Ce plan n’existe pas ou a été supprimé."
  >
    <template #action>
      <CzButton
        variante="secondaire"
        to="/plateforme/plans"
      >
        Retour aux plans
      </CzButton>
    </template>
  </CzEmpty>
  <CzErreurChargement
    v-else-if="error || !plan"
    titre="Impossible d’afficher le plan"
    @reessayer="refresh()"
  />
  <FormulairePlan
    v-else
    :key="plan.id"
    :plan="plan"
  />
</template>

<style scoped>
.sa-plan-chargement {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
</style>
