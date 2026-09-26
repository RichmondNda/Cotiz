<!--
  Zone de dépôt d'une preuve de paiement ou d'un logo.
  États : repos, survol / glisser (brand-pale), erreur, envoi en cours (barre de progression),
  fichier déposé (vignette + nom + « Retirer »), désactivé.
  Mobile : le toucher ouvre directement le choix appareil photo / galerie (input natif).
-->
<script setup lang="ts">
export interface FichierDepose {
  nom: string
  /** Taille en octets. */
  taille: number
  type?: string
  fichier?: File
}

const props = withDefaults(defineProps<{
  /** Types acceptés (attribut `accept`). */
  accept?: string
  /** Libellé des formats affiché sous le texte. */
  formats?: string
  tailleMaxMo?: number
  /** Message d'erreur imposé (sinon calculé : taille, format). */
  erreur?: string
  /** Aide sous le message d'erreur. */
  aideErreur?: string
  /** 0–100 pendant l'envoi, null sinon. */
  progression?: number | null
  disabled?: boolean
  /** Texte du dépôt désactivé. */
  texteDesactive?: string
  aideDesactive?: string
  label?: string
}>(), {
  accept: 'image/jpeg,image/png,application/pdf',
  formats: 'JPG, PNG ou PDF · 5 Mo maximum',
  tailleMaxMo: 5,
  erreur: undefined,
  aideErreur: undefined,
  progression: null,
  disabled: false,
  texteDesactive: 'Dépôt indisponible',
  aideDesactive: undefined,
  label: 'Déposer un fichier',
})

const modele = defineModel<FichierDepose | null>({ default: null })
const emit = defineEmits<{ annuler: [] }>()

const input = ref<HTMLInputElement | null>(null)
const survol = ref(false)
const erreurLocale = ref<{ message: string, aide: string } | null>(null)

const erreurAffichee = computed(() => props.erreur
  ? { message: props.erreur, aide: props.aideErreur ?? props.formats }
  : erreurLocale.value)

function formatTaille(octets: number): string {
  const mo = octets / 1024 / 1024
  if (mo >= 0.1) return `${mo.toFixed(1).replace('.', ',')}\u00A0Mo`
  return `${Math.max(1, Math.round(octets / 1024))}\u00A0Ko`
}

function accepter(f: File | undefined) {
  if (!f || props.disabled) return
  if (f.size > props.tailleMaxMo * 1024 * 1024) {
    erreurLocale.value = {
      message: `Fichier trop volumineux (${formatTaille(f.size)})`,
      aide: `Choisissez un fichier de ${props.tailleMaxMo}\u00A0Mo maximum`,
    }
    return
  }
  const types = props.accept.split(',').map(t => t.trim())
  if (f.type && !types.some(t => (t.endsWith('/*') ? f.type.startsWith(t.slice(0, -1)) : f.type === t))) {
    erreurLocale.value = { message: 'Format non accepté', aide: props.formats }
    return
  }
  erreurLocale.value = null
  modele.value = { nom: f.name, taille: f.size, type: f.type, fichier: f }
}

function surDepot(e: DragEvent) {
  survol.value = false
  accepter(e.dataTransfer?.files[0])
}
function surChoix(e: Event) {
  accepter((e.target as HTMLInputElement).files?.[0])
  ;(e.target as HTMLInputElement).value = ''
}
function parcourir() {
  if (!props.disabled) input.value?.click()
}
function retirer() {
  modele.value = null
}

const estImage = computed(() => !modele.value?.type || modele.value.type.startsWith('image/'))
</script>

<template>
  <div class="cz-filedrop">
    <input
      ref="input"
      type="file"
      class="sr-only"
      tabindex="-1"
      :accept="accept"
      :disabled="disabled"
      @change="surChoix"
    >

    <!-- Envoi en cours / fichier déposé -->
    <div
      v-if="modele"
      class="cz-file"
    >
      <span class="thumb"><CzIcon :nom="estImage ? 'image' : 'contrat'" /></span>
      <div class="cz-filedrop__infos">
        <div class="nm">
          {{ modele.nom }}
        </div>
        <template v-if="progression !== null">
          <CzProgress
            :valeur="progression"
            class="cz-filedrop__barre"
            label="Envoi du fichier"
          />
          <div
            class="meta"
            aria-live="polite"
          >
            Envoi… {{ Math.round(progression) }}&nbsp;%
          </div>
        </template>
        <div
          v-else
          class="meta"
        >
          {{ formatTaille(modele.taille) }} · déposé
        </div>
      </div>
      <CzButton
        v-if="progression !== null"
        variante="icone"
        taille="sm"
        icone="fermer"
        label="Annuler l'envoi"
        @click="emit('annuler')"
      />
      <CzButton
        v-else-if="!disabled"
        variante="fantome"
        taille="sm"
        @click="retirer"
      >
        Retirer
      </CzButton>
    </div>

    <!-- Zone de dépôt -->
    <div
      v-else
      class="cz-drop"
      :class="{ 'is-hover': survol, 'is-error': erreurAffichee, 'is-disabled': disabled }"
      role="button"
      :tabindex="disabled ? -1 : 0"
      :aria-disabled="disabled || undefined"
      :aria-label="label"
      @click="parcourir"
      @keydown.enter.prevent="parcourir"
      @keydown.space.prevent="parcourir"
      @dragenter.prevent="survol = !disabled"
      @dragover.prevent="survol = !disabled"
      @dragleave.prevent="survol = false"
      @drop.prevent="surDepot"
    >
      <template v-if="disabled">
        <CzIcon nom="importer" />
        <div>{{ texteDesactive }}</div>
        <span
          v-if="aideDesactive"
          class="fmt"
        >{{ aideDesactive }}</span>
      </template>
      <template v-else-if="erreurAffichee">
        <CzIcon nom="alerte" />
        <div
          role="alert"
        >
          <b>{{ erreurAffichee.message }}</b>
        </div>
        <span class="fmt">{{ erreurAffichee.aide }}</span>
      </template>
      <template v-else-if="survol">
        <CzIcon nom="importer" />
        <div><strong>Déposez le fichier</strong></div>
        <span class="fmt">{{ formats }}</span>
      </template>
      <template v-else>
        <CzIcon nom="importer" />
        <div><slot>Glissez votre preuve ici ou <strong>parcourez vos fichiers</strong></slot></div>
        <span class="fmt">{{ formats }}</span>
      </template>
    </div>
  </div>
</template>

<style scoped>
.cz-drop {
  cursor: pointer;
}

.cz-drop.is-disabled {
  cursor: not-allowed;
}

.cz-drop:focus-visible {
  outline: none;
  border-color: var(--brand);
  box-shadow: var(--focus-ring);
}

.cz-filedrop__infos {
  flex: 1;
  min-width: 0;
}

.cz-filedrop__infos .nm {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cz-filedrop__barre {
  margin: var(--space-2) 0 var(--space-1);
}
</style>
