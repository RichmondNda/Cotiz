<!--
  SaUtilisateurs — gérer l'équipe interne de Cotiz et tracer les actions sensibles. Fonction V2 : en V1, écran
  « Bientôt disponible ». `?scenario=nominal` : aperçu de la V2 (onglets Équipe · Journal d'audit, tableau nom, email,
  rôle, dernière connexion, statut ; « Inviter un membre »), comme la capture de référence.
-->
<script setup lang="ts">
import type { ColonneTable } from '~/components/cz/CzTable.vue'
import type { Onglet } from '~/components/cz/CzTabs.vue'
import { formatHeure, formatRelatif } from '~/utils/format'
import { ROLES_PLATEFORME } from '~/utils/statuts'

definePageMeta({ middleware: 'espace-plateforme', layout: 'backoffice', espace: 'superadmin', titre: 'Utilisateurs' })
useHead({ title: 'Utilisateurs · Cotiz' })

const route = useRoute()
const toast = useToast()
const apercuV2 = computed(() => route.query.scenario === 'nominal')
const { data, pending, error, refresh } = useUtilisateursPlateforme({ immediat: apercuV2.value })
const lignes = computed(() => (data.value ?? []).map(u => ({ ...u })))

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
]
/** « aujourd'hui, 9 h 02 » ; placeholders de la maquette tels quels ; « — » si jamais connecté. */
function connexion(d: string | null) {
  if (!d) return '—'
  if (!/^\d{4}-/.test(d)) return d
  return `${formatRelatif(d.slice(0, 10))}, ${formatHeure(d)}`
}
const bientot = () => toast.info('Bientôt disponible', { message: 'La gestion de l’équipe plateforme arrive en V2.' })
</script>

<template>
  <div class="sa-utils">
    <EnTetePage titre="Utilisateurs plateforme">
      <template #apres-titre>
        <CzSoon>V2</CzSoon>
      </template>
      <template
        v-if="apercuV2"
        #actions
      >
        <CzButton
          icone="ajouter"
          @click="bientot"
        >
          Inviter un membre
        </CzButton>
      </template>
    </EnTetePage>

    <div
      v-if="!apercuV2"
      class="cz-card"
    >
      <CzEmpty
        icone="souscripteurs"
        bientot
        description="Gérez l’équipe interne de Cotiz et tracez les actions sensibles dans un journal d’audit."
        integre
      />
    </div>

    <template v-else>
      <CzTabs
        v-model="onglet"
        :onglets="ONGLETS"
        label="Utilisateurs plateforme"
      />
      <CzTable
        v-if="onglet === 'equipe'"
        :colonnes="COLONNES"
        :lignes="lignes"
        :chargement="pending && !data"
        :erreur="error ? 'Vérifiez votre connexion, puis réessayez.' : undefined"
        :cliquable="false"
        label="Équipe interne de Cotiz"
        @reessayer="refresh()"
      >
        <template #cell-nom="{ ligne }">
          <div class="cz-person">
            <CzAvatar
              :nom="ligne.nom"
              :initiales="ligne.nom.startsWith('[') ? '··' : undefined"
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
      </CzTable>
      <div
        v-else
        class="cz-card"
      >
        <CzEmpty
          icone="historique"
          bientot
          description="Liste chronologique filtrable des actions sensibles : acteur, action, cible, date, adresse IP."
          integre
        />
      </div>
    </template>
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
