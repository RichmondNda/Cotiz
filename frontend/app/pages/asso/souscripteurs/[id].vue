<!--
  MgSouscripteur — fiche souscripteur : tout savoir sur un membre avant de l'appeler.
  Desktop : colonne identité (grand avatar, nom, statut global, téléphone avec Appeler / Copier, email, adresse,
  membre depuis ; Envoyer une relance, Renvoyer les identifiants, Modifier) ; onglets Projets (une carte par projet :
  cases d'échéances, versé, reste, statut) · Historique (frise complète) · Contrats (signature et document).
  Mobile : en-tête « Membre depuis… » avec menu (identifiants, modifier), carte identité, Appeler / Relancer, onglets.
  États : en retard (Moussa Diarra), à jour (Awa Koné), contrat non signé (Fatou Traoré) (+ `chargement`, `erreur`).
  Onglet dans l'URL (`?onglet=historique`).
-->
<script setup lang="ts">
import type { ElementMenu } from '~/components/cz/CzMenu.vue'
import type { EvenementFrise } from '~/components/metier/Frise.vue'
import type { AccesARemettre } from '~~/types'
import { codeErreur, messageRefus } from '~/composables/api/client'
import { estDate, formatDate, formatMois } from '~/utils/format'
import { STATUTS_SOUSCRIPTION } from '~/utils/statuts'

definePageMeta({ middleware: 'espace-gestionnaire', layout: 'backoffice', espace: 'gestionnaire', titre: 'Souscripteur' })

type Onglet = 'projets' | 'historique' | 'contrats'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const id = computed(() => String(route.params.id))
const { data: fiche, pending, error, refresh } = useSouscripteur(id)
const { modifier, renvoyerIdentifiants } = useActionsSouscripteur()
const { data: association } = useAssociationGestionnaire()
const envoyerRelance = useEnvoiRelance()

const s = computed(() => fiche.value?.souscripteur)
const nom = computed(() => (s.value ? `${s.value.prenom} ${s.value.nom}` : ''))
useHead({ title: () => (nom.value ? `${nom.value} · Cotiz` : 'Souscripteur · Cotiz') })
useFilAriane(() => [{ label: 'Souscripteurs', to: '/asso/souscripteurs' }, ...(nom.value ? [{ label: nom.value }] : [])])

const ONGLETS: Onglet[] = ['projets', 'historique', 'contrats']
const onglet = computed<string | undefined>({
  get: () => (ONGLETS.includes(route.query.onglet as Onglet) ? route.query.onglet as string : 'projets'),
  set: v => router.replace({ query: { ...route.query, onglet: v === 'projets' ? undefined : v } }),
})
const ongletMobile = computed<Onglet>({
  get: () => onglet.value as Onglet,
  set: v => (onglet.value = v),
})
const OPTIONS_ONGLETS: { valeur: Onglet, label: string }[] = [
  { valeur: 'projets', label: 'Projets' },
  { valeur: 'historique', label: 'Historique' },
  { valeur: 'contrats', label: 'Contrats' },
]

const statut = computed(() => (fiche.value ? STATUTS_SOUSCRIPTION[fiche.value.statutGlobal] : null))
const tonAvatar = computed(() => (fiche.value?.statutGlobal === 'en_retard' ? 'danger' : fiche.value?.statutGlobal === 'signature_attendue' ? 'warning' : 'brand'))
const membreDepuis = computed(() => (fiche.value && estDate(fiche.value.membreDepuis) ? formatMois(fiche.value.membreDepuis).toLowerCase() : fiche.value?.membreDepuis ?? ''))
const telLien = computed(() => (s.value && /^\+?[\d\s]+$/.test(s.value.telephone) ? `tel:${s.value.telephone.replace(/\s/g, '')}` : undefined))

const evenements = computed<EvenementFrise[]>(() => (fiche.value?.historique ?? []).map(e => ({ id: e.id, titre: e.titre, detail: e.detail, ton: e.ton })))
const contrats = computed(() => (fiche.value?.souscriptions ?? []).map(x => ({
  id: x.id,
  projet: x.projet.nom,
  signe: Boolean(x.contratSigneLe),
  signature: x.contratSigneLe ? `Signé le ${estDate(x.contratSigneLe) ? formatDate(x.contratSigneLe, 'numerique') : x.contratSigneLe}` : 'En attente',
  lien: `/asso/projets/${x.projetId}/contrat`,
})))

// ---------------------------------------------------------------- Actions
const envoi = ref<'relance' | 'identifiants' | null>(null)

async function relancer() {
  const f = fiche.value
  if (!f || envoi.value) return
  envoi.value = 'relance'
  try {
    const projet = f.souscriptions.find(x => x.statut === 'en_retard') ?? f.souscriptions[0]
    await envoyerRelance({ souscripteurIds: [f.souscripteur.id], projetId: projet?.projetId })
    toast.succes('Relance envoyée', { message: `${nom.value} a reçu une notification dans son espace.` })
  }
  catch {
    toast.erreur('La relance n’a pas pu être envoyée', { message: 'Vérifiez votre connexion, puis réessayez.' })
  }
  finally {
    envoi.value = null
  }
}

/** Nouveau code d'activation (l'ancien est invalidé), à remettre soi-même : carte « Code d'activation ». */
const codeRenvoye = ref<AccesARemettre | null>(null)
async function renvoyer() {
  if (!s.value || envoi.value) return
  if (!fiche.value?.activationEnAttente) {
    toast.info('Compte déjà activé', { message: `${nom.value} se connecte avec son mot de passe.` })
    return
  }
  envoi.value = 'identifiants'
  try {
    codeRenvoye.value = await renvoyerIdentifiants(s.value.id)
  }
  catch (e) {
    toast.erreur('Aucun nouveau code n’a pu être créé', { message: messageRefus(e) ?? 'Vérifiez votre connexion, puis réessayez.' })
  }
  finally {
    envoi.value = null
  }
}

const copie = ref(false)
async function copierTelephone() {
  if (!s.value) return
  try {
    await navigator.clipboard.writeText(s.value.telephone)
    copie.value = true
    setTimeout(() => (copie.value = false), 1500)
  }
  catch {
    // Presse-papiers indisponible : rien à faire.
  }
}

// ---------------------------------------------------------------- Modifier
const edition = ref(false)
const email = ref('')
const adresse = ref('')
const erreurEmail = ref('')
const enregistrement = ref(false)
function ouvrirEdition() {
  email.value = s.value?.email && !s.value.email.startsWith('[') ? s.value.email : ''
  adresse.value = s.value?.adresse ?? ''
  erreurEmail.value = ''
  edition.value = true
}
async function enregistrer() {
  if (!s.value) return
  enregistrement.value = true
  erreurEmail.value = ''
  try {
    fiche.value = await modifier(s.value.id, { email: email.value, adresse: adresse.value }, fiche.value!.version)
    edition.value = false
    toast.succes('Coordonnées enregistrées')
  }
  catch (e) {
    if (codeErreur(e) === 'email-invalide') erreurEmail.value = 'Saisissez une adresse email valide (ex. nom@exemple.ci).'
    else toast.erreur('Les coordonnées n’ont pas pu être enregistrées', { message: messageRefus(e) ?? 'Vérifiez votre connexion, puis réessayez.' })
  }
  finally {
    enregistrement.value = false
  }
}

const menuMobile = computed<ElementMenu[]>(() => [
  { label: 'Renvoyer les identifiants', icone: 'email', action: renvoyer },
  { label: 'Modifier', icone: 'modifier', action: ouvrirEdition },
])
</script>

<template>
  <div class="fiche">
    <EnTeteGestionnaireMobile
      :titre="nom || 'Souscripteur'"
      :sous-titre="membreDepuis ? `Membre depuis ${membreDepuis}` : undefined"
      retour="/asso/souscripteurs"
      :cloche="false"
    >
      <template
        v-if="fiche"
        #actions
      >
        <CzMenu
          :elements="menuMobile"
          :label="`Autres actions sur ${nom}`"
        >
          <template #declencheur="{ basculer, attrs }">
            <CzButton
              variante="icone"
              icone="actions"
              nu
              :label="`Autres actions sur ${nom}`"
              v-bind="attrs"
              @click="basculer"
            />
          </template>
        </CzMenu>
      </template>
    </EnTeteGestionnaireMobile>

    <div
      v-if="pending && !fiche"
      class="fiche__grille"
      aria-busy="true"
    >
      <CzSkeleton :hauteur="480" />
      <div class="fiche__colonne">
        <CzSkeleton :hauteur="44" />
        <CzSkeleton :hauteur="140" />
      </div>
    </div>

    <CzErreurChargement
      v-else-if="error || !fiche || !s"
      titre="Impossible d’afficher ce souscripteur"
      :erreur="error"
      :introuvable="{ titre: 'Souscripteur introuvable', description: 'Ce souscripteur n’existe pas ou a été retiré.', retour: { label: 'Voir les souscripteurs', to: '/asso/souscripteurs' } }"
      @reessayer="refresh()"
    />

    <div
      v-else
      class="fiche__grille"
    >
      <!-- Identité -->
      <aside
        class="cz-card fiche__identite"
        aria-label="Identité"
      >
        <div class="fiche__entete">
          <CzAvatar
            :nom="nom"
            :ton="tonAvatar"
            taille="lg"
            class="fiche__avatar"
          />
          <div class="fiche__qui">
            <b class="fiche__nom cz-desktop">{{ nom }}</b>
            <span class="cz-mono fiche__tel-mobile cz-mobile">{{ s.telephone }}</span>
            <span class="fiche__email-mobile cz-mobile">{{ s.email ?? '—' }}</span>
          </div>
          <CzBadge
            v-if="statut"
            :ton="statut.ton"
            class="fiche__statut cz-desktop"
          >
            {{ statut.libelle }}
          </CzBadge>
          <CzBadge
            v-if="statut"
            :ton="statut.ton"
            petit
            class="fiche__statut cz-mobile"
          >
            {{ statut.libelle }}
          </CzBadge>
        </div>

        <dl class="fiche__coordonnees cz-desktop">
          <dt>Téléphone</dt>
          <dd class="fiche__tel">
            <span class="cz-mono">{{ s.telephone }}</span>
            <span class="fiche__tel-actions">
              <CzButton
                v-if="telLien"
                variante="icone"
                taille="sm"
                icone="telephone"
                :label="`Appeler ${nom}`"
                :href="telLien"
              />
              <CzButton
                variante="icone"
                taille="sm"
                :icone="copie ? 'coche' : 'copier'"
                :label="copie ? 'Copié' : 'Copier le numéro'"
                @click="copierTelephone"
              />
            </span>
          </dd>
          <dt>Email</dt>
          <dd>{{ s.email ?? '—' }}</dd>
          <dt>Adresse</dt>
          <dd>{{ s.adresse ?? '—' }}</dd>
          <dt>Membre depuis</dt>
          <dd>{{ membreDepuis }}</dd>
        </dl>

        <div class="fiche__actions cz-desktop">
          <CzButton
            bloc
            icone="relance"
            :chargement="envoi === 'relance'"
            libelle-chargement="Envoi…"
            @click="relancer"
          >
            Envoyer une relance
          </CzButton>
          <CzButton
            variante="secondaire"
            bloc
            :chargement="envoi === 'identifiants'"
            libelle-chargement="Création du code…"
            @click="renvoyer"
          >
            Renvoyer les identifiants
          </CzButton>
          <CzButton
            variante="fantome"
            bloc
            @click="ouvrirEdition"
          >
            Modifier
          </CzButton>
        </div>
      </aside>

      <div class="fiche__actions-mobile cz-mobile">
        <CzButton
          variante="secondaire"
          :href="telLien"
          :disabled="!telLien"
        >
          Appeler
        </CzButton>
        <CzButton
          :chargement="envoi === 'relance'"
          libelle-chargement="Envoi…"
          @click="relancer"
        >
          Relancer
        </CzButton>
      </div>

      <!-- Onglets -->
      <section class="fiche__colonne">
        <CzTabs
          v-model="onglet"
          :onglets="OPTIONS_ONGLETS"
          label="Fiche du souscripteur"
          class="cz-desktop"
        />
        <CzSegmented
          v-model="ongletMobile"
          :options="OPTIONS_ONGLETS"
          label="Fiche du souscripteur"
          pleine-largeur
          class="cz-mobile"
        />

        <div
          v-if="onglet === 'projets'"
          class="fiche__projets"
        >
          <CarteSouscriptionFiche
            v-for="x in fiche.souscriptions"
            :key="x.id"
            :souscription="x"
          />
          <CzEmpty
            v-if="!fiche.souscriptions.length"
            icone="projet"
            titre="Aucun projet"
            description="Ce souscripteur n’est inscrit à aucun projet de l’association."
          />
        </div>

        <div
          v-else-if="onglet === 'historique'"
          class="cz-card fiche__historique"
        >
          <Frise
            v-if="evenements.length"
            :evenements="evenements"
            :label="`Historique de ${nom}`"
          />
          <CzEmpty
            v-else
            icone="historique"
            titre="Aucun événement"
            integre
          />
        </div>

        <template v-else>
          <ul class="cz-card fiche__contrats-mobile cz-mobile">
            <li
              v-for="c in contrats"
              :key="c.id"
            >
              <span class="fiche__contrat-projet">{{ c.projet }}</span>
              <CzBadge
                :ton="c.signe ? 'success' : 'warning'"
                petit
              >
                {{ c.signature }}
              </CzBadge>
              <NuxtLink
                :to="c.lien"
                class="fiche__lien"
              >
                {{ c.signe ? 'PDF' : 'Voir le contrat' }}
              </NuxtLink>
            </li>
          </ul>
          <div class="cz-table-wrap cz-desktop">
            <table
              class="cz-table"
              :aria-label="`Contrats de ${nom}`"
            >
              <thead>
                <tr>
                  <th>Projet</th>
                  <th>Signature</th>
                  <th>Document</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="c in contrats"
                  :key="c.id"
                >
                  <td class="fiche__contrat-projet">
                    {{ c.projet }}
                  </td>
                  <td>
                    <CzBadge :ton="c.signe ? 'success' : 'warning'">
                      {{ c.signature }}
                    </CzBadge>
                  </td>
                  <td>
                    <NuxtLink
                      :to="c.lien"
                      class="fiche__lien"
                    >
                      {{ c.signe ? 'PDF' : 'Voir le contrat' }}
                    </NuxtLink>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
      </section>
    </div>

    <CzModal
      v-model:ouvert="edition"
      :titre="`Modifier les coordonnées de ${nom}`"
      taille="md"
    >
      <form
        id="form-coordonnees"
        class="fiche__form"
        novalidate
        @submit.prevent="enregistrer"
      >
        <CzField
          label="Téléphone"
          aide="Identifiant de connexion du souscripteur : il n’est pas modifiable."
        >
          <CzInput
            :model-value="s?.telephone ?? ''"
            readonly
            mono
          />
        </CzField>
        <CzField
          label="Email"
          :erreur="erreurEmail || undefined"
        >
          <CzInput
            v-model="email"
            type="email"
            placeholder="nom@exemple.ci"
            autocomplete="off"
          />
        </CzField>
        <CzField label="Adresse">
          <CzInput
            v-model="adresse"
            placeholder="Quartier, ville"
          />
        </CzField>
      </form>
      <template #pied>
        <CzButton
          variante="fantome"
          @click="edition = false"
        >
          Annuler
        </CzButton>
        <CzButton
          type="submit"
          form="form-coordonnees"
          :chargement="enregistrement"
          libelle-chargement="Enregistrement…"
          @click="enregistrer"
        >
          Enregistrer
        </CzButton>
      </template>
    </CzModal>

    <CzModal
      :ouvert="codeRenvoye !== null"
      titre="Nouveau code d’activation"
      taille="md"
      @update:ouvert="(o: boolean) => { if (!o) codeRenvoye = null }"
    >
      <HandoffCard
        v-if="codeRenvoye"
        titre="Code d’activation"
        :destinataire="codeRenvoye.destinataire"
        :code="codeRenvoye.code"
        :expire-le="codeRenvoye.expireLe"
        :message="codeRenvoye.message"
        :whatsapp="codeRenvoye.whatsapp"
        :sms="codeRenvoye.sms"
        :lien="codeRenvoye.lien"
        :association="association?.nom"
      />
      <template #pied>
        <CzButton @click="codeRenvoye = null">
          Terminer
        </CzButton>
      </template>
    </CzModal>
  </div>
</template>

<style scoped>
.fiche {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.fiche__grille {
  display: grid;
  grid-template-columns: 340px minmax(0, 1fr);
  gap: 20px;
  align-items: start;
}

.fiche__identite {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-6);
}

.fiche__entete {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  text-align: center;
}

.fiche__avatar {
  width: 80px;
  height: 80px;
  font-size: 26px;
}

.fiche__nom {
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 600;
  color: var(--text-strong);
}

.fiche__coordonnees {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: var(--space-3) 18px;
  margin: 0;
  font-size: 13.5px;
}

.fiche__coordonnees dt {
  color: var(--text-muted);
}

.fiche__coordonnees dd {
  margin: 0;
  color: var(--text-strong);
  overflow-wrap: anywhere;
}

.fiche__tel {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
}

.fiche__tel .cz-mono {
  flex: 1;
  line-height: 1.6;
}

.fiche__tel-actions {
  display: flex;
  gap: 6px;
}

.fiche__actions {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.fiche__colonne {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  min-width: 0;
}

.fiche__projets {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.fiche__historique {
  padding: 22px;
}

.fiche__contrat-projet {
  font-weight: 600;
  color: var(--text-strong);
}

.fiche__lien {
  font-weight: 600;
  color: var(--brand-dark);
  text-decoration: none;
}

.fiche__contrats-mobile {
  margin: 0;
  padding: 0 var(--space-4);
  list-style: none;
}

.fiche__contrats-mobile li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2) var(--space-3);
  padding: 14px 0;
}

.fiche__contrats-mobile li + li {
  border-top: 1px solid var(--divider-row);
}

.fiche__contrats-mobile .fiche__contrat-projet {
  flex-basis: 100%;
}

.fiche__contrats-mobile .fiche__lien {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  margin-left: auto;
}

.fiche__form {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

@media (max-width: 1023px) {
  .fiche__grille {
    grid-template-columns: 280px minmax(0, 1fr);
  }
}

@media (max-width: 767px) {
  .fiche {
    gap: var(--space-3);
  }

  .fiche__grille {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-3);
  }

  .fiche__identite {
    padding: 20px var(--space-6);
  }

  .fiche__entete {
    flex-direction: row;
    align-items: center;
    gap: var(--space-4);
    text-align: left;
  }

  .fiche__avatar {
    width: 56px;
    height: 56px;
    font-size: 20px;
  }

  .fiche__qui {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: var(--space-1);
    min-width: 0;
  }

  .fiche__tel-mobile {
    font-size: 14px;
    white-space: nowrap;
    color: var(--text-strong);
  }

  .fiche__email-mobile {
    font-size: 12.5px;
    color: var(--text-muted);
  }

  .fiche__statut {
    align-self: flex-start;
    margin-top: var(--space-2);
  }

  .fiche__actions-mobile {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-2);
  }

  .fiche__actions-mobile > * {
    min-height: 44px;
  }

  .fiche__colonne {
    gap: var(--space-3);
  }

  .fiche__historique {
    padding: var(--space-4);
  }
}
</style>
