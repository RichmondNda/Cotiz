<!--
  Liste libellé / valeur des fiches (SaDemande, SaAssociation) : libellé gris à gauche, valeur à droite.
  `copier` : bouton « Copier » après la valeur (email, téléphone), avec toast de confirmation.
  `mono` : valeur en police mono (téléphones, références). Slot `valeur-<cle>` pour une valeur riche (badge).
-->
<script setup lang="ts">
export interface Definition {
  cle: string
  libelle: string
  valeur?: string | number
  mono?: boolean
  /** Libellé accessible du bouton de copie (« Copier l’email »). */
  copier?: string
}

withDefaults(defineProps<{
  elements: Definition[]
  /** Largeur de la colonne des libellés. */
  largeurLibelle?: string
}>(), { largeurLibelle: '200px' })

const toast = useToast()

async function copier(d: Definition) {
  try {
    await navigator.clipboard.writeText(String(d.valeur ?? ''))
    toast.succes('Copié', { message: `${d.libelle} copié dans le presse-papiers.` })
  }
  catch {
    toast.erreur('Copie impossible', { message: 'Sélectionnez le texte pour le copier.' })
  }
}
</script>

<template>
  <dl
    class="definitions"
    :style="{ '--definitions-libelle': largeurLibelle }"
  >
    <template
      v-for="d in elements"
      :key="d.cle"
    >
      <dt>{{ d.libelle }}</dt>
      <dd :class="{ definitions__copie: d.copier }">
        <slot :name="`valeur-${d.cle}`">
          <span :class="{ 'cz-mono': d.mono }">{{ d.valeur }}</span>
        </slot>
        <CzButton
          v-if="d.copier"
          variante="icone"
          taille="sm"
          icone="copier"
          :label="d.copier"
          @click="copier(d)"
        />
      </dd>
    </template>
  </dl>
</template>

<style scoped>
.definitions {
  display: grid;
  grid-template-columns: var(--definitions-libelle) minmax(0, 1fr);
  gap: var(--space-3) 0;
  margin: 0;
  font-size: 14px;
}

dt {
  color: var(--text-muted);
}

dd {
  margin: 0;
  color: var(--text);
  overflow-wrap: anywhere;
}

.definitions__copie {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

@media (max-width: 767px) {
  .definitions {
    grid-template-columns: minmax(0, 1fr);
    gap: 0;
  }

  dd {
    margin-bottom: var(--space-3);
  }
}
</style>
