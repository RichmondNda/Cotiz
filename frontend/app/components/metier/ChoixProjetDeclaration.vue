<!--
  Étape « Projet » de la déclaration : cartes radio des projets du souscripteur avec leur reste à payer.
  En retard : montant du retard en danger-fg. Contrat non signé : carte inactive (« Contrat à signer avant tout paiement »).
  Clavier : flèches pour changer de projet, comme un groupe radio natif.
-->
<script setup lang="ts">
import type { SouscriptionMembre } from '~~/types'
import { formatFCFA, nomCourtAssociation } from '~/utils/format'

const props = defineProps<{
  souscriptions: SouscriptionMembre[]
  label?: string
}>()

const modele = defineModel<string | null>({ default: null })
const racine = ref<HTMLElement | null>(null)

// Projets déclarables d'abord, contrats à signer en dernier.
const options = computed(() => [...props.souscriptions].sort((a, b) => Number(a.statut === 'signature_attendue') - Number(b.statut === 'signature_attendue')).map((s) => {
  const inactive = s.statut === 'signature_attendue'
  const retard = s.montantEnRetard > 0
  return {
    id: s.projetId,
    nom: s.projet.nom,
    association: nomCourtAssociation(s.association.nom),
    inactive,
    ton: inactive ? 'warning' : retard ? 'danger' : 'neutre',
    montant: inactive ? 'Contrat à signer' : retard ? `${formatFCFA(s.montantEnRetard)} en retard` : formatFCFA(s.reste),
    detail: inactive ? 'avant tout paiement' : retard ? `reste ${formatFCFA(s.reste)}` : 'reste à payer',
  }
}))
const actives = computed(() => options.value.filter(o => !o.inactive))

function choisir(id: string) {
  if (options.value.find(o => o.id === id)?.inactive) return
  modele.value = id
}

function surTouche(e: KeyboardEvent, id: string) {
  const i = actives.value.findIndex(o => o.id === id)
  const n = actives.value.length
  let j: number
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % n
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i - 1 + n) % n
  else return
  e.preventDefault()
  const cible = actives.value[j]!
  modele.value = cible.id
  racine.value?.querySelector<HTMLElement>(`[data-projet="${cible.id}"]`)?.focus()
}

const focalisable = computed(() => modele.value ?? actives.value[0]?.id)
</script>

<template>
  <div
    ref="racine"
    role="radiogroup"
    :aria-label="label"
    class="choix-projet"
  >
    <div
      v-for="o in options"
      :key="o.id"
      role="radio"
      :data-projet="o.id"
      class="choix-projet__carte"
      :class="{ 'is-on': modele === o.id, 'is-off': o.inactive }"
      :aria-checked="modele === o.id"
      :aria-disabled="o.inactive || undefined"
      :tabindex="!o.inactive && o.id === focalisable ? 0 : -1"
      @click="choisir(o.id)"
      @keydown="surTouche($event, o.id)"
      @keydown.space.prevent="choisir(o.id)"
    >
      <span
        class="choix-projet__radio"
        aria-hidden="true"
      />
      <span class="choix-projet__nom">
        <b>{{ o.nom }}</b>
        <span>{{ o.association }}</span>
      </span>
      <span class="choix-projet__montant">
        <b :class="`is-${o.ton}`">{{ o.montant }}</b>
        <span>{{ o.detail }}</span>
      </span>
    </div>
  </div>
</template>

<style scoped>
.choix-projet {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.choix-projet__carte {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: 68px;
  padding: var(--space-3);
  border: 2px solid var(--border);
  border-radius: var(--r-tile);
  background: var(--surface);
  cursor: pointer;
}

.choix-projet__carte:hover:not(.is-off, .is-on) {
  border-color: var(--text-disabled);
}

.choix-projet__carte.is-on {
  border-color: var(--brand);
}

.choix-projet__carte.is-off {
  background: var(--surface-hover);
  opacity: .6;
  cursor: not-allowed;
}

.choix-projet__carte:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.choix-projet__radio {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border: 2px solid var(--text-disabled);
  border-radius: 50%;
}

.is-on .choix-projet__radio {
  border-color: var(--brand);
}

.is-on .choix-projet__radio::after {
  content: "";
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--brand);
}

.choix-projet__nom {
  flex: 1;
  min-width: 0;
  font-size: 12.5px;
  color: var(--text-muted);
}

.choix-projet__nom b {
  display: block;
  font-family: var(--font-display);
  font-size: 15px;
  font-weight: 600;
  line-height: 1.5;
  color: var(--text-strong);
}

.choix-projet__montant {
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--text-muted);
  text-align: right;
}

.choix-projet__montant b {
  display: block;
  font-weight: 600;
  color: var(--text-strong);
}

.choix-projet__montant b.is-danger {
  color: var(--danger-fg);
}

.choix-projet__montant b.is-warning {
  color: var(--warning-fg);
}
</style>
