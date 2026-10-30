<!--
  MgCodes — codes à remettre (mb.codes, mb.resend) : comptes de souscripteurs pas encore activés et dernier code
  d'activation émis par l'association. Écran ajouté après la maquette (ui-deviations.md, mg-codes) : composants
  existants, calqué sur SaReinitialisations.
  Onglets À remettre (compteur orange) · Remis · Tous ; tableau : souscripteur et téléphone, code (police mono) ou son
  état (expiré, bloqué), expiration, case « Remis », action « Remettre » (HandoffCard : Copier, WhatsApp, SMS,
  Imprimer la fiche avec QR) ou « Régénérer » (nouveau code, l'ancien est invalidé). « Imprimer les fiches » : une
  fiche A6 par code valide non remis. Mobile : liste de cartes.
-->
<script setup lang="ts">
import type { ColonneTable } from '~/components/cz/CzTable.vue'
import type { Onglet } from '~/components/cz/CzTabs.vue'
import type { AccesARemettre, CodeARemettre } from '~~/types'
import { messageRefus } from '~/composables/api/client'
import { formatDate, formatDateHeure, pluriel } from '~/utils/format'

definePageMeta({ middleware: 'espace-gestionnaire', layout: 'backoffice', espace: 'gestionnaire', titre: 'Codes à remettre' })
useHead({ title: 'Codes à remettre · Cotiz' })
useFilAriane(() => [{ label: 'Souscripteurs', to: '/asso/souscripteurs' }, { label: 'Codes à remettre' }])

type OngletCodes = 'a_remettre' | 'remis' | 'tous'

const route = useRoute()
const router = useRouter()
const toast = useToast()
// Gestionnaires qui inscrivent seulement (members.manage) : les autres reviennent à l'annuaire, sans appel à mb.codes.
const { peut, pret } = usePermissions()
const { data, pending, error, refresh } = useCodesARemettre({ immediat: false })
watch(pret, (p) => {
  if (!p) return
  if (peut('members.manage')) refresh()
  else router.replace('/asso/souscripteurs')
}, { immediate: true })
const { data: association } = useAssociationGestionnaire()
const { marquerRemis, regenerer } = useActionsCodes()
const { fiches, imprimer } = useImpressionFiches()

const ONGLETS: { valeur: OngletCodes, label: string }[] = [
  { valeur: 'a_remettre', label: 'À remettre' },
  { valeur: 'remis', label: 'Remis' },
  { valeur: 'tous', label: 'Tous' },
]
const onglet = computed<OngletCodes>({
  get: () => (ONGLETS.some(o => o.valeur === route.query.onglet) ? route.query.onglet as OngletCodes : 'a_remettre'),
  set: v => router.replace({ query: { ...route.query, onglet: v === 'a_remettre' ? undefined : v } }),
})
const codes = computed(() => data.value ?? [])
const dans = (c: CodeARemettre, o: OngletCodes) => o === 'tous' || (o === 'remis') === Boolean(c.remisLe)
const onglets = computed<Onglet[]>(() => ONGLETS.map((o) => {
  const n = codes.value.filter(c => dans(c, o.valeur)).length
  return { label: o.label, valeur: o.valeur, compteur: o.valeur === 'a_remettre' ? String(n) : n, tonCompteur: o.valeur === 'a_remettre' ? 'warning' : 'neutral' }
}))

const nom = (c: CodeARemettre) => `${c.souscripteur.prenom} ${c.souscripteur.nom}`.trim()
const lignes = computed(() => codes.value.filter(c => dans(c, onglet.value)).map(c => ({ id: c.id, nom: nom(c), source: c })))
const aImprimer = computed(() => codes.value.filter(c => !c.remisLe && c.acces?.lien).map(c => c.acces!))

const ETATS = {
  expire: { texte: 'Expiré', ton: 'warning' },
  bloque: { texte: 'Bloqué (trop d’essais)', ton: 'danger' },
} as const

const COLONNES: ColonneTable[] = [
  { cle: 'nom', label: 'Souscripteur', squelette: 'personne' },
  { cle: 'code', label: 'Code' },
  { cle: 'expiration', label: 'Expire le' },
  { cle: 'remis', label: 'Remis' },
  { cle: 'action', label: '' },
]
const chargement = computed(() => pending.value && !data.value)

// ---------------------------------------------------------------- Remise
const ouvert = ref<{ code: CodeARemettre, acces: AccesARemettre } | null>(null)
const modale = computed({
  get: () => ouvert.value !== null,
  set: (o) => {
    if (!o) ouvert.value = null
  },
})
function remettre(c: CodeARemettre) {
  if (c.acces) ouvert.value = { code: c, acces: c.acces }
}

const enCours = ref<string | null>(null)
async function marquer(c: CodeARemettre) {
  if (c.remisLe || enCours.value) return
  enCours.value = c.id
  try {
    const maj = await marquerRemis(c.id)
    data.value = codes.value.map(x => (x.id === maj.id ? maj : x))
    if (ouvert.value?.code.id === c.id) ouvert.value = { ...ouvert.value, code: maj }
    toast.succes('Code remis', { message: `${nom(c)} peut activer son compte.` })
  }
  catch (e) {
    toast.erreur('Le code n’a pas pu être marqué remis', { message: messageRefus(e) ?? 'Vérifiez votre connexion, puis réessayez.' })
  }
  finally {
    enCours.value = null
  }
}

async function nouveauCode(c: CodeARemettre) {
  if (enCours.value) return
  enCours.value = c.id
  try {
    const acces = await regenerer(c.souscripteur.id)
    await refresh()
    const nouveau = codes.value.find(x => x.souscripteur.id === c.souscripteur.id)
    if (nouveau) ouvert.value = { code: nouveau, acces }
  }
  catch (e) {
    toast.erreur('Aucun nouveau code n’a pu être créé', { message: messageRefus(e) ?? 'Vérifiez votre connexion, puis réessayez.' })
    await refresh()
  }
  finally {
    enCours.value = null
  }
}
</script>

<template>
  <div class="mg-codes">
    <EnTetePage
      titre="Codes à remettre"
      sous-titre="Souscripteurs dont le compte n’est pas encore activé. Remettez-leur leur code en main propre, par WhatsApp ou par SMS depuis votre téléphone."
    >
      <template #actions>
        <CzButton
          variante="secondaire"
          icone="imprimer"
          :disabled="!aImprimer.length || !association"
          @click="imprimer(aImprimer)"
        >
          Imprimer les fiches
        </CzButton>
      </template>
    </EnTetePage>

    <CzTabs
      v-model="onglet"
      :onglets="onglets"
      label="Codes d’activation"
    />

    <CzTable
      :colonnes="COLONNES"
      :lignes="lignes"
      :chargement="chargement"
      :lignes-squelette="3"
      :cliquable="false"
      :erreur="error ? 'Vérifiez votre connexion, puis réessayez.' : undefined"
      label="Codes d’activation à remettre"
      @reessayer="refresh()"
    >
      <template #cell-nom="{ ligne }">
        <span class="mg-codes__nom">{{ ligne.nom }}</span>
        <div class="mg-codes__sous">
          {{ ligne.source.souscripteur.telephone }}
        </div>
      </template>
      <template #cell-code="{ ligne }">
        <span
          v-if="ligne.source.acces"
          class="cz-mono mg-codes__code"
        >{{ ligne.source.acces.code }}</span>
        <CzBadge
          v-else
          :ton="ETATS[ligne.source.etat === 'bloque' ? 'bloque' : 'expire'].ton"
        >
          {{ ETATS[ligne.source.etat === 'bloque' ? 'bloque' : 'expire'].texte }}
        </CzBadge>
      </template>
      <template #cell-expiration="{ ligne }">
        <span class="mg-codes__muted">{{ ligne.source.acces ? formatDateHeure(ligne.source.acces.expireLe) : '—' }}</span>
      </template>
      <template #cell-remis="{ ligne }">
        <CzCheckbox
          :model-value="Boolean(ligne.source.remisLe)"
          :disabled="Boolean(ligne.source.remisLe) || !ligne.source.acces || enCours === ligne.id"
          :label="`Code remis à ${ligne.nom}`"
          @update:model-value="marquer(ligne.source)"
        />
        <div
          v-if="ligne.source.remisLe"
          class="mg-codes__sous"
        >
          le {{ formatDate(ligne.source.remisLe, 'numerique') }}
        </div>
      </template>
      <template #cell-action="{ ligne }">
        <CzButton
          v-if="ligne.source.acces"
          taille="sm"
          variante="secondaire"
          @click="remettre(ligne.source)"
        >
          {{ ligne.source.remisLe ? 'Revoir le code' : 'Remettre' }}
        </CzButton>
        <CzButton
          v-else
          taille="sm"
          variante="secondaire"
          :chargement="enCours === ligne.id"
          libelle-chargement="Création…"
          @click="nouveauCode(ligne.source)"
        >
          Régénérer
        </CzButton>
      </template>
      <template #carte="{ ligne }">
        <div class="mg-codes__carte">
          <span class="mg-codes__carte-l">
            <b>{{ ligne.nom }}</b>
            <span class="mg-codes__sous">{{ ligne.source.souscripteur.telephone }}</span>
            <span
              v-if="ligne.source.acces"
              class="mg-codes__sous"
            >Valable jusqu’au {{ formatDateHeure(ligne.source.acces.expireLe) }}</span>
          </span>
          <span
            v-if="ligne.source.acces"
            class="cz-mono mg-codes__code"
          >{{ ligne.source.acces.code }}</span>
          <CzBadge
            v-else
            :ton="ETATS[ligne.source.etat === 'bloque' ? 'bloque' : 'expire'].ton"
          >
            {{ ETATS[ligne.source.etat === 'bloque' ? 'bloque' : 'expire'].texte }}
          </CzBadge>
        </div>
        <CzButton
          v-if="ligne.source.acces"
          taille="sm"
          bloc
          @click.stop="remettre(ligne.source)"
        >
          {{ ligne.source.remisLe ? 'Revoir le code' : 'Remettre' }}
        </CzButton>
        <CzButton
          v-else
          taille="sm"
          bloc
          :chargement="enCours === ligne.id"
          libelle-chargement="Création…"
          @click.stop="nouveauCode(ligne.source)"
        >
          Régénérer
        </CzButton>
      </template>
      <template #vide>
        <CzEmpty
          v-if="onglet === 'a_remettre'"
          icone="valide"
          ton="success"
          titre="Aucun code à remettre"
          description="Les comptes créés par votre association apparaissent ici jusqu’à leur activation."
          integre
        />
        <CzEmpty
          v-else
          icone="filtre"
          ton="neutral"
          titre="Aucun code"
          description="Aucun code dans cet onglet."
          integre
        />
      </template>
    </CzTable>

    <p
      v-if="aImprimer.length"
      class="mg-codes__sous"
    >
      {{ pluriel(aImprimer.length, 'fiche') }} à imprimer (codes valides non remis).
    </p>

    <CzModal
      v-model:ouvert="modale"
      titre="Code à remettre"
      taille="md"
    >
      <HandoffCard
        v-if="ouvert"
        :remis="Boolean(ouvert.code.remisLe)"
        titre="Code d’activation"
        :destinataire="ouvert.acces.destinataire"
        :code="ouvert.acces.code"
        :expire-le="ouvert.acces.expireLe"
        :message="ouvert.acces.message"
        :whatsapp="ouvert.acces.whatsapp"
        :sms="ouvert.acces.sms"
        :lien="ouvert.acces.lien"
        :association="association?.nom"
        @update:remis="ouvert && marquer(ouvert.code)"
      />
      <template #pied>
        <CzButton
          taille="sm"
          @click="modale = false"
        >
          Fermer
        </CzButton>
      </template>
    </CzModal>

    <FichesActivation
      v-if="association"
      :fiches="fiches"
      :association="association.nom"
    />
  </div>
</template>

<style scoped>
.mg-codes {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.mg-codes__nom {
  font-weight: 600;
  color: var(--text-strong);
}

.mg-codes__code {
  font-weight: 600;
  letter-spacing: .08em;
  color: var(--brand-dark);
}

.mg-codes__sous {
  font-size: 12px;
  color: var(--text-muted);
}

.mg-codes__muted {
  color: var(--text-muted);
}

.mg-codes__carte {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
  width: 100%;
}

.mg-codes__carte-l {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
}
</style>
