<!--
  Éditeur de texte simple (description d'un projet) : barre « Gras » et « Liste » au-dessus d'une zone de texte.
  Mise en forme légère en texte brut : **gras**, puces « • » en début de ligne.
  S'utilise dans un CzField (libellé, aide, erreur).
-->
<script setup lang="ts">
import { useChamp } from '~/composables/useChamp'

const props = withDefaults(defineProps<{
  lignes?: number
  placeholder?: string
  erreur?: boolean
  id?: string
}>(), { lignes: 3, placeholder: undefined, erreur: false, id: undefined })

const modele = defineModel<string>({ default: '' })
const champ = useChamp(props)
const zone = ref<HTMLTextAreaElement | null>(null)

async function remplacer(debut: number, fin: number, texte: string, curseur: number) {
  modele.value = modele.value.slice(0, debut) + texte + modele.value.slice(fin)
  await nextTick()
  zone.value?.focus()
  zone.value?.setSelectionRange(curseur, curseur)
}

function gras() {
  const el = zone.value
  if (!el) return
  const { selectionStart: a, selectionEnd: b } = el
  const choisi = modele.value.slice(a, b) || 'texte'
  remplacer(a, b, `**${choisi}**`, a + choisi.length + 4)
}

function liste() {
  const el = zone.value
  if (!el) return
  const debutLigne = modele.value.lastIndexOf('\n', el.selectionStart - 1) + 1
  remplacer(debutLigne, debutLigne, '• ', el.selectionStart + 2)
}
</script>

<template>
  <div
    class="editeur"
    :class="{ 'is-error': champ.enErreur.value }"
  >
    <div
      class="editeur__barre"
      role="toolbar"
      aria-label="Mise en forme"
    >
      <CzButton
        variante="icone"
        taille="sm"
        label="Gras"
        class="editeur__gras"
        @click="gras"
      >
        G
      </CzButton>
      <CzButton
        variante="icone"
        taille="sm"
        label="Liste à puces"
        @click="liste"
      >
        •≡
      </CzButton>
    </div>
    <textarea
      :id="champ.id.value"
      ref="zone"
      v-model="modele"
      class="editeur__zone"
      :rows="lignes"
      :placeholder="placeholder"
      :aria-describedby="champ.decritPar.value"
      :aria-invalid="champ.enErreur.value || undefined"
    />
  </div>
</template>

<style scoped>
.editeur {
  overflow: hidden;
  border: 1.5px solid var(--border);
  border-radius: var(--r-field);
  background: var(--surface);
}

.editeur:focus-within {
  border-color: var(--brand);
  box-shadow: var(--focus-ring);
}

.editeur.is-error {
  border-color: var(--danger);
}

.editeur__barre {
  display: flex;
  gap: var(--space-1);
  padding: 6px;
  border-bottom: 1px solid var(--border);
  background: var(--surface-subtle);
}

.editeur__gras {
  font-weight: 700;
}

.editeur__zone {
  display: block;
  width: 100%;
  padding: 10px 14px;
  border: 0;
  outline: none;
  resize: vertical;
  font: inherit;
  font-size: 14.5px;
  line-height: 1.6;
  color: var(--text);
  background: transparent;
}
</style>
