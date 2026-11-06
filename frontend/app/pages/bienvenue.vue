<!--
  MbOnboarding — expliquer Cotiz en 3 écrans à une personne que son association y a inscrite.
  Carrousel (glissement horizontal, points de pagination), « Suivant » / « Précédent », « Passer » ;
  dernière diapositive : « Voir mes projets ». Plein écran en mobile, carte centrée (560 px) en desktop, sans navigation.
-->
<script setup lang="ts">
import type { NomIcone } from '~/utils/icons'

definePageMeta({ middleware: 'espace-souscripteur', layout: false })
useHead({ title: 'Bienvenue · Cotiz', bodyAttrs: { 'data-theme': 'member' } })

const { data: moi } = useMoi()

// Association qui a inscrit la personne : la plus ancienne inscription (`GET /me`, réel ; me.assos reste simulé au lot 3.2).
const association = computed(() => moi.value?.associationsSouscrites[0]?.nom ?? 'Votre association')

const diapositives = computed<{ icone: NomIcone, titre: string, texte: string }[]>(() => [
  {
    icone: 'accueil',
    titre: moi.value ? `Bienvenue ${moi.value.prenom} !` : 'Bienvenue !',
    texte: `${association.value} vous a inscrit sur Cotiz. Retrouvez ici vos projets, vos échéances et tous vos paiements.`,
  },
  {
    icone: 'echeance',
    titre: 'Suivez vos échéances',
    texte: 'Voyez d’un coup d’œil ce qui est payé, ce qui arrive et ce qui est en retard, projet par projet.',
  },
  {
    icone: 'ajouter',
    titre: 'Déclarez vos paiements',
    texte: 'Après un versement mobile money ou bancaire, déclarez-le en quelques secondes avec votre preuve. Votre association le valide.',
  },
])

const index = ref(0)
const courante = computed(() => diapositives.value[index.value]!)
const derniere = computed(() => index.value === diapositives.value.length - 1)

function aller(i: number) {
  index.value = Math.max(0, Math.min(diapositives.value.length - 1, i))
}
function suivant() {
  if (derniere.value) navigateTo('/accueil')
  else aller(index.value + 1)
}

// Glissement horizontal (mobile).
let departX: number | null = null
function debutGlisse(e: TouchEvent) {
  departX = e.touches[0]?.clientX ?? null
}
function finGlisse(e: TouchEvent) {
  const x = e.changedTouches[0]?.clientX
  if (departX === null || x === undefined) return
  const dx = x - departX
  departX = null
  if (Math.abs(dx) < 50) return
  aller(index.value + (dx < 0 ? 1 : -1))
}
</script>

<template>
  <div
    class="bienvenue"
    data-theme="member"
  >
    <main
      class="bienvenue__carte"
      @touchstart.passive="debutGlisse"
      @touchend="finGlisse"
    >
      <header class="bienvenue__haut">
        <CzLogo
          :taille="28"
          :taille-texte="20"
        />
        <NuxtLink
          v-if="!derniere"
          to="/accueil"
          class="bienvenue__passer"
        >
          Passer
        </NuxtLink>
      </header>

      <section
        class="bienvenue__diapo"
        aria-roledescription="diapositive"
        :aria-label="`${index + 1} sur ${diapositives.length}`"
        aria-live="polite"
      >
        <div
          class="bienvenue__illustration"
          aria-hidden="true"
        >
          <span class="bienvenue__point" />
          <span class="bienvenue__halo">
            <span class="bienvenue__tuile">
              <CzIcon
                :nom="courante.icone"
                :taille="36"
              />
            </span>
          </span>
        </div>
        <h1>{{ courante.titre }}</h1>
        <p>{{ courante.texte }}</p>
      </section>

      <div
        class="bienvenue__points"
        role="tablist"
        aria-label="Diapositives"
      >
        <button
          v-for="(d, i) in diapositives"
          :key="i"
          type="button"
          role="tab"
          :aria-selected="i === index"
          :aria-label="`Diapositive ${i + 1} : ${d.titre}`"
          :class="{ 'is-on': i === index }"
          @click="aller(i)"
        />
      </div>

      <div class="bienvenue__actions">
        <CzButton
          taille="lg"
          bloc
          @click="suivant"
        >
          {{ derniere ? 'Voir mes projets' : 'Suivant' }}
        </CzButton>
        <CzButton
          v-if="index > 0"
          variante="fantome"
          @click="aller(index - 1)"
        >
          Précédent
        </CzButton>
      </div>
    </main>
  </div>
</template>

<style scoped>
.bienvenue {
  min-height: 100vh;
  padding: 72px var(--space-4) var(--space-8);
  background: var(--page);
}

.bienvenue__carte {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-6);
  max-width: 560px;
  margin: 0 auto;
  padding: var(--space-8) var(--space-8) var(--space-8);
  border-radius: var(--r-card-lg);
  background: var(--surface);
  box-shadow: var(--shadow);
  text-align: center;
}

.bienvenue__haut {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  min-height: 44px;
}

.bienvenue__passer {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  padding: 0 var(--space-2);
  font-size: 14px;
  font-weight: 600;
  color: var(--text-muted);
  text-decoration: none;
}

.bienvenue__passer:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
  border-radius: var(--r-sm);
}

.bienvenue__diapo {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
}

.bienvenue__illustration {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 220px;
  height: 220px;
  margin-bottom: var(--space-8);
  border: 2px solid var(--brand-pale);
  border-radius: 50%;
}

.bienvenue__point {
  position: absolute;
  top: 24px;
  right: -8px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--brand);
}

.bienvenue__halo {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 150px;
  height: 150px;
  border-radius: 50%;
  background: var(--brand-pale);
}

.bienvenue__tuile {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 88px;
  height: 88px;
  border-radius: var(--r-sheet);
  background: var(--surface);
  box-shadow: var(--shadow-hover);
  color: var(--brand);
}

.bienvenue__diapo h1 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 26px;
  font-weight: 700;
  line-height: 1.3;
  color: var(--text-strong);
}

.bienvenue__diapo p {
  max-width: 480px;
  margin: 0;
  font-size: 15px;
  line-height: 1.7;
  color: var(--text-muted);
}

.bienvenue__points {
  display: flex;
  gap: var(--space-2);
}

.bienvenue__points button {
  width: 10px;
  height: 10px;
  padding: 0;
  border: 0;
  border-radius: var(--r-pill);
  background: var(--border);
  cursor: pointer;
}

.bienvenue__points button.is-on {
  width: 26px;
  background: var(--brand);
}

.bienvenue__points button:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.bienvenue__actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
}

@media (max-width: 767px) {
  .bienvenue {
    padding: var(--space-4) var(--space-4) var(--space-8);
  }

  .bienvenue__carte {
    gap: var(--space-6);
    padding: 0;
    background: transparent;
    box-shadow: none;
  }

  .bienvenue__illustration {
    margin: var(--space-4) 0 var(--space-8);
  }

  .bienvenue__diapo h1 {
    font-size: 28px;
  }
}
</style>
