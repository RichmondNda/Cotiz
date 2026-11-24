<!--
  SaUtilisateurs — équipe interne de Cotiz et journal des actions sensibles (lot 4.7).
  Onglet Équipe (pf.staff, propriétaires seulement) : tableau nom, email, rôle, dernière connexion, statut, actions
  (renvoyer l'invitation, changer le rôle, retirer l'accès) ; « Inviter un membre ».
  Écart sans fournisseur (ui-deviations) : aucun email ; l'invitation (ou son renvoi) affiche le code `staff_invite` et
  son message prêt (HandoffCard) à transmettre par la personne qui invite.
  Onglet Journal d'audit (pf.audit, propriétaires et administrateurs) : composant JournalAudit (filtres, export CSV).
-->
<script setup lang="ts">
import type { ColonneTable } from '~/components/cz/CzTable.vue'
import type { ElementMenu } from '~/components/cz/CzMenu.vue'
import type { Onglet } from '~/components/cz/CzTabs.vue'
import type { AccesARemettre, InvitationPersonnel, RolePlateforme, UtilisateurPlateforme } from '~~/types'
import { codeErreur, messageRefus } from '~/composables/api/client'
import { formatDate, formatHeure } from '~/utils/format'
import { ROLES_PLATEFORME } from '~/utils/statuts'

definePageMeta({ middleware: 'espace-plateforme', layout: 'backoffice', espace: 'superadmin', titre: 'Utilisateurs' })
useHead({ title: 'Utilisateurs · Cotiz' })

const toast = useToast()
const { peut, pret } = usePermissions()
const gere = computed(() => peut('platform.staff.manage'))
const lit = computed(() => peut('platform.audit.read'))
const { data, pending, error, refresh } = useUtilisateursPlateforme({ immediat: false })
const actions = useActionsPersonnel()
watch([pret, gere], ([p, g]) => {
  if (p && g) void refresh()
}, { immediate: true })

const lignes = computed(() => (data.value ?? []).map(u => ({ ...u })))
const proprietairesActifs = computed(() => (data.value ?? []).filter(u => u.role === 'proprietaire' && u.statut === 'actif').length)

const onglet = ref<'equipe' | 'audit'>('equipe')
const ONGLETS: Onglet[] = [
  { label: 'Équipe', valeur: 'equipe' },
  { label: 'Journal d’audit', valeur: 'audit' },
]
const COLONNES: ColonneTable[] = [
  { cle: 'nom', label: 'Nom', squelette: 'personne' },
  { cle: 'email', label: 'Email' },
  { cle: 'role', label: 'Rôle', squelette: 'badge' },
  { cle: 'derniereConnexion', label: 'Dernière connexion' },
  { cle: 'statut', label: 'Statut', squelette: 'badge' },
  { cle: 'actions', label: '', largeur: '56px' },
]
/**
 * « 20 nov. 2026, 13 h 49 » ; « — » si jamais connecté. Date absolue : les dates relatives du front partent encore de la
 * date figée des maquettes (utils/date-reference.ts).
 */
function connexion(d: string | null) {
  if (!d) return '—'
  return `${formatDate(d)}, ${formatHeure(d)}`
}

// ---------------------------------------------------------------- Invitation
const invitation = ref(false)
const envoi = ref(false)
const erreurInvitation = ref<string>()
/** Message prêt de la dernière invitation (ou de son renvoi), à transmettre par la personne qui invite. */
const acces = ref<AccesARemettre | null>(null)
const accesOuvert = computed({
  get: () => acces.value !== null,
  set: (v) => { if (!v) acces.value = null },
})
const ERREURS: Record<string, string> = {
  'email-existant': 'Cet email a déjà un compte Cotiz. Invitez une adresse sans compte.',
  'email-invalide': 'Indiquez un email valide, par exemple nom@exemple.com',
}

function ouvrirInvitation() {
  erreurInvitation.value = undefined
  invitation.value = true
}

async function inviter(corps: InvitationPersonnel) {
  envoi.value = true
  erreurInvitation.value = undefined
  try {
    acces.value = await actions.inviter(corps)
    invitation.value = false
    await refresh()
  }
  catch (e) {
    const code = codeErreur(e)
    erreurInvitation.value = (code && ERREURS[code]) || 'L’invitation n’a pas pu être envoyée. Réessayez.'
  }
  finally {
    envoi.value = false
  }
}

// ---------------------------------------------------------------- Actions d'une ligne
const aRetirer = ref<UtilisateurPlateforme | null>(null)
const retrait = ref(false)
const confirmationOuverte = computed({
  get: () => aRetirer.value !== null,
  set: (v) => { if (!v) aRetirer.value = null },
})
const DERNIER = 'La plateforme garde au moins un propriétaire actif. Nommez d’abord un autre propriétaire.'

async function renvoyer(u: UtilisateurPlateforme) {
  try {
    acces.value = await actions.renvoyer(u)
    await refresh()
  }
  catch (e) {
    toast.erreur('Nouveau code impossible', { message: messageRefus(e) ?? 'Vérifiez votre connexion, puis réessayez.' })
  }
}

async function changerRole(u: UtilisateurPlateforme, role: RolePlateforme) {
  try {
    await actions.changerRole(u.id, role)
    toast.succes('Rôle modifié', { message: `Nouveau rôle de ${u.nom} : ${ROLES_PLATEFORME[role]}.` })
    await refresh()
  }
  catch (e) {
    toast.erreur('Rôle inchangé', { message: codeErreur(e) === 'dernier-proprietaire' ? DERNIER : 'Vérifiez votre connexion, puis réessayez.' })
  }
}

async function retirer() {
  const u = aRetirer.value
  if (!u) return
  retrait.value = true
  try {
    await actions.retirer(u.id)
    toast.succes(u.statut === 'invite' ? 'Invitation annulée' : 'Accès retiré', { message: `${u.nom} n’a plus accès à l’espace plateforme.` })
    aRetirer.value = null
    await refresh()
  }
  catch (e) {
    toast.erreur('Retrait impossible', { message: codeErreur(e) === 'dernier-proprietaire' ? DERNIER : 'Vérifiez votre connexion, puis réessayez.' })
  }
  finally {
    retrait.value = false
  }
}

const autresRoles = (u: UtilisateurPlateforme) => (['proprietaire', 'administrateur', 'support'] as const).filter(r => r !== u.role)
const menu = (u: UtilisateurPlateforme): ElementMenu[] => [
  ...(u.statut === 'invite' ? [{ label: 'Renvoyer l’invitation', action: () => renvoyer(u) }] : []),
  ...autresRoles(u).map((r, i) => ({
    label: `Rôle : ${ROLES_PLATEFORME[r]}`,
    separe: i === 0 && u.statut === 'invite',
    action: () => changerRole(u, r),
  })),
  {
    label: u.statut === 'invite' ? 'Annuler l’invitation' : 'Retirer l’accès',
    danger: true,
    separe: true,
    disabled: u.role === 'proprietaire' && u.statut === 'actif' && proprietairesActifs.value <= 1,
    action: () => (aRetirer.value = u),
  },
]
</script>

<template>
  <div class="sa-utils">
    <EnTetePage titre="Utilisateurs plateforme">
      <template
        v-if="gere && onglet === 'equipe'"
        #actions
      >
        <CzButton
          icone="ajouter"
          :disabled="pending && !data"
          @click="ouvrirInvitation"
        >
          Inviter un membre
        </CzButton>
      </template>
    </EnTetePage>

    <CzTabs
      v-model="onglet"
      :onglets="ONGLETS"
      label="Utilisateurs plateforme"
    />

    <template v-if="onglet === 'equipe'">
      <div
        v-if="pret && !gere"
        class="cz-card"
      >
        <CzEmpty
          icone="souscripteurs"
          titre="Réservé aux propriétaires"
          description="Seuls les propriétaires de la plateforme gèrent l’équipe interne de Cotiz."
          integre
        />
      </div>
      <CzTable
        v-else
        :colonnes="COLONNES"
        :lignes="lignes"
        :chargement="!pret || (pending && !data)"
        :erreur="error ? 'Vérifiez votre connexion, puis réessayez.' : undefined"
        :cliquable="false"
        label="Équipe interne de Cotiz"
        @reessayer="refresh()"
      >
        <template #cell-nom="{ ligne }">
          <div class="cz-person">
            <CzAvatar
              :nom="ligne.nom"
              :initiales="ligne.statut === 'invite' ? '··' : undefined"
              taille="sm"
            />
            <b class="sa-utils__nom">{{ ligne.nom }}</b>
          </div>
        </template>
        <template #cell-role="{ ligne }">
          <CzBadge :ton="ligne.role === 'proprietaire' ? 'brand' : 'neutral'">
            {{ ROLES_PLATEFORME[ligne.role] }}
          </CzBadge>
        </template>
        <template #cell-derniereConnexion="{ ligne }">
          <span class="sa-utils__muted">{{ connexion(ligne.derniereConnexion) }}</span>
        </template>
        <template #cell-statut="{ ligne }">
          <CzBadge :ton="ligne.statut === 'actif' ? 'success' : 'warning'">
            {{ ligne.statut === 'actif' ? 'Actif' : 'Invitation envoyée' }}
          </CzBadge>
        </template>
        <template #cell-actions="{ ligne }">
          <CzMenu
            :elements="menu(ligne)"
            :label="`Actions pour ${ligne.nom}`"
            largeur="240px"
          >
            <template #declencheur="{ basculer, attrs }">
              <CzButton
                variante="icone"
                taille="sm"
                icone="actions"
                :label="`Actions pour ${ligne.nom}`"
                v-bind="attrs"
                @click="basculer"
              />
            </template>
          </CzMenu>
        </template>
      </CzTable>
    </template>
    <template v-else>
      <div
        v-if="pret && !lit"
        class="cz-card"
      >
        <CzEmpty
          icone="historique"
          titre="Réservé aux propriétaires et administrateurs"
          description="Le journal des actions sensibles de la plateforme est lu par les propriétaires et les administrateurs."
          integre
        />
      </div>
      <JournalAudit v-else-if="pret" />
    </template>

    <ModaleInvitationPersonnel
      v-model:ouvert="invitation"
      :envoi="envoi"
      :erreur="erreurInvitation"
      @inviter="inviter"
    />

    <CzModal
      v-model:ouvert="accesOuvert"
      titre="Invitation à transmettre"
      taille="md"
    >
      <HandoffCard
        v-if="acces"
        titre="Invitation dans l’équipe Cotiz"
        libelle-code="Code d’invitation"
        :destinataire="acces.destinataire"
        :code="acces.code"
        :expire-le="acces.expireLe"
        :message="acces.message"
        :whatsapp="acces.whatsapp"
        :sms="acces.sms"
        :mailto="acces.mailto"
      />
    </CzModal>

    <CzConfirmation
      v-model:ouvert="confirmationOuverte"
      :titre="aRetirer?.statut === 'invite' ? 'Annuler l’invitation ?' : `Retirer l’accès de ${aRetirer?.nom ?? ''} ?`"
      confirmer="Retirer l’accès"
      :chargement="retrait"
      libelle-chargement="Retrait…"
      @confirmer="retirer"
    >
      {{ aRetirer?.nom ?? '' }} ne pourra plus se connecter à l’espace plateforme. Son compte et ses autres accès restent ; ses actions passées restent dans le journal d’audit.
    </CzConfirmation>
  </div>
</template>

<style scoped>
.sa-utils {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.sa-utils__nom {
  color: var(--text-strong);
}

.sa-utils__muted {
  color: var(--text-muted);
}
</style>
