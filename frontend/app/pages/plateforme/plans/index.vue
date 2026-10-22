<!--
  SaPlans — voir et gérer l'offre commerciale.
  Une carte par plan : nom (étoile si mis en avant sur la landing, bordure brand), badge Actif / Archivé, menu ⋯
  (modifier, dupliquer, archiver), prix mensuel et annuel, quotas, nombre d'associations abonnées, « Modifier → ».
  Archiver un plan utilisé : message indiquant que ses abonnés le conservent, avec « Annuler ».
  Scénarios : `aucun-plan` (+ `chargement`, `erreur`).
-->
<script setup lang="ts">
import type { ElementMenu } from '~/components/cz/CzMenu.vue'
import type { Plan, Quota } from '~~/types'
import { formatFCFA } from '~/utils/format'
import { STATUTS_PLAN } from '~/utils/statuts'

definePageMeta({ middleware: 'espace-plateforme', layout: 'backoffice', espace: 'superadmin', titre: 'Plans d’abonnement' })
useHead({ title: 'Plans d’abonnement · Cotiz' })

const toast = useToast()
const { data: plans, pending, error, refresh } = usePlans()
const { archiver, desarchiver, dupliquer } = useActionsPlan()

const prix = (p: Plan['prixMensuel']) => formatFCFA(p)
const quota = (q: Quota) => (q === null ? '∞' : String(q))
const lien = (p: Plan) => `/plateforme/plans/${p.id}`

const archive = ref<Plan | null>(null)
async function archiverPlan(p: Plan) {
  try {
    archive.value = await archiver(p.id)
    await refresh()
  }
  catch {
    toast.erreur('Archivage impossible', { message: 'Vérifiez votre connexion, puis réessayez.' })
  }
}
async function annulerArchivage() {
  if (!archive.value) return
  await desarchiver(archive.value.id, archive.value.version ?? 1)
  archive.value = null
  await refresh()
}
async function dupliquerPlan(p: Plan) {
  try {
    const copie = await dupliquer(p.id)
    toast.succes('Plan dupliqué', { message: `« ${copie.nom} » est prêt à être modifié.` })
    await navigateTo(lien(copie))
  }
  catch {
    toast.erreur('Duplication impossible', { message: 'Vérifiez votre connexion, puis réessayez.' })
  }
}
const actions = (p: Plan): ElementMenu[] => [
  { label: 'Modifier', to: lien(p) },
  { label: 'Dupliquer', action: () => dupliquerPlan(p) },
  { label: 'Archiver', danger: true, separe: true, disabled: p.statut === 'archive', action: () => archiverPlan(p) },
]

const chargement = computed(() => pending.value && !plans.value)
</script>

<template>
  <div class="sa-plans">
    <EnTetePage
      titre="Plans d’abonnement"
      sous-titre="L’offre commerciale affichée sur la page Tarifs."
    >
      <template #actions>
        <CzButton
          icone="ajouter"
          to="/plateforme/plans/nouveau"
        >
          Nouveau plan
        </CzButton>
      </template>
    </EnTetePage>

    <CzAlert
      v-if="archive"
      ton="info"
    >
      <b>Plan {{ archive.nom }} archivé.</b> Il n’est plus proposé aux nouvelles associations ; ses {{ archive.associationsAbonnees }} abonnés actuels le conservent.
      <template #action>
        <CzButton
          variante="fantome"
          taille="sm"
          @click="annulerArchivage"
        >
          Annuler
        </CzButton>
      </template>
    </CzAlert>

    <div
      v-if="chargement"
      class="sa-plans__grille"
    >
      <div
        v-for="i in 3"
        :key="i"
        class="cz-card sa-plans__carte"
      >
        <CzSkeleton
          :hauteur="20"
          largeur="40%"
        />
        <CzSkeleton :hauteur="30" />
        <CzSkeleton :hauteur="64" />
      </div>
    </div>

    <CzErreurChargement
      v-else-if="error"
      titre="Impossible d’afficher les plans"
      @reessayer="refresh()"
    />

    <div
      v-else-if="!plans?.length"
      class="cz-card"
    >
      <CzEmpty
        icone="plans"
        titre="Aucun plan pour l’instant"
        description="Créez votre premier plan pour pouvoir accueillir des associations."
        integre
      >
        <template #action>
          <CzButton
            taille="sm"
            to="/plateforme/plans/nouveau"
          >
            Nouveau plan
          </CzButton>
        </template>
      </CzEmpty>
    </div>

    <div
      v-else
      class="sa-plans__grille"
    >
      <article
        v-for="p in plans"
        :key="p.id"
        class="cz-card sa-plans__carte"
        :class="{ 'is-avant': p.misEnAvant, 'is-archive': p.statut === 'archive' }"
      >
        <div class="sa-plans__tete">
          <NuxtLink
            :to="lien(p)"
            class="sa-plans__nom"
          >
            {{ p.nom }}
          </NuxtLink>
          <span
            v-if="p.misEnAvant"
            class="sa-plans__etoile"
            title="Mis en avant sur la landing"
          >
            <CzIcon
              nom="etoile"
              :taille="18"
              label="Mis en avant sur la landing"
            />
          </span>
          <CzBadge
            :ton="STATUTS_PLAN[p.statut].ton"
            class="sa-plans__badge"
          >
            {{ STATUTS_PLAN[p.statut].libelle }}
          </CzBadge>
          <CzMenu
            :elements="actions(p)"
            :label="`Actions du plan ${p.nom}`"
          >
            <template #declencheur="{ basculer, attrs }">
              <CzButton
                variante="icone"
                taille="sm"
                icone="actions"
                :label="`Actions du plan ${p.nom}`"
                v-bind="attrs"
                @click="basculer"
              />
            </template>
          </CzMenu>
        </div>
        <div>
          <div class="sa-plans__prix">
            {{ prix(p.prixMensuel) }} <small>/ mois</small>
          </div>
          <div class="sa-plans__annuel">
            ou {{ prix(p.prixAnnuel) }} / an
          </div>
        </div>
        <dl class="sa-plans__quotas">
          <div>
            <dd>{{ quota(p.quotas.projets) }}</dd>
            <dt>projets</dt>
          </div>
          <div>
            <dd>{{ quota(p.quotas.souscripteurs) }}</dd>
            <dt>souscripteurs</dt>
          </div>
          <div>
            <dd>{{ quota(p.quotas.gestionnaires) }}</dd>
            <dt>gestionnaires</dt>
          </div>
        </dl>
        <div class="sa-plans__pied">
          <span><b>{{ p.associationsAbonnees }}</b> {{ p.associationsAbonnees > 1 ? 'associations abonnées' : 'association abonnée' }}</span>
          <NuxtLink
            :to="lien(p)"
            class="sa-plans__modifier"
          >Modifier →</NuxtLink>
        </div>
      </article>
    </div>
  </div>
</template>

<style scoped>
.sa-plans {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.sa-plans__grille {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--space-4);
}

.sa-plans__carte {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-6);
}

.sa-plans__carte.is-avant {
  box-shadow: 0 0 0 2px var(--brand), var(--shadow);
}

.sa-plans__carte.is-archive {
  opacity: 0.6;
}

.sa-plans__tete {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.sa-plans__nom {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 18px;
  color: var(--text-strong);
  text-decoration: none;
}

.sa-plans__nom:hover {
  text-decoration: underline;
}

.sa-plans__etoile {
  display: inline-flex;
  color: var(--brand);
}

.sa-plans__etoile :deep(svg) {
  fill: currentColor;
}

.sa-plans__badge {
  margin-left: auto;
}

.sa-plans__prix {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 26px;
  color: var(--text-strong);
}

.sa-plans__prix small {
  font-family: var(--font-text);
  font-weight: 400;
  font-size: 13px;
  color: var(--text-muted);
}

.sa-plans__annuel {
  font-size: 13px;
  color: var(--text-muted);
}

.sa-plans__quotas {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-2);
  margin: 0;
  padding: var(--space-3);
  border-radius: var(--r-md);
  background: var(--surface-subtle);
}

.sa-plans__quotas div {
  display: flex;
  flex-direction: column;
}

.sa-plans__quotas dd {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 16px;
  color: var(--text-strong);
}

.sa-plans__quotas dt {
  font-size: 12px;
  color: var(--text-muted);
}

.sa-plans__pied {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: var(--space-3);
  border-top: 1px solid var(--divider);
  font-size: 13.5px;
}

.sa-plans__modifier {
  font-weight: 600;
  text-decoration: none;
}

.sa-plans__modifier:hover {
  text-decoration: underline;
}
</style>
