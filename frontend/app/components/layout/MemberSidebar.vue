<!--
  Barre latérale souscripteur (desktop, 240 px) : logo, 4 entrées + Notifications (compteur),
  « Déclarer un paiement » en bas, puis l'utilisateur.
-->
<script setup lang="ts">
import type { ElementMenu } from '~/components/cz/CzMenu.vue'
import { NAV_SOUSCRIPTEUR, NAV_SOUSCRIPTEUR_NOTIFICATIONS } from '~/config/navigation'

const props = withDefaults(defineProps<{
  alias?: Record<string, string[]>
}>(), { alias: () => ({}) })

const { data: moi } = useMoi()
// Sans projet où déclarer (terminé, contrat à signer, association suspendue, rien à régler) : pas de bouton.
const { data: declarationPossible } = useDeclarationPossible()
const { actif, compteur } = useEntreesNavigation(() => props.alias)

const entrees = [...NAV_SOUSCRIPTEUR, NAV_SOUSCRIPTEUR_NOTIFICATIONS]
const nom = computed(() => [moi.value?.prenom, moi.value?.nom].filter(Boolean).join(' '))
// Menu du compte sous le nom (retours d'interface du 2026-11-12) : profil et déconnexion à portée, comme le gestionnaire.
const { deconnecter } = useSession()
const menuCompte: ElementMenu[] = [
  { label: 'Mon profil', to: '/profil' },
  { label: 'Se déconnecter', danger: true, separe: true, action: deconnecter },
]
</script>

<template>
  <nav
    class="membre-nav"
    aria-label="Navigation principale"
  >
    <NuxtLink
      to="/accueil"
      class="membre-nav__logo"
      aria-label="Cotiz — accueil"
    >
      <CzLogo
        :taille="28"
        :taille-texte="18"
      />
    </NuxtLink>
    <NuxtLink
      v-for="e in entrees"
      :key="e.cle"
      :to="e.to"
      class="membre-nav__it"
      :class="{ 'is-on': actif(e) }"
      :aria-current="actif(e) ? 'page' : undefined"
    >
      <CzIcon
        :nom="e.icone"
        :taille="20"
      />
      <span class="membre-nav__label">{{ e.label }}</span>
      <CzCount
        v-if="compteur(e)"
        :valeur="compteur(e)!"
        :ton="e.tonCompteur"
      />
    </NuxtLink>
    <div class="membre-nav__sep" />
    <CzButton
      v-if="declarationPossible"
      bloc
      icone="ajouter"
      to="/paiements/declarer"
    >
      Déclarer un paiement
    </CzButton>
    <CzMenu
      v-if="moi"
      :elements="menuCompte"
      alignement="gauche"
      ouverture="haut"
      label="Menu du compte"
      class="membre-nav__compte"
    >
      <template #declencheur="{ basculer, attrs }">
        <button
          type="button"
          class="membre-nav__moi"
          v-bind="attrs"
          aria-label="Menu du compte"
          @click="basculer"
        >
          <CzAvatar
            :nom="nom"
            taille="sm"
          />
          <span><b>{{ nom }}</b><span class="cz-muted">{{ moi.fonction ?? 'Souscripteur' }}</span></span>
          <CzIcon
            nom="chevron-bas"
            class="membre-nav__chevron"
          />
        </button>
      </template>
    </CzMenu>
  </nav>
</template>

<style scoped>
.membre-nav {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  height: 100%;
  padding: var(--space-4) var(--space-3);
  background: var(--surface);
  border-right: 1px solid var(--border);
  font-family: var(--font-text);
}

.membre-nav__logo {
  display: flex;
  padding: var(--space-1) var(--space-2) var(--space-4);
  text-decoration: none;
}

.membre-nav__it {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: 42px;
  padding: var(--space-3);
  border-radius: var(--r-btn-sm);
  font-size: 14px;
  color: var(--text-muted);
  text-decoration: none;
}

.membre-nav__it:hover {
  background: var(--surface-hover);
  color: var(--text);
}

.membre-nav__it.is-on {
  background: var(--brand-pale);
  color: var(--brand-dark);
  font-weight: 600;
}

.membre-nav__it:focus-visible,
.membre-nav__logo:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.membre-nav__label {
  flex-grow: 1;
}

.membre-nav__sep {
  flex-grow: 1;
}

.membre-nav__compte {
  display: flex;
  width: 100%;
}

.membre-nav__moi {
  display: flex;
  flex: 1;
  align-items: center;
  gap: var(--space-3);
  min-height: 44px;
  margin-top: var(--space-2);
  padding: var(--space-2);
  border: 0;
  border-radius: var(--r-field);
  background: none;
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}

.membre-nav__moi:hover {
  background: var(--surface-hover);
}

.membre-nav__moi:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.membre-nav__chevron {
  width: 16px;
  height: 16px;
  margin-left: auto;
  color: var(--text-muted);
  transform: rotate(180deg);
}

.membre-nav__moi b {
  display: block;
  color: var(--text-strong);
}
</style>
