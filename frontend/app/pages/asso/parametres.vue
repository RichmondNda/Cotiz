<!--
  MgParametres — tenir à jour l'identité de l'association et ses modalités de paiement (visibles par les souscripteurs).
  Desktop : navigation par sections à gauche (Informations, Contact, Modalités de paiement, Région et devise),
  cartes à droite. Mobile : cartes empilées.
  Dès qu'un champ change : barre « Modifications non enregistrées » (Annuler / Enregistrer) ; quitter la page
  avec des modifications → confirmation. Après enregistrement : toast (desktop) / bandeau de succès (mobile).
  Scénarios : `chargement`, `erreur`.
-->
<script setup lang="ts">
import type { Association, ModalitePaiement } from '~~/types'
import { initiales } from '~/utils/format'
import { codeErreur, messageRefus } from '~/composables/api/client'
import { erreursMoyens, MESSAGE_OPERATEUR } from '~/composables/api/vues/associations'

definePageMeta({ middleware: 'espace-gestionnaire', layout: 'backoffice', espace: 'gestionnaire', titre: 'Paramètres de l’association' })
useHead({ title: 'Paramètres de l’association · Cotiz' })

const toast = useToast()
const { estMobile } = useBreakpoint()
const { data: association, pending, error, refresh } = useAssociationGestionnaire()
const { refresh: rafraichirSession } = useMoi()
const modifier = useModificationAssociation()

// ---------------------------------------------------------------- Formulaire
interface Formulaire {
  nom: string
  ville: string
  description: string
  telephoneContact: string
  emailContact: string
  numeroMobileMoney: string
  operateur: string
  iban: string
  instructionsPaiement: string
  logoUrl: string
}

function depuis(a: Association): Formulaire {
  const mm = a.modalitesPaiement.find(m => m.moyen === 'mobile_money')
  const vir = a.modalitesPaiement.find(m => m.moyen === 'virement')
  return {
    nom: a.nom,
    ville: a.ville,
    description: a.description ?? '',
    telephoneContact: a.telephoneContact ?? '',
    emailContact: a.emailContact ?? '',
    numeroMobileMoney: mm?.numeroMobileMoney ?? '',
    operateur: mm?.operateur ?? '',
    iban: vir?.iban ?? '',
    instructionsPaiement: a.instructionsPaiement ?? '',
    logoUrl: a.logoUrl ?? '',
  }
}

const formulaireVide = (): Formulaire => ({
  nom: '', ville: '', description: '', telephoneContact: '', emailContact: '',
  numeroMobileMoney: '', operateur: '', iban: '', instructionsPaiement: '', logoUrl: '',
})
const form = reactive<Formulaire>(formulaireVide())
const reference = ref<Formulaire | null>(null)
const modifie = computed(() => Boolean(reference.value) && JSON.stringify(form) !== JSON.stringify(reference.value))
watch(association, (a) => {
  if (!a || modifie.value) return
  reference.value = depuis(a)
  Object.assign(form, reference.value)
}, { immediate: true })
const enregistre = ref(false)
watch(modifie, v => v && (enregistre.value = false))

const tentee = ref(false)
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const erreurs = computed(() => {
  // Moyens refusés par le contrat de as.pm.replace (même schéma que le back) ; l'opérateur a son propre champ.
  const moyens = tentee.value && association.value ? erreursMoyens(modalites(association.value), form.instructionsPaiement.trim()) : {}
  return {
    nom: tentee.value && !form.nom.trim() ? 'Indiquez le nom de l’association' : undefined,
    emailContact: tentee.value && form.emailContact.trim() && !EMAIL.test(form.emailContact.trim())
      ? 'Indiquez un email valide, par exemple contact@association.ci'
      : undefined,
    numeroMobileMoney: moyens.mobile_money !== MESSAGE_OPERATEUR ? moyens.mobile_money : undefined,
    operateur: moyens.mobile_money === MESSAGE_OPERATEUR ? moyens.mobile_money : undefined,
    iban: moyens.virement,
  }
})

// ---------------------------------------------------------------- Logo
const champLogo = ref<HTMLInputElement | null>(null)
/** Fichier choisi, déposé à l'enregistrement (as.upload). */
const fichierLogo = ref<File>()
const erreurLogo = ref<string>()
function choisirLogo(e: Event) {
  const fichier = (e.target as HTMLInputElement).files?.[0]
  ;(e.target as HTMLInputElement).value = ''
  if (!fichier) return
  if (!['image/png', 'image/jpeg'].includes(fichier.type)) {
    erreurLogo.value = 'Choisissez une image PNG ou JPG'
    return
  }
  if (fichier.size > 1024 * 1024) {
    erreurLogo.value = 'Choisissez une image de 1 Mo maximum'
    return
  }
  erreurLogo.value = undefined
  fichierLogo.value = fichier
  form.logoUrl = `[LOGO] ${fichier.name}`
}

// ---------------------------------------------------------------- Enregistrement
function modalites(a: Association): ModalitePaiement[] {
  // Les autres moyens (espèces…) sont conservés tels quels.
  const autres = a.modalitesPaiement.filter(m => m.moyen !== 'mobile_money' && m.moyen !== 'virement')
  const liste: ModalitePaiement[] = []
  const ancienMm = a.modalitesPaiement.find(m => m.moyen === 'mobile_money')
  if (ancienMm || form.numeroMobileMoney.trim() || form.operateur.trim()) {
    liste.push({ ...ancienMm, moyen: 'mobile_money', numeroMobileMoney: form.numeroMobileMoney.trim() || undefined, operateur: form.operateur.trim() || undefined })
  }
  const ancienVir = a.modalitesPaiement.find(m => m.moyen === 'virement')
  if (ancienVir || form.iban.trim()) {
    // « Instructions complémentaires » = instructions du virement.
    liste.push({ ...ancienVir, moyen: 'virement', iban: form.iban.trim() || undefined, instructions: form.instructionsPaiement.trim() || undefined })
  }
  return [...liste, ...autres]
}

const envoi = ref(false)
async function enregistrer() {
  const a = association.value
  if (!a) return
  tentee.value = true
  if (Object.values(erreurs.value).some(Boolean)) return
  envoi.value = true
  try {
    await modifier(a.id, {
      nom: form.nom.trim(),
      ville: form.ville.trim(),
      description: form.description.trim(),
      telephoneContact: form.telephoneContact.trim(),
      emailContact: form.emailContact.trim(),
      logo: fichierLogo.value,
      instructionsPaiement: form.instructionsPaiement.trim(),
      modalitesPaiement: modalites(a),
    })
    reference.value = { ...form }
    fichierLogo.value = undefined
    tentee.value = false
    enregistre.value = true
    if (!estMobile.value) {
      toast.succes('Paramètres enregistrés', {
        message: 'Vos souscripteurs voient les nouvelles informations.',
        action: { label: 'Fermer', rappel: () => {} },
      })
    }
    await Promise.all([refresh(), rafraichirSession()])
  }
  catch (e) {
    toast.erreur('Les paramètres n’ont pas pu être enregistrés', {
      message: codeErreur(e) === 'logo_en_analyse'
        ? 'Le logo est en cours de vérification : réessayez dans un instant.'
        : messageRefus(e) ?? 'Vérifiez votre connexion, puis réessayez.',
    })
  }
  finally {
    envoi.value = false
  }
}

function annuler() {
  if (reference.value) Object.assign(form, reference.value)
  tentee.value = false
  erreurLogo.value = undefined
  fichierLogo.value = undefined
}

const { confirmation, quitter } = useGardeModifications(() => modifie.value)

// ---------------------------------------------------------------- Sections (desktop)
const SECTIONS = [
  { id: 'infos', label: 'Informations' },
  { id: 'contact', label: 'Contact' },
  { id: 'paiement', label: 'Modalités de paiement' },
  { id: 'region', label: 'Région et devise' },
] as const
const section = ref<string>('infos')
function allerA(id: string) {
  section.value = id
  document.getElementById(`parametres-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// La section active suit le défilement : celle qui occupe le haut de la fenêtre.
let observateur: IntersectionObserver | null = null
function observerSections() {
  observateur?.disconnect()
  observateur = new IntersectionObserver((entrees) => {
    const visible = entrees.find(e => e.isIntersecting)
    if (visible) section.value = visible.target.id.replace('parametres-', '')
  }, { rootMargin: '-15% 0px -75% 0px' })
  for (const s of SECTIONS) {
    const el = document.getElementById(`parametres-${s.id}`)
    if (el) observateur.observe(el)
  }
}
onBeforeUnmount(() => observateur?.disconnect())

const chargement = computed(() => pending.value && !association.value)
onMounted(() => {
  watch(chargement, async (v) => {
    if (v) return
    await nextTick()
    observerSections()
  }, { immediate: true })
})
const sigle = computed(() => association.value?.sigle ?? initiales(form.nom || association.value?.nom || ''))
</script>

<template>
  <div
    class="parametres"
    :class="{ 'parametres--barre': modifie }"
  >
    <EnTeteGestionnaireMobile
      titre="Paramètres"
      sous-titre="Visibles par vos souscripteurs"
      retour="/asso/plus"
      :cloche="false"
    />
    <EnTetePage
      titre="Paramètres de l’association"
      sous-titre="Ces informations sont visibles par vos souscripteurs"
      class="cz-desktop"
    />

    <CzErreurChargement
      v-if="error && !association"
      titre="Impossible d’afficher les paramètres"
      @reessayer="refresh()"
    />

    <div
      v-else
      class="parametres__grille"
    >
      <nav
        class="parametres__nav cz-desktop"
        aria-label="Sections"
      >
        <button
          v-for="s in SECTIONS"
          :key="s.id"
          type="button"
          class="parametres__nav-lien"
          :class="{ 'is-on': section === s.id }"
          :aria-current="section === s.id ? 'true' : undefined"
          @click="allerA(s.id)"
        >
          {{ s.label }}
        </button>
      </nav>

      <div
        v-if="chargement"
        class="parametres__cartes"
        aria-busy="true"
      >
        <div
          v-for="i in 3"
          :key="i"
          class="cz-card cz-card--lg parametres__carte"
        >
          <CzSkeleton
            :hauteur="18"
            largeur="40%"
          />
          <CzSkeleton :hauteur="44" />
          <CzSkeleton :hauteur="44" />
        </div>
      </div>

      <form
        v-else
        class="parametres__cartes"
        novalidate
        @submit.prevent="enregistrer"
      >
        <CzAlert
          v-if="enregistre"
          ton="success"
          sans-icone
          class="cz-mobile"
          role="status"
        >
          Paramètres enregistrés.
        </CzAlert>

        <!-- Informations -->
        <section
          id="parametres-infos"
          class="cz-card cz-card--lg parametres__carte"
          aria-labelledby="parametres-infos-titre"
        >
          <h2
            id="parametres-infos-titre"
            class="parametres__titre"
          >
            <span class="cz-desktop">Informations générales</span><span class="cz-mobile">Informations</span>
          </h2>
          <div class="parametres__logo">
            <span
              class="parametres__vignette"
              aria-hidden="true"
            >{{ sigle }}</span>
            <div class="parametres__logo-texte">
              <CzButton
                variante="secondaire"
                taille="sm"
                @click="champLogo?.click()"
              >
                Changer le logo
              </CzButton>
              <span
                v-if="erreurLogo"
                class="parametres__erreur"
                role="alert"
              >{{ erreurLogo }}</span>
              <span
                v-else
                class="cz-help cz-desktop"
              >{{ form.logoUrl.startsWith('[LOGO]') ? form.logoUrl.replace('[LOGO] ', '') : 'PNG ou JPG carré, 1 Mo maximum' }}</span>
              <input
                ref="champLogo"
                type="file"
                accept="image/png,image/jpeg"
                class="sr-only"
                tabindex="-1"
                aria-label="Logo de l’association"
                @change="choisirLogo"
              >
            </div>
          </div>
          <div class="parametres__deux">
            <CzField
              :erreur="erreurs.nom"
              class="parametres__nom"
            >
              <template #label>
                <span class="cz-desktop">Nom de l’association</span><span class="cz-mobile">Nom</span>
              </template>
              <CzInput
                v-model="form.nom"
                autocomplete="organization"
              />
            </CzField>
            <CzField label="Ville">
              <CzInput
                v-model="form.ville"
                autocomplete="address-level2"
              />
            </CzField>
          </div>
          <CzField label="Description">
            <CzInput
              v-model="form.description"
              type="textarea"
              :lignes="3"
            />
          </CzField>
        </section>

        <!-- Contact -->
        <section
          id="parametres-contact"
          class="cz-card cz-card--lg parametres__carte"
          aria-labelledby="parametres-contact-titre"
        >
          <h2
            id="parametres-contact-titre"
            class="parametres__titre"
          >
            <span class="cz-desktop">Contact affiché aux souscripteurs</span><span class="cz-mobile">Contact</span>
          </h2>
          <div class="parametres__deux">
            <CzField label="Téléphone">
              <CzInput
                v-model="form.telephoneContact"
                type="tel"
                inputmode="tel"
                autocomplete="tel"
              />
            </CzField>
            <CzField
              label="Email"
              :erreur="erreurs.emailContact"
            >
              <CzInput
                v-model="form.emailContact"
                type="email"
                autocomplete="email"
              />
            </CzField>
          </div>
        </section>

        <!-- Modalités de paiement -->
        <section
          id="parametres-paiement"
          class="cz-card cz-card--lg parametres__carte"
          aria-labelledby="parametres-paiement-titre"
        >
          <div class="parametres__entete">
            <h2
              id="parametres-paiement-titre"
              class="parametres__titre"
            >
              Modalités de paiement par défaut
            </h2>
            <CzBadge
              ton="info"
              petit
              class="cz-desktop"
            >
              Reprises à la création d’un projet
            </CzBadge>
          </div>
          <p class="parametres__intro cz-desktop">
            Les paiements ne transitent pas par Cotiz : vos souscripteurs vous paient directement, puis déclarent leur versement.
          </p>
          <div class="parametres__deux">
            <CzField :erreur="erreurs.numeroMobileMoney">
              <template #label>
                <span class="cz-desktop">Numéro mobile money</span><span class="cz-mobile">Mobile money</span>
              </template>
              <CzInput
                v-model="form.numeroMobileMoney"
                type="tel"
                inputmode="tel"
              />
            </CzField>
            <CzField
              label="Opérateur"
              :erreur="erreurs.operateur"
            >
              <CzInput v-model="form.operateur" />
            </CzField>
          </div>
          <CzField :erreur="erreurs.iban">
            <template #label>
              IBAN / RIB<span class="cz-desktop">&nbsp;(facultatif)</span>
            </template>
            <CzInput v-model="form.iban" />
          </CzField>
          <CzField label="Instructions complémentaires">
            <CzInput
              v-model="form.instructionsPaiement"
              type="textarea"
              :lignes="3"
              placeholder="Ex. : indiquez votre nom dans le motif du virement"
            />
          </CzField>
        </section>

        <!-- Région et devise -->
        <section
          id="parametres-region"
          class="cz-card cz-card--lg parametres__carte parametres__region"
          aria-labelledby="parametres-region-titre"
        >
          <h2
            id="parametres-region-titre"
            class="parametres__titre"
          >
            <span class="cz-desktop">Région et devise</span><span class="cz-mobile">Région</span>
          </h2>
          <dl>
            <div>
              <dt>Devise</dt>
              <dd><span class="cz-desktop">Franc CFA (F CFA)</span><span class="cz-mobile">F CFA</span></dd>
            </div>
            <div>
              <dt><span class="cz-desktop">Fuseau horaire</span><span class="cz-mobile">Fuseau</span></dt>
              <dd>Abidjan (GMT)</dd>
            </div>
            <div class="cz-desktop">
              <dt>Langue</dt>
              <dd>Français</dd>
            </div>
          </dl>
        </section>
        <button
          type="submit"
          hidden
        />
      </form>
    </div>

    <BarreModifications
      v-if="modifie"
      :envoi="envoi"
      @annuler="annuler"
      @enregistrer="enregistrer"
    />

    <CzConfirmation
      v-model:ouvert="confirmation"
      titre="Quitter sans enregistrer ?"
      confirmer="Quitter sans enregistrer"
      annuler="Rester sur la page"
      @confirmer="quitter"
    >
      Vos modifications des paramètres de l’association seront perdues.
    </CzConfirmation>
  </div>
</template>

<style scoped>
.parametres {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.parametres--barre {
  padding-bottom: calc(var(--space-12) + var(--space-6));
}

.parametres__grille {
  display: grid;
  grid-template-columns: 200px minmax(0, 760px);
  gap: var(--space-6);
  align-items: start;
}

.parametres__nav {
  position: sticky;
  top: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.parametres__nav-lien {
  width: 100%;
  min-height: 40px;
  padding: 9px var(--space-3);
  border: 0;
  border-radius: var(--r-field);
  background: transparent;
  font: inherit;
  font-size: 13.5px;
  text-align: left;
  color: var(--text-muted);
  cursor: pointer;
}

.parametres__nav-lien:hover {
  background: var(--surface-hover);
  color: var(--text);
}

.parametres__nav-lien.is-on {
  background: var(--brand-pale);
  font-weight: 600;
  color: var(--brand-dark);
}

.parametres__nav-lien:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.parametres__cartes {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.parametres__carte {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  scroll-margin-top: var(--space-4);
}

.parametres__titre {
  margin: 0;
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 600;
  color: var(--text-strong);
}

.parametres__entete {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.parametres__intro {
  margin: 0;
  font-size: 13.5px;
  color: var(--text-muted);
}

.parametres__logo {
  display: flex;
  align-items: flex-start;
  gap: var(--space-4);
}

.parametres__vignette {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  border-radius: var(--r-field);
  background: var(--brand-pale);
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 600;
  color: var(--brand-dark);
}

.parametres__logo-texte {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-2);
}

.parametres__erreur {
  font-size: 12px;
  color: var(--danger-fg);
}

.parametres__deux {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
}

.parametres__region dl {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin: 0;
  font-size: 14px;
}

.parametres__region dl > div {
  display: flex;
  justify-content: space-between;
  gap: var(--space-3);
}

.parametres__region dd {
  margin: 0;
  font-weight: 600;
  color: var(--text-strong);
}

@media (max-width: 1023px) {
  .parametres__grille {
    grid-template-columns: 160px minmax(0, 1fr);
    gap: var(--space-4);
  }
}

@media (max-width: 767px) {
  .parametres {
    gap: var(--space-3);
  }

  .parametres--barre {
    padding-bottom: 72px;
  }

  .parametres__grille {
    grid-template-columns: minmax(0, 1fr);
  }

  .parametres__cartes {
    gap: var(--space-3);
  }

  .parametres__carte {
    gap: var(--space-3);
  }

  .parametres__titre {
    font-size: 16px;
  }

  .parametres__logo {
    align-items: center;
    gap: var(--space-3);
  }

  .parametres__vignette {
    width: 44px;
    height: 44px;
    font-size: 16px;
  }

  .parametres__deux {
    grid-template-columns: minmax(0, 1fr);
  }

  .parametres__region dl {
    gap: var(--space-2);
  }
}
</style>
