<!--
  SaDemande — décider d'approuver ou de refuser une association, et lancer sa mise en place.
  Colonne principale : L'association · Le responsable (email et téléphone copiables) · Besoins exprimés · Historique.
  Colonne « Décision » (collante) : plan à attribuer (pré-rempli avec le souhait), comptes gestionnaires, début
  d'abonnement, note interne ; « Approuver et créer l'espace » (modale récapitulative → crée l'association) et
  « Refuser » (modale : motif obligatoire, précisions, aperçu de l'email). Après décision : résumé à la place.
  Mobile : colonne de décision sous la fiche, boutons en barre fixe en bas.
  Scénarios : `approuvee`, `refusee` (+ `chargement`, `erreur`). Modales : interaction réelle.
-->
<script setup lang="ts">
import type { Definition } from '~/components/metier/ListeDefinitions.vue'
import type { EvenementFrise } from '~/components/metier/Frise.vue'
import { formatDate, formatHeure } from '~/utils/format'
import { formatSaisieDate, lireDateSaisie } from '~/utils/echeancier'
import { maintenant } from '~/utils/date-reference'
import { STATUTS_DEMANDE, TYPES_ASSOCIATION } from '~/utils/statuts'

definePageMeta({ middleware: 'espace-plateforme', layout: 'backoffice', espace: 'superadmin', titre: 'Demande' })

const route = useRoute()
const id = computed(() => String(route.params.id))
const toast = useToast()
const { data: demande, pending, error, refresh } = useDemande(id)
const { data: plans } = usePlans({ statut: 'actif' })
const { refresh: rechargerCompteurs } = useCompteursNavigation()
const { approuver, refuser } = useDecisionDemande()

const d = computed(() => demande.value)
useHead({ title: () => `${d.value?.association.nom ?? 'Demande'} · Cotiz` })
useFilAriane(() => [{ label: 'Demandes', to: '/plateforme/demandes' }, { label: d.value?.association.nom ?? '…' }])

const nomPlan = (planId?: string) => plans.value?.find(p => p.id === planId)?.nom ?? planId ?? ''
const responsable = computed(() => (d.value ? `${d.value.responsable.prenom} ${d.value.responsable.nom}`.trim() : ''))
const heure = (iso: string) => (iso.includes('T') ? ` à ${formatHeure(iso)}` : '')

// ---------------------------------------------------------------- Fiche
const association = computed<Definition[]>(() => d.value
  ? [
      { cle: 'type', libelle: 'Type', valeur: TYPES_ASSOCIATION[d.value.association.type] },
      { cle: 'lieu', libelle: 'Ville · Pays', valeur: `${d.value.association.ville} · ${d.value.association.pays}` },
      { cle: 'numero', libelle: 'N° d’enregistrement', valeur: d.value.association.numeroEnregistrement || 'Non renseigné' },
      { cle: 'description', libelle: 'Description', valeur: d.value.association.description },
    ]
  : [])
const contact = computed<Definition[]>(() => d.value
  ? [
      { cle: 'nom', libelle: 'Nom', valeur: responsable.value },
      { cle: 'fonction', libelle: 'Fonction', valeur: d.value.responsable.fonction },
      { cle: 'email', libelle: 'Email', valeur: d.value.responsable.email, copier: 'Copier l’email' },
      { cle: 'telephone', libelle: 'Téléphone', valeur: d.value.responsable.telephone, mono: true, copier: 'Copier le téléphone' },
    ]
  : [])
const besoins = computed<Definition[]>(() => d.value
  ? [
      { cle: 'souscripteurs', libelle: 'Souscripteurs estimés', valeur: d.value.besoins.souscripteursEstimes },
      { cle: 'projets', libelle: 'Projets envisagés', valeur: d.value.besoins.projetsEnvisages },
      { cle: 'plan', libelle: 'Plan souhaité' },
      { cle: 'source', libelle: 'Source', valeur: d.value.besoins.source },
    ]
  : [])
const historique = computed<EvenementFrise[]>(() => (d.value?.historique ?? []).map(e => ({
  id: e.id,
  titre: e.titre,
  detail: [`${formatDate(e.date, 'numerique')}${e.date.includes('T') ? ` · ${formatHeure(e.date)}` : ''}`, e.detail].filter(Boolean).join(' · '),
  ton: e.ton,
})))

// ---------------------------------------------------------------- Décision
/** Début d'abonnement proposé : le 1er du mois suivant. */
function premierDuMoisSuivant() {
  const m = maintenant()
  return formatDate(new Date(m.getFullYear(), m.getMonth() + 1, 1), 'numerique')
}
/** Plan choisi par le super-admin ; à défaut, le souhait du demandeur (pré-remplissage, rendu serveur compris). */
const planChoisi = ref<string | null>(null)
const planId = computed<string | null>({
  get: () => planChoisi.value ?? d.value?.besoins.planSouhaiteId ?? null,
  set: v => (planChoisi.value = v),
})
const comptes = ref(2)
const debut = ref(premierDuMoisSuivant())
const note = ref('')
const erreurDebut = ref('')
const optionsPlans = computed(() => (plans.value ?? []).map(p => ({ valeur: p.id, label: p.nom })))

const modaleApprobation = ref(false)
const modaleRefus = ref(false)
const envoi = ref(false)

function ouvrirApprobation() {
  erreurDebut.value = lireDateSaisie(debut.value) ? '' : 'Saisissez une date au format JJ/MM/AAAA.'
  if (!erreurDebut.value) modaleApprobation.value = true
}

async function confirmerApprobation(message: string | undefined) {
  if (!d.value || !planId.value) return
  envoi.value = true
  try {
    demande.value = await approuver(d.value.id, {
      planId: planId.value,
      comptesGestionnaires: comptes.value,
      debutAbonnement: lireDateSaisie(debut.value)!,
      noteInterne: note.value.trim() || undefined,
      messagePersonnalise: message,
    })
    modaleApprobation.value = false
    toast.succes('Espace créé', { message: `${responsable.value} va recevoir ses identifiants par email.` })
    rechargerCompteurs()
  }
  catch {
    toast.erreur('Approbation impossible', { message: 'Vérifiez votre connexion, puis réessayez.' })
  }
  finally {
    envoi.value = false
  }
}

async function confirmerRefus(refus: { motif: string, precisions?: string }) {
  if (!d.value) return
  envoi.value = true
  try {
    demande.value = await refuser(d.value.id, refus)
    modaleRefus.value = false
    toast.succes('Demande refusée', { message: `L’email a été envoyé à ${d.value.responsable.email}.` })
    rechargerCompteurs()
  }
  catch {
    toast.erreur('Refus impossible', { message: 'Vérifiez votre connexion, puis réessayez.' })
  }
  finally {
    envoi.value = false
  }
}

const lienAssociation = computed(() => (d.value?.associationId ? `/plateforme/associations/${d.value.associationId}` : '/plateforme/associations'))
const introuvable = computed(() => (error.value as { statusCode?: number } | null)?.statusCode === 404)
</script>

<template>
  <div class="sa-demande">
    <!-- Chargement -->
    <template v-if="pending && !d">
      <CzSkeleton
        :hauteur="32"
        largeur="50%"
      />
      <div class="sa-demande__grille">
        <div class="sa-demande__principal">
          <div
            v-for="i in 3"
            :key="i"
            class="cz-card"
          >
            <CzSkeleton
              :hauteur="120"
            />
          </div>
        </div>
        <div class="cz-card">
          <CzSkeleton :hauteur="320" />
        </div>
      </div>
    </template>

    <CzEmpty
      v-else-if="introuvable"
      icone="recherche"
      ton="neutral"
      titre="Demande introuvable"
      description="Cette demande n’existe pas ou a été supprimée."
    >
      <template #action>
        <CzButton
          variante="secondaire"
          to="/plateforme/demandes"
        >
          Retour aux demandes
        </CzButton>
      </template>
    </CzEmpty>

    <CzErreurChargement
      v-else-if="error || !d"
      titre="Impossible d’afficher la demande"
      @reessayer="refresh()"
    />

    <template v-else>
      <header class="sa-demande__tete">
        <h1 class="sa-demande__titre">
          {{ d.association.nom }}
          <CzBadge :ton="STATUTS_DEMANDE[d.statut].ton">
            {{ STATUTS_DEMANDE[d.statut].libelle }}
          </CzBadge>
        </h1>
        <p class="sa-demande__meta">
          Reçue le {{ formatDate(d.recueLe, 'numerique') }}{{ heure(d.recueLe) }} · Référence <span class="cz-mono sa-demande__ref">{{ d.reference }}</span>
        </p>
      </header>

      <div class="sa-demande__grille">
        <div class="sa-demande__principal">
          <section class="cz-card sa-demande__carte">
            <h2 class="sa-demande__h2">
              L’association
            </h2>
            <ListeDefinitions :elements="association" />
          </section>
          <section class="cz-card sa-demande__carte">
            <h2 class="sa-demande__h2">
              Le responsable
            </h2>
            <ListeDefinitions :elements="contact" />
          </section>
          <section class="cz-card sa-demande__carte">
            <h2 class="sa-demande__h2">
              Besoins exprimés
            </h2>
            <ListeDefinitions :elements="besoins">
              <template #valeur-plan>
                <CzBadge ton="brand">
                  {{ nomPlan(d.besoins.planSouhaiteId) }}
                </CzBadge>
              </template>
            </ListeDefinitions>
          </section>
          <section class="cz-card sa-demande__carte">
            <h2 class="sa-demande__h2">
              Historique
            </h2>
            <Frise
              :evenements="historique"
              label="Historique de la demande"
            />
          </section>
        </div>

        <aside class="sa-demande__decision">
          <!-- À traiter -->
          <section
            v-if="d.statut === 'a_traiter'"
            class="cz-card sa-demande__carte sa-demande__form"
            aria-labelledby="titre-decision"
          >
            <h2
              id="titre-decision"
              class="sa-demande__h2 sa-demande__h2--serre"
            >
              Décision
            </h2>
            <CzField
              label="Plan à attribuer"
              aide="Pré-rempli avec le souhait du demandeur"
            >
              <CzSelect
                v-model="planId"
                :options="optionsPlans"
              />
            </CzField>
            <CzField label="Comptes gestionnaires autorisés">
              <CzCounter
                v-model="comptes"
                :min="1"
                label="Comptes gestionnaires autorisés"
                class="sa-demande__compteur"
              />
            </CzField>
            <CzField
              label="Début de l’abonnement"
              :erreur="erreurDebut || undefined"
            >
              <CzInput
                :model-value="debut"
                inputmode="numeric"
                placeholder="JJ/MM/AAAA"
                @update:model-value="v => (debut = formatSaisieDate(String(v)))"
              />
            </CzField>
            <CzField label="Note interne">
              <CzInput
                v-model="note"
                type="textarea"
                :lignes="3"
                placeholder="Non visible par l’association"
              />
            </CzField>
            <div class="sa-demande__actions">
              <CzButton
                variante="succes"
                icone="coche"
                bloc
                taille="lg"
                @click="ouvrirApprobation"
              >
                Approuver et créer l’espace
              </CzButton>
              <CzButton
                variante="danger-contour"
                bloc
                @click="modaleRefus = true"
              >
                Refuser
              </CzButton>
            </div>
          </section>

          <!-- Approuvée -->
          <section
            v-else-if="d.statut === 'approuvee'"
            class="cz-card sa-demande__carte sa-demande__resume"
          >
            <CzBadge
              ton="success"
              class="sa-demande__badge"
            >
              Approuvée
            </CzBadge>
            <p class="sa-demande__texte">
              L’espace a été créé avec le plan <b>{{ nomPlan(d.planAttribueId) }}</b> et {{ d.comptesGestionnaires ?? 1 }} compte{{ (d.comptesGestionnaires ?? 1) > 1 ? 's' : '' }} gestionnaire{{ (d.comptesGestionnaires ?? 1) > 1 ? 's' : '' }}. {{ responsable }} a reçu ses identifiants par email.
            </p>
            <CzButton
              bloc
              :to="lienAssociation"
            >
              Voir l’association créée
            </CzButton>
          </section>

          <!-- Refusée -->
          <section
            v-else
            class="cz-card sa-demande__carte sa-demande__resume"
          >
            <CzBadge
              ton="danger"
              class="sa-demande__badge"
            >
              Refusée
            </CzBadge>
            <ListeDefinitions
              :elements="[
                { cle: 'motif', libelle: 'Motif', valeur: d.motifRefus },
                { cle: 'envoye', libelle: 'Envoyé', valeur: `${d.refusEnvoyeLe ? formatDate(d.refusEnvoyeLe, 'numerique') : '—'} à ${d.responsable.email}` },
              ]"
              largeur-libelle="70px"
            />
            <CzButton
              variante="secondaire"
              bloc
              to="/plateforme/demandes"
            >
              Retour aux demandes
            </CzButton>
          </section>
        </aside>
      </div>

      <ModaleApprobationDemande
        v-model:ouvert="modaleApprobation"
        :association="d.association.nom"
        :plan="nomPlan(planId ?? undefined)"
        :responsable="responsable"
        :envoi="envoi"
        @approuver="confirmerApprobation"
      />
      <ModaleRefusDemande
        v-model:ouvert="modaleRefus"
        :association="d.association.nom"
        :prenom-responsable="d.responsable.prenom"
        :envoi="envoi"
        @refuser="confirmerRefus"
      />
    </template>
  </div>
</template>

<style scoped>
.sa-demande {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.sa-demande__tete {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.sa-demande__titre {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
  margin: 0;
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 28px;
  color: var(--text-strong);
}

.sa-demande__meta {
  margin: 0;
  font-size: 13.5px;
  color: var(--text-muted);
}

.sa-demande__ref {
  color: var(--text-strong);
}

.sa-demande__grille {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  gap: var(--space-4);
  align-items: start;
}

.sa-demande__principal {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  min-width: 0;
}

.sa-demande__carte {
  padding: var(--space-6);
}

.sa-demande__h2 {
  margin: 0 0 var(--space-4);
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 16px;
  color: var(--text-strong);
}

.sa-demande__h2--serre {
  margin: 0;
}

.sa-demande__decision {
  position: sticky;
  top: calc(64px + var(--space-4));
}

.sa-demande__form {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.sa-demande__compteur {
  align-self: flex-start;
}

.sa-demande__actions {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.sa-demande__resume {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.sa-demande__badge {
  align-self: flex-start;
}

.sa-demande__texte {
  margin: 0;
  font-size: 14px;
}

@media (max-width: 1023px) {
  .sa-demande__grille {
    grid-template-columns: minmax(0, 1fr);
  }

  .sa-demande__decision {
    position: static;
  }
}

@media (max-width: 767px) {
  .sa-demande__titre {
    font-size: 24px;
  }

  /* Boutons de décision en barre fixe, à portée de pouce. */
  .sa-demande__actions {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 20;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-4) calc(var(--space-3) + env(safe-area-inset-bottom));
    background: var(--surface);
    box-shadow: var(--shadow-menu);
  }

  /* Libellés complets, boutons empilés : pas de texte tronqué à 390 px. */
  .sa-demande__decision {
    padding-bottom: 136px;
  }
}
</style>
