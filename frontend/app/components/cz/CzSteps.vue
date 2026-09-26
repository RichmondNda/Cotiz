<!--
  Indicateur d'étapes : terminées en success (cliquables pour revenir), courante en brand, erreur en danger.
  Mobile (< 768 px) : « Étape 3 sur 6 — Calendrier » + barre de progression.
-->
<script setup lang="ts">
const props = withDefaults(defineProps<{
  etapes: string[]
  /** Numéro de l'étape courante (à partir de 1). */
  courante: number
  /** Numéros des étapes en erreur. */
  erreurs?: number[]
  /** Autorise le retour sur une étape terminée. */
  navigable?: boolean
}>(), { erreurs: () => [], navigable: true })

const emit = defineEmits<{ aller: [etape: number] }>()

function etat(n: number) {
  if (props.erreurs.includes(n)) return 'is-error'
  if (n < props.courante) return 'is-done'
  if (n === props.courante) return 'is-cur'
  return ''
}
const pourcentage = computed(() => Math.round((props.courante / props.etapes.length) * 100))
</script>

<template>
  <div class="cz-steps-bloc">
    <ol
      class="cz-steps cz-steps--desktop"
      aria-label="Étapes"
    >
      <template
        v-for="(e, i) in etapes"
        :key="e"
      >
        <li
          class="s"
          :class="etat(i + 1)"
          :aria-current="i + 1 === courante ? 'step' : undefined"
        >
          <component
            :is="navigable && i + 1 < courante ? 'button' : 'span'"
            :type="navigable && i + 1 < courante ? 'button' : undefined"
            class="cz-steps__cible"
            @click="navigable && i + 1 < courante && emit('aller', i + 1)"
          >
            <b><CzIcon
              v-if="etat(i + 1) === 'is-done'"
              nom="coche"
            /><template v-else>{{ i + 1 }}</template></b>{{ e }}
          </component>
        </li>
        <li
          v-if="i < etapes.length - 1"
          class="ln"
          :class="{ 'is-done': i + 2 <= courante }"
          aria-hidden="true"
        />
      </template>
    </ol>
    <div class="cz-steps--mobile">
      <div class="cz-steps__entete">
        <b>Étape {{ courante }} sur {{ etapes.length }} — {{ etapes[courante - 1] }}</b>
        <span class="cz-muted">{{ pourcentage }}&nbsp;%</span>
      </div>
      <CzProgress
        :valeur="pourcentage"
        :label="`Étape ${courante} sur ${etapes.length}`"
      />
    </div>
  </div>
</template>

<style scoped>
.cz-steps {
  margin: 0;
  padding: 0;
  list-style: none;
}

.cz-steps__cible {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  color: inherit;
}

button.cz-steps__cible {
  cursor: pointer;
}

button.cz-steps__cible:focus-visible {
  outline: none;
  border-radius: var(--r-sm);
  box-shadow: var(--focus-ring);
}

.cz-steps--mobile {
  display: none;
}

.cz-steps__entete {
  display: flex;
  justify-content: space-between;
  gap: var(--space-2);
  margin-bottom: var(--space-2);
  font-size: 13px;
}

@media (max-width: 767px) {
  .cz-steps--desktop {
    display: none;
  }

  .cz-steps--mobile {
    display: block;
  }
}
</style>
