<!--
  Pages légales (/legal/cgu · /legal/confidentialite · /legal/mentions) : onglets entre documents, titre,
  date de mise à jour, « Imprimer » / « Télécharger en PDF » (boîte d'impression du navigateur), sommaire collant
  avec la section active surlignée et colonne de lecture de 720 px. Mobile : sommaire replié en accordéon.
-->
<script setup lang="ts">
import { estDocumentLegal, ONGLETS_LEGAUX } from '~/config/legal'
import { formatDate } from '~/utils/format'

definePageMeta({
  layout: 'public',
  validate: route => estDocumentLegal(route.params.document),
})

const route = useRoute()
const cle = computed(() => (estDocumentLegal(route.params.document) ? route.params.document : 'cgu'))
const { data: doc } = await useDocumentLegal(cle)
const sections = computed(() => doc.value?.sections ?? [])

useHead({ title: () => `${doc.value?.titre ?? ONGLETS_LEGAUX[cle.value]} — Cotiz` })

const active = ref(0)
const sommaireOuvert = ref(false)
watch(cle, () => {
  active.value = 0
  sommaireOuvert.value = false
})

// Section active : la dernière dont le titre est passé sous l'en-tête collant.
let observateur: IntersectionObserver | undefined
function observer() {
  observateur?.disconnect()
  const visibles = new Set<number>()
  observateur = new IntersectionObserver((entrees) => {
    for (const e of entrees) {
      const i = sections.value.findIndex(s => s.id === e.target.id)
      if (e.isIntersecting) visibles.add(i)
      else visibles.delete(i)
    }
    if (visibles.size) active.value = Math.min(...visibles)
  }, { rootMargin: '-88px 0px -55% 0px' })
  for (const s of sections.value) {
    const el = document.getElementById(s.id)
    if (el) observateur.observe(el)
  }
}
onMounted(observer)
watch(sections, () => nextTick(observer))
onBeforeUnmount(() => observateur?.disconnect())

function aller(i: number) {
  active.value = i
  sommaireOuvert.value = false
}

function imprimer() {
  window.print()
}
</script>

<template>
  <div class="legal">
    <div class="legal__bandeau">
      <nav
        class="legal__onglets"
        aria-label="Documents légaux"
      >
        <NuxtLink
          v-for="(onglet, k) in ONGLETS_LEGAUX"
          :key="k"
          :to="`/legal/${k}`"
          class="legal__onglet"
          :class="{ 'is-on': k === cle }"
          :aria-current="k === cle ? 'page' : undefined"
        >
          {{ onglet }}
        </NuxtLink>
      </nav>
      <h1 class="legal__titre">
        {{ doc?.titre }}
      </h1>
      <div class="legal__meta">
        <span class="legal__date">Dernière mise à jour : {{ doc ? formatDate(doc.miseAJour, 'long') : '[DATE]' }}</span>
        <div class="legal__actions">
          <CzButton
            variante="secondaire"
            taille="sm"
            icone="imprimer"
            @click="imprimer"
          >
            Imprimer
          </CzButton>
          <CzButton
            variante="secondaire"
            taille="sm"
            icone="telecharger"
            @click="imprimer"
          >
            Télécharger en PDF
          </CzButton>
        </div>
      </div>
    </div>

    <div class="legal__corps">
      <nav
        class="legal__sommaire"
        aria-label="Sommaire"
      >
        <div class="legal__surtitre">
          SOMMAIRE
        </div>
        <a
          v-for="(s, i) in sections"
          :key="s.id"
          :href="`#${s.id}`"
          class="legal__entree"
          :class="{ 'is-on': i === active }"
          :aria-current="i === active ? 'location' : undefined"
          @click="aller(i)"
        >{{ s.titre }}</a>
      </nav>

      <CzAccordeon
        v-model:ouvert="sommaireOuvert"
        titre="Sommaire"
        class="legal__sommaire-mobile"
      >
        <nav
          class="legal__sommaire-liste"
          aria-label="Sommaire"
        >
          <a
            v-for="(s, i) in sections"
            :key="s.id"
            :href="`#${s.id}`"
            class="legal__entree"
            :class="{ 'is-on': i === active }"
            @click="aller(i)"
          >{{ s.titre }}</a>
        </nav>
      </CzAccordeon>

      <article class="legal__article">
        <section
          v-for="s in sections"
          :id="s.id"
          :key="s.id"
          class="legal__section"
        >
          <h2>{{ s.titre }}</h2>
          <!-- eslint-disable vue/no-v-html -- Markdown versionné du dépôt, rendu sans HTML brut (markdown-it) -->
          <div
            class="legal__texte"
            v-html="s.html"
          />
          <!-- eslint-enable vue/no-v-html -->
        </section>
      </article>
    </div>
  </div>
</template>

<style scoped>
.legal {
  --gouttiere: max(var(--space-12), calc((100% - 1200px) / 2));
}

.legal__bandeau {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: calc(var(--space-8) + var(--space-2)) var(--gouttiere) var(--space-8);
  background: var(--corail-page);
}

.legal__onglets {
  display: flex;
  gap: var(--space-2);
}

.legal__onglet {
  display: inline-flex;
  align-items: center;
  min-height: 40px;
  padding: var(--space-2) var(--space-4);
  border: 1px solid var(--border);
  border-radius: var(--r-pill);
  background: var(--surface);
  font-size: 13.5px;
  color: var(--text);
  text-decoration: none;
  white-space: nowrap;
}

.legal__onglet:hover {
  border-color: var(--text-disabled);
}

.legal__onglet.is-on {
  border-color: var(--brand);
  background: var(--brand-pale);
  color: var(--brand-dark);
  font-weight: 600;
}

.legal__titre {
  margin: 0;
  font-family: var(--font-display);
  font-size: 32px;
  font-weight: 600;
  color: var(--ink-title);
}

.legal__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.legal__date {
  font-size: 13.5px;
  color: var(--text-muted);
}

.legal__actions {
  display: flex;
  gap: var(--space-2);
}

.legal__corps {
  display: grid;
  grid-template-columns: 260px minmax(0, 720px);
  gap: calc(var(--space-12) + var(--space-4));
  padding: calc(var(--space-8) + var(--space-2)) var(--gouttiere) calc(var(--space-12) + var(--space-4));
  background: var(--surface);
}

.legal__sommaire {
  position: sticky;
  top: 96px;
  align-self: start;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.legal__surtitre {
  padding: 0 var(--space-3) var(--space-2);
  font-family: var(--font-display);
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: .04em;
  color: var(--text-muted);
}

.legal__entree {
  display: block;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--r-sm);
  font-size: 13.5px;
  color: var(--text-muted);
  text-decoration: none;
}

.legal__entree:hover {
  color: var(--text);
}

.legal__entree.is-on {
  background: var(--brand-pale);
  color: var(--brand-dark);
  font-weight: 600;
}

.legal__sommaire-mobile {
  display: none;
}

.legal__article {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.legal__section {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  scroll-margin-top: 88px;
}

.legal__section h2 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 600;
  color: var(--text-strong);
}

.legal__texte {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.legal__texte :deep(p),
.legal__texte :deep(ul),
.legal__texte :deep(ol) {
  margin: 0;
  font-size: 15px;
  line-height: 1.7;
  color: var(--text-muted);
}

@media (max-width: 1023px) {
  .legal__corps {
    grid-template-columns: 200px minmax(0, 1fr);
    gap: var(--space-8);
  }
}

@media (max-width: 767px) {
  .legal__bandeau {
    gap: var(--space-3);
    padding: var(--space-6) var(--space-4);
  }

  .legal__onglets {
    overflow-x: auto;
  }

  .legal__onglet {
    min-height: 44px;
  }

  .legal__sommaire-liste .legal__entree {
    display: flex;
    align-items: center;
    min-height: 44px;
  }

  .legal__titre {
    font-size: 26px;
  }

  .legal__corps {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
    padding: var(--space-6) var(--space-4) calc(var(--space-8) + var(--space-2));
  }

  .legal__sommaire {
    display: none;
  }

  .legal__sommaire-mobile {
    display: block;
  }

  .legal__sommaire-liste {
    display: flex;
    flex-direction: column;
    margin: 0 calc(-1 * var(--space-2));
  }
}

@media print {
  .legal__onglets,
  .legal__actions,
  .legal__sommaire,
  .legal__sommaire-mobile {
    display: none;
  }

  .legal__corps {
    display: block;
  }
}
</style>
