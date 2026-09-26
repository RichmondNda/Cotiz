<!-- Démonstration du gabarit de connexion (développement uniquement), thème par ?theme=member|manager|superadmin. -->
<script setup lang="ts">
definePageMeta({ middleware: 'dev-uniquement', layout: false })
const route = useRoute()
const theme = computed(() => (['member', 'manager', 'superadmin'].includes(String(route.query.theme)) ? route.query.theme : 'manager') as 'member' | 'manager' | 'superadmin')
const email = ref('awa@entraide.ci')
const mdp = ref('motdepasse')
const garder = ref(true)
</script>

<template>
  <NuxtLayout
    name="auth"
    :theme="theme"
  >
    <template #panneau>
      <b class="dev-accroche">Votre association, organisée.</b>
    </template>
    <div>
      <h1 class="dev-h1">
        Espace association
      </h1>
      <p class="cz-help dev-sous">
        Connectez-vous pour gérer vos projets et vos souscripteurs.
      </p>
    </div>
    <CzField label="Email">
      <CzInput
        v-model="email"
        type="email"
      />
    </CzField>
    <CzField label="Mot de passe">
      <CzInput
        v-model="mdp"
        type="password"
      />
    </CzField>
    <CzCheckbox v-model="garder">
      Rester connecté
    </CzCheckbox>
    <CzButton
      taille="lg"
      bloc
    >
      Se connecter
    </CzButton>
  </NuxtLayout>
</template>

<style scoped>
.dev-accroche {
  font-family: var(--font-display);
  font-size: 34px;
  font-weight: 600;
  line-height: 1.2;
}

.dev-h1 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 28px;
  font-weight: 600;
  color: var(--text-strong);
}

.dev-sous {
  margin: var(--space-1) 0 0;
  font-size: 14px;
}
</style>
