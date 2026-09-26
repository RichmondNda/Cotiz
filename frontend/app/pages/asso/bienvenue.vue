<!--
  MgOnboarding — premier accès d'une gestionnaire : un espace configuré et un premier projet, sans se perdre.
  Plein écran, sans barre latérale : logo, progression en 4 étapes, « Terminer plus tard » (→ tableau de bord).
  1 Bienvenue · 2 Votre association (logo, nom, description, ville, contacts) · 3 Moyens de paiement (cases,
  coordonnées de chaque moyen retenu, aperçu côté souscripteur) · 4 C'est prêt (récapitulatif, deux choix).
  Chaque étape est enregistrée à la validation (`PATCH /api/associations/:id`).
  Mobile : une étape par écran, progression en segments, barre d'action fixe en bas.
-->
<script setup lang="ts">
import type { FichierDepose } from '~/components/cz/CzFileDrop.vue'
import type { ModalitePaiement, MoyenPaiement } from '~~/types'
import { emailValide } from '~/utils/validation'
import { MOYENS_PAIEMENT } from '~/utils/statuts'

definePageMeta({ middleware: 'espace-gestionnaire', layout: false })
useHead({ title: 'Bienvenue · Cotiz', bodyAttrs: { 'data-theme': 'manager' } })

const { data: moi, error: erreurMoi, refresh: rechargerMoi } = useMoi()
const { data: association, error: erreurAssociation, refresh: rechargerAssociation } = useAssociationGestionnaire()
const modifier = useModificationAssociation()
const toast = useToast()

/** Rien ne s'enregistre ni n'avance tant que l'association et la session ne sont pas chargées. */
const pret = computed(() => Boolean(association.value && moi.value))
const erreur = computed(() => Boolean(erreurAssociation.value || erreurMoi.value))
function recharger() {
  rechargerAssociation()
  rechargerMoi()
}

const ETAPES = ['Bienvenue', 'Votre association', 'Moyens de paiement', 'C’est prêt'] as const
const etape = ref(1)
const pourcentage = computed(() => etape.value * 25)
const prenom = computed(() => moi.value?.prenom ?? '')

// ---------------------------------------------------------------- Formulaire (pré-rempli par l'association)
const profil = reactive({ nom: '', description: '', ville: '', telephone: '', email: '' })
const logo = ref<FichierDepose | null>(null)
const moyens = reactive<Record<MoyenPaiement, { actif: boolean, valeur: string }>>({
  virement: { actif: false, valeur: '' },
  mobile_money: { actif: false, valeur: '' },
  // Valeur d'exemple de la maquette, proposée si l'association n'a pas encore d'instructions.
  especes: { actif: false, valeur: 'Remise au trésorier lors de la réunion mensuelle' },
})
const CHAMPS_MOYENS: Record<MoyenPaiement, string> = {
  virement: 'IBAN',
  mobile_money: 'Numéro et opérateur',
  especes: 'Instructions',
}
const ORDRE: MoyenPaiement[] = ['virement', 'mobile_money', 'especes']

watch(association, (a) => {
  if (!a) return
  Object.assign(profil, {
    nom: a.nom,
    description: a.description ?? '',
    ville: a.ville,
    telephone: a.telephoneContact ?? '',
    email: a.emailContact ?? '',
  })
  for (const m of a.modalitesPaiement) {
    const valeur = m.moyen === 'virement'
      ? m.iban
      : m.moyen === 'mobile_money' ? [m.numeroMobileMoney, m.operateur].filter(Boolean).join(' · ') : m.instructions
    moyens[m.moyen] = { actif: true, valeur: valeur ?? moyens[m.moyen].valeur }
  }
}, { immediate: true })

const tentee = ref(false)
const erreurs = computed(() => {
  if (!tentee.value) return {}
  const e: Record<string, string> = {}
  if (etape.value === 2) {
    if (!profil.nom.trim()) e.nom = 'Indiquez le nom de l’association.'
    if (profil.email.trim() && !emailValide(profil.email)) e.email = 'Adresse email invalide.'
  }
  if (etape.value === 3 && !ORDRE.some(m => moyens[m].actif)) e.moyens = 'Choisissez au moins un moyen de paiement.'
  return e
})

const moyensRetenus = computed(() => ORDRE.filter(m => moyens[m].actif))
const apercu = computed(() => moyensRetenus.value.map(m => ({ libelle: MOYENS_PAIEMENT[m], valeur: moyens[m].valeur })))
const resumeMoyens = computed(() => moyensRetenus.value.map(m => MOYENS_PAIEMENT[m]).join(', ') || 'Aucun')

function modalites(): ModalitePaiement[] {
  return moyensRetenus.value.map((moyen): ModalitePaiement => {
    const valeur = moyens[moyen].valeur.trim() || undefined
    if (moyen === 'virement') return { moyen, iban: valeur }
    if (moyen === 'mobile_money') {
      const [numero, operateur] = (valeur ?? '').split(' · ')
      return { moyen, numeroMobileMoney: numero || undefined, operateur: operateur || undefined }
    }
    return { moyen, instructions: valeur }
  })
}

// ---------------------------------------------------------------- Navigation
const envoi = ref(false)

async function continuer() {
  if (!association.value) return
  tentee.value = true
  if (Object.keys(erreurs.value).length) return
  if (etape.value === 2 || etape.value === 3) {
    envoi.value = true
    try {
      await modifier(association.value.id, etape.value === 2
        ? {
            nom: profil.nom.trim(),
            description: profil.description.trim() || undefined,
            ville: profil.ville.trim(),
            telephoneContact: profil.telephone.trim() || undefined,
            emailContact: profil.email.trim() || undefined,
            logoUrl: logo.value ? `[LOGO] ${logo.value.nom}` : undefined,
          }
        : { modalitesPaiement: modalites() })
    }
    catch {
      toast.erreur('Enregistrement impossible', { message: 'Vérifiez votre connexion, puis réessayez.' })
      return
    }
    finally {
      envoi.value = false
    }
  }
  tentee.value = false
  etape.value = Math.min(ETAPES.length, etape.value + 1)
  if (import.meta.client) window.scrollTo({ top: 0 })
}

function retour() {
  tentee.value = false
  etape.value = Math.max(1, etape.value - 1)
}
</script>

<template>
  <div
    class="onboarding"
    data-theme="manager"
  >
    <LienEvitement />

    <!-- En-tête desktop : logo, progression, « Terminer plus tard » -->
    <header class="onboarding__entete cz-desktop">
      <CzLogo
        :taille="28"
        :taille-texte="19"
      />
      <div class="onboarding__progression">
        <div class="onboarding__progression-texte">
          <b>Étape {{ etape }} sur {{ ETAPES.length }} — {{ ETAPES[etape - 1] }}</b>
          <span>{{ pourcentage }}&nbsp;%</span>
        </div>
        <CzProgress
          :valeur="pourcentage"
          :label="`Étape ${etape} sur ${ETAPES.length}`"
        />
      </div>
      <NuxtLink
        to="/asso"
        class="onboarding__plus-tard"
      >
        Terminer plus tard
      </NuxtLink>
    </header>

    <!-- En-tête mobile -->
    <EnTeteMobile
      class="cz-mobile"
      titre="Bienvenue sur Cotiz"
      :sous-titre="`Étape ${etape} sur ${ETAPES.length} · ${ETAPES[etape - 1]}`"
    />

    <main
      id="contenu"
      class="onboarding__contenu"
    >
      <CzEtapesSegments
        :total="ETAPES.length"
        :courante="etape"
        class="cz-mobile"
      />

      <!-- Chargement / erreur -->
      <CzEmpty
        v-if="erreur"
        icone="alerte"
        ton="danger"
        titre="Impossible de charger votre association"
        description="Vérifiez votre connexion, puis réessayez."
        class="onboarding__carte"
      >
        <template #action>
          <CzButton
            variante="secondaire"
            @click="recharger"
          >
            Réessayer
          </CzButton>
        </template>
      </CzEmpty>
      <CzCard
        v-else-if="!pret"
        class="onboarding__carte onboarding__carte--centre"
        aria-busy="true"
      >
        <CzSkeleton
          :largeur="96"
          :hauteur="96"
          forme="rond"
        />
        <CzSkeleton
          :hauteur="24"
          largeur="60%"
        />
        <CzSkeleton
          :hauteur="14"
          largeur="45%"
        />
      </CzCard>

      <!-- 1. Bienvenue -->
      <CzCard
        v-else-if="etape === 1"
        class="onboarding__carte onboarding__carte--centre"
      >
        <CzLogo
          variante="symbole"
          :taille="120"
          class="cz-desktop"
        />
        <span class="onboarding__tuile cz-mobile">
          <CzIcon
            nom="accueil"
            :taille="32"
          />
        </span>
        <h1 class="onboarding__h1">
          <span class="cz-desktop">Bienvenue sur Cotiz, {{ prenom }} !</span>
          <span class="cz-mobile">Bienvenue, {{ prenom }} !</span>
        </h1>
        <p class="onboarding__texte cz-desktop">
          En 3 minutes, configurons l’espace d’{{ association?.nom }}.
        </p>
        <p class="onboarding__texte cz-mobile">
          L’espace d’{{ association?.nom }} est prêt. En 3 étapes, complétez votre profil d’association et vos moyens de paiement.
        </p>
        <CzButton
          taille="lg"
          class="cz-desktop"
          @click="continuer"
        >
          Commencer
        </CzButton>
      </CzCard>

      <!-- 2. Votre association -->
      <CzCard
        v-else-if="etape === 2"
        class="onboarding__carte"
      >
        <h1 class="onboarding__h1 onboarding__h1--gauche">
          Votre association
        </h1>
        <div class="onboarding__logo">
          <CzAvatar
            v-if="logo"
            :nom="profil.nom"
            org
            class="onboarding__avatar"
          />
          <CzFileDrop
            v-model="logo"
            accept="image/png,image/jpeg"
            formats="PNG ou JPG · recadrage carré"
            label="Logo de l’association"
            class="onboarding__depot"
          >
            <span class="cz-desktop">Déposez votre logo ou parcourez vos fichiers</span>
            <span class="cz-mobile">Ajouter le logo de l’association</span>
          </CzFileDrop>
        </div>
        <CzField
          label="Nom de l’association"
          :erreur="erreurs.nom"
        >
          <CzInput v-model="profil.nom" />
        </CzField>
        <CzField label="Description courte">
          <CzInput
            v-model="profil.description"
            type="textarea"
            :lignes="3"
          />
        </CzField>
        <div class="onboarding__grille3">
          <CzField label="Ville">
            <CzInput v-model="profil.ville" />
          </CzField>
          <CzField label="Téléphone de contact">
            <CzInput
              v-model="profil.telephone"
              inputmode="tel"
              autocomplete="tel"
            />
          </CzField>
          <CzField
            label="Email de contact"
            :erreur="erreurs.email"
          >
            <CzInput
              v-model="profil.email"
              type="email"
              autocomplete="email"
            />
          </CzField>
        </div>
        <div class="onboarding__nav cz-desktop">
          <CzButton
            variante="fantome"
            @click="retour"
          >
            Retour
          </CzButton>
          <CzButton
            :chargement="envoi"
            libelle-chargement="Enregistrement…"
            @click="continuer"
          >
            Continuer
          </CzButton>
        </div>
      </CzCard>

      <!-- 3. Moyens de paiement -->
      <CzCard
        v-else-if="etape === 3"
        class="onboarding__carte onboarding__carte--paiements"
      >
        <div class="onboarding__paiements">
          <div class="onboarding__moyens">
            <h1 class="onboarding__h1 onboarding__h1--gauche onboarding__h1--moyen">
              Comment vos membres vous paient
            </h1>
            <p class="onboarding__aide cz-mobile">
              Les paiements ne transitent pas par Cotiz : ces informations sont affichées à vos souscripteurs.
            </p>
            <CzField :erreur="erreurs.moyens">
              <div
                class="onboarding__liste-moyens"
                role="group"
                aria-label="Moyens de paiement"
              >
                <div
                  v-for="m in ORDRE"
                  :key="m"
                  class="onboarding__moyen"
                >
                  <CzCheckbox v-model="moyens[m].actif">
                    <b>{{ MOYENS_PAIEMENT[m] }}</b>
                  </CzCheckbox>
                  <CzField
                    v-if="moyens[m].actif"
                    :label="CHAMPS_MOYENS[m]"
                  >
                    <CzInput v-model="moyens[m].valeur" />
                  </CzField>
                </div>
              </div>
            </CzField>
          </div>
          <ApercuCommentPayer
            :association="profil.nom"
            :moyens="apercu"
            class="cz-desktop"
          />
        </div>
        <div class="onboarding__nav cz-desktop">
          <CzButton
            variante="fantome"
            @click="retour"
          >
            Retour
          </CzButton>
          <CzButton
            :chargement="envoi"
            libelle-chargement="Enregistrement…"
            @click="continuer"
          >
            Continuer
          </CzButton>
        </div>
      </CzCard>

      <!-- 4. C'est prêt -->
      <CzCard
        v-else
        class="onboarding__carte"
      >
        <span class="cz-mobile onboarding__succes">
          <CzIconeSucces :taille="72" />
        </span>
        <h1 class="onboarding__h1 onboarding__h1--gauche">
          C’est prêt !
        </h1>
        <dl class="onboarding__recap cz-desktop">
          <dt>Association</dt><dd>{{ profil.nom }} · {{ profil.ville }}</dd>
          <dt>Contact</dt><dd>{{ profil.email || profil.telephone || '—' }}</dd>
          <dt>Moyens de paiement</dt><dd>{{ resumeMoyens }}</dd>
        </dl>
        <p class="onboarding__texte cz-mobile">
          Moyens de paiement : {{ resumeMoyens.toLowerCase() }}. Créez maintenant votre premier projet.
        </p>
        <div class="onboarding__choix cz-desktop">
          <NuxtLink
            to="/asso/projets/nouveau"
            class="cz-card is-clickable onboarding__choix-carte onboarding__choix-carte--primaire"
          >
            <span class="onboarding__choix-icone onboarding__choix-icone--primaire"><CzIcon nom="ajouter" /></span>
            <b class="onboarding__choix-titre">Créer mon premier projet</b>
            <span class="onboarding__choix-texte">Montant, fréquence, durée : on vous guide.</span>
          </NuxtLink>
          <NuxtLink
            to="/asso"
            class="cz-card is-clickable onboarding__choix-carte"
          >
            <span class="onboarding__choix-icone"><CzIcon nom="voir" /></span>
            <b class="onboarding__choix-titre">Découvrir l’espace d’abord</b>
            <span class="onboarding__choix-texte">Accéder au tableau de bord.</span>
          </NuxtLink>
        </div>
        <CzButton
          variante="secondaire"
          bloc
          to="/asso/projets/nouveau"
          class="cz-mobile"
        >
          Créer un projet
        </CzButton>
      </CzCard>
    </main>

    <!-- Barre d'action mobile -->
    <BarreActionMobile
      :precedent="etape > 1 && etape < ETAPES.length"
      @precedent="retour"
    >
      <CzButton
        v-if="etape < ETAPES.length"
        :chargement="envoi"
        :disabled="!pret"
        libelle-chargement="Enregistrement…"
        @click="continuer"
      >
        {{ etape === 1 ? 'Commencer' : 'Continuer' }}
      </CzButton>
      <CzButton
        v-else
        to="/asso"
      >
        Accéder au tableau de bord
      </CzButton>
    </BarreActionMobile>
  </div>
</template>

<style scoped>
.onboarding {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: var(--page);
}

.onboarding__entete {
  display: flex;
  align-items: center;
  gap: var(--space-8);
  height: 72px;
  padding: 0 var(--space-12);
  background: var(--surface);
  box-shadow: var(--shadow);
}

.onboarding__progression {
  flex: 1;
  max-width: 520px;
  margin: 0 auto;
}

.onboarding__progression-texte {
  display: flex;
  justify-content: space-between;
  margin-bottom: 6px;
  font-size: 13px;
}

.onboarding__progression-texte span {
  color: var(--text-muted);
}

.onboarding__plus-tard {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  font-size: 14px;
  font-weight: 600;
  color: var(--brand-dark);
  text-decoration: none;
}

.onboarding__plus-tard:hover {
  color: var(--ink-title);
}

.onboarding__contenu {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  padding: var(--space-12);
}

.onboarding__carte {
  display: flex;
  flex-direction: column;
  gap: 22px;
  width: 100%;
  max-width: 720px;
  padding: 40px;
}

.onboarding__carte--centre {
  align-items: center;
  gap: var(--space-4);
  padding-top: 56px;
  padding-bottom: 56px;
  text-align: center;
}

.onboarding__h1 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 28px;
  font-weight: 600;
  color: var(--text-strong);
}

.onboarding__h1--moyen {
  font-size: 24px;
  line-height: 1.6;
}

.onboarding__texte {
  margin: 0;
  font-size: 16px;
  line-height: 1.6;
  color: var(--text-muted);
}

.onboarding__aide {
  margin: 0;
  font-size: 13.5px;
  line-height: 1.6;
  color: var(--text-muted);
}

.onboarding__tuile {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 72px;
  height: 72px;
  border-radius: 20px;
  background: var(--brand-pale);
  color: var(--brand-dark);
}

.onboarding__logo {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.onboarding__avatar {
  flex-shrink: 0;
  width: 72px;
  height: 72px;
  font-size: 22px;
}

.onboarding__depot {
  flex: 1;
}

.onboarding__grille3 {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.onboarding__nav {
  display: flex;
  justify-content: space-between;
  padding-top: var(--space-4);
  border-top: 1px solid var(--divider);
}

.onboarding__paiements {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr);
  gap: var(--space-6);
}

.onboarding__moyens,
.onboarding__liste-moyens {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.onboarding__moyen {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: var(--space-3) 14px;
  border: 1.5px solid var(--border);
  border-radius: var(--r-md);
}

.onboarding__moyen :deep(.cz-check) {
  min-height: 36px;
  font-size: 14.5px;
}

.onboarding__recap {
  display: grid;
  grid-template-columns: 160px 1fr;
  gap: var(--space-2) 14px;
  margin: 0;
  padding: var(--space-4);
  border-radius: var(--r-md);
  background: var(--surface-subtle);
  font-size: 14px;
}

.onboarding__recap dt {
  color: var(--text-muted);
}

.onboarding__recap dd {
  margin: 0;
  font-weight: 700;
  color: var(--text-strong);
}

.onboarding__choix {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-4);
}

.onboarding__choix-carte {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: 22px;
  color: inherit;
  text-decoration: none;
}

.onboarding__choix-carte--primaire {
  border: 2px solid var(--brand);
}

.onboarding__choix-carte:focus-visible {
  outline: none;
  box-shadow: var(--shadow), 0 0 0 3px var(--brand);
}

.onboarding__choix-icone {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: var(--r-md);
  background: var(--brand-pale);
  color: var(--brand-dark);
}

.onboarding__choix-icone--primaire {
  background: var(--brand);
  color: var(--on-brand);
}

.onboarding__choix-titre {
  font-family: var(--font-display);
  font-size: 17px;
  color: var(--text-strong);
}

.onboarding__choix-texte {
  font-size: 13.5px;
  color: var(--text-muted);
}

@media (max-width: 767px) {
  .onboarding__contenu {
    align-items: stretch;
    gap: 14px;
    padding: 14px var(--space-3) 104px;
  }

  .onboarding__carte {
    gap: var(--space-3);
    padding: var(--space-6);
  }

  .onboarding__carte--centre {
    padding: 28px 18px;
  }

  .onboarding__h1 {
    font-size: 22px;
  }

  .onboarding__h1--gauche {
    font-size: 16px;
  }

  .onboarding__carte--centre .onboarding__h1,
  .onboarding__succes + .onboarding__h1 {
    font-size: 22px;
    text-align: center;
  }

  .onboarding__succes {
    display: flex;
    justify-content: center;
  }

  .onboarding__texte {
    font-size: 15px;
    text-align: center;
  }

  /* Étape 3 en mobile : titre et moyens directement sur le fond, chaque moyen dans sa carte. */
  .onboarding__carte--paiements {
    padding: 0;
    background: transparent;
    box-shadow: none;
  }

  .onboarding__paiements {
    grid-template-columns: minmax(0, 1fr);
  }

  .onboarding__moyens,
  .onboarding__liste-moyens {
    gap: 10px;
  }

  .onboarding__moyen {
    padding: 14px;
    border: 0;
    border-radius: var(--r-card);
    background: var(--surface);
    box-shadow: var(--shadow);
  }

  .onboarding__logo {
    flex-direction: column;
    align-items: stretch;
  }

  .onboarding__grille3 {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-3);
  }
}
</style>
