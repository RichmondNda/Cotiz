<!--
  SaDashboard — savoir en un regard ce qui demande une action (demandes à traiter, impayés) et si la plateforme va bien.
  File prioritaire (3 plus anciennes demandes, bordure orange) ou état positif « Aucune demande en attente » ;
  4 KPI cliquables (liste filtrée) ; courbe 12 mois et répartition par plan (données illustratives) ;
  associations à surveiller ; activité récente. Scénarios : `aucune-demande` (+ `chargement`, `erreur`).
-->
<script setup lang="ts">
import { formatDate, formatFCFA, formatRelatif, pluriel } from '~/utils/format'
import { maintenant } from '~/utils/date-reference'
import { SIGNAUX_ASSOCIATION, TYPES_ASSOCIATION } from '~/utils/statuts'

definePageMeta({ middleware: 'espace-plateforme', layout: 'backoffice', espace: 'superadmin', titre: 'Tableau de bord' })
useHead({ title: 'Tableau de bord · Cotiz' })

const { data, pending, error, refresh } = useTableauDeBordPlateforme()
const { data: moi } = useMoi()

const chargement = computed(() => pending.value && !data.value)
const aujourdhui = computed(() => {
  const d = formatDate(maintenant(), 'complet')
  return d.charAt(0).toUpperCase() + d.slice(1)
})
const chiffre = (v: number | string, montant = false) => (typeof v === 'number' ? (montant ? formatFCFA(v) : String(v)) : montant ? `${v} F` : v)
const totalRepartition = computed(() => (data.value?.repartition ?? []).reduce((n, r) => n + r.nombre, 0) || 1)
</script>

<template>
  <div class="sa-dash">
    <EnTetePage
      :titre="`Bonjour ${moi?.prenom ?? ''}`"
      :sous-titre="aujourdhui"
    >
      <template #actions>
        <CzButton
          icone="ajouter"
          to="/plateforme/associations/nouvelle"
        >
          Créer une association
        </CzButton>
      </template>
    </EnTetePage>

    <CzErreurChargement
      v-if="error && !data"
      titre="Impossible d’afficher le tableau de bord"
      @reessayer="refresh()"
    />

    <template v-else>
      <!-- File prioritaire -->
      <section
        v-if="chargement || (data && data.demandesATraiter > 0)"
        class="cz-card sa-dash__file"
        aria-labelledby="titre-file"
      >
        <div class="sa-dash__file-tete">
          <h2
            id="titre-file"
            class="sa-dash__h2 sa-dash__h2--grand"
          >
            <CzSkeleton
              v-if="chargement"
              :hauteur="20"
              :largeur="200"
            />
            <template v-else>
              {{ pluriel(data!.demandesATraiter, 'demande') }} à traiter
            </template>
          </h2>
          <NuxtLink
            to="/plateforme/demandes"
            class="sa-dash__lien"
          >Voir toutes les demandes →</NuxtLink>
        </div>
        <div class="sa-dash__defile">
          <table class="cz-table sa-dash__demandes">
            <tbody v-if="chargement">
              <tr
                v-for="i in 3"
                :key="i"
              >
                <td colspan="4">
                  <CzSkeleton
                    :hauteur="14"
                    largeur="50%"
                  />
                </td>
              </tr>
            </tbody>
            <tbody v-else>
              <tr
                v-for="d in data!.demandesPrioritaires"
                :key="d.id"
              >
                <td>
                  <NuxtLink
                    :to="`/plateforme/demandes/${d.id}`"
                    class="sa-dash__nom"
                  >{{ d.association.nom }}</NuxtLink>
                  <div class="sa-dash__sous">
                    {{ d.association.ville }} · {{ TYPES_ASSOCIATION[d.association.type] }}
                  </div>
                </td>
                <td class="sa-dash__muted">
                  {{ formatRelatif(d.recueLe.slice(0, 10), { style: 'long' }) }}
                </td>
                <td>
                  <CzBadge ton="brand">
                    {{ data!.repartition.find(r => r.planId === d.besoins.planSouhaiteId)?.nom ?? d.besoins.planSouhaiteId }}
                  </CzBadge>
                </td>
                <td class="num">
                  <CzButton
                    taille="sm"
                    :to="`/plateforme/demandes/${d.id}`"
                  >
                    Examiner
                  </CzButton>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
      <div
        v-else
        class="cz-card sa-dash__vide"
      >
        <span class="sa-dash__vide-ic"><CzIcon nom="valide" /></span>
        <div>
          <b>Aucune demande en attente</b>
          <div class="sa-dash__sous">
            Toutes les demandes de création ont été traitées.
          </div>
        </div>
      </div>

      <!-- KPI -->
      <div class="sa-dash__kpis">
        <template v-if="chargement">
          <CzKpi
            v-for="i in 4"
            :key="i"
            chargement
          />
        </template>
        <template v-else-if="data">
          <CzKpi
            libelle="Associations actives"
            icone="association"
            :valeur="data.kpi.associationsActives"
            :detail="`+${data.kpi.nouvellesCeMois} ce mois`"
            ton-detail="up"
            :to="{ path: '/plateforme/associations', query: { statut: 'active' } }"
          />
          <CzKpi
            libelle="Souscripteurs sur la plateforme"
            icone="souscripteurs"
            :valeur="chiffre(data.kpi.souscripteurs)"
            detail="toutes associations"
            to="/plateforme/associations"
          />
          <CzKpi
            libelle="Revenu mensuel récurrent"
            icone="tendance"
            ton="success"
            :valeur="chiffre(data.kpi.revenuMensuel, true)"
            :detail="`${data.kpi.abonnementsAJour} abonnements à jour`"
            to="/plateforme/facturation"
          />
          <CzKpi
            libelle="Abonnements impayés"
            icone="alerte"
            ton="danger"
            :detail="`sur ${data.kpi.totalAssociations} associations`"
            :ton-detail="data.kpi.abonnementsImpayes > 0 ? 'bad' : undefined"
            :to="{ path: '/plateforme/associations', query: { statut: 'impayee' } }"
          >
            <template #valeur>
              <span :class="{ 'sa-dash__danger': data.kpi.abonnementsImpayes > 0 }">{{ data.kpi.abonnementsImpayes }}</span>
            </template>
          </CzKpi>
        </template>
      </div>

      <!-- Graphiques -->
      <div class="sa-dash__rangee">
        <section class="cz-card sa-dash__carte">
          <div class="sa-dash__carte-tete">
            <h2 class="sa-dash__h2">
              Associations actives — 12 mois
            </h2>
            <span class="sa-dash__note">Données illustratives</span>
          </div>
          <CzSkeleton
            v-if="chargement"
            :hauteur="180"
          />
          <CourbeAssociations
            v-else-if="data"
            :points="data.evolution"
          />
        </section>
        <section class="cz-card sa-dash__carte">
          <div class="sa-dash__carte-tete">
            <h2 class="sa-dash__h2">
              Répartition par plan
            </h2>
            <span class="sa-dash__note">Données illustratives</span>
          </div>
          <ul class="sa-dash__repartition">
            <li
              v-for="r in data?.repartition ?? []"
              :key="r.planId"
            >
              <div class="sa-dash__rep-l">
                <span>{{ r.nom }}</span><b>{{ r.nombre }}</b>
              </div>
              <CzProgress
                :valeur="(r.nombre / totalRepartition) * 100"
                :label="`${r.nom} : ${r.nombre} associations`"
              />
            </li>
          </ul>
        </section>
      </div>

      <div class="sa-dash__rangee">
        <section class="cz-card sa-dash__carte">
          <h2 class="sa-dash__h2 sa-dash__h2--table">
            Associations à surveiller
          </h2>
          <div class="sa-dash__defile">
            <table class="cz-table">
              <thead>
                <tr>
                  <th>Association</th>
                  <th>Signal</th>
                  <th>Depuis</th>
                  <th><span class="sr-only">Action</span></th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="a in data?.aSurveiller ?? []"
                  :key="a.associationId"
                >
                  <td>
                    <NuxtLink
                      :to="`/plateforme/associations/${a.associationId}`"
                      class="sa-dash__nom"
                    >
                      {{ a.nom }}
                    </NuxtLink>
                  </td>
                  <td>
                    <CzBadge :ton="SIGNAUX_ASSOCIATION[a.signal].ton">
                      {{ SIGNAUX_ASSOCIATION[a.signal].libelle }}
                    </CzBadge>
                  </td>
                  <td class="sa-dash__muted">
                    {{ a.depuis ? formatDate(a.depuis) : '—' }}
                  </td>
                  <td class="num">
                    <CzButton
                      variante="secondaire"
                      taille="sm"
                      :to="`/plateforme/associations/${a.associationId}`"
                    >
                      Voir
                    </CzButton>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
        <section class="cz-card sa-dash__carte">
          <h2 class="sa-dash__h2 sa-dash__h2--frise">
            Activité récente
          </h2>
          <Frise
            :evenements="data?.activite ?? []"
            label="Activité récente de la plateforme"
          />
        </section>
      </div>
    </template>
  </div>
</template>

<style scoped>
.sa-dash {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.sa-dash__h2 {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 16px;
  color: var(--text-strong);
}

.sa-dash__h2--grand {
  font-size: 18px;
}

.sa-dash__h2--table {
  margin-bottom: var(--space-2);
}

.sa-dash__h2--frise {
  margin-bottom: var(--space-3);
}

.sa-dash__file {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-6);
  border-left: 4px solid var(--warning);
}

.sa-dash__file-tete,
.sa-dash__carte-tete {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: var(--space-3);
}

.sa-dash__carte-tete {
  margin-bottom: var(--space-3);
}

.sa-dash__lien {
  font-size: 13.5px;
  font-weight: 600;
  text-decoration: none;
}

.sa-dash__lien:hover {
  text-decoration: underline;
}

.sa-dash__demandes td {
  border-bottom-color: var(--divider-row);
}

.sa-dash__nom {
  font-weight: 600;
  color: var(--text-strong);
  text-decoration: none;
}

.sa-dash__nom:hover {
  text-decoration: underline;
}

.sa-dash__sous {
  font-size: 12px;
  color: var(--text-muted);
}

.sa-dash__muted {
  color: var(--text-muted);
}

.sa-dash__vide {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-6);
}

.sa-dash__vide b {
  font-family: var(--font-display);
  color: var(--text-strong);
}

.sa-dash__vide-ic {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: var(--r-pill);
  background: var(--success-bg);
  color: var(--success-fg);
}

.sa-dash__kpis {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-4);
}

.sa-dash__danger {
  color: var(--danger-fg);
}

.sa-dash__rangee {
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  gap: var(--space-4);
}

.sa-dash__carte {
  min-width: 0;
  padding: var(--space-6);
}

.sa-dash__note {
  font-size: 12px;
  color: var(--text-muted);
}

.sa-dash__repartition {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 13.5px;
}

.sa-dash__rep-l {
  display: flex;
  justify-content: space-between;
  margin-bottom: var(--space-1);
}

.sa-dash__defile {
  position: relative;
  overflow-x: auto;
}

@media (max-width: 1023px) {
  .sa-dash__kpis {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .sa-dash__rangee {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 767px) {
  .sa-dash__kpis {
    grid-template-columns: minmax(0, 1fr);
  }

  .sa-dash__file-tete {
    flex-direction: column;
  }

  .sa-dash__demandes td:nth-child(2) {
    display: none;
  }

  /* Nom · plan · Examiner tiennent dans la largeur de la carte, sans défilement horizontal. */
  .sa-dash__demandes td {
    padding-left: var(--space-2);
    padding-right: var(--space-2);
  }

  .sa-dash__demandes td:first-child {
    padding-left: 0;
  }

  .sa-dash__demandes td:last-child {
    padding-right: 0;
  }
}
</style>
