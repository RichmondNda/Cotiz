<!--
  SaFacturation — suivre les encaissements d'abonnements et les impayés. Fonction V2 : en V1, écran
  « Bientôt disponible » avec un lien vers les associations impayées.
  `?scenario=nominal` : aperçu de la V2 (KPI revenu du mois / encaissé / en attente / impayé, onglets par statut,
  tableau des factures avec sélection, PDF et « Marquer payée »), comme la capture de référence.
-->
<script setup lang="ts">
import type { ColonneTable } from '~/components/cz/CzTable.vue'
import type { Onglet } from '~/components/cz/CzTabs.vue'
import type { ChiffreOuPlaceholder, StatutFacture } from '~~/types'
import { formatDate, formatFCFA, formatMois } from '~/utils/format'
import { STATUTS_FACTURE } from '~/utils/statuts'

definePageMeta({ middleware: 'espace-plateforme', layout: 'backoffice', espace: 'superadmin', titre: 'Facturation' })
useHead({ title: 'Facturation · Cotiz' })

const route = useRoute()
const toast = useToast()
const apercuV2 = computed(() => route.query.scenario === 'nominal')
const { data, pending, error, refresh } = useFacturationPlateforme({ immediat: apercuV2.value })

const onglet = ref<'toutes' | StatutFacture>('toutes')
const ONGLETS: Onglet[] = [
  { label: 'Toutes', valeur: 'toutes' },
  { label: 'À venir', valeur: 'a_venir' },
  { label: 'En attente', valeur: 'en_attente' },
  { label: 'Payées', valeur: 'payee' },
  { label: 'Impayées', valeur: 'impayee' },
]
const factures = computed(() => (data.value?.factures ?? []).filter(f => onglet.value === 'toutes' || f.statut === onglet.value)
  .map(f => ({ ...f })))
const COLONNES: ColonneTable[] = [
  { cle: 'numero', label: 'N° facture' },
  { cle: 'associationNom', label: 'Association' },
  { cle: 'periode', label: 'Période' },
  { cle: 'montant', label: 'Montant', num: true },
  { cle: 'emiseLe', label: 'Émise le' },
  { cle: 'echeance', label: 'Échéance' },
  { cle: 'statut', label: 'Statut', squelette: 'badge' },
  { cle: 'pdf', label: 'PDF' },
  { cle: 'action', label: '' },
]
const montant = (v: ChiffreOuPlaceholder | '[PRIX]') => (typeof v === 'number' ? formatFCFA(v) : `${v} F`)
const bientot = () => toast.info('Bientôt disponible', { message: 'La facturation globale arrive en V2.' })
</script>

<template>
  <div class="sa-factu">
    <EnTetePage titre="Facturation globale">
      <template #apres-titre>
        <CzSoon>V2</CzSoon>
      </template>
    </EnTetePage>

    <div
      v-if="!apercuV2"
      class="cz-card"
    >
      <CzEmpty
        icone="facturation"
        bientot
        description="Vous suivrez ici les encaissements d’abonnements et les impayés : revenu du mois, factures émises, relances et export."
        integre
      >
        <template #action>
          <CzButton
            variante="secondaire"
            taille="sm"
            :to="{ path: '/plateforme/associations', query: { statut: 'impayee' } }"
          >
            Voir les associations impayées
          </CzButton>
        </template>
      </CzEmpty>
    </div>

    <template v-else>
      <CzErreurChargement
        v-if="error && !data"
        titre="Impossible d’afficher la facturation"
        @reessayer="refresh()"
      />
      <template v-else>
        <div class="sa-factu__kpis">
          <template v-if="pending && !data">
            <CzKpi
              v-for="i in 4"
              :key="i"
              chargement
            />
          </template>
          <template v-else-if="data">
            <CzKpi
              libelle="Revenu du mois"
              :valeur="montant(data.kpi.revenuMois)"
              :detail="`${data.kpi.abonnements} abonnements`"
            />
            <CzKpi
              libelle="Encaissé"
              icone="valide"
              ton="success"
              :valeur="montant(data.kpi.encaisse)"
              :detail="`${data.kpi.facturesPayees} factures payées`"
              ton-detail="up"
            />
            <CzKpi
              libelle="En attente"
              icone="en-attente"
              ton="warning"
              :valeur="montant(data.kpi.enAttente)"
              detail="échéance à venir"
              ton-detail="warn"
            />
            <CzKpi
              libelle="Impayé"
              icone="alerte"
              ton="danger"
              :detail="`${data.kpi.associationsImpayees} associations`"
              ton-detail="bad"
            >
              <template #valeur>
                <span class="sa-factu__danger">{{ montant(data.kpi.impaye) }}</span>
              </template>
            </CzKpi>
          </template>
        </div>

        <CzTabs
          v-model="onglet"
          :onglets="ONGLETS"
          label="Statut des factures"
        />

        <CzTable
          :colonnes="COLONNES"
          :lignes="factures"
          :chargement="pending && !data"
          selectionnable
          :cliquable="false"
          label="Factures d’abonnement"
        >
          <template #cell-numero="{ ligne }">
            <span class="cz-mono sa-factu__nowrap">{{ ligne.numero }}</span>
          </template>
          <template #cell-associationNom="{ ligne }">
            <NuxtLink
              :to="`/plateforme/associations/${ligne.associationId}`"
              class="sa-factu__asso"
            >{{ ligne.associationNom }}</NuxtLink>
          </template>
          <template #cell-periode="{ ligne }">
            <span class="sa-factu__nowrap">{{ formatMois(ligne.periode, 'court-annee') }}</span>
          </template>
          <template #cell-montant="{ ligne }">
            {{ montant(ligne.montant) }}
          </template>
          <template #cell-emiseLe="{ ligne }">
            <span class="sa-factu__muted">{{ ligne.emiseLe ? formatDate(ligne.emiseLe, 'numerique') : '—' }}</span>
          </template>
          <template #cell-echeance="{ ligne }">
            <span class="sa-factu__muted">{{ formatDate(ligne.echeance, 'numerique') }}</span>
          </template>
          <template #cell-statut="{ ligne }">
            <CzBadge :ton="STATUTS_FACTURE[ligne.statut].ton">
              {{ STATUTS_FACTURE[ligne.statut].libelle }}
            </CzBadge>
          </template>
          <template #cell-pdf>
            <button
              type="button"
              class="sa-factu__pdf"
              @click="bientot"
            >
              PDF
            </button>
          </template>
          <template #cell-action="{ ligne }">
            <CzButton
              v-if="ligne.statut === 'impayee' || ligne.statut === 'en_attente'"
              variante="secondaire"
              taille="sm"
              @click="bientot"
            >
              Marquer payée
            </CzButton>
          </template>
          <template #actions-groupees>
            <CzButton
              variante="secondaire"
              taille="sm"
              @click="bientot"
            >
              Relancer
            </CzButton>
            <CzButton
              variante="secondaire"
              taille="sm"
              icone="telecharger"
              @click="bientot"
            >
              Exporter
            </CzButton>
          </template>
          <template #vide>
            <CzEmpty
              icone="facturation"
              ton="neutral"
              titre="Aucune facture"
              description="Aucune facture dans cet onglet."
              integre
            />
          </template>
        </CzTable>
      </template>
    </template>
  </div>
</template>

<style scoped>
.sa-factu {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.sa-factu__kpis {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-4);
}

.sa-factu__nowrap {
  white-space: nowrap;
}

.sa-factu__danger {
  color: var(--danger-fg);
}

.sa-factu__asso {
  font-weight: 600;
  color: var(--text-strong);
  text-decoration: none;
}

.sa-factu__asso:hover {
  text-decoration: underline;
}

.sa-factu__muted {
  color: var(--text-muted);
}

.sa-factu__pdf {
  min-height: 44px;
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  color: var(--text-muted);
  cursor: pointer;
}

.sa-factu__pdf:hover {
  color: var(--brand);
  text-decoration: underline;
}

@media (max-width: 1023px) {
  .sa-factu__kpis {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 767px) {
  .sa-factu__kpis {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
