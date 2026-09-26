<!-- Lien d'évitement « Aller au contenu » : invisible jusqu'au premier Tab, mène à #contenu. -->
<template>
  <a
    href="#contenu"
    class="lien-evitement"
  >Aller au contenu</a>
</template>

<style scoped>
.lien-evitement {
  position: absolute;
  left: var(--space-2);
  top: -100px;
  z-index: 300;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--r-field);
  background: var(--surface);
  color: var(--brand-dark);
  box-shadow: var(--shadow-menu);
}

.lien-evitement:focus {
  top: var(--space-2);
}
</style>
