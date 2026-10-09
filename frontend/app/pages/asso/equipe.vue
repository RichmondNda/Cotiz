<!--
  MgEquipe — comptes gestionnaires de l'association.
  Desktop : tableau (membre, rôle, téléphone, dernière connexion, statut, actions ⋮ : renvoyer / retirer l'accès),
  carte « Comptes gestionnaires » (quota de comptes secondaires fixé par la plateforme), carte « Qui peut faire quoi ? ».
  Mobile : jauge « Comptes secondaires 2 / 3 », liste, rôle secondaire expliqué, bouton pleine largeur.
  Invitation : modale (desktop) / feuille basse (mobile). Quota atteint : barre rouge, explication, bouton désactivé.
  Scénarios : `quota-atteint` (+ `chargement`, `erreur`).
-->
<script setup lang="ts">
import type { ColonneTable } from '~/components/cz/CzTable.vue'
import type { ElementMenu } from '~/components/cz/CzMenu.vue'
import type { Gestionnaire, InvitationGestionnaire } from '~~/types'
import { codeErreur } from '~/composables/api/client'
import { formatDate, joursDepuis, lireDate } from '~/utils/format'

definePageMeta({ middleware: 'espace-gestionnaire', layout: 'backoffice', espace: 'gestionnaire', titre: 'Équipe' })
useHead({ title: 'Équipe · Cotiz' })

const toast = useToast()
const { data, pending, error, refresh } = useEquipe()
const { data: moi } = useMoi()
const actions = useActionsEquipe()

const membres = computed(() => data.value?.membres ?? [])
const quota = computed(() => data.value?.comptesSecondaires ?? { utilises: 0, limite: 0 })
const quotaAtteint = computed(() => Boolean(data.value) && quota.value.utilises >= quota.value.limite)
const pourcentage = computed(() => (quota.value.limite ? Math.min(100, Math.round(quota.value.utilises / quota.value.limite * 100)) : 0))
const nomAssociation = computed(() => moi.value?.association?.nom ?? 'votre association')

// ---------------------------------------------------------------- Présentation d'un membre
const nom = (g: Gestionnaire) => `${g.prenom} ${g.nom}`.trim()
const estMoi = (g: Gestionnaire) => g.id === moi.value?.id
const initialesMembre = (g: Gestionnaire) => (g.statut === 'invite' ? '··' : undefined)
const role = (g: Gestionnaire) => (g.role === 'principal' ? `Principale${estMoi(g) ? ' · vous' : ''}` : 'Secondaire')

const heure = (d: string) => {
  const x = lireDate(d)
  return `${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`
}
/** Desktop : « Aujourd'hui, 09:02 », « Hier, 18:40 », « Jamais ». */
function derniereConnexion(g: Gestionnaire): string {
  if (!g.derniereConnexion) return 'Jamais'
  const j = joursDepuis(g.derniereConnexion)
  if (j === 0) return `Aujourd’hui, ${heure(g.derniereConnexion)}`
  if (j === 1) return `Hier, ${heure(g.derniereConnexion)}`
  return formatDate(g.derniereConnexion)
}
/** Mobile : « aujourd'hui », « hier », « jamais connecté ». */
function derniereConnexionCourte(g: Gestionnaire): string {
  if (!g.derniereConnexion) return 'jamais connecté'
  const j = joursDepuis(g.derniereConnexion)
  return j === 0 ? 'aujourd’hui' : j === 1 ? 'hier' : formatDate(g.derniereConnexion)
}

const COLONNES: ColonneTable[] = [
  { cle: 'membre', label: 'Membre', squelette: 'personne' },
  { cle: 'role', label: 'Rôle', squelette: 'badge' },
  { cle: 'telephone', label: 'Téléphone', largeur: '150px' },
  { cle: 'connexion', label: 'Dernière connexion' },
  { cle: 'statut', label: 'Statut', squelette: 'badge' },
  { cle: 'actions', label: '', largeur: '56px' },
]
const lignes = computed(() => membres.value.map(g => ({ id: g.id, membre: g })))

// ---------------------------------------------------------------- Invitation
const invitation = ref(false)
const envoi = ref(false)
const erreurInvitation = ref<string>()
const ERREURS: Record<string, string> = {
  'email-existant': 'Cet email a déjà un compte gestionnaire',
  'email-invalide': 'Indiquez un email valide, par exemple nom@exemple.com',
}

function ouvrirInvitation() {
  if (quotaAtteint.value) return
  erreurInvitation.value = undefined
  invitation.value = true
}

async function inviter(corps: InvitationGestionnaire) {
  envoi.value = true
  erreurInvitation.value = undefined
  try {
    await actions.inviter(corps)
    invitation.value = false
    toast.succes('Invitation envoyée', { message: `${corps.prenom} ${corps.nom} reçoit ses identifiants à ${corps.email}.` })
    await refresh()
  }
  catch (e) {
    const code = codeErreur(e)
    if (code === 'quota-atteint') {
      invitation.value = false
      toast.erreur('Limite de comptes atteinte', { message: 'Le nombre de comptes est fixé par la plateforme Cotiz.' })
      await refresh()
    }
    else {
      erreurInvitation.value = (code && ERREURS[code]) || 'L’invitation n’a pas pu être envoyée. Réessayez.'
    }
  }
  finally {
    envoi.value = false
  }
}

// ---------------------------------------------------------------- Actions d'une ligne
const aRetirer = ref<Gestionnaire | null>(null)
const retrait = ref(false)
const confirmationOuverte = computed({
  get: () => aRetirer.value !== null,
  set: (v) => { if (!v) aRetirer.value = null },
})

async function renvoyer(g: Gestionnaire) {
  try {
    const r = await actions.renvoyer(g.id)
    toast.succes(r.type === 'invitation' ? 'Invitation renvoyée' : 'Identifiants renvoyés', { message: `Envoyé à ${r.email}.` })
  }
  catch {
    toast.erreur('Envoi impossible', { message: 'Vérifiez votre connexion, puis réessayez.' })
  }
}

async function retirer() {
  const g = aRetirer.value
  if (!g) return
  retrait.value = true
  try {
    await actions.retirer(g.id)
    toast.succes(g.statut === 'invite' ? 'Invitation annulée' : 'Accès retiré', { message: `${nom(g)} n’a plus accès à l’espace de l’association.` })
    aRetirer.value = null
    await refresh()
  }
  catch {
    toast.erreur('Retrait impossible', { message: 'Vérifiez votre connexion, puis réessayez.' })
  }
  finally {
    retrait.value = false
  }
}

const menu = (g: Gestionnaire): ElementMenu[] => [
  { label: g.statut === 'invite' ? 'Renvoyer l’invitation' : 'Renvoyer les identifiants', action: () => renvoyer(g) },
  { label: 'Retirer l’accès', danger: true, separe: true, action: () => (aRetirer.value = g) },
]

const chargement = computed(() => pending.value && !data.value)
</script>

<template>
  <div class="equipe">
    <EnTeteGestionnaireMobile
      titre="Équipe"
      :sous-titre="data ? `${quota.utilises} sur ${quota.limite} comptes secondaires` : undefined"
      retour="/asso/plus"
      :cloche="false"
    />
    <EnTetePage
      titre="Équipe"
      :sous-titre="`Les gestionnaires qui administrent ${nomAssociation} avec vous`"
      class="cz-desktop"
    >
      <template #actions>
        <CzButton
          :disabled="quotaAtteint || chargement"
          :aria-describedby="quotaAtteint ? 'equipe-quota' : undefined"
          @click="ouvrirInvitation"
        >
          Inviter un gestionnaire
        </CzButton>
      </template>
    </EnTetePage>

    <CzErreurChargement
      v-if="error && !data"
      titre="Impossible d’afficher l’équipe"
      @reessayer="refresh()"
    />

    <div
      v-else
      class="equipe__grille"
    >
      <div class="equipe__principal">
        <!-- Desktop : tableau -->
        <CzTable
          :colonnes="COLONNES"
          :lignes="lignes"
          :chargement="chargement"
          :cliquable="false"
          label="Gestionnaires de l’association"
          class="cz-desktop"
        >
          <template #cell-membre="{ ligne }">
            <div class="cz-person">
              <CzAvatar
                :nom="nom(ligne.membre)"
                :initiales="initialesMembre(ligne.membre)"
                taille="sm"
              />
              <div>
                <b>{{ nom(ligne.membre) }}</b>
                <div class="sub">
                  {{ ligne.membre.email }}
                </div>
              </div>
            </div>
          </template>
          <template #cell-role="{ ligne }">
            <CzBadge
              :ton="ligne.membre.role === 'principal' ? 'brand' : 'neutral'"
              petit
            >
              {{ role(ligne.membre) }}
            </CzBadge>
          </template>
          <template #cell-telephone="{ ligne }">
            <span class="cz-mono">{{ ligne.membre.telephone ?? '—' }}</span>
          </template>
          <template #cell-connexion="{ ligne }">
            <span class="equipe__muted">{{ derniereConnexion(ligne.membre) }}</span>
          </template>
          <template #cell-statut="{ ligne }">
            <CzBadge
              :ton="ligne.membre.statut === 'actif' ? 'success' : 'warning'"
              petit
            >
              {{ ligne.membre.statut === 'actif' ? 'Actif' : 'Invitation envoyée' }}
            </CzBadge>
          </template>
          <template #cell-actions="{ ligne }">
            <CzMenu
              v-if="ligne.membre.role !== 'principal'"
              :elements="menu(ligne.membre)"
              :label="`Actions pour ${nom(ligne.membre)}`"
              largeur="220px"
            >
              <template #declencheur="{ basculer, attrs }">
                <CzButton
                  variante="icone"
                  taille="sm"
                  icone="actions"
                  :label="`Actions pour ${nom(ligne.membre)}`"
                  v-bind="attrs"
                  @click="basculer"
                />
              </template>
            </CzMenu>
          </template>
        </CzTable>

        <!-- Mobile : jauge, liste -->
        <div class="cz-mobile equipe__mobile">
          <div class="cz-card equipe__jauge-mobile">
            <template v-if="chargement">
              <CzSkeleton
                :hauteur="14"
                largeur="50%"
              />
              <CzSkeleton :hauteur="8" />
            </template>
            <template v-else>
              <div class="equipe__ligne-quota">
                <span>Comptes secondaires</span>
                <b>{{ quota.utilises }} / {{ quota.limite }}</b>
              </div>
              <CzProgress
                :valeur="pourcentage"
                :ton="quotaAtteint ? 'danger' : 'brand'"
                label="Comptes secondaires utilisés"
              />
              <span
                v-if="quotaAtteint"
                class="equipe__limite"
              >Limite atteinte, fixée par la plateforme Cotiz.</span>
            </template>
          </div>

          <ul
            class="cz-card equipe__liste"
            :aria-busy="chargement || undefined"
          >
            <template v-if="chargement">
              <li
                v-for="i in 3"
                :key="i"
                class="equipe__membre"
              >
                <CzSkeleton
                  :hauteur="30"
                  :largeur="30"
                  forme="rond"
                />
                <CzSkeleton
                  :hauteur="12"
                  largeur="60%"
                />
              </li>
            </template>
            <li
              v-for="g in membres"
              v-else
              :key="g.id"
              class="equipe__membre"
            >
              <CzAvatar
                :nom="nom(g)"
                :initiales="initialesMembre(g)"
                taille="sm"
              />
              <span class="equipe__qui">
                <b>{{ nom(g) }}</b>
                <span>{{ role(g) }} · {{ derniereConnexionCourte(g) }}</span>
              </span>
              <CzBadge
                :ton="g.statut === 'actif' ? 'success' : 'warning'"
                petit
              >
                {{ g.statut === 'actif' ? 'Actif' : 'Invité' }}
              </CzBadge>
            </li>
          </ul>

          <div class="cz-card equipe__role-mobile">
            <b>Gestionnaire secondaire</b>
            <span>Projets, souscripteurs, validation des paiements et relances. Pas d’accès à l’équipe, à l’abonnement ni aux paramètres.</span>
          </div>

          <CzButton
            bloc
            :disabled="quotaAtteint || chargement"
            @click="ouvrirInvitation"
          >
            Inviter un gestionnaire
          </CzButton>
        </div>
      </div>

      <!-- Desktop : quota et rôles -->
      <aside class="equipe__cote cz-desktop">
        <section class="cz-card equipe__carte">
          <h2 class="equipe__titre">
            Comptes gestionnaires
          </h2>
          <template v-if="chargement">
            <CzSkeleton
              :hauteur="14"
              largeur="70%"
            />
            <CzSkeleton :hauteur="8" />
          </template>
          <template v-else>
            <div class="equipe__ligne-quota">
              <span>{{ quota.utilises }} sur {{ quota.limite }} comptes secondaires</span>
              <b>{{ pourcentage }} %</b>
            </div>
            <CzProgress
              :valeur="pourcentage"
              :ton="quotaAtteint ? 'danger' : 'brand'"
              label="Comptes secondaires utilisés"
            />
            <p
              id="equipe-quota"
              class="equipe__note"
              :class="{ equipe__limite: quotaAtteint }"
            >
              {{ quotaAtteint
                ? 'Limite atteinte. Le nombre de comptes est fixé par la plateforme Cotiz.'
                : 'Limite fixée par la plateforme Cotiz pour votre association.' }}
            </p>
          </template>
        </section>
        <section class="cz-card equipe__carte equipe__roles">
          <h2 class="equipe__titre">
            Qui peut faire quoi ?
          </h2>
          <div>
            <b>Gestionnaire principal</b>
            <p>Tout, y compris l’équipe, l’abonnement et les paramètres de l’association.</p>
          </div>
          <div>
            <b>Gestionnaire secondaire</b>
            <p>Projets, souscripteurs, validation des paiements et relances.</p>
          </div>
        </section>
      </aside>
    </div>

    <ModaleInvitationGestionnaire
      v-model:ouvert="invitation"
      :envoi="envoi"
      :erreur="erreurInvitation"
      @inviter="inviter"
    />

    <CzConfirmation
      v-model:ouvert="confirmationOuverte"
      :titre="aRetirer?.statut === 'invite' ? 'Annuler l’invitation ?' : `Retirer l’accès de ${aRetirer ? nom(aRetirer) : ''} ?`"
      confirmer="Retirer l’accès"
      :chargement="retrait"
      libelle-chargement="Retrait…"
      @confirmer="retirer"
    >
      {{ aRetirer ? nom(aRetirer) : '' }} ne pourra plus se connecter à l’espace de l’association. Les paiements qu’il ou elle a validés restent dans l’historique.
    </CzConfirmation>
  </div>
</template>

<style scoped>
.equipe {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.equipe__grille {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: var(--space-4);
  align-items: start;
}

.equipe__principal,
.equipe__cote {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.equipe__muted {
  color: var(--text-muted);
}

.equipe__carte {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.equipe__titre {
  margin: 0;
  font-family: var(--font-display);
  font-size: 15px;
  font-weight: 600;
  color: var(--text-strong);
}

.equipe__ligne-quota {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-3);
  font-size: 14px;
}

.equipe__ligne-quota b {
  color: var(--text-strong);
}

.equipe__note {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-muted);
}

.equipe .equipe__limite {
  font-size: 13px;
  color: var(--warning-fg);
}

.equipe__roles {
  gap: var(--space-2);
  font-size: 13.5px;
  line-height: 1.5;
}

.equipe__roles b {
  color: var(--text-strong);
}

.equipe__roles p {
  margin: 0;
  font-size: 13px;
  color: var(--text-muted);
}

.equipe__mobile {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.equipe__jauge-mobile {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.equipe__liste {
  margin: 0;
  padding: 0;
  list-style: none;
  overflow: hidden;
}

.equipe__membre {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: 64px;
  padding: var(--space-2) 14px;
}

.equipe__membre + .equipe__membre {
  border-top: 1px solid var(--divider-row);
}

.equipe__qui {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.equipe__qui b {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-strong);
}

.equipe__qui span {
  font-size: 12.5px;
  color: var(--text-muted);
}

.equipe__role-mobile {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  font-size: 13.5px;
  line-height: 1.5;
}

.equipe__role-mobile b {
  color: var(--text-strong);
}

.equipe__role-mobile span {
  font-size: 13px;
  color: var(--text-muted);
}

@media (max-width: 1023px) {
  .equipe__grille {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 767px) {
  .equipe {
    gap: var(--space-3);
  }
}
</style>
