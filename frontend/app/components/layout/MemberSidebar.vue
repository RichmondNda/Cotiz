<!--
  Barre latérale souscripteur (desktop, 240 px) : logo, 4 entrées + Notifications (compteur),
  « Déclarer un paiement » en bas, puis l'utilisateur.
-->
<script setup lang="ts">
import { NAV_SOUSCRIPTEUR, NAV_SOUSCRIPTEUR_NOTIFICATIONS } from '~/config/navigation'

const props = withDefaults(defineProps<{
  alias?: Record<string, string[]>
}>(), { alias: () => ({}) })

const { data: moi } = useMoi()
const { actif, compteur } = useEntreesNavigation(() => props.alias)

const entrees = [...NAV_SOUSCRIPTEUR, NAV_SOUSCRIPTEUR_NOTIFICATIONS]
const nom = computed(() => [moi.value?.prenom, moi.value?.nom].filter(Boolean).join(' '))
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
      bloc
      icone="ajouter"
      to="/paiements/declarer"
    >
      Déclarer un paiement
    </CzButton>
    <div
      v-if="moi"
      class="membre-nav__moi"
    >
      <CzAvatar
        :nom="nom"
        taille="sm"
      />
      <span><b>{{ nom }}</b><span class="cz-muted">{{ moi.fonction ?? 'Souscripteur' }}</span></span>
    </div>
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

.membre-nav__moi {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-2) 0;
  font-size: 13px;
}

.membre-nav__moi b {
  display: block;
  color: var(--text-strong);
}
</style>
