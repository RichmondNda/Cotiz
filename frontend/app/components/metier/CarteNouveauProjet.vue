<!-- Carte fantôme « + Nouveau projet » en fin de grille de projets (pointillé, mène à la création). -->
<template>
  <NuxtLink
    to="/asso/projets/nouveau"
    class="cz-card cz-card--ghost carte-nouveau"
  >
    <CzIcon
      nom="ajouter"
      :taille="26"
    />
    Nouveau projet
  </NuxtLink>
</template>

<style scoped>
.carte-nouveau {
  text-decoration: none;
}

.carte-nouveau:hover {
  border-color: var(--brand);
}

.carte-nouveau:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}
</style>
