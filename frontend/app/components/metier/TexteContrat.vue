<!--
  Texte intégral d'un contrat (typographie de lecture : 16 px, interligne 1.7), puis les signatures.
  Le texte vient de l'API : paragraphes séparés par une ligne vide, `**…**` pour le gras (jamais de HTML brut).
-->
<script setup lang="ts">
import { paragraphesContrat } from '~/utils/contrat'

export interface Signature {
  role: string
  nom: string
  mention: string
}

const props = defineProps<{
  titre: string
  sousTitre?: string
  texte: string
  signatures: Signature[]
}>()

const paragraphes = computed(() => paragraphesContrat(props.texte))
</script>

<template>
  <CzCard
    variante="lg"
    tag="article"
    class="contrat"
  >
    <h2 class="contrat__titre">
      {{ titre }}
    </h2>
    <p
      v-if="sousTitre"
      class="contrat__sous-titre"
    >
      {{ sousTitre }}
    </p>
    <div class="contrat__texte">
      <p
        v-for="(p, i) in paragraphes"
        :key="i"
      >
        <template
          v-for="(m, j) in p"
          :key="j"
        >
          <strong v-if="m.gras">{{ m.texte }}</strong><template v-else>
            {{ m.texte }}
          </template>
        </template>
      </p>
    </div>
    <div class="contrat__signatures">
      <div
        v-for="s in signatures"
        :key="s.role"
      >
        <span>{{ s.role }}</span>
        <b>{{ s.nom }}</b>
        <span>{{ s.mention }}</span>
      </div>
    </div>
  </CzCard>
</template>

<style scoped>
.contrat {
  padding: var(--space-6);
}

.contrat__titre {
  margin: 0;
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 600;
  color: var(--text-strong);
}

.contrat__sous-titre {
  margin: var(--space-2) 0 0;
  font-size: 13px;
  color: var(--text-muted);
}

.contrat__texte {
  margin-top: var(--space-4);
  font-size: 16px;
  line-height: 1.7;
  color: var(--text);
}

.contrat__texte p {
  margin: 0 0 var(--space-3);
}

.contrat__texte strong {
  font-weight: 600;
  color: var(--text-strong);
}

.contrat__signatures {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: var(--space-4);
  padding-top: var(--space-4);
  border-top: 1px solid var(--border);
}

.contrat__signatures div {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  font-size: 12px;
  color: var(--text-muted);
}

.contrat__signatures b {
  font-family: var(--font-display);
  font-size: 14px;
  font-weight: 600;
  color: var(--text-strong);
}
</style>
