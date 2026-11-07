<!--
  MbDeclarer — déclarer un versement en moins d'une minute, sans erreur de répartition.
  4 étapes sur une seule route, état partagé (useDeclaration) : projet → montant → preuve → récapitulatif.
  - `?projet=` (depuis un projet, une carte ou une notification) : projet pré-sélectionné, étape « Projet » sautée.
  - Montant : raccourcis (1 échéance, tout le retard, 3 mois) ; sélecteur d'échéances couvertes pré-rempli,
    les plus anciennes d'abord. Paiement partiel : alerte « Il restera… ». Montant supérieur au reste : erreur,
    excédent affiché, « Continuer » désactivé.
  - Envoi : `me.declare`, puis /paiements/declarer/ok.
  Mobile : une étape par écran, navigation basse masquée, barre d'action fixe en bas.
-->
<script setup lang="ts">
import type { MoyenPaiement, NouvelleDeclaration } from '~~/types'
import type { EcheanceSelecteur } from '~/components/metier/SelecteurEcheances.vue'
import { messageRefus } from '~/composables/api/client'
import { ETAPES_DECLARATION } from '~/composables/useDeclaration'
import { maintenant } from '~/utils/date-reference'
import { libelleCouverture, libelleEcheance } from '~/utils/echeances'
import { formatFCFA, lireDate } from '~/utils/format'
import { MOYENS_PAIEMENT } from '~/utils/statuts'

definePageMeta({ middleware: 'espace-souscripteur', layout: 'souscripteur', fab: false, navBasse: false })
useHead({ title: 'Déclarer un paiement · Cotiz' })

const route = useRoute()
const { etat, commencer, choisirProjet, choisirPreuve, contenuPreuve, cleEnvoi, reinitialiser } = useDeclaration()

const projetDemande = typeof route.query.projet === 'string' ? route.query.projet : undefined
if (projetDemande && etat.value.projetId !== projetDemande) commencer(projetDemande)

const { data: souscriptions, pending, error, refresh } = useMesSouscriptions()
const { data: echeances } = useEcheances()

const declarables = computed(() => (souscriptions.value ?? []).filter(s => s.projet.statut !== 'termine' && s.reste > 0))
const souscription = computed(() => declarables.value.find(s => s.projetId === etat.value.projetId && s.statut !== 'signature_attendue'))

// Projet demandé inconnu ou contrat non signé : retour au choix du projet.
watch(souscriptions, (liste) => {
  if (liste && etat.value.projetId && !souscription.value) etat.value = { ...etat.value, projetId: null, etape: 1 }
}, { immediate: true })

const retour = computed(() => (projetDemande ? `/projets/${projetDemande}` : '/accueil'))
const libelleEtape = computed(() => ETAPES_DECLARATION[etat.value.etape - 1])
const sousTitre = computed(() => `Étape ${etat.value.etape} sur 4 · ${libelleEtape.value}`)

// ---------------------------------------------------------------- Étape 1 — Projet
const projetChoisi = computed({
  get: () => etat.value.projetId,
  set: (id) => {
    if (id) choisirProjet(id)
  },
})

// ---------------------------------------------------------------- Étape 2 — Montant
const echeancesProjet = computed<EcheanceSelecteur[]>(() => (echeances.value ?? [])
  .filter(e => e.projetId === etat.value.projetId && !e.fermee && ['en_retard', 'a_venir', 'partielle'].includes(e.statut))
  .sort((a, b) => a.rang - b.rang)
  .map(e => ({ id: e.id, montant: e.montant, montantPaye: e.montantPaye, label: libelleEcheance(e), enRetard: e.statut === 'en_retard' })))

const montant = computed({
  get: () => etat.value.montant,
  set: v => (etat.value.montant = v),
})
const repartition = computed({
  get: () => etat.value.repartition,
  set: v => (etat.value.repartition = v),
})

const raccourcis = computed(() => {
  const s = souscription.value
  if (!s) return []
  const unite = s.projet.montantEcheance
  const liste = [{ label: '1 échéance', montant: unite }]
  if (s.montantEnRetard > 0) liste.push({ label: 'Tout le retard', montant: s.montantEnRetard })
  liste.push({ label: '3 mois', montant: 3 * unite })
  return liste.filter(r => r.montant <= s.reste)
})

const tropEleve = computed(() => Boolean(souscription.value && montant.value && montant.value > souscription.value.reste))
const lignePartielle = computed(() => repartition.value?.lignes.find(l => l.etat === 'partial'))
const montantValide = computed(() => Boolean(montant.value && montant.value > 0 && !tropEleve.value && repartition.value?.reste === 0))

// ---------------------------------------------------------------- Étape 3 — Preuve
const modalites = computed(() => souscription.value?.association.modalitesPaiement ?? [])
const moyens = computed(() => modalites.value.map(m => ({ valeur: m.moyen, label: m.moyen === 'virement' ? 'Virement' : MOYENS_PAIEMENT[m.moyen] })))
const moyen = computed<MoyenPaiement>({
  get: () => etat.value.moyen ?? moyens.value[0]?.valeur ?? 'mobile_money',
  set: v => (etat.value.moyen = v),
})

const entreePhoto = ref<HTMLInputElement | null>(null)
const entreeImage = ref<HTMLInputElement | null>(null)
function fichierChoisi(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (f) choisirPreuve(f)
  ;(e.target as HTMLInputElement).value = ''
}
// Page rechargée : le nom de la preuve est resté dans l'état, plus son contenu → à rechoisir.
onMounted(() => {
  if (etat.value.preuve && !contenuPreuve()) choisirPreuve(null)
})
const taillePreuve = computed(() => (etat.value.preuve ? `${Math.max(1, Math.round(etat.value.preuve.taille / 1024))} Ko` : ''))

/** JJ/MM/AAAA → ISO, si la date existe et n'est pas dans le futur. */
function dateIso(saisie: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(saisie.trim())
  if (!m) return null
  const iso = `${m[3]}-${m[2]}-${m[1]}`
  const d = lireDate(iso)
  if (Number.isNaN(d.getTime()) || d.getDate() !== Number(m[1]) || d > maintenant()) return null
  return iso
}
const tentativePreuve = ref(false)
const erreurDate = computed(() => (tentativePreuve.value && !dateIso(etat.value.date) ? 'Saisissez une date passée au format JJ/MM/AAAA.' : undefined))
const erreurPreuve = computed(() => (tentativePreuve.value && !etat.value.preuve && !etat.value.reference.trim()
  ? 'Ajoutez une capture du reçu ou la référence de la transaction.'
  : undefined))

// ---------------------------------------------------------------- Étape 4 — Récapitulatif
const couverture = computed(() => {
  const lignes = repartition.value?.lignes.filter(l => l.affecte > 0) ?? []
  const ids = new Set(lignes.map(l => l.id))
  const texte = libelleCouverture((echeances.value ?? []).filter(e => ids.has(e.id)), 'long')
  return lignePartielle.value ? `${texte} (dernière partielle)` : texte
})

// ---------------------------------------------------------------- Navigation entre étapes
const peutContinuer = computed(() => {
  switch (etat.value.etape) {
    case 1: return Boolean(souscription.value)
    case 2: return montantValide.value
    default: return true
  }
})

function continuer() {
  if (etat.value.etape === 3) {
    tentativePreuve.value = true
    if (erreurDate.value || erreurPreuve.value) return
  }
  if (!peutContinuer.value) return
  etat.value.etape = Math.min(4, etat.value.etape + 1)
  scrollHaut()
}
function precedent() {
  etat.value.etape = Math.max(1, etat.value.etape - 1)
  scrollHaut()
}
function aller(n: number) {
  if (n < etat.value.etape) etat.value.etape = n
}
function scrollHaut() {
  if (import.meta.client) window.scrollTo({ top: 0 })
}

// ---------------------------------------------------------------- Envoi
const declarer = useDeclarationPaiement()
const envoi = ref(false)
const erreurEnvoi = ref<string | null>(null)

async function envoyer() {
  if (envoi.value) return
  const s = souscription.value
  const r = repartition.value
  const date = dateIso(etat.value.date)
  if (!s || !r || !montant.value || !date) return
  const reference = etat.value.reference.trim()
  const corps: NouvelleDeclaration = {
    projetId: s.projetId,
    montant: montant.value,
    repartition: r.lignes.filter(l => l.affecte > 0).map(l => ({ echeanceId: l.id, montantAffecte: l.affecte })),
    moyen: moyen.value,
    dateVirement: date,
    preuve: etat.value.preuve
      ? { type: etat.value.preuve.nom.toLowerCase().endsWith('.pdf') ? 'pdf' : 'image', nomFichier: etat.value.preuve.nom, url: '[URL]', ...(reference ? { reference } : {}) }
      : { type: 'reference', reference },
    ...(etat.value.commentaire.trim() ? { commentaire: etat.value.commentaire.trim() } : {}),
  }
  envoi.value = true
  erreurEnvoi.value = null
  try {
    const paiement = await declarer(corps, cleEnvoi(corps), contenuPreuve())
    reinitialiser()
    await refreshNuxtData()
    await navigateTo({ path: '/paiements/declarer/ok', query: { paiement: paiement.id } })
  }
  catch (e) {
    erreurEnvoi.value = messageRefus(e) ?? 'La déclaration n’a pas pu être envoyée. Vérifiez votre connexion, puis réessayez.'
  }
  finally {
    envoi.value = false
  }
}
</script>

<template>
  <div class="declarer">
    <EnTeteSouscripteur
      titre="Déclarer un paiement"
      :sous-titre="sousTitre"
      :retour="retour"
    />

    <div class="declarer__colonne">
      <div class="declarer__etapes">
        <CzSteps
          :etapes="[...ETAPES_DECLARATION]"
          :courante="etat.etape"
          @aller="aller"
        />
      </div>
      <div
        class="declarer__barres"
        aria-hidden="true"
      >
        <span
          v-for="n in 4"
          :key="n"
          :class="{ 'is-on': n <= etat.etape }"
        />
      </div>

      <template v-if="pending && !souscriptions">
        <CzSkeleton
          :hauteur="68"
          class="declarer__skel"
        />
        <CzSkeleton
          :hauteur="68"
          class="declarer__skel"
        />
      </template>

      <CzEmpty
        v-else-if="error"
        icone="alerte"
        ton="danger"
        titre="Impossible de charger vos projets"
        description="Vérifiez votre connexion, puis réessayez."
      >
        <template #action>
          <CzButton
            variante="secondaire"
            @click="refresh()"
          >
            Réessayer
          </CzButton>
        </template>
      </CzEmpty>

      <CzEmpty
        v-else-if="!declarables.length"
        icone="projet"
        titre="Aucun projet à régler"
        description="Vous n’avez aucun paiement à déclarer pour l’instant."
      />

      <!-- Étape 1 — Projet -->
      <section
        v-else-if="etat.etape === 1"
        class="declarer__etape"
      >
        <h2 class="declarer__titre">
          Pour quel projet ?
        </h2>
        <ChoixProjetDeclaration
          v-model="projetChoisi"
          :souscriptions="declarables"
          label="Pour quel projet ?"
        />
      </section>

      <!-- Étape 2 — Montant -->
      <section
        v-else-if="etat.etape === 2 && souscription"
        class="declarer__etape"
      >
        <div>
          <h2 class="declarer__titre">
            Combien avez-vous versé ?
          </h2>
          <p class="declarer__rappel">
            {{ souscription.projet.nom }} · reste à payer {{ formatFCFA(souscription.reste) }}
          </p>
        </div>
        <CzField
          label="Montant versé"
          :erreur="tropEleve ? `Ce montant dépasse votre reste à payer (${formatFCFA(souscription.reste)}). Vérifiez le montant saisi.` : undefined"
        >
          <CzInput
            v-model="montant"
            type="montant"
            placeholder="0"
            class="declarer__montant"
          />
        </CzField>
        <div
          class="declarer__raccourcis"
          role="group"
          aria-label="Montants courants"
        >
          <CzChip
            v-for="r in raccourcis"
            :key="r.label"
            :actif="montant === r.montant"
            class="declarer__raccourci"
            @click="montant = r.montant"
          >
            {{ r.label }} · {{ formatFCFA(r.montant) }}
          </CzChip>
        </div>
        <SelecteurEcheances
          v-model:repartition="repartition"
          :montant="montant"
          :echeances="echeancesProjet"
          vue="souscripteur"
          :lignes-min="5"
        >
          <template #entete>
            <b>Échéances couvertes</b>
            <CzBadge
              ton="brand"
              petit
            >
              Les plus anciennes d’abord
            </CzBadge>
          </template>
          <template #pied="{ repartition: r }">
            <template v-if="r && r.reste > 0">
              <span>Excédent non affecté</span>
              <b class="neg">+ {{ formatFCFA(r.reste) }}</b>
            </template>
            <template v-else-if="r && r.reste < 0">
              <span>Échéances cochées au-delà du montant</span>
              <b class="neg">{{ formatFCFA(r.reste) }}</b>
            </template>
            <template v-else>
              <span>Total affecté</span>
              <b>{{ formatFCFA(montant ?? 0) }}</b>
            </template>
          </template>
        </SelecteurEcheances>
        <CzAlert
          v-if="lignePartielle && !tropEleve"
          ton="warning"
          sans-icone
        >
          <b>Paiement partiel.</b> Il restera {{ formatFCFA(lignePartielle.du - lignePartielle.affecte) }} à payer
          pour {{ (lignePartielle.label ?? '').split(' ')[0]!.toLowerCase() }}.
        </CzAlert>
      </section>

      <!-- Étape 3 — Preuve -->
      <section
        v-else-if="etat.etape === 3 && souscription"
        class="declarer__etape"
      >
        <h2 class="declarer__titre">
          Votre preuve de paiement
        </h2>
        <div class="declarer__deux">
          <CzField
            label="Date du versement"
            :erreur="erreurDate"
          >
            <CzInput
              v-model="etat.date"
              inputmode="numeric"
              placeholder="JJ/MM/AAAA"
              :maxlength="10"
            />
          </CzField>
          <CzField label="Moyen de paiement">
            <CzSegmented
              v-model="moyen"
              :options="moyens"
              label="Moyen de paiement"
              class="declarer__moyens"
            />
          </CzField>
        </div>
        <CzField
          label="Capture ou photo du reçu"
          :aide="etat.preuve ? undefined : 'JPG, PNG ou PDF · 5 Mo maximum'"
          :erreur="erreurPreuve"
        >
          <div
            v-if="!etat.preuve"
            class="declarer__boutons-preuve"
          >
            <CzButton
              variante="secondaire"
              icone="appareil-photo"
              @click="entreePhoto?.click()"
            >
              Prendre une photo
            </CzButton>
            <CzButton
              variante="secondaire"
              icone="image"
              @click="entreeImage?.click()"
            >
              Choisir une image
            </CzButton>
          </div>
          <div
            v-else
            class="declarer__preuve"
          >
            <div class="cz-proof declarer__vignette">
              <CzIcon
                nom="image"
                :taille="30"
              />
            </div>
            <div class="declarer__preuve-texte">
              <b>{{ etat.preuve.nom }}</b>
              <span>{{ taillePreuve }} · ajoutée</span>
            </div>
            <CzButton
              variante="fantome"
              taille="sm"
              @click="choisirPreuve(null)"
            >
              Changer
            </CzButton>
          </div>
          <input
            ref="entreePhoto"
            type="file"
            accept="image/*"
            capture="environment"
            class="sr-only"
            tabindex="-1"
            aria-hidden="true"
            @change="fichierChoisi"
          >
          <input
            ref="entreeImage"
            type="file"
            accept="image/jpeg,image/png,application/pdf"
            class="sr-only"
            tabindex="-1"
            aria-hidden="true"
            @change="fichierChoisi"
          >
        </CzField>
        <CzField
          label="Référence de la transaction"
          aide="Indiquée dans le SMS de confirmation de votre opérateur."
        >
          <CzInput v-model="etat.reference" />
        </CzField>
        <CzField label="Commentaire (facultatif)">
          <CzInput
            v-model="etat.commentaire"
            type="textarea"
            placeholder="Ex. : versement fait par mon frère"
          />
        </CzField>
      </section>

      <!-- Étape 4 — Récapitulatif -->
      <section
        v-else-if="etat.etape === 4 && souscription && montant"
        class="declarer__etape"
      >
        <h2 class="declarer__titre">
          Vérifiez avant d’envoyer
        </h2>
        <CzCard
          variante="lg"
          class="declarer__recap"
        >
          <div class="declarer__recap-montant">
            <span>Montant déclaré</span>
            <b>{{ formatFCFA(montant) }}</b>
            <span>{{ souscription.projet.nom }} · {{ souscription.association.nom }}</span>
          </div>
          <dl class="declarer__recap-lignes">
            <div>
              <dt>Échéances couvertes</dt>
              <dd>{{ couverture }}</dd>
            </div>
            <div>
              <dt>Date du versement</dt>
              <dd>{{ etat.date }}</dd>
            </div>
            <div>
              <dt>Moyen</dt>
              <dd>{{ MOYENS_PAIEMENT[moyen] }}</dd>
            </div>
            <div>
              <dt>Référence</dt>
              <dd class="cz-mono">
                {{ etat.reference.trim() || '—' }}
              </dd>
            </div>
            <div>
              <dt>Preuve</dt>
              <dd>{{ etat.preuve?.nom ?? '—' }}</dd>
            </div>
          </dl>
        </CzCard>
        <CzAlert
          ton="info"
          sans-icone
        >
          Votre association vérifiera la réception avant de valider. Rien n’est débité par Cotiz.
        </CzAlert>
        <CzAlert
          v-if="erreurEnvoi"
          ton="danger"
        >
          {{ erreurEnvoi }}
        </CzAlert>
      </section>

      <div
        v-if="souscriptions && declarables.length"
        class="declarer__actions"
      >
        <CzButton
          v-if="etat.etape > 1"
          variante="fantome"
          class="declarer__precedent"
          @click="precedent"
        >
          Précédent
        </CzButton>
        <CzButton
          v-if="etat.etape > 1"
          variante="icone"
          label="Étape précédente"
          icone="chevron-gauche"
          class="declarer__precedent-mobile"
          @click="precedent"
        />
        <CzButton
          v-if="etat.etape < 4"
          :disabled="!peutContinuer"
          class="declarer__suivant"
          @click="continuer"
        >
          Continuer
        </CzButton>
        <CzButton
          v-else
          :chargement="envoi"
          libelle-chargement="Envoi…"
          class="declarer__suivant"
          @click="envoyer"
        >
          Envoyer ma déclaration
        </CzButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
.declarer {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.declarer :deep(.entete-mb__page),
.declarer__colonne {
  width: 100%;
  max-width: 720px;
  margin: 0 auto;
}

.declarer__colonne {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.declarer__barres {
  display: none;
  gap: var(--space-2);
}

.declarer__barres span {
  flex: 1;
  height: 4px;
  border-radius: var(--r-pill);
  background: var(--border);
}

.declarer__barres span.is-on {
  background: var(--brand);
}

.declarer__skel {
  border-radius: var(--r-tile);
}

.declarer__etape {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.declarer__titre {
  margin: 0;
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 600;
  color: var(--text-strong);
}

.declarer__rappel {
  margin: var(--space-1) 0 0;
  font-size: 13.5px;
  color: var(--text-muted);
}

.declarer__montant.cz-input {
  height: 64px;
}

.declarer__montant :deep(input) {
  font-family: var(--font-display);
  font-size: 28px;
  font-weight: 600;
  color: var(--text-strong);
}

.declarer__montant :deep(.sfx) {
  font-size: 18px;
}

.declarer__raccourcis {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.declarer__raccourci {
  min-height: 40px;
}

.declarer__deux {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-4);
}

.declarer__moyens {
  display: flex;
  width: 100%;
}

.declarer__moyens :deep([role="radio"]) {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
}

.declarer__boutons-preuve {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}

.declarer__boutons-preuve > * {
  flex: 1;
  min-width: 150px;
  height: 52px;
  font-size: 15px;
}

.declarer__preuve {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.declarer__vignette {
  width: 84px;
  height: 104px;
  justify-content: center;
  cursor: default;
}

.declarer__preuve-texte {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  font-size: 12.5px;
  color: var(--text-muted);
}

.declarer__preuve-texte b {
  font-size: 14px;
  color: var(--text-strong);
  overflow-wrap: anywhere;
}

.declarer__recap {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-6);
}

.declarer__recap-montant {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1);
  padding-bottom: var(--space-3);
  border-bottom: 1px solid var(--border);
  font-size: 12.5px;
  color: var(--text-muted);
  text-align: center;
}

.declarer__recap-montant b {
  font-family: var(--font-display);
  font-size: 32px;
  font-weight: 600;
  color: var(--text-strong);
  font-variant-numeric: tabular-nums;
}

.declarer__recap-lignes {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin: 0;
}

.declarer__recap-lignes div {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: var(--space-3);
  font-size: 14px;
}

.declarer__recap-lignes dt {
  color: var(--text-muted);
}

.declarer__recap-lignes dd {
  margin: 0;
  font-weight: 600;
  color: var(--text-strong);
  text-align: right;
}

.declarer__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-3);
  padding-top: var(--space-1);
}

.declarer__precedent-mobile {
  display: none;
}

@media (max-width: 767px) {
  .declarer {
    gap: var(--space-3);
    padding-bottom: 96px;
  }

  .declarer__colonne,
  .declarer__etape {
    gap: var(--space-3);
  }

  .declarer__etapes {
    display: none;
  }

  .declarer__barres {
    display: flex;
  }

  .declarer__deux {
    grid-template-columns: minmax(0, 1fr);
  }

  .declarer__recap {
    padding: var(--space-6);
  }

  /* Barre d'action fixe en bas : « Continuer » au pouce. */
  .declarer__actions {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 25;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-4) calc(var(--space-4) + env(safe-area-inset-bottom));
    border-top: 1px solid var(--border);
    background: var(--surface);
  }

  .declarer__precedent {
    display: none;
  }

  .declarer__precedent-mobile {
    display: inline-flex;
    width: 58px;
    height: var(--control-lg);
    border-color: var(--brand);
    color: var(--brand-dark);
  }

  .declarer__suivant {
    flex: 1;
    height: var(--control-lg);
  }
}
</style>
