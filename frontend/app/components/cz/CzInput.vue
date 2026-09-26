<!--
  Champ de saisie `cz-input` (44 px).
  Types : texte, email, password (bouton afficher), search (icône loupe, 40 px), date, tel,
  montant (suffixe « F CFA », milliers formatés à la saisie, clavier numérique, v-model numérique),
  telephone (préfixe indicatif +225), textarea.
  États : erreur, désactivé, lecture seule (`copiable` ajoute un bouton copier), chargement (spinner à droite).
-->
<script setup lang="ts">
import type { NomIcone } from '~/utils/icons'
import { formatSaisieMontant, lireMontant } from '~/utils/format'
import { useChamp } from '~/composables/useChamp'

type TypeChamp = 'text' | 'email' | 'password' | 'search' | 'date' | 'tel' | 'montant' | 'telephone' | 'textarea'

const props = withDefaults(defineProps<{
  type?: TypeChamp
  placeholder?: string
  /** Texte de préfixe (ex. indicatif). Par défaut « +225 » pour `telephone`. */
  prefixe?: string
  /** Texte de suffixe. Par défaut « F CFA » pour `montant`. */
  suffixe?: string
  /** Icône en tête de champ (loupe pour `search`). */
  icone?: NomIcone
  erreur?: boolean
  disabled?: boolean
  readonly?: boolean
  chargement?: boolean
  copiable?: boolean
  mono?: boolean
  maxlength?: number
  lignes?: number
  autocomplete?: string
  inputmode?: 'text' | 'numeric' | 'tel' | 'email' | 'search' | 'decimal'
  id?: string
  name?: string
  /** Libellé accessible quand le champ n'est pas dans un CzField. */
  label?: string
}>(), {
  type: 'text',
  placeholder: undefined,
  prefixe: undefined,
  suffixe: undefined,
  icone: undefined,
  erreur: false,
  disabled: false,
  readonly: false,
  chargement: false,
  copiable: false,
  mono: false,
  maxlength: undefined,
  lignes: 3,
  autocomplete: undefined,
  inputmode: undefined,
  id: undefined,
  name: undefined,
  label: undefined,
})

const modele = defineModel<string | number | null>({ default: '' })
const emit = defineEmits<{ blur: [FocusEvent], focus: [FocusEvent] }>()

const champ = useChamp(props)
const visible = ref(false)
const copie = ref(false)

const estMontant = computed(() => props.type === 'montant')
const suffixeAffiche = computed(() => props.suffixe ?? (estMontant.value ? 'F CFA' : undefined))
const prefixeAffiche = computed(() => props.prefixe ?? (props.type === 'telephone' ? '+225' : undefined))
const iconeTete = computed(() => props.icone ?? (props.type === 'search' ? 'recherche' : undefined))

const typeNatif = computed(() => {
  switch (props.type) {
    case 'password': return visible.value ? 'text' : 'password'
    case 'montant': return 'text'
    case 'telephone': return 'tel'
    default: return props.type
  }
})
const modeSaisie = computed(() => props.inputmode ?? (estMontant.value ? 'numeric' : props.type === 'telephone' ? 'tel' : undefined))

const valeurAffichee = computed(() => {
  if (estMontant.value) {
    return typeof modele.value === 'number' ? formatSaisieMontant(String(modele.value)) : (modele.value ?? '')
  }
  return modele.value ?? ''
})

function saisir(e: Event) {
  const cible = e.target as HTMLInputElement | HTMLTextAreaElement
  if (estMontant.value) {
    const formate = formatSaisieMontant(cible.value)
    cible.value = formate
    modele.value = lireMontant(formate)
  }
  else {
    modele.value = cible.value
  }
}

async function copier() {
  try {
    await navigator.clipboard.writeText(String(modele.value ?? ''))
    copie.value = true
    setTimeout(() => (copie.value = false), 1500)
  }
  catch {
    // Presse-papiers indisponible (contexte non sécurisé) : rien à faire.
  }
}

const attributsCommuns = computed(() => ({
  'id': champ.id.value,
  'name': props.name,
  'placeholder': props.placeholder,
  'disabled': props.disabled,
  'readonly': props.readonly,
  'maxlength': props.maxlength,
  'autocomplete': props.autocomplete,
  'aria-invalid': champ.enErreur.value || undefined,
  'aria-describedby': champ.decritPar.value,
  'aria-required': champ.requis.value || undefined,
  'aria-label': props.label,
  'aria-busy': props.chargement || undefined,
}))
</script>

<template>
  <div
    class="cz-input"
    :class="{
      'cz-input--area': type === 'textarea',
      'cz-input--suffix': suffixeAffiche,
      'cz-input--prefix': prefixeAffiche,
      'cz-search': type === 'search',
      'is-error': champ.enErreur.value,
      'is-disabled': disabled,
      'is-readonly': readonly,
    }"
  >
    <span
      v-if="prefixeAffiche"
      class="pfx"
    ><slot name="prefixe">{{ prefixeAffiche }}</slot></span>
    <span
      v-if="iconeTete"
      class="lead"
    ><CzIcon :nom="iconeTete" /></span>
    <textarea
      v-if="type === 'textarea'"
      v-bind="attributsCommuns"
      class="cz-input__natif grow"
      :rows="lignes"
      :value="String(valeurAffichee)"
      @input="saisir"
      @blur="emit('blur', $event)"
      @focus="emit('focus', $event)"
    />
    <input
      v-else
      v-bind="attributsCommuns"
      class="cz-input__natif grow"
      :class="{ 'cz-num': estMontant, 'cz-mono': mono }"
      :type="typeNatif"
      :inputmode="modeSaisie"
      :value="valeurAffichee"
      @input="saisir"
      @blur="emit('blur', $event)"
      @focus="emit('focus', $event)"
    >
    <CzSpinner v-if="chargement" />
    <button
      v-if="type === 'password'"
      type="button"
      class="trail cz-input__action"
      :aria-label="visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'"
      :aria-pressed="visible"
      @click="visible = !visible"
    >
      <CzIcon nom="voir" />
    </button>
    <button
      v-if="copiable"
      type="button"
      class="trail cz-input__action"
      :aria-label="copie ? 'Copié' : 'Copier'"
      :title="copie ? 'Copié' : 'Copier'"
      @click="copier"
    >
      <CzIcon :nom="copie ? 'coche' : 'copier'" />
    </button>
    <span
      v-if="$slots.fin"
      class="trail"
    ><slot name="fin" /></span>
    <span
      v-if="suffixeAffiche"
      class="sfx"
    >{{ suffixeAffiche }}</span>
  </div>
</template>

<style scoped>
.cz-input__natif {
  height: 100%;
  padding: 0;
  border: 0;
  outline: none;
  background: transparent;
  font: inherit;
  color: inherit;
  white-space: normal;
}

.cz-input__natif.cz-mono {
  font-family: var(--font-mono);
  font-size: 12.5px;
}

.cz-input__natif::placeholder {
  color: var(--text-disabled);
}

.cz-input__natif:disabled {
  cursor: not-allowed;
}

textarea.cz-input__natif {
  min-height: 64px;
  resize: vertical;
  line-height: 1.5;
}

.cz-input__action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  height: 32px;
  margin-right: calc(-1 * var(--space-1));
  padding: 0;
  border: 0;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}

.cz-input__action:hover {
  background: var(--surface-hover);
}

.cz-input__action:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.cz-input--suffix .sfx,
.cz-input--prefix .pfx {
  flex-shrink: 0;
}
</style>
