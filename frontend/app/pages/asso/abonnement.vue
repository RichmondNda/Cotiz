<!--
  MgAbonnement — savoir ce que l'association paie à Cotiz et où elle en est de ses quotas.
  Carte « Formule actuelle » (badge Actif / Échéance proche / Suspendu, prix, client depuis, prochaine facture,
  moyen de paiement, contrat plateforme), jauges d'utilisation (orange au-delà de 80 %, rouge à 100 %),
  factures (tableau en desktop, liste en mobile), « Demander un changement » (traité par l'équipe Cotiz).
  Échéance proche : bandeau warning ; suspendu : bandeau danger.
  Scénarios : `echeance-proche`, `suspendu` (+ `chargement`, `erreur`).
-->
<script setup lang="ts">
import type { ColonneTable } from '~/components/cz/CzTable.vue'
import type { TonBadge } from '~/components/cz/CzBadge.vue'
import type { FactureAbonnement, StatutAbonnement, StatutFactureAbonnement, UtilisationQuota } from '~~/types'
import { estDate, formatDate, formatFCFA, formatMois } from '~/utils/format'

definePageMeta({ middleware: 'espace-gestionnaire', layout: 'backoffice', espace: 'gestionnaire', titre: 'Abonnement' })
useHead({ title: 'Abonnement · Cotiz' })

const toast = useToast()
const { data: abonnement, pending, error, refresh } = useAbonnement()
const demanderChangement = useDemandeChangementFormule()

const STATUTS: Record<StatutAbonnement, { libelle: string, ton: TonBadge }> = {
  actif: { libelle: 'Actif', ton: 'success' },
  echeance_proche: { libelle: 'Échéance proche', ton: 'warning' },
  suspendu: { libelle: 'Suspendu', ton: 'danger' },
}
const STATUTS_FACTURE: Record<StatutFactureAbonnement, { libelle: string, ton: TonBadge }> = {
  payee: { libelle: 'Payée', ton: 'success' },
  a_payer: { libelle: 'À payer', ton: 'warning' },
  impayee: { libelle: 'Impayée', ton: 'danger' },
}

const date = (d: string) => (estDate(d) ? formatDate(d) : d)
const clientDepuis = computed(() => {
  const d = abonnement.value?.clientDepuis
  return d && estDate(d) ? formatMois(d).toLocaleLowerCase('fr') : d
})

const JAUGES = [
  { cle: 'projets', label: 'Projets' },
  { cle: 'souscripteurs', label: 'Souscripteurs' },
  { cle: 'gestionnaires', label: 'Gestionnaires' },
] as const
const valeurQuota = (q: UtilisationQuota) => `${q.utilise} / ${q.limite ?? 'illimité'}`
/** Spec : orange au-delà de 80 %, rouge à 100 %. */
const tonQuota = (q: UtilisationQuota) => (q.pourcentage >= 100 ? 'danger' : q.pourcentage > 80 ? 'warning' : 'brand')

/** Lignes du tableau (CzTable attend des enregistrements indexables). */
const lignesFactures = computed(() => (abonnement.value?.factures ?? []).map(f => ({ ...f })))

const COLONNES: ColonneTable[] = [
  { cle: 'numero', label: 'Facture' },
  { cle: 'periode', label: 'Période' },
  { cle: 'emiseLe', label: 'Émise le' },
  { cle: 'montant', label: 'Montant', num: true, squelette: 'montant' },
  { cle: 'statut', label: 'Statut', squelette: 'badge' },
  { cle: 'pdf', label: '', largeur: '120px' },
]

function pdf(f?: FactureAbonnement) {
  toast.info(f ? 'PDF de la facture bientôt disponible' : 'Contrat plateforme bientôt disponible', {
    message: 'Le téléchargement arrivera avec la facturation en ligne.',
  })
}

const envoi = ref(false)
async function demander() {
  envoi.value = true
  try {
    await demanderChangement()
    toast.succes('Demande envoyée à l’équipe Cotiz', { message: 'Elle vous recontacte pour changer de formule.' })
    await refresh()
  }
  catch {
    toast.erreur('La demande n’a pas pu être envoyée', { message: 'Vérifiez votre connexion, puis réessayez.' })
  }
  finally {
    envoi.value = false
  }
}

const chargement = computed(() => pending.value && !abonnement.value)
</script>

<template>
  <div class="abonnement">
    <EnTeteGestionnaireMobile
      titre="Abonnement"
      :sous-titre="abonnement ? `Formule ${abonnement.nomPlan}` : undefined"
      retour="/asso/plus"
      :cloche="false"
    />
    <EnTetePage
      titre="Abonnement"
      sous-titre="Votre formule Cotiz, son utilisation et vos factures"
      class="cz-desktop"
    />

    <CzErreurChargement
      v-if="error && !abonnement"
      titre="Impossible d’afficher votre abonnement"
      @reessayer="refresh()"
    />

    <!-- Chargement -->
    <div
      v-else-if="chargement"
      class="abonnement__haut"
      aria-busy="true"
    >
      <div class="cz-card cz-card--lg abonnement__squelette">
        <CzSkeleton
          :hauteur="14"
          largeur="30%"
        />
        <CzSkeleton
          :hauteur="28"
          largeur="50%"
        />
        <CzSkeleton
          :hauteur="80"
        />
      </div>
      <div class="cz-card abonnement__squelette">
        <CzSkeleton
          v-for="i in 3"
          :key="i"
          :hauteur="24"
        />
      </div>
    </div>

    <template v-else-if="abonnement">
      <CzAlert
        v-if="abonnement.statut === 'echeance_proche'"
        ton="warning"
        sans-icone
      >
        <span class="cz-desktop"><b>Votre abonnement arrive à échéance le {{ date(abonnement.factureDue?.echeance ?? abonnement.prochaineFacture) }}.</b>
          Réglez la facture {{ abonnement.factureDue?.numero }} pour éviter la suspension de votre espace.</span>
        <span class="cz-mobile"><b>Échéance le {{ date(abonnement.factureDue?.echeance ?? abonnement.prochaineFacture) }}.</b>
          Réglez la facture {{ abonnement.factureDue?.numero }} pour éviter la suspension.</span>
      </CzAlert>
      <CzAlert
        v-else-if="abonnement.statut === 'suspendu'"
        ton="danger"
        sans-icone
      >
        <span class="cz-desktop"><b>Espace suspendu pour non-paiement.</b>
          Vos souscripteurs ne peuvent plus déclarer de paiement. Réglez la facture {{ abonnement.factureDue?.numero }}
          ou contactez-nous : {{ abonnement.emailContactCotiz }}.</span>
        <span class="cz-mobile"><b>Espace suspendu pour non-paiement.</b>
          Réglez la facture {{ abonnement.factureDue?.numero }} ou écrivez à {{ abonnement.emailContactCotiz }}.</span>
      </CzAlert>

      <div class="abonnement__haut">
        <!-- Formule actuelle -->
        <section
          class="cz-card cz-card--lg abonnement__formule"
          aria-labelledby="abonnement-formule"
        >
          <div class="abonnement__ligne">
            <div>
              <div class="abonnement__lbl">
                Formule actuelle
              </div>
              <h2
                id="abonnement-formule"
                class="abonnement__plan"
              >
                {{ abonnement.nomPlan }}
              </h2>
            </div>
            <CzBadge :ton="STATUTS[abonnement.statut].ton">
              {{ STATUTS[abonnement.statut].libelle }}
            </CzBadge>
          </div>
          <div class="abonnement__prix">
            {{ formatFCFA(abonnement.prixAnnuel) }} <span>/ an</span>
          </div>
          <dl class="abonnement__infos">
            <div>
              <dt>Client depuis</dt>
              <dd>{{ clientDepuis }}</dd>
            </div>
            <div>
              <dt>Prochaine facture</dt>
              <dd>{{ date(abonnement.prochaineFacture) }}</dd>
            </div>
            <div>
              <dt>Paiement</dt>
              <dd>
                <span class="cz-desktop">{{ abonnement.moyenPaiement }}</span>
                <span class="cz-mobile">{{ abonnement.moyenPaiement.replace(/ à Cotiz$/, '') }}</span>
              </dd>
            </div>
            <div class="cz-desktop">
              <dt>Contrat plateforme</dt>
              <dd>
                <CzButton
                  variante="fantome"
                  taille="sm"
                  class="abonnement__lien"
                  @click="pdf()"
                >
                  Télécharger (PDF)
                </CzButton>
              </dd>
            </div>
          </dl>
        </section>

        <!-- Utilisation -->
        <section
          class="cz-card abonnement__utilisation"
          aria-labelledby="abonnement-utilisation"
        >
          <h2
            id="abonnement-utilisation"
            class="abonnement__titre"
          >
            Utilisation
          </h2>
          <div
            v-for="j in JAUGES"
            :key="j.cle"
          >
            <div class="abonnement__ligne abonnement__jauge">
              <span>{{ j.label }}</span>
              <b>{{ valeurQuota(abonnement.utilisation[j.cle]) }}</b>
            </div>
            <CzProgress
              :valeur="abonnement.utilisation[j.cle].pourcentage"
              :ton="tonQuota(abonnement.utilisation[j.cle])"
              :label="`${j.label} : ${valeurQuota(abonnement.utilisation[j.cle])}`"
            />
          </div>
          <p class="abonnement__note cz-desktop">
            Les plafonds de chaque formule sont définis par Cotiz.
          </p>
        </section>
      </div>

      <!-- Factures -->
      <h2 class="abonnement__titre abonnement__titre--section">
        Factures
      </h2>
      <CzTable
        :colonnes="COLONNES"
        :lignes="lignesFactures"
        :cliquable="false"
        label="Factures de l’abonnement"
        class="cz-desktop"
      >
        <template #cell-numero="{ ligne }">
          <span class="cz-mono">{{ ligne.numero }}</span>
        </template>
        <template #cell-emiseLe="{ ligne }">
          {{ date(ligne.emiseLe) }}
        </template>
        <template #cell-montant="{ ligne }">
          {{ formatFCFA(ligne.montant) }}
        </template>
        <template #cell-statut="{ ligne }">
          <CzBadge
            :ton="STATUTS_FACTURE[ligne.statut].ton"
            petit
          >
            {{ STATUTS_FACTURE[ligne.statut].libelle }}
          </CzBadge>
        </template>
        <template #vide>
          <CzEmpty
            icone="facturation"
            ton="neutral"
            titre="Aucune facture pour l’instant"
            description="Vos factures d’abonnement apparaîtront ici dès leur émission."
            integre
          />
        </template>
        <template #cell-pdf="{ ligne }">
          <CzButton
            variante="fantome"
            taille="sm"
            :label="`Télécharger la facture ${ligne.numero} (PDF)`"
            @click="pdf(ligne)"
          >
            PDF
          </CzButton>
        </template>
      </CzTable>
      <div
        v-if="!abonnement.factures.length"
        class="cz-card cz-mobile"
      >
        <CzEmpty
          icone="facturation"
          ton="neutral"
          titre="Aucune facture pour l’instant"
          integre
        />
      </div>
      <ul
        v-else
        class="cz-card abonnement__factures cz-mobile"
      >
        <li
          v-for="f in abonnement.factures"
          :key="f.id"
        >
          <span class="abonnement__facture">
            <b class="cz-mono">{{ f.numero }}</b>
            <span>{{ f.periode }} · {{ formatFCFA(f.montant) }}</span>
          </span>
          <CzBadge
            :ton="STATUTS_FACTURE[f.statut].ton"
            petit
          >
            {{ STATUTS_FACTURE[f.statut].libelle }}
          </CzBadge>
          <CzButton
            variante="fantome"
            taille="sm"
            :label="`Télécharger la facture ${f.numero} (PDF)`"
            @click="pdf(f)"
          >
            PDF
          </CzButton>
        </li>
      </ul>

      <!-- Changement de formule -->
      <section class="cz-card abonnement__changement cz-desktop">
        <div class="abonnement__changement-texte">
          <b>Besoin d’une autre formule ?</b>
          <span>Découverte, Essentiel ou Pro : l’équipe Cotiz change votre formule à votre demande.</span>
        </div>
        <CzBadge
          v-if="abonnement.changementDemande"
          ton="success"
        >
          Demande envoyée
        </CzBadge>
        <CzButton
          v-else
          variante="secondaire"
          :chargement="envoi"
          libelle-chargement="Envoi…"
          @click="demander"
        >
          Demander un changement
        </CzButton>
      </section>
      <div class="cz-mobile">
        <CzAlert
          v-if="abonnement.changementDemande"
          ton="success"
          sans-icone
        >
          Demande envoyée à l’équipe Cotiz.
        </CzAlert>
        <CzButton
          v-else
          variante="secondaire"
          bloc
          :chargement="envoi"
          libelle-chargement="Envoi…"
          @click="demander"
        >
          Demander un changement de formule
        </CzButton>
      </div>
    </template>
  </div>
</template>

<style scoped>
.abonnement {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.abonnement__haut {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
  gap: var(--space-4);
  align-items: start;
}

.abonnement__squelette {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.abonnement__formule {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  border: 2px solid var(--brand);
}

.abonnement__ligne {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-3);
}

.abonnement__lbl,
.abonnement__infos dt {
  font-size: 12.5px;
  color: var(--text-muted);
}

.abonnement__plan {
  margin: 0;
  font-family: var(--font-display);
  font-size: 26px;
  font-weight: 600;
  color: var(--text-strong);
}

.abonnement__prix {
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 600;
  color: var(--brand-dark);
}

.abonnement__prix span {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-muted);
}

.abonnement__infos {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
  margin: 0;
  font-size: 13.5px;
}

.abonnement__infos dd {
  margin: 0;
  font-weight: 600;
  color: var(--text-strong);
}

.abonnement__lien {
  padding-left: 0;
}

.abonnement__utilisation {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.abonnement__titre {
  margin: 0;
  font-family: var(--font-display);
  font-size: 15px;
  font-weight: 600;
  color: var(--text-strong);
}

.abonnement__titre--section {
  font-size: 16px;
}

.abonnement__jauge {
  margin-bottom: var(--space-1);
  font-size: 13.5px;
}

.abonnement__jauge b {
  color: var(--text-strong);
}

.abonnement__note {
  margin: 0;
  font-size: 12.5px;
  color: var(--text-muted);
}

.abonnement__factures {
  margin: 0;
  padding: 0;
  list-style: none;
  overflow: hidden;
}

.abonnement__factures li {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: 56px;
  padding: var(--space-3) 14px;
}

.abonnement__factures li + li {
  border-top: 1px solid var(--divider-row);
}

.abonnement__facture {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.abonnement__facture b {
  font-size: 13.5px;
  color: var(--text-strong);
}

.abonnement__facture span {
  font-size: 12.5px;
  color: var(--text-muted);
}

.abonnement__changement {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.abonnement__changement-texte {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
}

.abonnement__changement-texte b {
  color: var(--text-strong);
}

.abonnement__changement-texte span {
  font-size: 13.5px;
  color: var(--text-muted);
}

@media (max-width: 1023px) {
  .abonnement__haut {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 767px) {
  .abonnement {
    gap: var(--space-3);
  }

  .abonnement__formule {
    gap: var(--space-2);
  }

  .abonnement__plan {
    font-size: 24px;
  }

  .abonnement__prix {
    font-size: 18px;
  }

  .abonnement__infos {
    grid-template-columns: 1fr;
    gap: var(--space-2);
  }

  .abonnement__infos > div {
    display: flex;
    justify-content: space-between;
    gap: var(--space-3);
  }

  .abonnement__infos dt {
    font-size: 13.5px;
  }

  .abonnement__infos dd {
    text-align: right;
  }
}
</style>
