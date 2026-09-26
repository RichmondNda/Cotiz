<!--
  Barre supérieure du back-office (64 px) : fil d'Ariane, recherche globale, cloche avec compteur, avatar et menu du compte.
  Super-admin en mobile : bouton menu (tiroir) à gauche.
-->
<script setup lang="ts">
import type { ElementMenu } from '~/components/cz/CzMenu.vue'

const props = defineProps<{
  espace: 'gestionnaire' | 'superadmin'
}>()

defineEmits<{ menu: [] }>()

const route = useRoute()
const { deconnecter } = useSession()
const { data: moi } = useMoi()
const { data: compteurs } = useCompteursNavigation()
const fil = useEtatFilAriane()
const recherche = ref('')

const estSa = computed(() => props.espace === 'superadmin')
const elementsFil = computed(() => {
  if (fil.value?.length) return estSa.value ? [{ label: 'Plateforme', to: '/plateforme' }, ...fil.value] : fil.value
  const titre = route.meta.titre ?? 'Tableau de bord'
  return estSa.value ? [{ label: 'Plateforme', to: '/plateforme' }, { label: titre }] : [{ label: titre }]
})

const nonLues = computed(() => (estSa.value ? compteurs.value?.demandesATraiter : compteurs.value?.notificationsNonLues) ?? 0)
const lienCloche = computed(() => (estSa.value ? '/plateforme/demandes' : '/asso/notifications'))
const libelleCloche = computed(() => (estSa.value
  ? `Notifications : ${nonLues.value} demande${nonLues.value > 1 ? 's' : ''} à traiter`
  : `Notifications : ${nonLues.value} non lue${nonLues.value > 1 ? 's' : ''}`))

const nomAffiche = computed(() => [moi.value?.prenom, moi.value?.nom].filter(Boolean).join(' '))
const menuCompte = computed<ElementMenu[]>(() => estSa.value
  ? [
      { label: 'Mon profil', to: '/plateforme/profil' },
      { label: 'Se déconnecter', danger: true, separe: true, action: deconnecter },
    ]
  : [
      { label: 'Mon profil', to: '/asso/profil' },
      { label: 'Paramètres de l’association', to: '/asso/parametres' },
      { label: 'Se déconnecter', danger: true, separe: true, action: deconnecter },
    ])
</script>

<template>
  <header class="cz-top topbar">
    <CzButton
      v-if="estSa"
      variante="icone"
      icone="menu"
      label="Ouvrir le menu"
      class="topbar__hamburger"
      @click="$emit('menu')"
    />
    <NuxtLink
      v-if="estSa"
      to="/plateforme"
      class="topbar__logo"
      aria-label="Cotiz — accueil"
    >
      <CzLogo />
    </NuxtLink>
    <CzCrumb
      :elements="elementsFil"
      class="topbar__fil"
    />
    <CzInput
      v-model="recherche"
      type="search"
      class="topbar__recherche"
      :placeholder="estSa ? 'Rechercher une association, une demande…' : 'Rechercher un souscripteur, un projet…'"
      label="Recherche globale"
    />
    <NuxtLink
      :to="lienCloche"
      class="cz-bell topbar__cloche"
      :aria-label="libelleCloche"
    >
      <CzIcon
        nom="notification"
        :taille="22"
      />
      <CzCount
        v-if="nonLues"
        :valeur="nonLues"
        ton="danger"
        class="topbar__compte"
      />
    </NuxtLink>
    <CzMenu
      :elements="menuCompte"
      label="Menu du compte"
    >
      <template #declencheur="{ basculer, attrs }">
        <button
          type="button"
          class="topbar__compte-btn"
          v-bind="attrs"
          aria-label="Menu du compte"
          @click="basculer"
        >
          <CzAvatar
            :nom="nomAffiche"
            taille="sm"
          />
          <span class="topbar__nom">{{ nomAffiche }}</span>
          <CzIcon
            nom="chevron-bas"
            :taille="16"
          />
        </button>
      </template>
    </CzMenu>
  </header>
</template>

<style scoped>
.topbar {
  position: sticky;
  top: 0;
  z-index: 10;
  gap: var(--space-6);
  padding: 0 var(--space-6);
}

.topbar__fil {
  min-width: 300px;
  font-size: 13.5px;
}

.topbar__recherche.cz-input {
  width: 360px;
  max-width: 360px;
  margin: 0 auto;
}

.topbar__cloche {
  width: var(--icon-btn);
  height: var(--icon-btn);
  align-items: center;
  justify-content: center;
  border-radius: var(--r-field);
}

.topbar__cloche .topbar__compte {
  top: 2px;
  right: 0;
}

.topbar__compte-btn {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1);
  border: 0;
  border-radius: var(--r-field);
  background: transparent;
  font-family: var(--font-text);
  font-size: 13.5px;
  color: var(--text);
  cursor: pointer;
}

.topbar__cloche:focus-visible,
.topbar__compte-btn:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.topbar__hamburger,
.topbar__logo {
  display: none;
}

@media (max-width: 1023px) {
  .topbar__fil {
    min-width: 0;
  }

  .topbar__recherche.cz-input {
    width: 280px;
  }
}

@media (max-width: 767px) {
  .topbar {
    padding: 0 var(--space-4);
    gap: var(--space-3);
  }

  .topbar__logo {
    display: flex;
    text-decoration: none;
  }

  .topbar__hamburger {
    display: inline-flex;
    width: 44px;
    height: 44px;
  }

  .topbar__fil,
  .topbar__recherche,
  .topbar__nom {
    display: none;
  }

  .topbar__cloche {
    margin-left: auto;
    width: 44px;
    height: 44px;
  }
}
</style>
