<!--
  MgContrats — l'état des signatures sur tous les projets : un contrat par projet, signé par l'association puis
  contre-signé par chaque souscripteur. Bandeau « Un contrat n'est plus modifiable après sa création ».
  Desktop : tableau (projet et conditions, signature de l'association, barre des contre-signatures, en attente,
  statut, Voir) ; « Voir » ouvre le panneau du contrat (engagement, signatures, Lire / Télécharger, signatures en
  attente, « Rappeler les non-signataires »).
  Mobile : cartes par projet, détail en feuille basse.
  Projet ouvert dans l'URL (`?projet=voyage-solidaire`). Scénarios : `aucun-contrat` (+ `chargement`, `erreur`).
-->
<script setup lang="ts">
import type { SyntheseContratProjet } from '~~/types'
import { estDate, formatDate, formatPourcent, pluriel } from '~/utils/format'

definePageMeta({ middleware: 'espace-gestionnaire', layout: 'backoffice', espace: 'gestionnaire', titre: 'Contrats' })
useHead({ title: 'Contrats · Cotiz' })

const route = useRoute()
const router = useRouter()
const toast = useToast()
const { data, pending, error, refresh } = useContratsProjets()
const envoyerRelance = useEnvoiRelance()
const { estMobile } = useBreakpoint()

const contrats = computed(() => data.value ?? [])
const chargement = computed(() => pending.value && !data.value)
const vide = computed(() => !chargement.value && !error.value && contrats.value.length === 0)

// ---------------------------------------------------------------- Détail (URL)
const ouvertId = computed(() => (typeof route.query.projet === 'string' ? route.query.projet : null))
const courant = computed(() => contrats.value.find(c => c.projetId === ouvertId.value) ?? null)
const detailOuvert = computed<boolean>({
  get: () => Boolean(courant.value),
  set: (v) => {
    if (!v) router.replace({ query: { ...route.query, projet: undefined } })
  },
})
function ouvrir(c: SyntheseContratProjet) {
  rappelEnvoye.value = false
  router.replace({ query: { ...route.query, projet: c.projetId } })
}

// ---------------------------------------------------------------- Libellés
const date = (d: string) => (estDate(d) ? formatDate(d, 'numerique') : d)
const signature = (c: SyntheseContratProjet) => `${date(c.signeParAssociation.le)} · ${c.signeParAssociation.nom}`
const signatures = (c: SyntheseContratProjet) => (c.places ? `${c.signes} / ${c.places} places` : `${c.signes} / ${c.total}`)
function ratio(c: SyntheseContratProjet): number | null {
  const sur = c.places ?? c.total
  return typeof c.signes === 'number' && typeof sur === 'number' && sur > 0 ? Math.round((c.signes / sur) * 100) : null
}
const pourcentage = (c: SyntheseContratProjet) => (ratio(c) === null ? '[N] %' : formatPourcent(ratio(c)!))
const STATUTS = {
  actif: { libelle: 'Actif', court: 'Actif', ton: 'success' },
  signatures_en_cours: { libelle: 'Signatures en cours', court: 'Signatures en cours', ton: 'warning' },
  inscriptions_ouvertes: { libelle: 'Inscriptions ouvertes', court: 'Inscriptions', ton: 'info' },
} as const
/** Barre verte quand les contre-signatures sont quasi complètes (≥ 95 %). */
const tonBarre = (c: SyntheseContratProjet) => ((ratio(c) ?? 0) >= 95 ? 'success' : 'brand')
const invitation = (d: string) => `invitation envoyée le ${date(d)}`

// ---------------------------------------------------------------- Rappel des non-signataires
const envoi = ref(false)
const rappelEnvoye = ref(false)
async function rappeler() {
  const c = courant.value
  if (!c?.nonSignataires.length || envoi.value) return
  envoi.value = true
  try {
    await envoyerRelance({ souscripteurIds: c.nonSignataires.map(n => n.souscripteurId), projetId: c.projetId })
    rappelEnvoye.value = true
  }
  catch {
    toast.erreur('Le rappel n’a pas pu être envoyé', { message: 'Vérifiez votre connexion, puis réessayez.' })
  }
  finally {
    envoi.value = false
  }
}
</script>

<template>
  <div class="contrats">
    <EnTeteGestionnaireMobile
      titre="Contrats"
      :sous-titre="contrats.length ? pluriel(contrats.length, 'projet') : 'Aucun projet'"
      retour="/asso"
      :cloche="false"
    />
    <EnTetePage
      titre="Contrats"
      sous-titre="Un contrat par projet · signé par l’association puis contre-signé par chaque souscripteur"
      class="cz-desktop"
    >
      <template #actions>
        <CzButton to="/asso/projets/nouveau">
          Nouveau projet
        </CzButton>
      </template>
    </EnTetePage>

    <div
      class="cz-alert cz-alert--info"
      role="note"
    >
      <div>
        <b class="cz-desktop-inline">Un contrat n’est plus modifiable après sa création.</b>
        <span class="cz-desktop-inline"> Ce que vos souscripteurs ont accepté reste ainsi intact. Pour changer les conditions, créez un nouveau projet.</span>
        <span class="cz-mobile">Un contrat n’est plus modifiable après sa création.</span>
      </div>
    </div>

    <CzErreurChargement
      v-if="error"
      titre="Impossible d’afficher les contrats"
      @reessayer="refresh()"
    />

    <div
      v-else-if="vide"
      class="cz-card contrats__vide"
    >
      <CzEmpty
        icone="contrat"
        titre="Aucun contrat pour l’instant"
        description="Le contrat se rédige à la création d’un projet."
        integre
      >
        <template #action>
          <CzButton to="/asso/projets/nouveau">
            Créer un projet
          </CzButton>
        </template>
      </CzEmpty>
    </div>

    <template v-else>
      <!-- Desktop : tableau -->
      <div class="cz-table-wrap cz-desktop">
        <table
          class="cz-table"
          aria-label="Contrats des projets"
          :aria-busy="chargement || undefined"
        >
          <thead>
            <tr>
              <th>Projet</th>
              <th>Signé par l’association</th>
              <th>Signatures des souscripteurs</th>
              <th class="num">
                En attente
              </th>
              <th>Statut</th>
              <th><span class="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody v-if="chargement">
            <tr
              v-for="i in 3"
              :key="i"
            >
              <td>
                <CzSkeleton
                  :hauteur="14"
                  largeur="70%"
                />
              </td>
              <td>
                <CzSkeleton
                  :hauteur="12"
                  largeur="80%"
                />
              </td>
              <td>
                <CzSkeleton :hauteur="8" />
              </td>
              <td>
                <CzSkeleton
                  :hauteur="12"
                  :largeur="24"
                  droite
                />
              </td>
              <td>
                <CzSkeleton
                  :hauteur="20"
                  :largeur="80"
                  forme="pilule"
                />
              </td>
              <td />
            </tr>
          </tbody>
          <tbody v-else>
            <tr
              v-for="c in contrats"
              :key="c.projetId"
              :class="{ 'is-selected': c.projetId === ouvertId }"
            >
              <td class="contrats__projet">
                <b>{{ c.nomProjet }}</b>
                <div class="contrats__conditions">
                  {{ c.conditions }}
                </div>
              </td>
              <td>{{ signature(c) }}</td>
              <td class="contrats__signatures">
                <div class="contrats__signatures-tete">
                  <span>{{ signatures(c) }}</span>
                  <span class="contrats__muted">{{ pourcentage(c) }}</span>
                </div>
                <CzProgress
                  :valeur="ratio(c) ?? 0"
                  :ton="tonBarre(c)"
                  :label="`Contre-signatures ${c.nomProjet}`"
                />
              </td>
              <td class="num">
                {{ c.enAttente ?? '—' }}
              </td>
              <td>
                <CzBadge
                  :ton="STATUTS[c.statut].ton"
                  petit
                >
                  {{ STATUTS[c.statut].libelle }}
                </CzBadge>
              </td>
              <td>
                <CzButton
                  variante="fantome"
                  taille="sm"
                  :aria-label="`Voir le contrat ${c.nomProjet}`"
                  @click="ouvrir(c)"
                >
                  Voir
                </CzButton>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Mobile : cartes -->
      <div class="contrats__cartes cz-mobile">
        <template v-if="chargement">
          <CzSkeleton
            v-for="i in 3"
            :key="i"
            :hauteur="140"
          />
        </template>
        <button
          v-for="c in contrats"
          v-else
          :key="c.projetId"
          type="button"
          class="cz-card contrats__carte"
          :aria-label="`Voir le contrat ${c.nomProjet}`"
          @click="ouvrir(c)"
        >
          <span class="contrats__carte-tete">
            <b>{{ c.nomProjet }}</b>
            <CzBadge
              :ton="STATUTS[c.statut].ton"
              petit
            >
              {{ STATUTS[c.statut].court }}
            </CzBadge>
          </span>
          <span class="contrats__signatures-tete">
            <span>Signatures {{ signatures(c) }}</span>
            <span>{{ pourcentage(c) }}</span>
          </span>
          <CzProgress
            :valeur="ratio(c) ?? 0"
            :ton="tonBarre(c)"
            :label="`Contre-signatures ${c.nomProjet}`"
          />
          <span class="contrats__muted">Signé par l’association le {{ date(c.signeParAssociation.le) }}</span>
        </button>
      </div>
    </template>

    <!-- Détail : panneau (desktop) / feuille basse (mobile) -->
    <template v-if="courant">
      <CzSheet
        v-if="estMobile"
        v-model:ouvert="detailOuvert"
        :titre="courant.nomProjet"
      >
        <div class="detail">
          <p class="detail__engagement">
            {{ courant.conditions }}
          </p>
          <div class="detail__ligne">
            <span>Contre-signatures</span><b>{{ courant.signes }} / {{ courant.total }}</b>
          </div>
          <template v-if="courant.nonSignataires.length">
            <h3 class="detail__surtitre">
              En attente
            </h3>
            <ul class="detail__liste">
              <li
                v-for="n in courant.nonSignataires"
                :key="n.souscripteurId"
              >
                <CzAvatar
                  :nom="n.nom"
                  ton="warning"
                  taille="sm"
                />
                <NuxtLink
                  :to="`/asso/souscripteurs/${n.souscripteurId}`"
                  class="detail__nom"
                >
                  {{ n.nom }}
                </NuxtLink>
                <CzBadge
                  ton="warning"
                  petit
                >
                  À signer
                </CzBadge>
              </li>
            </ul>
          </template>
          <div
            v-if="rappelEnvoye"
            class="cz-alert cz-alert--success"
            role="status"
          >
            <div>Rappel de signature envoyé aux souscripteurs en attente.</div>
          </div>
          <div class="detail__boutons">
            <CzButton
              variante="secondaire"
              :to="`/asso/projets/${courant.projetId}/contrat`"
            >
              Lire
            </CzButton>
            <CzButton
              variante="secondaire"
              :to="`/asso/projets/${courant.projetId}/contrat`"
            >
              PDF
            </CzButton>
          </div>
        </div>
        <template
          v-if="courant.nonSignataires.length"
          #pied
        >
          <CzButton
            :chargement="envoi"
            libelle-chargement="Envoi…"
            :disabled="rappelEnvoye"
            @click="rappeler"
          >
            Rappeler les non-signataires
          </CzButton>
        </template>
      </CzSheet>

      <CzPanel
        v-else
        v-model:ouvert="detailOuvert"
        :titre="`Contrat · ${courant.nomProjet}`"
      >
        <div class="detail">
          <p class="detail__engagement">
            <b>Engagement :</b> {{ courant.conditions }}
          </p>
          <div class="detail__ligne">
            <span>Signé par l’association</span><b>{{ signature(courant) }}</b>
          </div>
          <div class="detail__ligne">
            <span>Contre-signatures</span><b>{{ courant.signes }} / {{ courant.total }}</b>
          </div>
          <div class="detail__boutons">
            <CzButton
              variante="secondaire"
              :to="`/asso/projets/${courant.projetId}/contrat`"
            >
              Lire le contrat
            </CzButton>
            <CzButton
              variante="secondaire"
              icone="telecharger"
              :to="`/asso/projets/${courant.projetId}/contrat`"
            >
              Télécharger (PDF)
            </CzButton>
          </div>
          <h3 class="detail__titre">
            Signatures en attente
          </h3>
          <ul
            v-if="courant.nonSignataires.length"
            class="detail__liste"
          >
            <li
              v-for="n in courant.nonSignataires"
              :key="n.souscripteurId"
            >
              <CzAvatar
                :nom="n.nom"
                ton="warning"
                taille="sm"
              />
              <span class="detail__qui">
                <NuxtLink
                  :to="`/asso/souscripteurs/${n.souscripteurId}`"
                  class="detail__nom"
                >
                  {{ n.nom }}
                </NuxtLink>
                <span class="contrats__muted">{{ invitation(n.inviteLe) }}</span>
              </span>
              <CzBadge
                ton="warning"
                petit
              >
                À signer
              </CzBadge>
            </li>
          </ul>
          <p
            v-else
            class="contrats__muted"
          >
            Aucune signature en attente.
          </p>
          <div
            v-if="rappelEnvoye"
            class="cz-alert cz-alert--success"
            role="status"
          >
            <div>Rappel de signature envoyé aux souscripteurs en attente.</div>
          </div>
        </div>
        <template
          v-if="courant.nonSignataires.length"
          #pied
        >
          <CzButton
            bloc
            :chargement="envoi"
            libelle-chargement="Envoi…"
            :disabled="rappelEnvoye"
            @click="rappeler"
          >
            Rappeler les non-signataires
          </CzButton>
        </template>
      </CzPanel>
    </template>
  </div>
</template>

<style scoped>
.contrats {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.cz-desktop-inline {
  display: inline;
}

.contrats__projet b {
  color: var(--text-strong);
}

.contrats__conditions {
  max-width: 380px;
  font-size: 12.5px;
  color: var(--text-muted);
}

.contrats__signatures {
  min-width: 220px;
}

.contrats__signatures-tete {
  display: flex;
  justify-content: space-between;
  gap: var(--space-2);
  margin-bottom: var(--space-1);
  font-size: 12.5px;
}

.contrats__muted {
  font-size: 12.5px;
  color: var(--text-muted);
}

.contrats__vide {
  padding: var(--space-12) var(--space-4);
}

.contrats__cartes {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.contrats__carte {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  width: 100%;
  padding: 20px var(--space-6);
  border: 0;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.contrats__carte:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.contrats__carte-tete {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-1);
}

.contrats__carte-tete b {
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 600;
  color: var(--text-strong);
}

.contrats__carte .contrats__signatures-tete {
  font-size: 13px;
  color: var(--text-muted);
}

.detail {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  color: var(--text);
}

.detail__engagement {
  margin: 0;
  padding: 14px var(--space-4);
  border-radius: var(--r-md);
  background: var(--brand-pale);
  font-size: 14px;
  line-height: 1.55;
  color: var(--ink-title);
}

.detail__ligne {
  display: flex;
  justify-content: space-between;
  gap: var(--space-3);
  font-size: 14px;
}

.detail__ligne span {
  color: var(--text-muted);
}

.detail__ligne b {
  color: var(--text-strong);
}

.detail__boutons {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-2);
}

.detail__titre {
  margin: 0;
  font-family: var(--font-display);
  font-size: 15px;
  font-weight: 600;
  color: var(--text-strong);
}

.detail__surtitre {
  margin: 0;
  font-family: var(--font-display);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: .04em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.detail__liste {
  margin: 0;
  padding: 0;
  list-style: none;
}

.detail__liste li {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: 56px;
  padding: var(--space-2) 0;
}

.detail__liste li + li {
  border-top: 1px solid var(--divider);
}

.detail__qui {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.detail__nom {
  flex: 1;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-strong);
  text-decoration: none;
}

@media (max-width: 767px) {
  .contrats {
    gap: var(--space-3);
  }

  .cz-desktop-inline {
    display: none;
  }

  .detail__nom {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    font-weight: 400;
  }
}
</style>
