<!--
  MgSouscripteurs — annuaire : retrouver n'importe quel membre de l'association, tous projets confondus.
  Desktop : « 52 membres · tous projets confondus », Exporter (CSV) ; recherche nom / téléphone, puces de projet
  (noms courts), statut global ; tableau (souscripteur, téléphone, email, pastilles de projets, total versé,
  total restant, statut global = le pire de ses projets) ; pagination.
  Mobile : recherche, puces de statut (Tous · 52, En retard · 14, À jour, À signer), liste « Centre, Voyage · reste ».
  Filtre de statut dans l'URL (`?statut=en_retard`, lien du tableau de bord). Scénarios : `vide` (+ `chargement`, `erreur`).
-->
<script setup lang="ts">
import type { ColonneTable } from '~/components/cz/CzTable.vue'
import type { SouscripteurAnnuaire, StatutSouscription } from '~~/types'
import { formatFCFA, pluriel } from '~/utils/format'
import { telechargerCsv } from '~/utils/csv'
import { STATUTS_SOUSCRIPTION } from '~/utils/statuts'

definePageMeta({ middleware: 'espace-gestionnaire', layout: 'backoffice', espace: 'gestionnaire', titre: 'Souscripteurs' })
useHead({ title: 'Souscripteurs · Cotiz' })

type Statut = 'tous' | StatutSouscription

const route = useRoute()
const router = useRouter()
const toast = useToast()
const { data, pending, error, refresh } = useSouscripteurs()
const { data: projets } = useProjets()
const { data: association } = useAssociationGestionnaire()
const { peut } = usePermissions()

// ---------------------------------------------------------------- Filtres
const STATUTS: { valeur: Statut, label: string }[] = [
  { valeur: 'tous', label: 'tous' },
  { valeur: 'en_retard', label: 'en retard' },
  { valeur: 'a_jour', label: 'à jour' },
  { valeur: 'signature_attendue', label: 'signature attendue' },
]
const statut = computed<Statut>({
  get: () => (STATUTS.some(s => s.valeur === route.query.statut) ? route.query.statut as Statut : 'tous'),
  set: v => router.replace({ query: { ...route.query, statut: v === 'tous' ? undefined : v } }),
})
function statutSuivant() {
  const i = STATUTS.findIndex(s => s.valeur === statut.value)
  statut.value = STATUTS[(i + 1) % STATUTS.length]!.valeur
}
const projet = ref<string>('tous')
const recherche = ref('')

/** Nom court d'un projet pour les pastilles et les puces (« Centre », « Voyage », « Tontine »). */
const nomCourt = (id: string) => projets.value?.find(p => p.id === id)?.nom.split(' ')[0] ?? id
const pucesProjets = computed(() => [
  { valeur: 'tous', label: 'Tous les projets' },
  // Projets en cours d'abord, puis ceux aux inscriptions ouvertes.
  ...(projets.value ?? [])
    .filter(p => p.statut === 'en_cours' || p.statut === 'inscriptions_ouvertes')
    .sort((a, b) => Number(a.statut !== 'en_cours') - Number(b.statut !== 'en_cours'))
    .map(p => ({ valeur: p.id, label: nomCourt(p.id) })),
])

// ---------------------------------------------------------------- Données
const souscripteurs = computed(() => data.value ?? [])
// Annuaire chargé en entier (toutes les pages de mb.list) : son nombre fait foi ; avant, le compteur de l'association.
const total = computed(() => (data.value ? data.value.length : association.value?.nbSouscripteurs ?? 0))
const nbEnRetard = computed(() => souscripteurs.value.filter(s => s.statutGlobal === 'en_retard').length)

const nom = (s: SouscripteurAnnuaire) => `${s.prenom} ${s.nom}`
const lignes = computed(() => {
  const q = recherche.value.trim().toLocaleLowerCase('fr')
  const chiffres = q.replace(/\D/g, '')
  return souscripteurs.value
    .filter(s => (statut.value === 'tous' || s.statutGlobal === statut.value)
      && (projet.value === 'tous' || s.projetIds.includes(projet.value))
      && (!q || nom(s).toLocaleLowerCase('fr').includes(q) || (chiffres.length >= 2 && s.telephone.replace(/\D/g, '').includes(chiffres))))
    .map(s => ({
      id: s.id,
      nom: nom(s),
      telephone: s.telephone,
      email: s.email ?? '—',
      projets: s.projetIds,
      verse: s.totalVerse,
      reste: s.totalReste,
      statut: s.statutGlobal,
    }))
})
type Ligne = (typeof lignes.value)[number]

const COLONNES: ColonneTable[] = [
  { cle: 'nom', label: 'Souscripteur', triable: true, squelette: 'personne' },
  { cle: 'telephone', label: 'Téléphone' },
  { cle: 'email', label: 'Email' },
  { cle: 'projets', label: 'Projets' },
  { cle: 'verse', label: 'Total versé', num: true, squelette: 'montant' },
  { cle: 'reste', label: 'Total restant', num: true, squelette: 'montant' },
  { cle: 'statut', label: 'Statut global', squelette: 'badge' },
]
const filtre = computed(() => statut.value !== 'tous' || projet.value !== 'tous' || Boolean(recherche.value.trim()))
const { page, pages, lignesPage, plage } = usePagination(lignes, { parPage: 20, totalReference: total, filtre })
watch([statut, projet, recherche], () => (page.value = 1))

const badge = (s: StatutSouscription, court = false) => ({
  ...STATUTS_SOUSCRIPTION[s],
  libelle: court && s === 'signature_attendue' ? 'À signer' : STATUTS_SOUSCRIPTION[s].libelle,
})
const tonAvatar = (s: StatutSouscription) => (s === 'en_retard' ? 'danger' : s === 'signature_attendue' ? 'warning' : 'brand')
const montant = (m: Ligne['reste']) => formatFCFA(m)

const chargement = computed(() => pending.value && !data.value)
const vide = computed(() => !chargement.value && !error.value && souscripteurs.value.length === 0)

const pucesMobile = computed(() => [
  { valeur: 'tous' as Statut, label: `Tous · ${total.value}` },
  { valeur: 'en_retard' as Statut, label: `En retard · ${nbEnRetard.value}` },
  { valeur: 'a_jour' as Statut, label: 'À jour' },
  { valeur: 'signature_attendue' as Statut, label: 'À signer' },
])

function exporter() {
  telechargerCsv('souscripteurs.csv', [
    ['Souscripteur', 'Téléphone', 'Email', 'Projets', 'Total versé (F)', 'Total restant (F)', 'Statut global'],
    ...lignes.value.map(l => [l.nom, l.telephone, l.email, l.projets.map(nomCourt).join(', '), l.verse, l.reste, STATUTS_SOUSCRIPTION[l.statut].libelle]),
  ])
  toast.succes('Export prêt', { message: `${pluriel(lignes.value.length, 'souscripteur')} exportés en CSV.` })
}
</script>

<template>
  <div class="annuaire">
    <EnTeteGestionnaireMobile
      titre="Souscripteurs"
      :sous-titre="`${pluriel(total, 'membre')} · tous projets`"
    />
    <EnTetePage
      titre="Souscripteurs"
      :sous-titre="`${pluriel(total, 'membre')} · tous projets confondus`"
      class="cz-desktop"
    >
      <template #actions>
        <CzButton
          v-if="peut('members.manage')"
          variante="secondaire"
          icone="cadenas"
          to="/asso/souscripteurs/codes"
        >
          Codes à remettre
        </CzButton>
        <CzButton
          v-if="peut('members.manage')"
          variante="secondaire"
          icone="cadenas"
          to="/asso/souscripteurs/reinitialisations"
        >
          Réinitialisations
        </CzButton>
        <CzButton
          variante="secondaire"
          icone="telecharger"
          :disabled="!lignes.length"
          @click="exporter"
        >
          Exporter
        </CzButton>
      </template>
    </EnTetePage>

    <div class="cz-toolbar annuaire__outils">
      <CzInput
        v-model="recherche"
        type="search"
        placeholder="Nom ou téléphone"
        aria-label="Rechercher un souscripteur par nom ou téléphone"
        class="annuaire__recherche"
      />
      <div
        class="annuaire__puces cz-desktop"
        role="group"
        aria-label="Projet"
      >
        <CzChip
          v-for="p in pucesProjets"
          :key="p.valeur"
          :actif="projet === p.valeur"
          @click="projet = p.valeur"
        >
          {{ p.label }}
        </CzChip>
      </div>
      <CzChip
        :actif="statut !== 'tous'"
        class="annuaire__statut cz-desktop"
        @click="statutSuivant"
      >
        Statut : {{ STATUTS.find(s => s.valeur === statut)!.label }}
      </CzChip>
    </div>
    <CzChips
      v-model="statut"
      :options="pucesMobile"
      label="Statut"
      class="annuaire__puces-mobile cz-mobile"
    />

    <!-- Vide -->
    <div
      v-if="vide"
      class="cz-card annuaire__vide"
    >
      <CzEmpty
        icone="souscripteurs"
        titre="Aucun souscripteur pour l’instant"
        integre
      >
        <span class="cz-desktop">Les membres apparaissent ici dès que vous les inscrivez à un projet.</span>
        <span class="cz-mobile">Les membres apparaissent ici dès que vous les ajoutez à un projet.</span>
        <template #action>
          <CzButton
            taille="sm"
            to="/asso/projets"
            class="cz-desktop"
          >
            Aller aux projets
          </CzButton>
          <CzButton
            to="/asso/projets"
            class="cz-mobile"
          >
            Voir mes projets
          </CzButton>
        </template>
      </CzEmpty>
    </div>

    <template v-else>
      <!-- Desktop : tableau -->
      <CzTable
        :colonnes="COLONNES"
        :lignes="lignesPage"
        :chargement="chargement"
        :lignes-squelette="9"
        :erreur="error ? 'Vérifiez votre connexion, puis réessayez.' : undefined"
        :cliquable="false"
        label="Souscripteurs de l’association"
        class="cz-desktop"
        @reessayer="refresh()"
      >
        <template #cell-nom="{ ligne }">
          <div class="cz-person">
            <CzAvatar
              :nom="ligne.nom"
              :ton="tonAvatar(ligne.statut)"
              taille="sm"
            />
            <NuxtLink
              :to="`/asso/souscripteurs/${ligne.id}`"
              class="annuaire__nom"
            >
              {{ ligne.nom }}
            </NuxtLink>
          </div>
        </template>
        <template #cell-telephone="{ ligne }">
          <span class="cz-mono">{{ ligne.telephone }}</span>
        </template>
        <template #cell-email="{ ligne }">
          <span class="annuaire__muted">{{ ligne.email }}</span>
        </template>
        <template #cell-projets="{ ligne }">
          <span class="annuaire__pastilles">
            <span
              v-for="p in ligne.projets"
              :key="p"
              class="annuaire__pastille"
            >{{ nomCourt(p) }}</span>
          </span>
        </template>
        <template #cell-verse="{ ligne }">
          {{ montant(ligne.verse) }}
        </template>
        <template #cell-reste="{ ligne }">
          <b
            v-if="ligne.statut === 'en_retard'"
            class="annuaire__du"
          >{{ montant(ligne.reste) }}</b>
          <template v-else>
            {{ montant(ligne.reste) }}
          </template>
        </template>
        <template #cell-statut="{ ligne }">
          <CzBadge :ton="badge(ligne.statut).ton">
            {{ badge(ligne.statut).libelle }}
          </CzBadge>
        </template>
        <template #vide>
          <CzEmpty
            icone="recherche"
            ton="neutral"
            :titre="page > 1 ? 'Rien à afficher sur cette page' : 'Aucun souscripteur ne correspond'"
            :description="page > 1 ? 'Seuls les souscripteurs détaillés des données de démonstration sont listés.' : 'Modifiez la recherche ou les filtres.'"
            integre
          />
        </template>
      </CzTable>
      <div
        v-if="!chargement && !error"
        class="cz-tfoot cz-desktop"
      >
        <span>{{ plage }}</span>
        <CzPagination
          v-if="pages > 1"
          v-model:page="page"
          :pages="pages"
        />
      </div>

      <!-- Mobile : liste -->
      <div class="cz-mobile annuaire__mobile">
        <div
          v-if="chargement"
          class="cz-card annuaire__liste"
          aria-busy="true"
        >
          <div
            v-for="i in 6"
            :key="i"
            class="annuaire__ligne"
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
          </div>
        </div>
        <CzErreurChargement
          v-else-if="error"
          titre="Impossible d’afficher les souscripteurs"
          @reessayer="refresh()"
        />
        <template v-else>
          <ul
            v-if="lignes.length"
            class="cz-card annuaire__liste"
          >
            <li
              v-for="l in lignes"
              :key="l.id"
            >
              <NuxtLink
                :to="`/asso/souscripteurs/${l.id}`"
                class="annuaire__ligne"
              >
                <CzAvatar
                  :nom="l.nom"
                  :ton="tonAvatar(l.statut)"
                  taille="sm"
                />
                <span class="annuaire__qui">
                  <b>{{ l.nom }}</b>
                  <span>{{ l.projets.map(nomCourt).join(', ') }} · reste {{ montant(l.reste) }}</span>
                </span>
                <CzBadge
                  :ton="badge(l.statut, true).ton"
                  petit
                >
                  {{ badge(l.statut, true).libelle }}
                </CzBadge>
              </NuxtLink>
            </li>
          </ul>
          <CzEmpty
            v-else
            icone="recherche"
            ton="neutral"
            titre="Aucun souscripteur ne correspond"
          />
          <p class="annuaire__compte">
            {{ lignes.length }} affichés sur {{ filtre ? lignes.length : total }}
          </p>
        </template>
      </div>
    </template>
  </div>
</template>

<style scoped>
.annuaire {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.annuaire__recherche {
  width: 280px;
}

.annuaire__puces {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.annuaire__statut {
  margin-left: auto;
}

.annuaire__nom {
  font-weight: 600;
  color: var(--text-strong);
  text-decoration: none;
}

.annuaire__nom:hover {
  color: var(--brand-dark);
}

.annuaire__muted {
  color: var(--text-muted);
}

.annuaire__pastilles {
  display: inline-flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}

.annuaire__pastille {
  display: inline-flex;
  align-items: center;
  padding: 2px var(--space-2);
  border-radius: var(--r-pill);
  background: var(--brand-pale);
  font-size: 11.5px;
  font-weight: 600;
  color: var(--brand-dark);
}

.annuaire__du {
  color: var(--danger-fg);
}

.annuaire__vide {
  padding: var(--space-12) var(--space-4);
}

.annuaire__liste {
  margin: 0;
  padding: 0;
  list-style: none;
  overflow: hidden;
}

.annuaire__liste li + li {
  border-top: 1px solid var(--divider-row);
}

.annuaire__ligne {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: 64px;
  padding: var(--space-3) 14px;
  color: inherit;
  text-decoration: none;
}

.annuaire__qui {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.annuaire__qui b {
  font-weight: 600;
  color: var(--text-strong);
}

.annuaire__qui span {
  font-size: 12.5px;
  color: var(--text-muted);
}

.annuaire__compte {
  margin: var(--space-3) 0 0;
  text-align: center;
  font-size: 12.5px;
  color: var(--text-muted);
}

@media (max-width: 767px) {
  .annuaire {
    gap: var(--space-3);
  }

  .annuaire__outils {
    flex-wrap: nowrap;
  }

  .annuaire__recherche {
    width: 100%;
  }
}
</style>
