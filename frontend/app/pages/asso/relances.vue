<!--
  MgRelances — automatiser les rappels et relancer ponctuellement.
  Onglets : Retardataires (KPI en retard / montant / dernière relance automatique ; recherche, projet, ancienneté du
  retard ; tableau sélectionnable, « Relancer » par ligne, barre groupée « Relancer maintenant » → modale message +
  canal ; toast « Relance envoyée ») · Relances automatiques (règles activables, canaux, aperçu du message) ·
  Historique des envois.
  Mobile : en-tête « 14 retardataires », segments, 2 KPI, liste à cocher ; la sélection ouvre la barre « Relancer »
  puis la feuille d'envoi ; confirmation en bandeau.
  Onglet dans l'URL (`?onglet=automatiques`). Scénarios : `aucun-retard` (+ `chargement`, `erreur`).
-->
<script setup lang="ts">
import type { ColonneTable } from '~/components/cz/CzTable.vue'
import type { LigneRetard } from '~~/types'
import { estDate, formatDate, formatFCFA, formatMois, pluriel } from '~/utils/format'

definePageMeta({ middleware: 'espace-gestionnaire', layout: 'backoffice', espace: 'gestionnaire', titre: 'Relances' })
useHead({ title: 'Relances · Cotiz' })

type Onglet = 'retardataires' | 'automatiques' | 'historique'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const { data, pending, error, refresh } = useRelances()
const { data: compteurs } = useCompteursNavigation()
const { data: association } = useAssociationGestionnaire()
const envoyerRelance = useEnvoiRelance()
const basculerRegle = useRegleRelance()
const { estMobile } = useBreakpoint()

// ---------------------------------------------------------------- Onglets
const ONGLETS: Onglet[] = ['retardataires', 'automatiques', 'historique']
const onglet = computed<string | undefined>({
  get: () => (ONGLETS.includes(route.query.onglet as Onglet) ? route.query.onglet as string : 'retardataires'),
  set: v => router.replace({ query: { ...route.query, onglet: v === 'retardataires' ? undefined : v } }),
})
const ongletMobile = computed<Onglet>({ get: () => onglet.value as Onglet, set: v => (onglet.value = v) })
const nbEnRetard = computed(() => data.value?.nbEnRetard ?? 0)
const ongletsDesktop = computed(() => [
  { valeur: 'retardataires', label: `Retardataires (${nbEnRetard.value})` },
  { valeur: 'automatiques', label: 'Relances automatiques' },
  { valeur: 'historique', label: 'Historique des envois' },
])
const OPTIONS_MOBILE: { valeur: Onglet, label: string }[] = [
  { valeur: 'retardataires', label: 'Retards' },
  { valeur: 'automatiques', label: 'Automatiques' },
  { valeur: 'historique', label: 'Historique' },
]

// ---------------------------------------------------------------- Retardataires : filtres
const retardataires = computed(() => data.value?.retardataires ?? [])
const projets = computed(() => [...new Map(retardataires.value.map(r => [r.projetId, r.nomProjet])).entries()])
// Par défaut, le projet qui a le plus de retardataires (comme la maquette : Centre communautaire) ; `null` = tous.
const projetParDefaut = computed(() => {
  const n = new Map<string, number>()
  for (const r of retardataires.value) n.set(r.projetId, (n.get(r.projetId) ?? 0) + 1)
  return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
})
const projetChoisi = ref<string | null | undefined>(undefined)
const projet = computed(() => (projetChoisi.value === undefined ? projetParDefaut.value : projetChoisi.value))
const { data: tousProjets } = useProjets()
const pucesProjets = computed(() => (tousProjets.value ?? [])
  .filter(p => p.statut === 'en_cours')
  .map(p => ({ id: p.id, nom: p.nom })))
function choisirProjet(id: string) {
  projetChoisi.value = projet.value === id ? null : id
}

const RETARDS = [
  { label: 'tous', test: () => true },
  { label: '2 échéances et plus', test: (r: LigneRetard) => r.echeances.length >= 2 },
  { label: '1 échéance', test: (r: LigneRetard) => r.echeances.length === 1 },
]
const retard = ref(0)
const recherche = ref('')

const lignes = computed(() => {
  const q = recherche.value.trim().toLocaleLowerCase('fr')
  const chiffres = q.replace(/\D/g, '')
  return retardataires.value
    .filter(r => (!projet.value || r.projetId === projet.value) && RETARDS[retard.value]!.test(r)
      && (!q || r.nom.toLocaleLowerCase('fr').includes(q) || (chiffres.length >= 2 && r.telephone.replace(/\D/g, '').includes(chiffres))))
    .map(r => ({ id: `${r.souscripteurId}:${r.projetId}`, ...r }))
})
type Ligne = (typeof lignes.value)[number]

// ---------------------------------------------------------------- Libellés
const MOIS_COURTS = (d: string) => (estDate(d) ? formatMois(d, 'court').toLowerCase() : d)
function libelleEcheances(r: LigneRetard): string {
  const partielles = r.echeances.filter(e => e.partielle).length
  const pleines = r.echeances.filter(e => !e.partielle)
  if (!partielles) return `${pleines.length} (${pleines.map(e => MOIS_COURTS(e.date)).join(', ')})`
  const suite = pleines.map(e => MOIS_COURTS(e.date)).join(', ')
  return `${partielles} partielle${partielles > 1 ? 's' : ''}${suite ? ` + ${suite}` : ''}`
}
function libelleCourt(r: LigneRetard): string {
  const partielles = r.echeances.filter(e => e.partielle).length
  if (!partielles) return pluriel(r.echeances.length, 'échéance')
  const suite = r.echeances.filter(e => !e.partielle).map(e => MOIS_COURTS(e.date)).join(', ')
  return `partielle${suite ? ` + ${suite}` : ''}`
}
const jourMois = (d: string) => (estDate(d) ? formatDate(d, 'numerique').slice(0, 5) : d)
function derniereRelance(r: LigneRetard, court = false): string {
  const d = r.derniereRelance
  if (!d) return '—'
  const type = d.type === 'auto' ? 'Auto' : 'Manuelle'
  return court ? `${type.toLowerCase()} ${jourMois(d.date)}` : `${type} · ${jourMois(d.date)}`
}

// ---------------------------------------------------------------- Tableau
const COLONNES: ColonneTable[] = [
  { cle: 'nom', label: 'Souscripteur', squelette: 'personne' },
  { cle: 'nomProjet', label: 'Projet' },
  { cle: 'echeances', label: 'Échéances en retard' },
  { cle: 'montant', label: 'Montant dû', num: true, squelette: 'montant' },
  { cle: 'retardDepuis', label: 'Retard depuis' },
  { cle: 'derniere', label: 'Dernière relance' },
  { cle: 'actions', label: '', largeur: '112px' },
]
const selection = ref<string[]>([])
/** Sans filtre, le total est le nombre de retardataires de l'association (seuls ceux des données de démonstration sont détaillés). */
const filtre = computed(() => retard.value > 0 || Boolean(recherche.value.trim()))
const { page, total: totalListe, pages, lignesPage, plage } = usePagination(lignes, { parPage: 5, totalReference: nbEnRetard, filtre })
watch([projet, retard, recherche], () => {
  page.value = 1
  selection.value = []
})

// ---------------------------------------------------------------- Envoi
const aRelancer = ref<Ligne[]>([])
const modale = ref(false)
const envoi = ref(false)
const envoyee = ref(false)

function ouvrirRelance(l: Ligne[]) {
  if (!l.length) return
  aRelancer.value = l
  modale.value = true
}
const projetMessage = computed(() => {
  const ids = new Set(aRelancer.value.map(l => l.projetId))
  return ids.size === 1 ? aRelancer.value[0]!.nomProjet : undefined
})

async function envoyer(message: string) {
  envoi.value = true
  try {
    const ids = [...new Set(aRelancer.value.map(l => l.souscripteurId))]
    const projets = new Set(aRelancer.value.map(l => l.projetId))
    await envoyerRelance({ souscripteurIds: ids, projetId: projets.size === 1 ? [...projets][0] : undefined, message })
    modale.value = false
    selection.value = []
    if (estMobile.value) envoyee.value = true
    else toast.succes('Relance envoyée', { message: 'Les souscripteurs sélectionnés ont reçu une notification.' })
    await refresh()
  }
  catch {
    toast.erreur('La relance n’a pas pu être envoyée', { message: 'Vérifiez votre connexion, puis réessayez.' })
  }
  finally {
    envoi.value = false
  }
}

const selectionnees = computed(() => lignes.value.filter(l => selection.value.includes(l.id)))
function basculerMobile(id: string) {
  selection.value = selection.value.includes(id) ? selection.value.filter(x => x !== id) : [...selection.value, id]
}

// ---------------------------------------------------------------- Règles
async function changerRegle(id: string, active: boolean) {
  const regle = data.value?.regles.find(r => r.id === id)
  if (!regle) return
  regle.active = active
  try {
    await basculerRegle(id, active)
    toast.succes(active ? 'Règle activée' : 'Règle désactivée', { message: regle.titre })
  }
  catch {
    regle.active = !active
    toast.erreur('La règle n’a pas pu être modifiée', { message: 'Vérifiez votre connexion, puis réessayez.' })
  }
}
const ICONES_REGLE = { info: 'notification', warning: 'alerte', danger: 'alerte' } as const

const chargement = computed(() => pending.value && !data.value)
const aucunRetard = computed(() => !chargement.value && !error.value && retardataires.value.length === 0 && nbEnRetard.value === 0)
const nbAValider = computed(() => compteurs.value?.paiementsAValider ?? 0)
const derniereAuto = computed(() => data.value?.derniereAuto)
const projetKpi = computed(() => (projet.value ? projets.value.find(([id]) => id === projet.value)?.[1] : undefined) ?? projets.value[0]?.[1])
const nomAssociation = computed(() => association.value?.nom)
</script>

<template>
  <div class="relances">
    <EnTeteGestionnaireMobile
      titre="Relances"
      :sous-titre="chargement ? undefined : nbEnRetard ? pluriel(nbEnRetard, 'retardataire') : 'Aucun retard'"
      retour="/asso"
      :cloche="false"
    />
    <EnTetePage
      titre="Relances"
      sous-titre="Rappels de paiement automatiques et relances ponctuelles"
      class="cz-desktop"
    >
      <template #actions>
        <CzButton
          variante="secondaire"
          to="/asso/paiements"
        >
          Paiements à valider ({{ nbAValider }})
        </CzButton>
      </template>
    </EnTetePage>

    <CzTabs
      v-model="onglet"
      :onglets="ongletsDesktop"
      label="Relances"
      class="cz-desktop"
    />
    <CzSegmented
      v-model="ongletMobile"
      :options="OPTIONS_MOBILE"
      label="Relances"
      pleine-largeur
      class="cz-mobile"
    />

    <div
      v-if="envoyee && onglet === 'retardataires'"
      class="cz-alert cz-alert--success cz-mobile"
      role="status"
    >
      <div><b>Relance envoyée.</b> Les souscripteurs ont reçu une notification.</div>
    </div>

    <CzErreurChargement
      v-if="error"
      titre="Impossible d’afficher les relances"
      @reessayer="refresh()"
    />

    <!-- ================================================= Retardataires -->
    <template v-else-if="onglet === 'retardataires'">
      <div
        v-if="aucunRetard"
        class="cz-card relances__vide"
      >
        <CzEmpty
          icone="coche"
          ton="success"
          titre="Aucun retard de paiement"
          description="Tous vos souscripteurs sont à jour. Les relances automatiques restent actives."
          integre
        />
      </div>

      <template v-else>
        <div class="relances__kpis">
          <CzKpi
            libelle="Souscripteurs en retard"
            icone="en-attente"
            ton="danger"
            :valeur="nbEnRetard"
            :detail="`sur ${data?.nbActifs ?? '—'}${projetKpi ? ` · ${projetKpi}` : ''}`"
            ton-detail="bad"
            :chargement="chargement"
            class="cz-desktop"
          />
          <CzKpi
            libelle="Montant en retard"
            :valeur="data ? formatFCFA(data.montantEnRetard) : ''"
            detail="cumul des échéances non payées"
            :chargement="chargement"
            class="cz-desktop"
          />
          <CzKpi
            libelle="Dernière relance automatique"
            :valeur="derniereAuto ? formatDate(derniereAuto.date, 'numerique') : '—'"
            :detail="derniereAuto ? `« ${derniereAuto.regle} » · ${pluriel(derniereAuto.envois, 'envoi')}` : undefined"
            :chargement="chargement"
            class="cz-desktop"
          />
          <CzKpi
            libelle="En retard"
            :valeur="nbEnRetard"
            :detail="`sur ${data?.nbActifs ?? '—'}`"
            :chargement="chargement"
            class="relances__kpi-retard cz-mobile"
          />
          <CzKpi
            libelle="Dernière auto"
            :valeur="derniereAuto ? jourMois(derniereAuto.date) : '—'"
            :detail="derniereAuto ? pluriel(derniereAuto.envois, 'envoi') : undefined"
            :chargement="chargement"
            class="cz-mobile"
          />
        </div>

        <div class="cz-toolbar cz-desktop">
          <CzInput
            v-model="recherche"
            placeholder="Nom ou téléphone"
            aria-label="Rechercher un retardataire par nom ou téléphone"
            class="relances__recherche"
          />
          <CzChip
            v-for="p in pucesProjets"
            :key="p.id"
            :actif="projet === p.id"
            @click="choisirProjet(p.id)"
          >
            {{ p.nom }}
          </CzChip>
          <CzChip
            :actif="retard > 0"
            class="relances__retard"
            @click="retard = (retard + 1) % RETARDS.length"
          >
            Retard : {{ RETARDS[retard]!.label }}
          </CzChip>
        </div>

        <CzTable
          v-model:selection="selection"
          v-model:page="page"
          :colonnes="COLONNES"
          :lignes="lignesPage"
          :chargement="chargement"
          :lignes-squelette="5"
          selectionnable
          :cliquable="false"
          label="Souscripteurs en retard"
          class="cz-desktop"
        >
          <template #actions-groupees>
            <CzButton
              variante="fantome"
              taille="sm"
              @click="selection = []"
            >
              Annuler
            </CzButton>
            <CzButton
              taille="sm"
              @click="ouvrirRelance(selectionnees)"
            >
              Relancer maintenant
            </CzButton>
          </template>
          <template #cell-nom="{ ligne }">
            <div class="cz-person">
              <CzAvatar
                :nom="ligne.nom"
                ton="danger"
                taille="sm"
              />
              <div>
                <NuxtLink
                  :to="`/asso/souscripteurs/${ligne.souscripteurId}`"
                  class="relances__nom"
                >
                  {{ ligne.nom }}
                </NuxtLink>
                <div class="sub cz-mono">
                  {{ ligne.telephone }}
                </div>
              </div>
            </div>
          </template>
          <template #cell-echeances="{ ligne }">
            {{ libelleEcheances(ligne) }}
          </template>
          <template #cell-montant="{ ligne }">
            <b class="relances__du">{{ formatFCFA(ligne.montant) }}</b>
          </template>
          <template #cell-retardDepuis="{ ligne }">
            {{ estDate(ligne.retardDepuis) ? formatDate(ligne.retardDepuis, 'jour-mois') : ligne.retardDepuis }}
          </template>
          <template #cell-derniere="{ ligne }">
            <span class="relances__muted">{{ derniereRelance(ligne) }}</span>
          </template>
          <template #cell-actions="{ ligne }">
            <CzButton
              variante="secondaire"
              taille="sm"
              :aria-label="`Relancer ${ligne.nom}`"
              @click="ouvrirRelance([ligne])"
            >
              Relancer
            </CzButton>
          </template>
          <template #vide>
            <CzEmpty
              icone="recherche"
              ton="neutral"
              :titre="page > 1 ? 'Rien à afficher sur cette page' : 'Aucun retardataire ne correspond'"
              :description="page > 1 ? 'Seuls les retardataires détaillés des données de démonstration sont listés.' : 'Modifiez la recherche ou les filtres.'"
              integre
            />
          </template>
        </CzTable>
        <div
          v-if="!chargement"
          class="cz-tfoot cz-desktop"
        >
          <span>{{ plage }}</span>
          <CzPagination
            v-if="pages > 1"
            v-model:page="page"
            :pages="pages"
          />
        </div>

        <!-- Mobile : liste à cocher -->
        <div class="cz-mobile">
          <div
            v-if="chargement"
            class="cz-card relances__squelette"
            aria-busy="true"
          >
            <CzSkeleton
              v-for="i in 5"
              :key="i"
              :hauteur="40"
            />
          </div>
          <ul
            v-else-if="lignes.length"
            class="cz-card relances__liste"
            aria-label="Souscripteurs en retard"
          >
            <li
              v-for="l in lignes"
              :key="l.id"
            >
              <CzCheckbox
                :model-value="selection.includes(l.id)"
                :label="`Sélectionner ${l.nom}`"
                class="relances__case"
                @update:model-value="basculerMobile(l.id)"
              />
              <NuxtLink
                :to="`/asso/souscripteurs/${l.souscripteurId}`"
                class="relances__qui"
              >
                <b>{{ l.nom }}</b>
                <span>{{ libelleCourt(l) }} · relance : {{ derniereRelance(l, true) }}</span>
              </NuxtLink>
              <b class="relances__du">{{ formatFCFA(l.montant) }}</b>
            </li>
          </ul>
          <p
            v-if="!chargement"
            class="relances__compte"
          >
            {{ lignes.length }} affichés sur {{ totalListe }}
          </p>
        </div>
        <BarreActionMobile v-if="selection.length">
          <CzButton @click="ouvrirRelance(selectionnees)">
            Relancer {{ selection.length }} souscripteur(s)
          </CzButton>
        </BarreActionMobile>
      </template>
    </template>

    <!-- ================================================= Relances automatiques -->
    <div
      v-else-if="onglet === 'automatiques'"
      class="relances__auto"
    >
      <section
        class="cz-card relances__regles"
        aria-labelledby="titre-regles"
      >
        <div class="relances__ligne-titre">
          <h2
            id="titre-regles"
            class="relances__h2"
          >
            Règles de relance automatique
          </h2>
          <CzBadge
            ton="brand"
            petit
          >
            Tous les projets
          </CzBadge>
        </div>
        <p class="relances__intro">
          Cotiz envoie ces rappels aux souscripteurs concernés, sans action de votre part.
        </p>
        <div
          v-if="chargement"
          class="cz-card relances__squelette"
          aria-busy="true"
        >
          <CzSkeleton
            v-for="i in 5"
            :key="i"
            :hauteur="40"
          />
        </div>
        <ul
          v-else
          class="relances__liste-regles"
        >
          <li
            v-for="r in data?.regles ?? []"
            :key="r.id"
          >
            <span
              class="relances__icone"
              :class="`is-${r.ton}`"
              aria-hidden="true"
            ><CzIcon :nom="ICONES_REGLE[r.ton]" /></span>
            <span class="relances__regle">
              <b>{{ r.titre }}</b>
              <span>{{ r.description }}</span>
            </span>
            <CzToggle
              :model-value="r.active"
              :label="`${r.titre} : ${r.active ? 'active' : 'inactive'}`"
              @update:model-value="v => changerRegle(r.id, Boolean(v))"
            />
          </li>
        </ul>
      </section>
      <div class="relances__cote">
        <section class="cz-card relances__carte">
          <h2 class="relances__h3">
            Canaux d’envoi
          </h2>
          <div class="relances__canal">
            <span>Notification dans l’espace souscripteur</span>
            <CzBadge
              ton="success"
              petit
            >
              Actif
            </CzBadge>
          </div>
          <div class="relances__canal">
            <span>SMS</span><CzSoon petit>
              V2
            </CzSoon>
          </div>
          <div class="relances__canal">
            <span>Email</span><CzSoon petit>
              V2
            </CzSoon>
          </div>
        </section>
        <section class="cz-card relances__carte">
          <h2 class="relances__h3">
            Aperçu du message
          </h2>
          <p class="relances__apercu">
            Bonjour Moussa, votre échéance de {{ formatFCFA(25_000) }} pour le projet Centre communautaire est prévue le 5 octobre.
            Pensez à déclarer votre paiement sur Cotiz. — {{ nomAssociation ?? 'Entraide Yopougon' }}
          </p>
        </section>
      </div>
    </div>

    <!-- ================================================= Historique -->
    <template v-else>
      <div
        v-if="chargement"
        class="cz-card relances__squelette"
        aria-busy="true"
      >
        <CzSkeleton
          v-for="i in 5"
          :key="i"
          :hauteur="40"
        />
      </div>
      <div
        v-else
        class="cz-table-wrap cz-desktop"
      >
        <table
          class="cz-table"
          aria-label="Historique des envois"
        >
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Projet</th>
              <th class="num">
                Destinataires
              </th>
              <th>Canal</th>
              <th>Envoyée par</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="h in data?.historique ?? []"
              :key="h.id"
            >
              <td>{{ formatDate(h.date, 'numerique') }}</td>
              <td>
                <CzBadge
                  :ton="h.type === 'automatique' ? 'info' : 'brand'"
                  petit
                >
                  {{ h.type === 'automatique' ? 'Automatique' : 'Manuelle' }}
                </CzBadge>
              </td>
              <td>{{ h.projet }}</td>
              <td class="num">
                {{ h.destinataires }}
              </td>
              <td>Notification</td>
              <td class="relances__muted">
                {{ h.par }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <ul
        v-if="!chargement"
        class="cz-card relances__liste cz-mobile"
      >
        <li
          v-for="h in data?.historique ?? []"
          :key="h.id"
        >
          <span class="relances__qui">
            <b>{{ h.projet }}</b>
            <span>{{ formatDate(h.date, 'numerique') }} · {{ h.destinataires }} destinataire(s) · {{ h.par }}</span>
          </span>
          <CzBadge
            :ton="h.type === 'automatique' ? 'info' : 'brand'"
            petit
          >
            {{ h.type === 'automatique' ? 'Auto' : 'Manuelle' }}
          </CzBadge>
        </li>
      </ul>
    </template>

    <ModaleRelance
      v-model:ouvert="modale"
      :noms="aRelancer.map(l => l.nom)"
      :projet="projetMessage"
      :association="nomAssociation"
      :envoi="envoi"
      @envoyer="envoyer"
    />
  </div>
</template>

<style scoped>
.relances {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.relances__kpis {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-4);
}

.relances__recherche {
  width: 260px;
}

.relances__retard {
  margin-left: auto;
}

.relances__nom {
  font-weight: 600;
  color: var(--text-strong);
  text-decoration: none;
}

.relances__nom:hover {
  color: var(--brand-dark);
}

.relances__du {
  font-weight: 600;
  color: var(--danger-fg);
  white-space: nowrap;
}

.relances__muted {
  color: var(--text-muted);
}

.relances__vide {
  padding: var(--space-12) var(--space-4);
}

.relances__auto {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
  gap: var(--space-4);
  align-items: start;
}

.relances__regles {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: var(--space-6);
}

.relances__ligne-titre {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-3);
}

.relances__h2,
.relances__h3 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 600;
  color: var(--text-strong);
}

.relances__h3 {
  font-size: 15px;
}

.relances__intro {
  margin: 0 0 6px;
  font-size: 13.5px;
  color: var(--text-muted);
}

.relances__liste-regles {
  margin: 0;
  padding: 0;
  list-style: none;
}

.relances__liste-regles li {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: 14px 0;
  border-bottom: 1px solid var(--divider);
}

.relances__icone {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: var(--r-field);
}

.relances__icone .cz-icon {
  width: 18px;
  height: 18px;
}

.relances__icone.is-info {
  background: var(--info-bg);
  color: var(--info-fg);
}

.relances__icone.is-warning {
  background: var(--warning-bg);
  color: var(--warning-fg);
}

.relances__icone.is-danger {
  background: var(--danger-bg);
  color: var(--danger-fg);
}

.relances__regle {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.relances__regle b {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-strong);
}

.relances__regle span {
  font-size: 13px;
  color: var(--text-muted);
}

.relances__cote {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.relances__carte {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 18px;
}

.relances__canal {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-3);
  font-size: 14px;
}

.relances__apercu {
  margin: 0;
  padding: var(--space-3) 14px;
  border-radius: var(--r-md);
  background: var(--surface-subtle);
  font-size: 13.5px;
  line-height: 1.55;
}

.relances__liste {
  margin: 0;
  padding: 0;
  list-style: none;
  overflow: hidden;
}

.relances__liste li {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: 64px;
  padding: var(--space-3) 14px;
}

.relances__liste li + li {
  border-top: 1px solid var(--divider-row);
}

.relances__qui {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  color: inherit;
  text-decoration: none;
}

.relances__qui b {
  font-weight: 600;
  color: var(--text-strong);
}

.relances__qui span {
  font-size: 12.5px;
  color: var(--text-muted);
}

.relances__squelette {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
}

.relances__compte {
  margin: var(--space-3) 0 0;
  text-align: center;
  font-size: 12.5px;
  color: var(--text-muted);
}

@media (max-width: 1023px) {
  .relances__auto {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 767px) {
  .relances {
    gap: var(--space-3);
  }

  .relances__kpis {
    grid-template-columns: 1fr 1fr;
    gap: var(--space-3);
  }

  .relances__kpi-retard :deep(.v) {
    color: var(--danger-fg);
  }

  .relances__regles {
    padding: var(--space-4);
  }
}
</style>
