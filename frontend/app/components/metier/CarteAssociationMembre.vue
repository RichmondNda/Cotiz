<!--
  Association du souscripteur (MbAssociations) : avatar carré, nom, ville et nombre de projets, chevron vers la fiche ;
  puis une ligne par projet (reste, retard ou contrat à signer, badge de statut) qui mène au projet.
-->
<script setup lang="ts">
import type { AssociationMembre, SouscriptionMembre } from '~~/types'
import { formatDate, formatFCFA, nomCourtAssociation, pluriel } from '~/utils/format'
import { estTermine, lienProjet, statutCarte } from '~/utils/souscriptions'

const props = defineProps<{
  groupe: AssociationMembre
}>()

const lien = computed(() => `/associations/${props.groupe.association.id}`)
const logo = useImageFichier(() => props.groupe.association.logoFichierId)

function detail(s: SouscriptionMembre) {
  if (estTermine(s)) return `${formatFCFA(s.engagement)} · terminé`
  if (s.statut === 'signature_attendue') return `${formatFCFA(s.engagement)} · contrat à signer`
  if (s.montantEnRetard > 0) return `Reste ${formatFCFA(s.reste)} · ${formatFCFA(s.montantEnRetard)} en retard`
  return s.prochaine
    ? `Reste ${formatFCFA(s.reste)} · prochaine échéance ${formatDate(s.prochaine.date, 'jour-mois')}`
    : `Reste ${formatFCFA(s.reste)}`
}
</script>

<template>
  <article class="asso-membre">
    <NuxtLink
      :to="lien"
      class="asso-membre__entete"
    >
      <CzAvatar
        :nom="groupe.association.nom"
        :initiales="groupe.association.sigle"
        :src="logo ?? undefined"
        org
      />
      <span class="asso-membre__nom">
        <b>{{ nomCourtAssociation(groupe.association.nom) }}</b>
        <span>{{ groupe.association.ville }} · {{ pluriel(groupe.souscriptions.length, 'projet') }}</span>
      </span>
      <CzIcon
        nom="chevron-droite"
        class="asso-membre__chevron"
      />
    </NuxtLink>
    <ul class="asso-membre__projets">
      <li
        v-for="s in groupe.souscriptions"
        :key="s.id"
      >
        <NuxtLink
          :to="lienProjet(s)"
          class="asso-membre__projet"
        >
          <span class="asso-membre__projet-texte">
            <b>{{ s.projet.nom }}</b>
            <span>{{ detail(s) }}</span>
          </span>
          <BadgeStatut
            :type="estTermine(s) ? 'projet' : 'souscription'"
            :statut="statutCarte(s)"
            petit
          />
        </NuxtLink>
      </li>
    </ul>
  </article>
</template>

<style scoped>
.asso-membre {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-6);
  border-radius: var(--r-card-lg);
  background: var(--surface);
  box-shadow: var(--shadow);
}

.asso-membre__entete {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: 44px;
  margin-bottom: var(--space-2);
  border-radius: var(--r-md);
  color: inherit;
  text-decoration: none;
}

.asso-membre__entete :deep(.cz-avatar) {
  font-size: 17px;
}

.asso-membre__nom {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  font-size: 12.5px;
  color: var(--text-muted);
}

.asso-membre__nom b {
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 600;
  line-height: 1.35;
  color: var(--text-strong);
}

.asso-membre__chevron {
  flex-shrink: 0;
  color: var(--text-muted);
}

.asso-membre__projets {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.asso-membre__projet {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: 64px;
  padding: var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  background: var(--surface-subtle);
  color: inherit;
  text-decoration: none;
}

.asso-membre__projet:hover {
  background: var(--surface-hover);
}

.asso-membre__projet-texte {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--text-muted);
}

.asso-membre__projet-texte b {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-strong);
}

.asso-membre__entete:focus-visible,
.asso-membre__projet:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}
</style>
