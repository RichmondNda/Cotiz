<!--
  SaReinitialisations — demandes « mot de passe oublié » des gestionnaires, traitées par le super-admin (pf.resets).
  Écran ajouté après la maquette (ui-deviations.md, sa-resets) : composants existants, calqué sur SaDemandes.
  Onglets À traiter (compteur orange) · Codes remis · Terminées · Toutes ; tableau trié de la plus ancienne à la plus
  récente ; « Générer un code » sur une demande à traiter : modale de confirmation (identité vérifiée hors ligne), puis
  code à 6 chiffres affiché une seule fois avec le message prêt (HandoffCard). Mobile : liste de cartes.
  Owner et admin plateforme seulement (`platform.associations.manage`) : le support n'a pas l'entrée du menu.
-->
<script setup lang="ts">
import type { ColonneTable } from '~/components/cz/CzTable.vue'
import type { Onglet } from '~/components/cz/CzTabs.vue'
import type { CodeReinitialisation, DemandeReinitialisation, StatutReinitialisation } from '~~/types'
import { formatDate } from '~/utils/format'

definePageMeta({ middleware: 'espace-plateforme', layout: 'backoffice', espace: 'superadmin', titre: 'Réinitialisations' })
useHead({ title: 'Réinitialisations · Cotiz' })

type OngletReinitialisations = 'a_traiter' | 'code_remis' | 'terminee' | 'toutes'

const route = useRoute()
const router = useRouter()
const toast = useToast()
// Owner et admin seulement : le support (sans l'entrée du menu) qui ouvre l'adresse revient au tableau de bord.
const { peut, pret } = usePermissions()
watchEffect(() => {
  if (pret.value && !peut('platform.associations.manage')) router.replace('/plateforme')
})
const { data, pending, error, refresh } = useReinitialisations()
const { emettre } = useEmissionCodeReinitialisation()

const ONGLETS: { valeur: OngletReinitialisations, label: string }[] = [
  { valeur: 'a_traiter', label: 'À traiter' },
  { valeur: 'code_remis', label: 'Codes remis' },
  { valeur: 'terminee', label: 'Terminées' },
  { valeur: 'toutes', label: 'Toutes' },
]
const onglet = computed<OngletReinitialisations>({
  get: () => (ONGLETS.some(o => o.valeur === route.query.onglet) ? route.query.onglet as OngletReinitialisations : 'a_traiter'),
  set: v => router.replace({ query: { ...route.query, onglet: v === 'a_traiter' ? undefined : v } }),
})
const demandes = computed(() => data.value ?? [])
const compte = (o: OngletReinitialisations) => (o === 'toutes' ? demandes.value.length : demandes.value.filter(d => d.statut === o).length)
const onglets = computed<Onglet[]>(() => ONGLETS.map(o => ({
  label: o.label,
  valeur: o.valeur,
  compteur: o.valeur === 'a_traiter' ? String(compte(o.valeur)) : compte(o.valeur),
  tonCompteur: o.valeur === 'a_traiter' ? 'warning' : 'neutral',
})))

const nom = (d: DemandeReinitialisation) => `${d.personne.prenom} ${d.personne.nom}`.trim()
const lignes = computed(() => demandes.value
  .filter(d => onglet.value === 'toutes' || d.statut === onglet.value)
  .map(d => ({
    id: d.id,
    gestionnaire: nom(d),
    email: d.personne.email ?? '—',
    telephone: d.personne.telephone,
    demandeeLe: d.demandeeLe,
    traitement: d.traiteePar && d.traiteeLe ? `${d.traiteePar} · ${formatDate(d.traiteeLe, 'numerique')}` : '—',
    statut: d.statut as StatutReinitialisation,
  })))

const COLONNES: ColonneTable[] = [
  { cle: 'gestionnaire', label: 'Gestionnaire', squelette: 'personne' },
  { cle: 'contact', label: 'Contact' },
  { cle: 'demandeeLe', label: 'Demandée le' },
  { cle: 'traitement', label: 'Traitée par' },
  { cle: 'statut', label: 'Statut', squelette: 'badge' },
  { cle: 'action', label: '' },
]
const chargement = computed(() => pending.value && !data.value)

// Émission : confirmation, puis code affiché une seule fois.
const choisie = ref<DemandeReinitialisation | null>(null)
const resultat = ref<CodeReinitialisation | null>(null)
const envoi = ref(false)
const modale = computed({
  get: () => choisie.value !== null,
  set: (ouvert) => {
    if (ouvert) return
    choisie.value = null
    resultat.value = null
  },
})
function ouvrir(id: string) {
  choisie.value = demandes.value.find(d => d.id === id) ?? null
  resultat.value = null
}
async function generer() {
  if (!choisie.value) return
  envoi.value = true
  try {
    resultat.value = await emettre(choisie.value.id)
    await refresh()
  }
  catch (e) {
    toast.erreur('Code non généré', { message: messageRefus(e) ?? 'Vérifiez votre connexion, puis réessayez.' })
    if (codeErreur(e) === 'request_already_handled') {
      modale.value = false
      await refresh()
    }
  }
  finally {
    envoi.value = false
  }
}
</script>

<template>
  <div class="sa-reinit">
    <EnTetePage
      titre="Réinitialisations"
      sous-titre="Gestionnaires qui ont oublié leur mot de passe. Vérifiez leur identité hors ligne avant de générer un code."
    />

    <CzTabs
      v-model="onglet"
      :onglets="onglets"
      label="Statut des demandes de réinitialisation"
    />

    <CzTable
      :colonnes="COLONNES"
      :lignes="lignes"
      :chargement="chargement"
      :lignes-squelette="3"
      :erreur="error ? 'Vérifiez votre connexion, puis réessayez.' : undefined"
      label="Demandes de réinitialisation des gestionnaires"
      @reessayer="refresh()"
    >
      <template #cell-gestionnaire="{ ligne }">
        <span class="sa-reinit__nom">{{ ligne.gestionnaire }}</span>
      </template>
      <template #cell-contact="{ ligne }">
        {{ ligne.email }}
        <div
          v-if="ligne.telephone"
          class="sa-reinit__sous"
        >
          {{ ligne.telephone }}
        </div>
      </template>
      <template #cell-demandeeLe="{ ligne }">
        <span class="sa-reinit__muted">{{ formatDate(ligne.demandeeLe, 'numerique') }}</span>
      </template>
      <template #cell-traitement="{ ligne }">
        <span class="sa-reinit__muted">{{ ligne.traitement }}</span>
      </template>
      <template #cell-statut="{ ligne }">
        <BadgeStatut
          type="reinitialisation"
          :statut="ligne.statut"
        />
      </template>
      <template #cell-action="{ ligne }">
        <CzButton
          v-if="ligne.statut === 'a_traiter'"
          taille="sm"
          icone="cadenas"
          @click="ouvrir(ligne.id)"
        >
          Générer un code
        </CzButton>
      </template>
      <template #carte="{ ligne }">
        <div class="sa-reinit__carte">
          <span class="sa-reinit__carte-l">
            <b>{{ ligne.gestionnaire }}</b>
            <span class="sa-reinit__sous">{{ ligne.email }}<template v-if="ligne.telephone"> · {{ ligne.telephone }}</template></span>
            <span class="sa-reinit__sous">Demandée le {{ formatDate(ligne.demandeeLe, 'numerique') }}</span>
          </span>
          <BadgeStatut
            type="reinitialisation"
            :statut="ligne.statut"
          />
        </div>
        <CzButton
          v-if="ligne.statut === 'a_traiter'"
          taille="sm"
          icone="cadenas"
          bloc
          @click.stop="ouvrir(ligne.id)"
        >
          Générer un code
        </CzButton>
      </template>
      <template #vide>
        <CzEmpty
          v-if="onglet === 'a_traiter'"
          icone="valide"
          ton="success"
          titre="Aucune demande à traiter"
          description="Les gestionnaires qui demandent un nouveau mot de passe apparaîtront ici."
          integre
        />
        <CzEmpty
          v-else
          icone="filtre"
          ton="neutral"
          titre="Aucune demande"
          description="Aucune demande dans cet onglet."
          integre
        />
      </template>
    </CzTable>

    <CzModal
      v-model:ouvert="modale"
      :titre="resultat ? 'Code à transmettre' : `Générer un code pour ${choisie ? nom(choisie) : ''} ?`"
      taille="md"
    >
      <div
        v-if="choisie && !resultat"
        class="sa-reinit__confirmation"
      >
        <CzAlert ton="warning">
          Vérifiez d’abord l’identité de {{ nom(choisie) }} hors ligne (appel au numéro connu, en personne). Le code
          permet de choisir un nouveau mot de passe : il est valable 15 minutes et ne sera affiché qu’une fois.
        </CzAlert>
        <p class="sa-reinit__sous">
          {{ choisie.personne.email ?? '—' }}<template v-if="choisie.personne.telephone">
            · {{ choisie.personne.telephone }}
          </template>
        </p>
      </div>
      <div
        v-else-if="resultat"
        class="sa-reinit__confirmation"
      >
        <CzAlert ton="info">
          Ce code ne sera plus affiché après fermeture. Transmettez-le maintenant.
        </CzAlert>
        <HandoffCard
          titre="Code de réinitialisation"
          :destinataire="resultat.acces.destinataire"
          :code="resultat.acces.code"
          :expire-le="resultat.acces.expireLe"
          :message="resultat.acces.message"
          :whatsapp="resultat.acces.whatsapp"
          :sms="resultat.acces.sms"
          :mailto="resultat.acces.mailto"
        />
      </div>
      <template #pied>
        <template v-if="!resultat">
          <CzButton
            variante="fantome"
            taille="sm"
            @click="modale = false"
          >
            Annuler
          </CzButton>
          <CzButton
            taille="sm"
            :chargement="envoi"
            libelle-chargement="Génération…"
            @click="generer"
          >
            J’ai vérifié, générer le code
          </CzButton>
        </template>
        <CzButton
          v-else
          taille="sm"
          @click="modale = false"
        >
          Fermer
        </CzButton>
      </template>
    </CzModal>
  </div>
</template>

<style scoped>
.sa-reinit {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.sa-reinit__nom {
  font-weight: 600;
  color: var(--text-strong);
}

.sa-reinit__sous {
  font-size: 12px;
  color: var(--text-muted);
}

.sa-reinit__muted {
  color: var(--text-muted);
}

.sa-reinit__carte {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
  width: 100%;
}

.sa-reinit__carte-l {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
}

.sa-reinit__confirmation {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
</style>
