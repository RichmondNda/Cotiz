<!--
  « Vos données » (profils plateforme et gestionnaire, lot 4.7) : télécharge une copie JSON de ses données
  (me.profile › export : profil, compte, rôles, connexions récentes). Aucun secret dans le fichier.
-->
<script setup lang="ts">
import { messageRefus } from '~/composables/api/client'

const toast = useToast()
const exporter = useExportDonnees()
const enCours = ref(false)

async function telecharger() {
  enCours.value = true
  try {
    await exporter()
    toast.succes('Export téléchargé', { message: 'Le fichier JSON contient votre profil, vos accès et vos connexions récentes.' })
  }
  catch (e) {
    toast.erreur('Export impossible', { message: messageRefus(e) ?? 'Vérifiez votre connexion, puis réessayez.' })
  }
  finally {
    enCours.value = false
  }
}
</script>

<template>
  <section class="cz-card export-donnees">
    <div>
      <h2 class="export-donnees__titre">
        Vos données
      </h2>
      <p class="export-donnees__aide">
        Téléchargez une copie de vos données Cotiz (profil, accès, connexions récentes) au format JSON.
      </p>
    </div>
    <CzButton
      variante="secondaire"
      icone="telecharger"
      :chargement="enCours"
      libelle-chargement="Export…"
      @click="telecharger"
    >
      Exporter mes données
    </CzButton>
  </section>
</template>

<style scoped>
.export-donnees {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  flex-wrap: wrap;
}

.export-donnees__titre {
  margin: 0;
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 600;
  color: var(--text-strong);
}

.export-donnees__aide {
  margin: var(--space-2) 0 0;
  font-size: 13px;
  color: var(--text-muted);
}
</style>
