<!--
  En-tête du site public : logo, ancres (Fonctionnement, Tarifs, FAQ), « Se connecter » (menu de choix du profil)
  et « Créer mon association ». Ombre douce. Mobile (< 768 px) : menu hamburger qui déplie les liens et les accès.
-->
<script setup lang="ts">
import type { ElementMenu } from '~/components/cz/CzMenu.vue'

const menuOuvert = ref(false)
const route = useRoute()

const CONNEXION: ElementMenu[] = [
  { label: 'Je suis gestionnaire', to: '/connexion/association', icone: 'souscripteurs', classeIcone: 'pub-entete__ic-gestionnaire' },
  { label: 'Je suis souscripteur', to: '/connexion', icone: 'mon-espace', classeIcone: 'pub-entete__ic-souscripteur' },
]

const LIENS = [
  { label: 'Fonctionnement', to: '/#fonctionnement' },
  { label: 'Tarifs', to: '/#tarifs' },
  { label: 'FAQ', to: '/#faq' },
]

watch(() => route.fullPath, () => (menuOuvert.value = false))
</script>

<template>
  <div class="pub-entete">
    <header class="pub-entete__barre">
      <NuxtLink
        to="/"
        class="pub-entete__logo"
        aria-label="Cotiz — accueil"
      >
        <CzLogo
          :taille="32"
          :taille-texte="21"
        />
      </NuxtLink>
      <nav
        class="pub-entete__nav"
        aria-label="Sections"
      >
        <NuxtLink
          v-for="l in LIENS"
          :key="l.to"
          :to="l.to"
        >
          {{ l.label }}
        </NuxtLink>
      </nav>
      <div class="pub-entete__actions">
        <CzMenu
          :elements="CONNEXION"
          alignement="gauche"
          largeur="250px"
          label="Se connecter"
          class="pub-entete__connexion"
        >
          <template #declencheur="{ basculer, attrs }">
            <CzButton
              variante="secondaire"
              icone-droite="chevron-bas"
              v-bind="attrs"
              @click="basculer"
            >
              Se connecter
            </CzButton>
          </template>
        </CzMenu>
        <CzButton to="/demande">
          Créer mon association
        </CzButton>
      </div>
      <CzButton
        variante="icone"
        icone="menu"
        :label="menuOuvert ? 'Fermer le menu' : 'Ouvrir le menu'"
        :aria-expanded="menuOuvert"
        class="pub-entete__hamburger"
        @click="menuOuvert = !menuOuvert"
      />
    </header>
    <div
      v-if="menuOuvert"
      class="pub-entete__tiroir"
    >
      <NuxtLink
        v-for="l in LIENS"
        :key="l.to"
        :to="l.to"
        class="pub-entete__lien-mobile"
      >
        {{ l.label }}
      </NuxtLink>
      <div class="pub-entete__surtitre">
        SE CONNECTER
      </div>
      <CzButton
        variante="secondaire"
        bloc
        to="/connexion/association"
        class="pub-entete__acces"
      >
        Je suis gestionnaire
      </CzButton>
      <CzButton
        variante="secondaire"
        bloc
        to="/connexion"
        class="pub-entete__acces"
      >
        Je suis souscripteur
      </CzButton>
      <CzButton
        taille="lg"
        bloc
        to="/demande"
        class="pub-entete__creer"
      >
        Créer mon association
      </CzButton>
    </div>
  </div>
</template>

<style scoped>
.pub-entete {
  position: relative;
  z-index: 20;
}

.pub-entete__barre {
  display: flex;
  align-items: center;
  gap: var(--space-8);
  height: 72px;
  padding: 0 var(--space-12);
  background: var(--surface);
  box-shadow: var(--shadow);
}

.pub-entete__logo {
  display: flex;
  text-decoration: none;
}

.pub-entete__nav {
  display: flex;
  gap: var(--space-6);
  margin: 0 auto;
  font-size: 14.5px;
}

.pub-entete__nav a {
  color: var(--text);
  text-decoration: none;
}

.pub-entete__nav a:hover {
  color: var(--brand-dark);
}

.pub-entete__actions {
  position: relative;
  display: flex;
  gap: var(--space-3);
  align-items: center;
}

/* Site public : violet et corail se mêlent (identités gestionnaire et souscripteur). */
.pub-entete__connexion :deep(.it .pub-entete__ic-gestionnaire) {
  color: var(--violet-dark);
}

.pub-entete__connexion :deep(.it .pub-entete__ic-souscripteur) {
  color: var(--corail);
}

.pub-entete__hamburger {
  display: none;
}

.pub-entete__tiroir {
  position: absolute;
  top: 64px;
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-4) var(--space-6);
  background: var(--surface);
  box-shadow: var(--shadow-menu);
}

.pub-entete__lien-mobile {
  padding: var(--space-3) var(--space-1);
  border-bottom: 1px solid var(--divider-row);
  font-size: 16px;
  color: var(--text);
  text-decoration: none;
}

.pub-entete__surtitre {
  padding: var(--space-4) var(--space-1) var(--space-1);
  font-family: var(--font-display);
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: .04em;
  color: var(--text-muted);
}

.pub-entete__acces {
  height: 48px;
}

.pub-entete__creer {
  margin-top: var(--space-2);
}

@media (max-width: 767px) {
  .pub-entete__barre {
    justify-content: space-between;
    height: 64px;
    padding: 0 var(--space-4);
  }

  .pub-entete__nav,
  .pub-entete__actions {
    display: none;
  }

  .pub-entete__hamburger {
    display: inline-flex;
    width: 44px;
    height: 44px;
  }

  .pub-entete__logo {
    --cz-logo-texte: 19px;
  }
}
</style>
