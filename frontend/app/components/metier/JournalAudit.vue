<!--
  Journal d'audit de la plateforme (SaUtilisateurs › Journal d'audit, lot 4.7, `platform.audit.read` : propriétaires
  et administrateurs). Filtres : famille d'action, association, période ; acteur par clic sur son nom (puce effaçable).
  Liste chronologique (date, acteur, action, cible, association, adresse IP), pages de 50 (« Afficher plus »).
  « Exporter » : CSV des mêmes filtres (10 000 entrées au plus, au-delà l'export le signale).
-->
<script setup lang="ts">
import type { ColonneTable } from '~/components/cz/CzTable.vue'
import type { FiltresAudit } from '~~/types'
import { messageRefus } from '~/composables/api/client'
import { formatDate, formatHeure } from '~/utils/format'

const toast = useToast()
const journal = useJournalAudit()

const ACTIONS = [
  { valeur: '', label: 'Toutes' },
  { valeur: 'association.', label: 'Associations' },
  { valeur: 'association_request.', label: 'Demandes d’inscription' },
  { valeur: 'plan.', label: 'Plans' },
  { valeur: 'subscription.', label: 'Abonnements' },
  { valeur: 'invoice.', label: 'Facturation' },
  { valeur: 'staff.', label: 'Équipe Cotiz' },
  { valeur: 'user.', label: 'Comptes' },
  { valeur: 'password_reset.', label: 'Réinitialisations' },
  { valeur: 'payment.', label: 'Paiements' },
  { valeur: 'project.', label: 'Projets' },
  { valeur: 'team.', label: 'Équipes d’association' },
  { valeur: 'audit_log.', label: 'Exports du journal' },
]
const PERIODES = [
  { valeur: '', label: 'Toutes' },
  { valeur: '1', label: 'Dernières 24 h' },
  { valeur: '7', label: '7 derniers jours' },
  { valeur: '30', label: '30 derniers jours' },
  { valeur: '90', label: '90 derniers jours' },
]

const action = ref('')
const association = ref('')
const periode = ref('')
const acteur = ref<{ id: string, nom: string } | null>(null)
const export_ = ref(false)

const ASSOCIATIONS = computed(() => [
  { valeur: '', label: 'Toutes' },
  ...[...journal.associations.value].map(([valeur, label]) => ({ valeur, label })).sort((a, b) => a.label.localeCompare(b.label, 'fr')),
])

function filtres(): FiltresAudit {
  const jours = Number(periode.value)
  return {
    ...(acteur.value ? { acteurId: acteur.value.id } : {}),
    ...(action.value ? { action: action.value } : {}),
    ...(association.value ? { associationId: association.value } : {}),
    ...(jours ? { depuis: new Date(Date.now() - jours * 86_400_000).toISOString() } : {}),
  }
}

watch([action, association, periode, acteur], () => void journal.charger(filtres()), { immediate: true })

async function exporter() {
  export_.value = true
  try {
    const tronque = await journal.exporter(filtres())
    if (tronque) toast.succes('Export téléchargé', { message: 'Seules les 10 000 entrées les plus récentes y figurent : resserrez la période pour le reste.' })
    else toast.succes('Export téléchargé', { message: 'Le fichier CSV reprend les filtres affichés.' })
  }
  catch (e) {
    toast.erreur('Export impossible', { message: messageRefus(e) ?? 'Vérifiez votre connexion, puis réessayez.' })
  }
  finally {
    export_.value = false
  }
}

const COLONNES: ColonneTable[] = [
  { cle: 'date', label: 'Date' },
  { cle: 'acteur', label: 'Acteur', squelette: 'personne' },
  { cle: 'action', label: 'Action' },
  { cle: 'cible', label: 'Cible' },
  { cle: 'association', label: 'Association' },
  { cle: 'ip', label: 'Adresse IP' },
]
const lignes = computed(() => journal.entrees.value.map(e => ({ ...e })))
const ROLES: Record<string, string> = {
  'platform:owner': 'Propriétaire Cotiz',
  'platform:admin': 'Administrateur Cotiz',
  'platform:support': 'Support Cotiz',
  'association:owner': 'Propriétaire',
  'association:manager': 'Gestionnaire',
  'association:viewer': 'Lecteur',
  'subscriber': 'Souscripteur',
  'system': 'Système',
}
</script>

<template>
  <div class="journal">
    <div class="journal__barre">
      <div class="journal__filtres">
        <CzFiltreMenu
          v-model="action"
          libelle="Action"
          :options="ACTIONS"
        />
        <CzFiltreMenu
          v-model="association"
          libelle="Association"
          :options="ASSOCIATIONS"
        />
        <CzFiltreMenu
          v-model="periode"
          libelle="Période"
          :options="PERIODES"
        />
        <CzChip
          v-if="acteur"
          actif
          retirable
          @click="acteur = null"
          @retirer="acteur = null"
        >
          Acteur : {{ acteur.nom }}
        </CzChip>
      </div>
      <CzButton
        variante="secondaire"
        icone="telecharger"
        :chargement="export_"
        libelle-chargement="Export…"
        @click="exporter"
      >
        Exporter
      </CzButton>
    </div>

    <CzTable
      :colonnes="COLONNES"
      :lignes="lignes"
      :chargement="journal.chargement.value && !journal.entrees.value.length"
      :erreur="journal.erreur.value ? 'Vérifiez votre connexion, puis réessayez.' : undefined"
      :cliquable="false"
      label="Journal d’audit de la plateforme"
      @reessayer="journal.charger(filtres())"
    >
      <template #vide>
        <CzEmpty
          icone="historique"
          titre="Aucune action"
          description="Aucune action sensible ne correspond à ces filtres."
          integre
        />
      </template>
      <template #cell-date="{ ligne }">
        <span class="journal__muted">{{ formatDate(ligne.date) }}, {{ formatHeure(ligne.date) }}</span>
      </template>
      <template #cell-acteur="{ ligne }">
        <div class="journal__acteur">
          <button
            v-if="ligne.acteur"
            type="button"
            class="journal__lien"
            :title="`Voir les actions de ${ligne.acteur.nom}`"
            @click="acteur = ligne.acteur"
          >
            {{ ligne.acteur.nom }}
          </button>
          <b v-else>Système</b>
          <span class="journal__muted">{{ ROLES[ligne.roleActeur] ?? ligne.roleActeur }}</span>
        </div>
      </template>
      <template #cell-action="{ ligne }">
        <code class="journal__code">{{ ligne.action }}</code>
      </template>
      <template #cell-cible="{ ligne }">
        <span class="journal__muted">{{ ligne.cible }}</span>
      </template>
      <template #cell-association="{ ligne }">
        {{ ligne.association?.nom ?? '—' }}
      </template>
      <template #cell-ip="{ ligne }">
        <span class="journal__muted">{{ ligne.ip ?? '—' }}</span>
      </template>
    </CzTable>

    <div
      v-if="journal.entrees.value.length"
      class="journal__pied"
    >
      <span class="journal__muted">{{ journal.entrees.value.length }} sur {{ journal.total.value }}</span>
      <CzButton
        v-if="journal.aSuite.value"
        variante="fantome"
        :chargement="journal.chargement.value"
        libelle-chargement="Chargement…"
        @click="journal.suite()"
      >
        Afficher plus
      </CzButton>
    </div>
  </div>
</template>

<style scoped>
.journal {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.journal__barre {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.journal__filtres {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.journal__acteur {
  display: flex;
  flex-direction: column;
}

.journal__lien {
  padding: 0;
  border: 0;
  background: transparent;
  font: inherit;
  font-weight: 600;
  color: var(--text-strong);
  text-align: left;
  cursor: pointer;
}

.journal__lien:hover {
  color: var(--brand);
  text-decoration: underline;
}

.journal__lien:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
  border-radius: 4px;
}

.journal__code {
  font-size: 12.5px;
  color: var(--text-strong);
}

.journal__muted {
  font-size: 13px;
  color: var(--text-muted);
}

.journal__pied {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}
</style>
