<!--
  SaNouvelleAssociation — créer une association sans demande préalable (association accompagnée, démonstration).
  Formulaire en une page, 4 sections repliables : Association (mêmes champs que le formulaire public) · Gestionnaire
  principal · Abonnement (plan, date de début, comptes gestionnaires, période d'essai) · Envoi (accès remis maintenant).
  Barre d'actions collante en bas : Annuler · Créer l'association. Validation à la perte de focus et à l'envoi
  (bandeau « N champs à corriger dans … »). Création : toast de succès puis redirection vers le détail ; accès remis
  maintenant : carte « Accès du gestionnaire » (code d'activation, message prêt) à la place du formulaire, aucun email
  envoyé (ui-deviations.md).
  États `rempli`, `erreurs`, `envoi-en-cours` : interaction réelle (scripts/parcours).
-->
<script setup lang="ts">
import type { AccesARemettre, TypeAssociation } from '~~/types'
import { formatDate } from '~/utils/format'
import { formatSaisieDate, lireDateSaisie } from '~/utils/echeancier'
import { maintenant } from '~/utils/date-reference'
import { emailValide, formatSaisieTelephone, telephoneValide } from '~/utils/validation'
import { TYPES_ASSOCIATION } from '~/utils/statuts'

definePageMeta({ middleware: 'espace-plateforme', layout: 'backoffice', espace: 'superadmin', titre: 'Nouvelle association' })
useHead({ title: 'Créer une association · Cotiz' })
useFilAriane([{ label: 'Associations', to: '/plateforme/associations' }, { label: 'Nouvelle association' }])

const toast = useToast()
const { data: plans } = usePlans({ statut: 'actif' })
const { creer } = useActionsAssociationPlateforme()

const TYPES = (['association', 'mutuelle', 'tontine', 'groupement'] as const).map(t => ({ valeur: t as TypeAssociation, label: TYPES_ASSOCIATION[t] }))
const PAYS = ['Côte d’Ivoire', 'Sénégal', 'Mali', 'Burkina Faso'].map(p => ({ valeur: p, label: p }))
const ESSAIS = [14, 30, 60].map(j => ({ valeur: j, label: `${j} jours` }))
const optionsPlans = computed(() => (plans.value ?? []).map(p => ({ valeur: p.id, label: p.nom })))

const m = maintenant()
const f = reactive({
  nom: '',
  type: 'association' as TypeAssociation | null,
  numero: '',
  ville: '',
  pays: 'Côte d’Ivoire' as string | null,
  description: '',
  prenom: '',
  nomGestionnaire: '',
  email: '',
  telephone: '',
  planChoisi: null as string | null,
  debut: formatDate(new Date(m.getFullYear(), m.getMonth() + 1, 1), 'numerique'),
  /** Comptes choisis ; `null` : ceux du plan, sans surcharge. */
  comptes: null as number | null,
  essai: true,
  dureeEssai: 14 as number | null,
  envoyer: true,
})
/** Plan par défaut : le premier de l'offre (Découverte), y compris au rendu serveur. */
const plan = computed<string | null>({
  get: () => f.planChoisi ?? plans.value?.[0]?.id ?? null,
  set: v => (f.planChoisi = v),
})

/** Comptes du plan (quota) : valeur proposée tant qu'elle n'est pas changée. */
const comptesDuPlan = computed(() => {
  const q = plans.value?.find(p => p.id === plan.value)?.quotas.gestionnaires
  return typeof q === 'number' ? q : 1
})
const comptes = computed<number>({
  get: () => f.comptes ?? comptesDuPlan.value,
  set: v => (f.comptes = v === comptesDuPlan.value ? null : v),
})

const sections = reactive({ association: true, gestionnaire: true, abonnement: true, envoi: true })

// ---------------------------------------------------------------- Validation
type Champ = 'nom' | 'ville' | 'description' | 'prenom' | 'nomGestionnaire' | 'email' | 'telephone' | 'debut'
const SECTIONS: Record<Champ, 'Association' | 'Gestionnaire principal' | 'Abonnement'> = {
  nom: 'Association', ville: 'Association', description: 'Association',
  prenom: 'Gestionnaire principal', nomGestionnaire: 'Gestionnaire principal', email: 'Gestionnaire principal', telephone: 'Gestionnaire principal',
  debut: 'Abonnement',
}
function erreurDe(c: Champ): string | undefined {
  switch (c) {
    case 'nom': return f.nom.trim() ? undefined : 'Le nom est obligatoire'
    case 'ville': return f.ville.trim() ? undefined : 'La ville est obligatoire'
    case 'description': return f.description.length <= 500 ? undefined : '500 caractères maximum'
    case 'prenom': return f.prenom.trim() ? undefined : 'Le prénom est obligatoire'
    case 'nomGestionnaire': return f.nomGestionnaire.trim() ? undefined : 'Le nom est obligatoire'
    case 'email': return !f.email.trim() ? 'L’email est obligatoire' : emailValide(f.email) ? undefined : 'Adresse email incomplète'
    case 'telephone': return !f.telephone.trim() ? 'Le téléphone est obligatoire' : telephoneValide(f.telephone) ? undefined : 'Numéro à 10 chiffres attendu'
    case 'debut': return lireDateSaisie(f.debut) ? undefined : 'Date au format JJ/MM/AAAA'
  }
}
const touches = reactive(new Set<Champ>())
const soumis = ref(false)
const erreur = (c: Champ) => (soumis.value || touches.has(c) ? erreurDe(c) : undefined)
const toucher = (c: Champ) => touches.add(c)
const enErreur = computed(() => (Object.keys(SECTIONS) as Champ[]).filter(c => erreurDe(c)))
const bandeau = computed(() => {
  if (!soumis.value || !enErreur.value.length) return null
  const noms = [...new Set(enErreur.value.map(c => SECTIONS[c]))].map(s => `« ${s} »`)
  const liste = noms.length > 1 ? `${noms.slice(0, -1).join(', ')} et ${noms.at(-1)}` : noms[0]
  return { nombre: enErreur.value.length, liste }
})

// ---------------------------------------------------------------- Envoi
const envoi = ref(false)
/** Association créée avec ses accès à remettre (renvoyés une seule fois). */
const creee = ref<{ id: string, nom: string, acces: AccesARemettre } | null>(null)
async function creerAssociation() {
  soumis.value = true
  if (enErreur.value.length) {
    for (const s of new Set(enErreur.value.map(c => SECTIONS[c]))) {
      if (s === 'Association') sections.association = true
      if (s === 'Gestionnaire principal') sections.gestionnaire = true
      if (s === 'Abonnement') sections.abonnement = true
    }
    window.scrollTo({ top: 0, behavior: 'smooth' })
    return
  }
  if (!plan.value || !f.type || !f.pays) return
  envoi.value = true
  try {
    const { association: cree, acces } = await creer({
      association: { nom: f.nom.trim(), type: f.type, numeroEnregistrement: f.numero.trim() || undefined, ville: f.ville.trim(), pays: f.pays, description: f.description.trim() || undefined },
      gestionnaire: { prenom: f.prenom.trim(), nom: f.nomGestionnaire.trim(), email: f.email.trim(), telephone: `+225 ${formatSaisieTelephone(f.telephone)}` },
      abonnement: { planId: plan.value, debut: lireDateSaisie(f.debut)!, comptesGestionnaires: f.comptes, essaiJours: f.essai ? f.dureeEssai : null },
      envoyerIdentifiants: f.envoyer,
    })
    if (acces) {
      toast.succes('Association créée', { message: `Transmettez ses accès à ${acces.destinataire}.` })
      creee.value = { id: cree.id, nom: cree.nom, acces }
      window.scrollTo({ top: 0 })
      return
    }
    toast.succes('Association créée', {
      message: f.envoyer
        ? 'Le gestionnaire principal a déjà un compte Cotiz : le nouvel espace y est rattaché.'
        : 'Aucun code d’activation n’a été affiché.',
    })
    await navigateTo(`/plateforme/associations/${cree.id}`)
  }
  catch {
    toast.erreur('Création impossible', { message: 'Vérifiez votre connexion, puis réessayez.' })
  }
  finally {
    envoi.value = false
  }
}
</script>

<template>
  <div class="sa-nouvelle">
    <EnTetePage
      titre="Créer une association"
      sous-titre="Création directe, sans demande préalable (association accompagnée, démonstration)."
    />

    <div
      v-if="creee"
      class="sa-nouvelle__creee"
    >
      <HandoffCard
        titre="Accès du gestionnaire"
        :destinataire="creee.acces.destinataire"
        :code="creee.acces.code"
        :expire-le="creee.acces.expireLe"
        :message="creee.acces.message"
        :whatsapp="creee.acces.whatsapp"
        :sms="creee.acces.sms"
        :mailto="creee.acces.mailto"
      />
      <CzButton :to="`/plateforme/associations/${creee.id}`">
        Voir l’association {{ creee.nom }}
      </CzButton>
    </div>

    <template v-else>
      <CzAlert
        v-if="bandeau"
        ton="danger"
        icone="alerte"
      >
        <b>{{ bandeau.nombre }} champ{{ bandeau.nombre > 1 ? 's' : '' }} à corriger</b> dans {{ bandeau.liste }}.
      </CzAlert>

      <form
        class="sa-nouvelle__form"
        novalidate
        @submit.prevent="creerAssociation"
      >
        <SectionRepliable
          v-model:ouvert="sections.association"
          :numero="1"
          titre="Association"
        >
          <div class="sa-nouvelle__grille">
            <CzField
              label="Nom de l’association"
              requis
              :erreur="erreur('nom')"
              class="sa-nouvelle__large"
            >
              <CzInput
                v-model="f.nom"
                placeholder="Ex. Entraide Yopougon"
                @blur="toucher('nom')"
              />
            </CzField>
            <CzField
              label="Type"
              requis
            >
              <CzSelect
                v-model="f.type"
                :options="TYPES"
              />
            </CzField>
            <CzField label="Numéro d’enregistrement">
              <CzInput
                v-model="f.numero"
                placeholder="Optionnel"
              />
            </CzField>
            <CzField
              label="Ville"
              requis
              :erreur="erreur('ville')"
            >
              <CzInput
                v-model="f.ville"
                placeholder="Ex. Abidjan"
                @blur="toucher('ville')"
              />
            </CzField>
            <CzField
              label="Pays"
              requis
            >
              <CzSelect
                v-model="f.pays"
                :options="PAYS"
              />
            </CzField>
            <CzField
              label="Description de l’activité"
              :erreur="erreur('description')"
              class="sa-nouvelle__large"
            >
              <CzInput
                v-model="f.description"
                type="textarea"
                :lignes="3"
                :maxlength="500"
                placeholder="500 caractères maximum"
                @blur="toucher('description')"
              />
            </CzField>
          </div>
        </SectionRepliable>

        <SectionRepliable
          v-model:ouvert="sections.gestionnaire"
          :numero="2"
          titre="Gestionnaire principal"
        >
          <div class="sa-nouvelle__grille">
            <CzField
              label="Prénom"
              requis
              :erreur="erreur('prenom')"
            >
              <CzInput
                v-model="f.prenom"
                autocomplete="off"
                @blur="toucher('prenom')"
              />
            </CzField>
            <CzField
              label="Nom"
              requis
              :erreur="erreur('nomGestionnaire')"
            >
              <CzInput
                v-model="f.nomGestionnaire"
                autocomplete="off"
                @blur="toucher('nomGestionnaire')"
              />
            </CzField>
            <CzField
              label="Email"
              requis
              :erreur="erreur('email')"
            >
              <CzInput
                v-model="f.email"
                type="email"
                inputmode="email"
                autocomplete="off"
                @blur="toucher('email')"
              />
            </CzField>
            <CzField
              label="Téléphone"
              requis
              :erreur="erreur('telephone')"
            >
              <CzInput
                v-model="f.telephone"
                type="telephone"
                inputmode="numeric"
                autocomplete="off"
                @blur="toucher('telephone')"
              />
            </CzField>
          </div>
        </SectionRepliable>

        <SectionRepliable
          v-model:ouvert="sections.abonnement"
          :numero="3"
          titre="Abonnement"
        >
          <div class="sa-nouvelle__grille">
            <CzField
              label="Plan"
              requis
            >
              <CzSelect
                v-model="plan"
                :options="optionsPlans"
              />
            </CzField>
            <CzField
              label="Date de début"
              :erreur="erreur('debut')"
            >
              <CzInput
                :model-value="f.debut"
                inputmode="numeric"
                placeholder="JJ/MM/AAAA"
                @update:model-value="v => (f.debut = formatSaisieDate(String(v)))"
                @blur="toucher('debut')"
              />
            </CzField>
            <CzField label="Comptes gestionnaires autorisés">
              <CzCounter
                v-model="comptes"
                :min="1"
                label="Comptes gestionnaires autorisés"
                class="sa-nouvelle__compteur"
              />
            </CzField>
            <div class="cz-field">
              <span class="cz-label">Période d’essai</span>
              <div class="sa-nouvelle__essai">
                <CzToggle
                  v-model="f.essai"
                  label="Période d’essai"
                />
                <CzSelect
                  v-model="f.dureeEssai"
                  :options="ESSAIS"
                  :disabled="!f.essai"
                  label="Durée de la période d’essai"
                  class="sa-nouvelle__duree"
                />
              </div>
            </div>
          </div>
        </SectionRepliable>

        <SectionRepliable
          v-model:ouvert="sections.envoi"
          :numero="4"
          titre="Envoi"
        >
          <div class="sa-nouvelle__envoi">
            <CzToggle
              v-model="f.envoyer"
              label="Remettre les accès maintenant"
            />
            <div>
              <b>Remettre les accès maintenant</b>
              <div class="sa-nouvelle__aide">
                Le code d’activation et un message prêt s’affichent dès la création, à transmettre vous-même au gestionnaire principal.
              </div>
            </div>
          </div>
        </SectionRepliable>

        <div
          class="sa-nouvelle__barre"
          role="region"
          aria-label="Actions"
        >
          <CzButton
            variante="fantome"
            to="/plateforme/associations"
          >
            Annuler
          </CzButton>
          <CzButton
            type="submit"
            :chargement="envoi"
            libelle-chargement="Création…"
          >
            Créer l’association
          </CzButton>
        </div>
      </form>
    </template>
  </div>
</template>

<style scoped>
.sa-nouvelle__creee {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  max-width: 640px;
}

.sa-nouvelle {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  max-width: 836px;
  padding-bottom: 96px;
}

.sa-nouvelle__form {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.sa-nouvelle__grille {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-4);
}

.sa-nouvelle__large {
  grid-column: 1 / -1;
}

.sa-nouvelle__compteur {
  align-self: flex-start;
}

.sa-nouvelle__essai {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.sa-nouvelle__duree {
  width: 140px;
}

.sa-nouvelle__envoi {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  font-size: 14px;
}

.sa-nouvelle__envoi b {
  color: var(--text-strong);
}

.sa-nouvelle__aide {
  font-size: 13px;
  color: var(--text-muted);
}

.sa-nouvelle__barre {
  position: fixed;
  right: 0;
  bottom: 0;
  left: var(--sidebar);
  z-index: 30;
  display: flex;
  justify-content: flex-end;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-8);
  border-top: 1px solid var(--border);
  background: var(--surface);
}

@media (max-width: 1023px) {
  .sa-nouvelle__barre {
    left: var(--sidebar-collapsed);
  }
}

@media (max-width: 767px) {
  .sa-nouvelle__grille {
    grid-template-columns: minmax(0, 1fr);
  }

  .sa-nouvelle__barre {
    left: 0;
    padding: var(--space-3) var(--space-4) calc(var(--space-3) + env(safe-area-inset-bottom));
  }

  .sa-nouvelle__barre > :deep(.cz-btn) {
    flex: 1;
    height: 48px;
  }
}
</style>
