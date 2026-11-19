<!--
  MgProjetSouscripteurs — souscripteurs d'un projet.
  Desktop : recherche, puces de statut (Tous · À jour · En retard · Signature attendue · Retirés), requis, « Importer (Excel) »,
  « Ajouter un souscripteur » ; tableau avec sélection multiple et barre d'actions groupées (relancer, exporter, retirer),
  menu ⋯ par ligne, confirmation de retrait (historique conservé).
  Mobile : « + Ajouter » / « Importer (Excel) », recherche, puces défilantes, liste avec retrait (✕).
  `?statut=en_retard` pré-filtre ; `?ajout=1` ouvre l'ajout. Scénario : `aucun-souscripteur`.
-->
<script setup lang="ts">
import type { ColonneTable } from '~/components/cz/CzTable.vue'
import type { ElementMenu } from '~/components/cz/CzMenu.vue'
import type { SouscriptionAvecSouscripteur } from '~~/types'
import { messageRefus } from '~/composables/api/client'
import { formatDate, formatFCFA, pluriel } from '~/utils/format'
import { telechargerCsv } from '~/utils/csv'

definePageMeta({ ongletProjet: 'souscripteurs' })

type Filtre = 'tous' | 'a_jour' | 'en_retard' | 'signature_attendue' | 'retires'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const id = computed(() => String(route.params.id))
const { data: projet, refresh: rechargerProjet } = useProjet(id)
const { data, pending, error, refresh } = useSouscripteursProjet(id)
const { retirerSouscripteur } = useActionsProjet()
const { relancer } = useRelancesProjet(id)

// ---------------------------------------------------------------- Filtres
const FILTRES_VALIDES: Filtre[] = ['tous', 'a_jour', 'en_retard', 'signature_attendue', 'retires']
const filtre = ref<Filtre>(FILTRES_VALIDES.includes(route.query.statut as Filtre) ? route.query.statut as Filtre : 'tous')
const recherche = ref('')

const total = computed(() => (typeof projet.value?.nbSouscripteurs === 'number' ? projet.value.nbSouscripteurs : 0))
const souscriptions = computed(() => data.value ?? [])
const retires = computed(() => souscriptions.value.filter(s => s.retireLe).length)
const compteurs = computed<Record<Filtre, number>>(() => {
  const p = projet.value
  const enRetard = p?.nbEnRetard ?? 0
  const signature = p?.nbSignaturesAttendues ?? 0
  return { tous: total.value, a_jour: Math.max(0, total.value - enRetard - signature), en_retard: enRetard, signature_attendue: signature, retires: retires.value }
})
const puces = computed(() => [
  { valeur: 'tous' as const, label: 'Tous', compteur: compteurs.value.tous },
  { valeur: 'a_jour' as const, label: 'À jour', compteur: compteurs.value.a_jour },
  { valeur: 'en_retard' as const, label: 'En retard', compteur: compteurs.value.en_retard },
  { valeur: 'signature_attendue' as const, label: 'Signature attendue', compteur: compteurs.value.signature_attendue },
  { valeur: 'retires' as const, label: 'Retirés', compteur: compteurs.value.retires },
])
const pucesMobile = computed(() => [
  { valeur: 'tous' as const, label: `Tous · ${compteurs.value.tous}` },
  { valeur: 'en_retard' as const, label: `En retard · ${compteurs.value.en_retard}` },
  { valeur: 'a_jour' as const, label: `À jour · ${compteurs.value.a_jour}` },
  { valeur: 'signature_attendue' as const, label: `À signer · ${compteurs.value.signature_attendue}` },
  { valeur: 'retires' as const, label: `Retirés · ${compteurs.value.retires}` },
])

/** Nombre d'échéances en retard, déduit du montant dû (échéances entières ou soldes). */
const nbRetards = (s: SouscriptionAvecSouscripteur) => (projet.value?.montantEcheance ? Math.ceil(s.montantEnRetard / projet.value.montantEcheance) : 0)
const dateOuPlaceholder = (d: string) => (/^\d{4}-\d{2}-\d{2}/.test(d) ? formatDate(d, 'numerique') : d)

const lignes = computed(() => {
  const q = recherche.value.trim().toLocaleLowerCase('fr')
  const chiffres = q.replace(/\D/g, '')
  return souscriptions.value
    .filter((s) => {
      if (filtre.value === 'retires') return Boolean(s.retireLe)
      if (s.retireLe) return false
      return filtre.value === 'tous' || s.statut === filtre.value
    })
    .filter((s) => {
      if (!q) return true
      const nom = `${s.souscripteur.prenom} ${s.souscripteur.nom}`.toLocaleLowerCase('fr')
      return nom.includes(q) || (chiffres.length >= 2 && s.souscripteur.telephone.replace(/\D/g, '').includes(chiffres))
    })
    .map(s => ({
      id: s.souscripteurId,
      nom: `${s.souscripteur.prenom} ${s.souscripteur.nom}`,
      inscription: `Inscription le ${dateOuPlaceholder(s.inscritLe)}`,
      telephone: s.souscripteur.telephone,
      contrat: s.contratSigneLe ? `Signé le ${dateOuPlaceholder(s.contratSigneLe)}` : 'En attente',
      verse: s.verse,
      reste: s.reste,
      statut: s.statut,
      retards: nbRetards(s),
      retireLe: s.retireLe,
      source: s,
    }))
})
type Ligne = (typeof lignes.value)[number]

// ---------------------------------------------------------------- Tableau
const COLONNES: ColonneTable[] = [
  { cle: 'nom', label: 'Souscripteur', triable: true, squelette: 'personne' },
  { cle: 'telephone', label: 'Téléphone' },
  { cle: 'contrat', label: 'Contrat' },
  { cle: 'verse', label: 'Versé', num: true, triable: true, squelette: 'montant' },
  { cle: 'reste', label: 'Reste', num: true, triable: true, squelette: 'montant' },
  { cle: 'statut', label: 'Statut', squelette: 'badge' },
  { cle: 'actions', label: '', largeur: '56px' },
]
const PAR_PAGE = 20
const page = ref(1)
const selection = ref<string[]>([])
const pages = computed(() => Math.max(1, Math.ceil(Math.max(total.value, lignes.value.length) / PAR_PAGE)))
// Seuls les souscripteurs détaillés des données de démonstration existent : les pages suivantes sont vides.
const lignesPage = computed(() => lignes.value.slice((page.value - 1) * PAR_PAGE, page.value * PAR_PAGE))
const plage = computed(() => {
  const n = lignesPage.value.length
  const debut = (page.value - 1) * PAR_PAGE + 1
  return n ? `${debut}–${debut + n - 1} sur ${Math.max(total.value, lignes.value.length)}` : `0 sur ${total.value}`
})
watch([filtre, recherche], () => {
  page.value = 1
  selection.value = []
})

function statutBadge(l: Ligne): { texte: string, court: string, ton: 'success' | 'danger' | 'warning' | 'neutral' } {
  if (l.retireLe) return { texte: `Retiré le ${dateOuPlaceholder(l.retireLe)}`, court: 'Retiré', ton: 'neutral' }
  if (l.statut === 'en_retard') return { texte: `En retard · ${l.retards}`, court: `Retard · ${l.retards}`, ton: 'danger' }
  if (l.statut === 'signature_attendue') return { texte: 'Signature attendue', court: 'À signer', ton: 'warning' }
  return { texte: 'À jour', court: 'À jour', ton: 'success' }
}
const tonAvatar = (l: Ligne) => (l.statut === 'en_retard' && l.retards >= 2 ? 'danger' : l.statut === 'signature_attendue' ? 'warning' : 'brand')

function actions(l: Ligne): ElementMenu[] {
  if (l.retireLe) return [{ label: 'Voir la fiche', icone: 'voir', to: `/asso/souscripteurs/${l.id}` }]
  return [
    { label: 'Voir la fiche', icone: 'voir', to: `/asso/souscripteurs/${l.id}` },
    ...(l.statut === 'en_retard' ? [{ label: 'Relancer', icone: 'relance' as const, action: () => relancerIds([l.id], l.nom) }] : []),
    { label: 'Renvoyer les identifiants', icone: 'email', action: () => toast.succes('Identifiants renvoyés', { message: `${l.nom} va les recevoir par SMS.` }) },
    { label: 'Retirer du projet', icone: 'supprimer', danger: true, separe: true, action: () => demanderRetrait([l]) },
  ]
}

// ---------------------------------------------------------------- Actions
async function relancerIds(ids: string[], nom?: string) {
  if (await relancer(ids, { nom })) selection.value = []
}

/** Export CSV (souscripteurs sélectionnés) généré dans le navigateur. */
function exporter() {
  const choisis = lignes.value.filter(l => selection.value.includes(l.id))
  telechargerCsv(`souscripteurs-${id.value}.csv`, [
    ['Souscripteur', 'Téléphone', 'Contrat', 'Versé (F)', 'Reste (F)', 'Statut'],
    ...choisis.map(l => [l.nom, l.telephone, l.contrat, l.verse, l.reste, statutBadge(l).texte]),
  ])
  toast.succes('Export prêt', { message: `${pluriel(choisis.length, 'souscripteur')} exportés en CSV.` })
}

const aRetirer = ref<Ligne[]>([])
const confirmationRetrait = ref(false)
const retrait = ref(false)
function demanderRetrait(l: Ligne[]) {
  aRetirer.value = l
  confirmationRetrait.value = true
}
const titreRetrait = computed(() => (aRetirer.value.length === 1 ? `Retirer ${aRetirer.value[0]!.nom} ?` : `Retirer ${pluriel(aRetirer.value.length, 'souscripteur')} ?`))
async function confirmerRetrait() {
  retrait.value = true
  try {
    for (const l of aRetirer.value) await retirerSouscripteur(l.source.id)
    toast.succes(aRetirer.value.length > 1 ? 'Souscripteurs retirés' : 'Souscripteur retiré', {
      message: aRetirer.value.length > 1
        ? `${pluriel(aRetirer.value.length, 'souscripteur')} ne recevront plus d’échéances. Historique conservé.`
        : `${aRetirer.value[0]!.nom} ne recevra plus d’échéances. Historique conservé.`,
    })
    confirmationRetrait.value = false
    selection.value = []
    await Promise.all([refresh(), rechargerProjet()])
  }
  catch (e) {
    // Retrait partiel possible : la liste relue montre qui a été retiré.
    await Promise.all([refresh(), rechargerProjet()])
    toast.erreur('Le retrait a échoué', { message: messageRefus(e) ?? 'Vérifiez votre connexion, puis réessayez.' })
  }
  finally {
    retrait.value = false
  }
}

// ---------------------------------------------------------------- Ajout
const ajoutOuvert = ref(false)
onMounted(() => {
  if (route.query.ajout) {
    ajoutOuvert.value = true
    router.replace({ query: { ...route.query, ajout: undefined } })
  }
})
watch(() => route.query.ajout, (v) => {
  if (v) {
    ajoutOuvert.value = true
    router.replace({ query: { ...route.query, ajout: undefined } })
  }
})
async function apresInscription() {
  filtre.value = 'tous'
  await Promise.all([refresh(), rechargerProjet()])
}
</script>

<template>
  <div
    v-if="projet"
    class="souscripteurs"
  >
    <!-- Mobile : actions -->
    <div class="souscripteurs__actions-mobile cz-mobile">
      <CzButton @click="ajoutOuvert = true">
        + Ajouter
      </CzButton>
      <FeatureGate feature="imports">
        <CzButton
          variante="secondaire"
          :to="`/asso/projets/${id}/import`"
        >
          Importer (Excel)
        </CzButton>
        <template #indisponible />
      </FeatureGate>
    </div>

    <!-- Barre d'outils -->
    <div
      v-if="!(souscriptions.length === 0 && !pending)"
      class="cz-toolbar souscripteurs__outils"
    >
      <CzInput
        v-model="recherche"
        type="search"
        placeholder="Nom, téléphone…"
        label="Rechercher un souscripteur"
        class="souscripteurs__recherche"
      />
      <CzChips
        v-model="filtre"
        :options="puces"
        label="Filtrer par statut"
        class="cz-desktop"
      />
      <div
        class="souscripteurs__puces-mobile cz-mobile"
        role="group"
        aria-label="Filtrer par statut"
      >
        <CzChip
          v-for="p in pucesMobile"
          :key="p.valeur"
          :actif="filtre === p.valeur"
          @click="filtre = p.valeur"
        >
          {{ p.label }}
        </CzChip>
      </div>
    </div>
    <div class="souscripteurs__entete-tableau cz-desktop">
      <span
        v-if="projet.souscripteursRequis"
        class="souscripteurs__requis"
      ><b>{{ projet.nbSouscripteurs }} / {{ projet.souscripteursRequis }}</b> souscripteurs requis</span>
      <FeatureGate feature="imports">
        <CzButton
          variante="secondaire"
          taille="sm"
          :to="`/asso/projets/${id}/import`"
        >
          Importer (Excel)
        </CzButton>
        <template #indisponible />
      </FeatureGate>
      <CzButton
        taille="sm"
        @click="ajoutOuvert = true"
      >
        Ajouter un souscripteur
      </CzButton>
    </div>

    <!-- Aucun souscripteur -->
    <template v-if="!pending && !error && souscriptions.length === 0">
      <CzEmpty
        icone="souscripteurs"
        titre="Aucun souscripteur pour l’instant"
        description="Inscrivez vos membres un par un, ou d’un coup avec votre fichier Excel."
        class="souscripteurs__vide cz-desktop"
      >
        <template #action>
          <div class="souscripteurs__vide-actions">
            <FeatureGate feature="imports">
              <CzButton
                variante="secondaire"
                taille="sm"
                :to="`/asso/projets/${id}/import`"
              >
                Importer (Excel)
              </CzButton>
              <template #indisponible />
            </FeatureGate>
            <CzButton
              taille="sm"
              @click="ajoutOuvert = true"
            >
              Ajouter un souscripteur
            </CzButton>
          </div>
        </template>
      </CzEmpty>
      <CzCard
        variante="lg"
        class="cz-mobile"
      >
        <CzEmpty
          icone="souscripteurs"
          titre="Aucun souscripteur"
          description="Ajoutez des membres un par un ou importez une liste Excel."
          integre
          class="souscripteurs__vide-mobile"
        />
      </CzCard>
    </template>

    <template v-else>
      <!-- Desktop : tableau -->
      <CzTable
        v-model:selection="selection"
        :colonnes="COLONNES"
        :lignes="lignesPage"
        :chargement="pending && !data"
        :erreur="error ? 'Vérifiez votre connexion, puis réessayez.' : undefined"
        selectionnable
        :cliquable="false"
        label="Souscripteurs du projet"
        class="cz-desktop"
        @reessayer="refresh()"
      >
        <template #actions-groupees>
          <CzButton
            variante="secondaire"
            taille="sm"
            @click="relancerIds(selection)"
          >
            Relancer
          </CzButton>
          <CzButton
            variante="fantome"
            taille="sm"
            @click="exporter"
          >
            Exporter
          </CzButton>
          <CzButton
            variante="danger-contour"
            taille="sm"
            @click="demanderRetrait(lignes.filter(l => selection.includes(l.id) && !l.retireLe))"
          >
            Retirer
          </CzButton>
        </template>
        <template #cell-nom="{ ligne }">
          <div class="cz-person">
            <CzAvatar
              :nom="ligne.nom"
              :ton="tonAvatar(ligne)"
              taille="sm"
            />
            <div>
              <NuxtLink
                :to="`/asso/souscripteurs/${ligne.id}`"
                class="souscripteurs__nom"
              >
                {{ ligne.nom }}
              </NuxtLink>
              <div class="sub">
                {{ ligne.inscription }}
              </div>
            </div>
          </div>
        </template>
        <template #cell-telephone="{ ligne }">
          <span class="cz-mono">{{ ligne.telephone }}</span>
        </template>
        <template #cell-contrat="{ ligne }">
          <span class="souscripteurs__muted">{{ ligne.contrat }}</span>
        </template>
        <template #cell-verse="{ ligne }">
          {{ formatFCFA(ligne.verse) }}
        </template>
        <template #cell-reste="{ ligne }">
          <b
            v-if="ligne.statut === 'en_retard' && !ligne.retireLe"
            class="souscripteurs__du"
          >{{ formatFCFA(ligne.reste) }}</b>
          <template v-else>
            {{ formatFCFA(ligne.reste) }}
          </template>
        </template>
        <template #cell-statut="{ ligne }">
          <CzBadge :ton="statutBadge(ligne).ton">
            {{ statutBadge(ligne).texte }}
          </CzBadge>
        </template>
        <template #cell-actions="{ ligne }">
          <CzMenu
            :elements="actions(ligne)"
            :label="`Actions sur ${ligne.nom}`"
          >
            <template #declencheur="{ basculer, attrs }">
              <CzButton
                variante="icone"
                taille="sm"
                icone="actions"
                :label="`Actions sur ${ligne.nom}`"
                v-bind="attrs"
                @click="basculer"
              />
            </template>
          </CzMenu>
        </template>
        <template #vide>
          <CzEmpty
            icone="recherche"
            ton="neutral"
            :titre="page > 1 ? 'Rien à afficher sur cette page' : 'Aucun souscripteur ne correspond'"
            :description="page > 1 ? 'Seuls les souscripteurs détaillés des données de démonstration sont listés.' : undefined"
            integre
          />
        </template>
      </CzTable>
      <div
        v-if="!pending && !error"
        class="cz-tfoot souscripteurs__pied cz-desktop"
      >
        <span>{{ plage }}</span>
        <CzPagination
          v-if="pages > 1"
          v-model:page="page"
          :pages="pages"
        />
      </div>

      <!-- Mobile : liste -->
      <div class="cz-mobile souscripteurs__mobile">
        <CzCard class="souscripteurs__liste">
          <ul>
            <li
              v-for="l in lignes"
              :key="l.id"
            >
              <CzAvatar
                :nom="l.nom"
                :ton="l.statut === 'en_retard' ? 'danger' : l.statut === 'signature_attendue' ? 'warning' : 'brand'"
                taille="sm"
              />
              <NuxtLink
                :to="`/asso/souscripteurs/${l.id}`"
                class="souscripteurs__ligne-lien"
              >
                <b>{{ l.nom }}</b>
                <span>Reste {{ formatFCFA(l.reste) }}</span>
              </NuxtLink>
              <CzBadge
                :ton="statutBadge(l).ton"
                petit
              >
                {{ statutBadge(l).court }}
              </CzBadge>
              <CzButton
                v-if="!l.retireLe"
                variante="icone"
                icone="fermer"
                :label="`Retirer ${l.nom} du projet`"
                @click="demanderRetrait([l])"
              />
            </li>
          </ul>
        </CzCard>
        <p class="souscripteurs__compte">
          {{ lignes.length }} affichés sur {{ total }}
        </p>
      </div>
    </template>

    <!-- Confirmation de retrait (modale / feuille basse) -->
    <CzModal
      v-model:ouvert="confirmationRetrait"
      :titre="titreRetrait"
    >
      {{ aRetirer.length > 1 ? 'Ces personnes ne verront plus ce projet.' : 'Cette personne ne verra plus ce projet.' }}
      Les paiements déjà validés restent dans l’historique. Cette action demande une confirmation.
      <template #pied>
        <CzButton
          variante="fantome"
          taille="sm"
          @click="confirmationRetrait = false"
        >
          Annuler
        </CzButton>
        <CzButton
          variante="danger"
          taille="sm"
          :chargement="retrait"
          libelle-chargement="Retrait…"
          @click="confirmerRetrait"
        >
          Retirer du projet
        </CzButton>
      </template>
    </CzModal>

    <AjoutSouscripteur
      v-model:ouvert="ajoutOuvert"
      :projet="projet"
      @inscrit="apresInscription"
    />
  </div>
</template>

<style scoped>
.souscripteurs {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.souscripteurs__recherche {
  width: 240px;
}

.souscripteurs__entete-tableau {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: var(--space-3);
}

.souscripteurs__requis {
  font-size: 13px;
  color: var(--text-muted);
}

.souscripteurs__requis b {
  color: var(--text-strong);
}

.souscripteurs__nom {
  font-weight: 600;
  color: var(--text-strong);
  text-decoration: none;
}

.souscripteurs__nom:hover {
  color: var(--brand-dark);
}

.souscripteurs__muted {
  color: var(--text-muted);
}

.souscripteurs__du {
  color: var(--danger-fg);
}

.souscripteurs__pied {
  margin-top: calc(-1 * var(--space-2));
}

.souscripteurs__vide {
  padding: var(--space-12);
}

.souscripteurs__vide-actions {
  display: flex;
  gap: var(--space-3);
}

.souscripteurs__vide-mobile :deep(.i) {
  display: none;
}

.souscripteurs__actions-mobile {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-2);
}

.souscripteurs__puces-mobile {
  display: flex;
  gap: var(--space-2);
  margin: 0 calc(-1 * var(--space-3));
  padding: 0 var(--space-3) var(--space-1);
  overflow-x: auto;
  scrollbar-width: none;
}

.souscripteurs__puces-mobile > * {
  flex-shrink: 0;
  min-height: 44px;
  white-space: nowrap;
}

.souscripteurs__mobile {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.souscripteurs__liste {
  padding: 0;
}

.souscripteurs__liste ul {
  margin: 0;
  padding: 0;
  list-style: none;
}

.souscripteurs__liste li {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: 66px;
  padding: var(--space-2) var(--space-4);
  border-bottom: 1px solid var(--divider);
}

.souscripteurs__liste li:last-child {
  border-bottom: 0;
}

.souscripteurs__ligne-lien {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  color: inherit;
  text-decoration: none;
}

.souscripteurs__ligne-lien b {
  font-size: 14.5px;
  color: var(--text-strong);
}

.souscripteurs__ligne-lien span {
  font-size: 13px;
  color: var(--text-muted);
}

.souscripteurs__compte {
  margin: 0;
  font-size: 12.5px;
  text-align: center;
  color: var(--text-muted);
}

@media (max-width: 767px) {
  .souscripteurs {
    gap: var(--space-3);
  }

  .souscripteurs__outils {
    flex-direction: column;
    align-items: stretch;
    min-width: 0;
  }

  .souscripteurs__puces-mobile {
    min-width: 0;
    max-width: calc(100% + 2 * var(--space-3));
  }

  .souscripteurs__recherche {
    width: 100%;
  }

  .souscripteurs__actions-mobile :deep(.cz-btn) {
    height: 48px;
  }
}
</style>
