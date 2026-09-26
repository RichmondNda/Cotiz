<!--
  MgPaiement — détail d'un paiement déclaré : vérifier la preuve et valider en confiance, avec la bonne répartition.
  En-tête (souscripteur, projet, date, moyen, badge), montant en grand ; preuve (image, PDF ou référence seule) et
  rappel de vérification ; répartition ajustable (« Ajuster ») ; situation du souscripteur sur le projet
  (rangée d'échéances, reste à payer, 3 derniers versements).
  Pied collant : « Le montant reçu est différent » (champ du montant réel), « Rejeter » (modale : motif obligatoire),
  « Valider le paiement » → confirmation légère → validé, toast « Annuler » pendant 10 s ; puis « Paiement suivant ».
  Mobile : en-tête « Déclaration · 75 000 F », preuve avec date et moyen, échéances couvertes, situation sur le projet
  (absente de la capture mobile, gardée pour vérifier en confiance), barre Rejeter / Valider (validation directe),
  sans navigation basse.
  Scénarios : `pdf`, `reference-seule` (+ `chargement`, `erreur`). `?rejet=1` ouvre la modale de rejet.
-->
<script setup lang="ts">
import type { RejetPaiement, RepartitionEcheance } from '~~/types'
import type { EvenementFrise } from '~/components/metier/Frise.vue'
import { formatDate, formatFCFA, formatMois, lireDate, pluriel } from '~/utils/format'
import { MOYENS_PAIEMENT, STATUTS_PAIEMENT, MOTIFS_REJET } from '~/utils/statuts'

definePageMeta({ middleware: 'espace-gestionnaire', layout: 'backoffice', espace: 'gestionnaire', titre: 'Paiement', navBasse: false })

const route = useRoute()
const router = useRouter()
const id = computed(() => String(route.params.id))
const { data: paiement, pending, error, refresh } = usePaiement(id)
const { data: enAttente, refresh: rechargerFile } = usePaiements({ statut: 'en_attente' })
const { estMobile } = useBreakpoint()

const nom = computed(() => (paiement.value ? `${paiement.value.souscripteur.prenom} ${paiement.value.souscripteur.nom}` : ''))
useHead({ title: () => (paiement.value ? `Paiement de ${nom.value} · Cotiz` : 'Paiement · Cotiz') })
useFilAriane(() => [
  { label: 'Paiements', to: '/asso/paiements' },
  ...(paiement.value ? [{ label: `${nom.value} · ${formatFCFA(paiement.value.montant)}` }] : []),
])

const chargement = computed(() => pending.value && !paiement.value)
const enCours = computed(() => paiement.value?.statut === 'en_attente')
const statut = computed(() => (paiement.value ? STATUTS_PAIEMENT[paiement.value.statut] : null))
const lienFiche = computed(() => (paiement.value ? `/asso/souscripteurs/${paiement.value.souscripteurId}` : '/asso/souscripteurs'))
const moyen = computed(() => (paiement.value ? MOYENS_PAIEMENT[paiement.value.moyen] : ''))
const dateVersement = computed(() => (paiement.value ? paiement.value.dateVirement ?? paiement.value.declareLe : ''))

// ---------------------------------------------------------------- Répartition, montant reçu
const ajustement = ref(false)
const repartition = ref<RepartitionEcheance[] | null>(null)
const montantDifferent = ref(false)
const montantRecu = ref<number | null>(null)
watch(id, () => {
  montantDifferent.value = false
  montantRecu.value = null
  confirmation.value = false
})

// ---------------------------------------------------------------- Situation sur le projet
const versements = computed<EvenementFrise[]>(() => (paiement.value?.derniersVersements ?? []).map(v => ({
  id: v.echeanceId,
  titre: `${formatFCFA(v.montant)} validé`,
  detail: [formatDate(v.date, 'numerique'), formatMois(v.date, 'seul').toLowerCase(), v.traiteParNom && `par ${v.traiteParNom}`]
    .filter(Boolean).join(' · '),
})))

/** « septembre, octobre et novembre » */
const moisCouverts = computed(() => {
  const noms = (paiement.value?.echeancesCouvertes ?? []).map(e => (e.estFondsEntree ? 'fonds d’entrée' : formatMois(e.date, 'seul').toLowerCase()))
  return noms.length > 1 ? `${noms.slice(0, -1).join(', ')} et ${noms.at(-1)}` : noms[0] ?? ''
})
const traite = computed(() => {
  const p = paiement.value
  if (!p?.traiteLe) return ''
  return `le ${formatDate(lireDate(p.traiteLe.slice(0, 10)), 'numerique')}${p.traiteParNom ? ` par ${p.traiteParNom}` : ''}`
})

// ---------------------------------------------------------------- Actions
const confirmation = ref(false)
const rejetOuvert = ref(route.query.rejet === '1')
watch(paiement, (p) => {
  if (p && p.statut !== 'en_attente') rejetOuvert.value = false
})

const suivant = computed(() => (enAttente.value ?? [])
  .filter(p => p.id !== id.value)
  .sort((a, b) => a.declareLe.localeCompare(b.declareLe))[0])
const lienSuivant = computed(() => (suivant.value ? `/asso/paiements/${suivant.value.id}` : '/asso/paiements'))

const { envoi, validerPaiement: valider, rejeterPaiement: rejeter } = useTraitementAnnulable(() => Promise.all([refresh(), rechargerFile()]))

async function validerPaiement() {
  const p = paiement.value
  if (!p) return
  const n = (repartition.value ?? p.repartition).length
  await valider(p.id, {
    repartition: repartition.value ?? undefined,
    montantRecu: montantDifferent.value && montantRecu.value ? montantRecu.value : undefined,
  }, {
    message: `${pluriel(n, 'échéance')} d’${nom.value} ${n > 1 ? 'sont' : 'est'} à jour`,
    puis: () => {
      confirmation.value = false
      ajustement.value = false
    },
    annulation: { message: 'Le paiement est de nouveau en attente de validation.' },
  })
}

async function rejeterPaiement(corps: RejetPaiement) {
  const p = paiement.value
  if (!p) return
  // Après le rejet : paiement suivant de la file ; « Annuler » ramène sur ce paiement.
  const cible = lienSuivant.value
  await rejeter(p.id, corps, {
    message: `${nom.value} a reçu le motif : ${MOTIFS_REJET[corps.motif]}.`,
    puis: () => {
      rejetOuvert.value = false
      return router.push(cible)
    },
    annulation: {
      message: 'Le paiement est de nouveau en attente de validation.',
      puis: () => router.push(`/asso/paiements/${p.id}`),
    },
  })
}

function demanderValidation() {
  // Mobile : validation directe (toast « Annuler ») ; desktop : confirmation légère intégrée au pied.
  if (estMobile.value) validerPaiement()
  else confirmation.value = true
}
</script>

<template>
  <div class="paiement">
    <EnTeteGestionnaireMobile
      :titre="paiement ? `Déclaration · ${formatFCFA(paiement.montant)}` : 'Déclaration'"
      :sous-titre="paiement ? `${nom} · ${paiement.projet.nom}` : undefined"
      retour="/asso/paiements"
      :cloche="false"
    />

    <div
      v-if="chargement"
      class="paiement__squelette"
      aria-busy="true"
    >
      <CzSkeleton
        :hauteur="56"
        :largeur="320"
      />
      <CzSkeleton
        :hauteur="36"
        :largeur="180"
      />
      <div class="paiement__grille">
        <CzSkeleton :hauteur="360" />
        <CzSkeleton :hauteur="360" />
      </div>
    </div>

    <CzErreurChargement
      v-else-if="error || !paiement"
      titre="Impossible d’afficher ce paiement"
      @reessayer="refresh()"
    />

    <template v-else>
      <div class="paiement__tete cz-desktop">
        <CzAvatar
          :nom="nom"
          taille="lg"
        />
        <div class="paiement__qui">
          <NuxtLink
            :to="lienFiche"
            class="paiement__nom"
          >{{ nom }}</NuxtLink>
          <div class="paiement__meta">
            {{ paiement.projet.nom }} · déclaré le {{ formatDate(paiement.declareLe, 'numerique') }} · {{ moyen }}
          </div>
        </div>
        <CzBadge
          v-if="statut"
          :ton="statut.ton"
        >
          {{ statut.libelle }}
        </CzBadge>
      </div>
      <div class="paiement__montant cz-desktop">
        {{ formatFCFA(paiement.montant) }}
      </div>

      <div
        v-if="paiement.statut === 'valide'"
        class="cz-alert cz-alert--success"
        role="status"
      >
        <div class="cz-desktop">
          <b>Paiement validé {{ traite }}.</b> Les échéances de {{ moisCouverts }} sont marquées payées.
        </div>
        <div class="cz-mobile">
          <b>Paiement validé.</b> {{ nom }} a reçu une notification. Ses échéances sont à jour.
        </div>
      </div>
      <div
        v-else-if="paiement.statut === 'rejete'"
        class="cz-alert cz-alert--danger"
        role="status"
      >
        <div>
          <b>Paiement rejeté {{ traite }}.</b>
          <template v-if="paiement.motifRejet">
            Motif : {{ MOTIFS_REJET[paiement.motifRejet] }}.
          </template>
        </div>
      </div>

      <div class="paiement__grille">
        <section
          class="cz-card paiement__carte"
          aria-labelledby="titre-preuve"
        >
          <div class="paiement__carte-tete">
            <h2
              id="titre-preuve"
              class="t"
            >
              Preuve
            </h2>
            <CzBadge
              v-if="statut"
              :ton="statut.ton"
              petit
              class="cz-mobile"
            >
              {{ statut.libelle }}
            </CzBadge>
          </div>
          <VisionneusePreuve
            :preuve="paiement.preuve"
            grand
          />
          <div class="cz-alert cz-alert--info paiement__rappel cz-desktop">
            <div>
              Vérifiez sur votre relevé un versement de <b>{{ formatFCFA(paiement.montant) }}</b> vers le {{ formatDate(dateVersement, 'jour-mois-long') }}.
            </div>
          </div>
          <dl class="paiement__infos cz-mobile">
            <div>
              <dt>Date du versement</dt>
              <dd>{{ formatDate(dateVersement, 'numerique') }}</dd>
            </div>
            <div>
              <dt>Moyen</dt>
              <dd>{{ moyen }}</dd>
            </div>
          </dl>
        </section>

        <div class="paiement__colonne">
          <RepartitionPaiement
            v-model:ajustement="ajustement"
            v-model:repartition="repartition"
            :paiement="paiement"
            :modifiable="enCours"
          />
          <section
            v-if="paiement.echeancier.length || versements.length"
            class="cz-card paiement__carte"
            aria-labelledby="titre-situation"
          >
            <h2
              id="titre-situation"
              class="t"
            >
              Situation sur le projet
            </h2>
            <RangeeEcheances
              v-if="paiement.echeancier.length"
              :echeances="paiement.echeancier"
            />
            <p
              v-if="paiement.souscription"
              class="paiement__reste"
            >
              Reste à payer : <b>{{ formatFCFA(paiement.souscription.reste) }}</b>
            </p>
            <Frise
              v-if="versements.length"
              :evenements="versements"
              label="Derniers versements validés"
            />
          </section>
        </div>
      </div>

      <section
        v-if="montantDifferent && enCours"
        class="cz-card paiement__different"
      >
        <CzField
          label="Montant réellement reçu"
          class="paiement__champ-recu"
        >
          <CzInput
            v-model="montantRecu"
            type="montant"
          />
        </CzField>
        <span class="paiement__aide">La répartition sera recalculée et le souscripteur prévenu de l’écart.</span>
      </section>

      <!-- Pied collant (desktop) -->
      <div class="paiement__pied cz-desktop">
        <button
          v-if="enCours"
          type="button"
          class="paiement__lien"
          :aria-expanded="montantDifferent"
          @click="montantDifferent = !montantDifferent"
        >
          Le montant reçu est différent
        </button>
        <span class="paiement__espace" />
        <template v-if="enCours && confirmation">
          <span class="paiement__question">Confirmer la réception de {{ formatFCFA(montantDifferent && montantRecu ? montantRecu : paiement.montant) }} ?</span>
          <CzButton
            variante="fantome"
            @click="confirmation = false"
          >
            Annuler
          </CzButton>
          <CzButton
            variante="succes"
            :chargement="envoi?.action === 'valider'"
            libelle-chargement="Validation…"
            @click="validerPaiement"
          >
            Oui, valider
          </CzButton>
        </template>
        <template v-else-if="enCours">
          <CzButton
            variante="danger-contour"
            @click="rejetOuvert = true"
          >
            Rejeter
          </CzButton>
          <CzButton
            variante="succes"
            icone="coche"
            @click="demanderValidation"
          >
            Valider le paiement
          </CzButton>
        </template>
        <CzButton
          v-else
          :to="lienSuivant"
        >
          Paiement suivant
        </CzButton>
      </div>

      <BarreActionMobile v-if="enCours">
        <CzButton
          variante="danger-contour"
          @click="rejetOuvert = true"
        >
          Rejeter
        </CzButton>
        <CzButton
          variante="succes"
          :chargement="envoi?.action === 'valider'"
          libelle-chargement="Validation…"
          @click="demanderValidation"
        >
          Valider
        </CzButton>
      </BarreActionMobile>

      <ModaleRejetPaiement
        v-model:ouvert="rejetOuvert"
        :montant="paiement.montant"
        :prenom="paiement.souscripteur.prenom"
        :nom="paiement.souscripteur.nom"
        :envoi="envoi?.action === 'rejeter'"
        @rejeter="rejeterPaiement"
      />
    </template>
  </div>
</template>

<style scoped>
.paiement {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding-bottom: 88px;
}

.paiement__squelette {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.paiement__tete {
  display: flex;
  align-items: center;
  gap: 14px;
}

.paiement__qui {
  flex: 1;
  min-width: 0;
}

.paiement__nom {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-strong);
  text-decoration: none;
}

.paiement__nom:hover {
  color: var(--brand-dark);
}

.paiement__meta {
  font-size: 13.5px;
  color: var(--text-muted);
}

.paiement__montant {
  font-family: var(--font-display);
  font-size: 32px;
  font-weight: 600;
  color: var(--text-strong);
  font-variant-numeric: tabular-nums;
}

.paiement__grille {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
  gap: var(--space-4);
  align-items: start;
}

.paiement__colonne {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.paiement__carte {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: 22px;
}

.paiement__carte .t {
  margin: 0;
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 600;
  color: var(--text-strong);
}

.paiement__carte-tete {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.paiement__rappel {
  margin-top: 2px;
}

.paiement__reste {
  margin: 0;
  font-size: 13.5px;
}

.paiement__infos {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin: 0;
  font-size: 14px;
}

.paiement__infos div {
  display: flex;
  justify-content: space-between;
  gap: var(--space-3);
}

.paiement__infos dt {
  color: var(--text-muted);
}

.paiement__infos dd {
  margin: 0;
  font-weight: 600;
  color: var(--text-strong);
}

.paiement__different {
  display: flex;
  align-items: flex-end;
  gap: 14px;
  padding: 18px;
}

.paiement__champ-recu {
  width: 260px;
}

.paiement__aide {
  font-size: 13px;
  color: var(--text-muted);
}

.paiement__pied {
  position: fixed;
  right: 0;
  bottom: 0;
  left: var(--sidebar);
  z-index: 15;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: 14px var(--space-8);
  border-top: 1px solid var(--border);
  background: var(--surface);
  box-shadow: var(--shadow);
}

.paiement__lien {
  min-height: 44px;
  padding: 0 6px;
  border: 0;
  background: none;
  font-size: 14px;
  font-weight: 600;
  color: var(--brand-dark);
  cursor: pointer;
}

.paiement__lien:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
  border-radius: var(--r-xs);
}

.paiement__espace {
  flex: 1;
}

.paiement__question {
  font-size: 14px;
}

@media (max-width: 1023px) {
  .paiement__pied {
    left: var(--sidebar-collapsed);
    padding: 14px var(--space-6);
  }
}

@media (max-width: 767px) {
  .paiement {
    gap: var(--space-3);
  }

  .paiement__grille {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-3);
  }

  .paiement__colonne {
    gap: var(--space-3);
  }

  .paiement__carte {
    padding: var(--space-4);
  }

  .paiement__different {
    flex-direction: column;
    align-items: stretch;
  }

  .paiement__champ-recu {
    width: 100%;
  }
}
</style>
