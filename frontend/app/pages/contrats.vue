<!--
  MbContrats — retrouver ses engagements : contrats à signer en tête (contour warning, « Signer »),
  puis les contrats signés (date de signature) ; chaque contrat s'ouvre pour être relu ou téléchargé.
  Scénario : `tout-signe`.
-->
<script setup lang="ts">
import type { ContratDetaille } from '~~/types'
import { formatDate, formatFCFA, nomCourtAssociation, pluriel } from '~/utils/format'

definePageMeta({ middleware: 'espace-souscripteur', layout: 'souscripteur', fab: false })
useHead({ title: 'Mes contrats · Cotiz' })

const { data: contrats, pending, error, refresh } = useContrats()

const aSigner = computed(() => (contrats.value ?? []).filter(c => c.statut === 'a_signer'))
const signes = computed(() => (contrats.value ?? []).filter(c => c.statut === 'signe'))
const sousTitre = computed(() => {
  const liste = contrats.value ?? []
  if (!liste.length) return undefined
  return `${pluriel(liste.length, 'contrat')} · ${pluriel(new Set(liste.map(c => c.associationId)).size, 'association')}`
})

const lien = (c: ContratDetaille) => `/projets/${c.projetId}/contrat`
const dateSignature = (c: ContratDetaille) => (c.signeLe ? formatDate(c.signeLe, 'numerique') : '')
</script>

<template>
  <div class="contrats">
    <EnTeteSouscripteur
      titre="Mes contrats"
      :sous-titre="sousTitre"
      retour="/profil"
    />

    <div class="contrats__colonne">
      <template v-if="pending && !contrats">
        <CzSkeleton
          :hauteur="96"
          class="contrats__skel"
        />
        <CzSkeleton
          :hauteur="132"
          class="contrats__skel"
        />
      </template>

      <CzEmpty
        v-else-if="error"
        icone="alerte"
        ton="danger"
        titre="Impossible d’afficher vos contrats"
        description="Vérifiez votre connexion, puis réessayez."
        class="contrats__vide"
      >
        <template #action>
          <CzButton
            variante="secondaire"
            @click="refresh()"
          >
            Réessayer
          </CzButton>
        </template>
      </CzEmpty>

      <CzEmpty
        v-else-if="!contrats?.length"
        icone="contrat"
        titre="Aucun contrat pour l’instant"
        description="Les contrats de vos projets apparaîtront ici."
        class="contrats__vide"
      />

      <template v-else>
        <article
          v-for="c in aSigner"
          :key="c.id"
          class="contrats__a-signer"
        >
          <span class="contrats__icone contrats__icone--warning"><CzIcon nom="contrat" /></span>
          <div class="contrats__texte">
            <b>{{ c.projet.nom }}</b>
            <span>{{ nomCourtAssociation(c.association.nom) }} · {{ formatFCFA(c.engagement) }}</span>
            <CzBadge
              ton="warning"
              petit
            >
              À signer
            </CzBadge>
          </div>
          <CzButton
            :to="lien(c)"
            class="contrats__signer"
          >
            Signer
          </CzButton>
        </article>

        <section
          v-if="signes.length"
          class="contrats__section"
          aria-labelledby="titre-signes"
        >
          <h2
            id="titre-signes"
            class="cz-notif-group"
          >
            Contrats signés
          </h2>
          <ul class="contrats__liste">
            <li
              v-for="c in signes"
              :key="c.id"
            >
              <NuxtLink
                :to="lien(c)"
                class="contrats__ligne"
              >
                <span class="contrats__icone contrats__icone--success"><CzIcon nom="contrat" /></span>
                <span class="contrats__texte">
                  <b>{{ c.projet.nom }}</b>
                  <span>{{ nomCourtAssociation(c.association.nom) }} · signé le {{ dateSignature(c) }}</span>
                </span>
                <BadgeStatut
                  type="contrat"
                  statut="signe"
                  petit
                />
              </NuxtLink>
            </li>
          </ul>
        </section>

        <p class="contrats__aide">
          Touchez un contrat pour le relire ou télécharger sa version signée (PDF).
        </p>
      </template>
    </div>
  </div>
</template>

<style scoped>
.contrats {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.contrats :deep(.entete-mb__page),
.contrats__colonne {
  width: 100%;
  max-width: 760px;
  margin: 0 auto;
}

.contrats__colonne {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.contrats__skel {
  border-radius: var(--r-card-lg);
}

.contrats__vide {
  padding: var(--space-12) var(--space-6);
  border-radius: var(--r-card-lg);
  box-shadow: var(--shadow);
}

.contrats__a-signer {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-6);
  border: 2px solid var(--warning);
  border-radius: var(--r-card-lg);
  background: var(--surface);
  box-shadow: var(--shadow);
}

.contrats__icone {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: var(--r-md);
}

.contrats__icone--warning {
  background: var(--warning-bg);
  color: var(--warning-fg);
}

.contrats__icone--success {
  background: var(--success-bg);
  color: var(--success-fg);
}

.contrats__texte {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-1);
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-muted);
}

.contrats__texte b {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-strong);
}

.contrats__section {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.contrats__section .cz-notif-group {
  margin: var(--space-2) 0 0;
}

.contrats__liste {
  margin: 0;
  padding: 0;
  list-style: none;
  border-radius: var(--r-md);
  background: var(--surface);
  box-shadow: var(--shadow);
  overflow: hidden;
}

.contrats__liste li + li {
  border-top: 1px solid var(--divider-row);
}

.contrats__ligne {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: 66px;
  padding: var(--space-3);
  color: inherit;
  text-decoration: none;
}

.contrats__ligne:hover {
  background: var(--surface-hover);
}

.contrats__ligne:focus-visible {
  outline: none;
  box-shadow: inset var(--focus-ring);
}

.contrats__aide {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-muted);
}

@media (max-width: 767px) {
  .contrats {
    gap: var(--space-3);
  }

  .contrats__a-signer {
    padding: var(--space-6);
  }
}
</style>
