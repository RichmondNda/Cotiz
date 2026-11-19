<!--
  Barre latérale du back-office (240 px ; 72 px repliée, icônes seules).
  Gestionnaire : logo, association courante (→ paramètres), menu, puis Équipe / Abonnement / Paramètres.
  Super-admin : logo, badge « Espace plateforme », menu, puis Mon profil / Se déconnecter.
  Menus : app/config/navigation.ts ; compteurs : API mockée.
-->
<script setup lang="ts">
import { type EntreeNavigation, NAV_GESTIONNAIRE, NAV_PLATEFORME } from '~/config/navigation'

const props = withDefaults(defineProps<{
  espace: 'gestionnaire' | 'superadmin'
  replie?: boolean
}>(), { replie: false })

defineEmits<{ naviguer: [] }>()

const { deconnecter } = useSession()
const { data: moi } = useMoi()
// Logo de l'association courante (gestionnaire), à défaut ses initiales.
const logo = useImageFichier(() => (props.espace === 'gestionnaire' ? moi.value?.association?.logoFichierId : undefined))
const { actif, compteur } = useEntreesNavigation()

const { peut } = usePermissions()
// Entrée réservée à une permission (Réinitialisations : owner et admin plateforme) : masquée sans elle.
const nav = computed(() => {
  const menu = props.espace === 'superadmin' ? NAV_PLATEFORME : NAV_GESTIONNAIRE
  const visibles = (entrees: EntreeNavigation[]) => entrees.filter(e => !e.permission || peut(e.permission))
  return { principal: visibles(menu.principal), bas: visibles(menu.bas) }
})
const accueil = computed(() => (props.espace === 'superadmin' ? '/plateforme' : '/asso'))
</script>

<template>
  <nav
    class="cz-side sidebar"
    :class="{ 'is-replie': replie }"
    aria-label="Navigation principale"
  >
    <NuxtLink
      :to="accueil"
      class="logo sidebar__logo"
      aria-label="Cotiz — accueil"
    >
      <CzLogo
        variante="symbole"
        :taille="28"
      />
      <span class="sidebar__texte">Cotiz</span>
    </NuxtLink>

    <NuxtLink
      v-if="espace === 'gestionnaire' && moi?.association"
      to="/asso/parametres"
      class="org sidebar__org"
      :title="replie ? moi.association.nom : undefined"
    >
      <CzAvatar
        :nom="moi.association.nom"
        :initiales="moi.association.sigle"
        :src="logo ?? undefined"
        org
        class="sidebar__org-avatar"
      />
      <span class="sidebar__texte"><b>{{ moi.association.nom }}</b>Plan {{ moi.association.plan }}</span>
    </NuxtLink>
    <div
      v-else-if="espace === 'superadmin'"
      class="role sidebar__texte"
    >
      <CzBadge
        ton="brand"
        icone="plateforme"
      >
        Espace plateforme
      </CzBadge>
    </div>

    <template
      v-for="(groupe, g) in [nav.principal, nav.bas]"
      :key="g"
    >
      <div
        v-if="g === 1"
        class="sep"
      />
      <template
        v-for="e in groupe"
        :key="e.cle"
      >
        <button
          v-if="e.action === 'deconnexion'"
          type="button"
          class="it sidebar__it"
          :title="replie ? e.label : undefined"
          :aria-label="replie ? e.label : undefined"
          @click="deconnecter"
        >
          <CzIcon :nom="e.icone" /><span class="sidebar__texte sidebar__label">{{ e.label }}</span>
        </button>
        <NuxtLink
          v-else
          :to="e.to"
          class="it sidebar__it"
          :class="{ 'is-on': actif(e) }"
          :aria-current="actif(e) ? 'page' : undefined"
          :title="replie ? e.label : undefined"
          :aria-label="replie ? (compteur(e) ? `${e.label} (${compteur(e)})` : e.label) : undefined"
          @click="$emit('naviguer')"
        >
          <CzIcon :nom="e.icone" /><span class="sidebar__texte sidebar__label">{{ e.label }}</span>
          <CzCount
            v-if="compteur(e)"
            :valeur="compteur(e)!"
            :ton="e.tonCompteur"
          />
        </NuxtLink>
      </template>
    </template>
  </nav>
</template>

<style scoped>
.sidebar {
  height: 100%;
  padding: var(--space-4) var(--space-3);
  overflow-y: auto;
}

.sidebar__logo {
  font-size: 18px;
  text-decoration: none;
}

.sidebar__org {
  color: var(--text-muted);
  text-decoration: none;
}

.sidebar__org-avatar {
  width: 34px;
  height: 34px;
  font-size: 12px;
}

.sidebar__it {
  min-height: 40px;
  border: 0;
  background: none;
  font: inherit;
  font-size: 13.5px;
  text-align: left;
  text-decoration: none;
}

.sidebar__it:focus-visible,
.sidebar__org:focus-visible,
.sidebar__logo:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.sidebar__label {
  flex-grow: 1;
}

/* Repliée (tablette) : icônes seules, compteur en pastille. */
.sidebar.is-replie {
  padding-inline: var(--space-2);
}

.sidebar.is-replie .sidebar__texte {
  display: none;
}

.sidebar.is-replie .sidebar__logo {
  justify-content: center;
  padding-inline: 0;
}

.sidebar.is-replie .sidebar__org {
  justify-content: center;
  padding-inline: 0;
  background: none;
}

.sidebar.is-replie .sidebar__it {
  position: relative;
  justify-content: center;
  padding: var(--space-3) 0;
}

.sidebar.is-replie .sidebar__it .cz-count {
  position: absolute;
  top: 2px;
  right: 6px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  font-size: 10px;
}
</style>
