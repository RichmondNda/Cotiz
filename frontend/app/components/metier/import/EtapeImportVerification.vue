<!--
  Import, étape 3 — Vérification. Desktop : 4 tuiles (prêtes, comptes existants rattachés, erreurs, doublon dans le
  fichier) qui filtrent le tableau ; cellules en erreur surlignées et modifiables sur place ; « Corriger » (saisie
  recontrôlée par le serveur, lot 4.4), « Ignorer » (ligne non importée). Autre erreur (nom manquant, email invalide,
  déjà inscrit…) : motif affiché, ligne à ignorer. Mobile : « Prêts » / « À corriger », lignes à traiter, comptes existants.
-->
<script setup lang="ts">
import type { LigneVerifiee } from '~/composables/useImportSouscripteurs'
import { useImportSouscripteurs } from '~/composables/useImportSouscripteurs'
import { pluriel } from '~/utils/format'

type Filtre = 'tout' | 'pretes' | 'existants' | 'erreurs' | 'doublons'

const { etat, compteurs, aExaminer, enErreur, corrigeable, correctionValide, corriger, ignorer } = useImportSouscripteurs()
const toast = useToast()

const filtre = ref<Filtre>('tout')
const TUILES = computed(() => [
  { cle: 'pretes' as const, libelle: 'Prêtes', valeur: compteurs.value.pretes, ton: 'success' },
  { cle: 'existants' as const, libelle: 'Comptes existants rattachés', valeur: compteurs.value.comptesExistants, ton: 'info' },
  { cle: 'erreurs' as const, libelle: 'Erreurs', valeur: compteurs.value.erreurs, ton: 'danger' },
  { cle: 'doublons' as const, libelle: 'Doublon dans le fichier', valeur: compteurs.value.doublons, ton: 'warning' },
])
function basculer(f: Filtre) {
  filtre.value = filtre.value === f ? 'tout' : f
}

/** Ordre de la maquette : lignes à traiter (erreurs, doublons), comptes existants, puis prêtes ; ordre du fichier ensuite. */
const rang = (l: LigneVerifiee) =>
  l.decision === 'corrigee' ? 3 : enErreur(l) ? 0 : l.statut === 'doublon' ? 1 : l.statut === 'compte_existant' ? 2 : 3
const lignes = computed(() => etat.lignes.filter((l) => {
  if (l.decision === 'ignoree') return false
  switch (filtre.value) {
    case 'pretes': return l.statut === 'prete' || l.decision === 'corrigee'
    case 'existants': return l.statut === 'compte_existant'
    case 'erreurs': return enErreur(l) && !l.decision
    case 'doublons': return l.statut === 'doublon' && !l.decision
    default: return true
  }
}).sort((a, b) => rang(a) - rang(b) || a.ligne - b.ligne))

const STATUTS: Record<LigneVerifiee['statut'], { texte: string, ton: 'success' | 'info' | 'danger' | 'warning' }> = {
  prete: { texte: 'Prête', ton: 'success' },
  compte_existant: { texte: 'Compte existant', ton: 'info' },
  telephone_incomplet: { texte: 'Téléphone incomplet', ton: 'danger' },
  prenom_manquant: { texte: 'Prénom manquant', ton: 'danger' },
  doublon: { texte: 'Doublon', ton: 'warning' },
  erreur: { texte: 'Erreur', ton: 'danger' },
  ignoree: { texte: 'Ignorée', ton: 'warning' },
}
function statut(l: LigneVerifiee) {
  if (l.decision === 'corrigee') return { texte: 'Corrigée', ton: 'success' as const }
  if (l.statut === 'doublon') return { texte: `Doublon de la ligne ${l.doublonDe}`, ton: 'warning' as const }
  return { ...STATUTS[l.statut], ...(l.motif ? { texte: l.motif } : {}) }
}
/** Mobile : « Téléphone incomplet », « Numéro en double (ligne 8) ». */
function probleme(l: LigneVerifiee) {
  return l.statut === 'doublon' ? `Numéro en double (ligne ${l.doublonDe})` : l.motif ?? STATUTS[l.statut].texte
}
const aTraiter = (l: LigneVerifiee) => !l.decision && (enErreur(l) || l.statut === 'doublon')

const tentees = ref<number[]>([])
async function surCorriger(l: LigneVerifiee) {
  try {
    if (await corriger(l)) {
      toast.succes(`Ligne ${l.ligne} corrigée`, { message: 'Elle sera importée avec les autres.' })
      if (enCorrection.value === l.ligne) enCorrection.value = null
    }
    else {
      tentees.value = [...tentees.value, l.ligne]
    }
  }
  catch (e) {
    toast.erreur('Correction impossible', { message: messageRefus(e) })
  }
}
async function surIgnorer(l: LigneVerifiee) {
  try {
    await ignorer(l)
    toast.info(`Ligne ${l.ligne} ignorée`, { message: 'Elle ne sera pas importée.' })
  }
  catch (e) {
    toast.erreur('Action impossible', { message: messageRefus(e) })
  }
}
/** Mobile : « Corriger » ouvre la saisie de la ligne. */
const enCorrection = ref<number | null>(null)
</script>

<template>
  <div class="verif">
    <h2 class="verif__titre cz-desktop">
      Vérification
    </h2>

    <!-- Desktop -->
    <div class="cz-grid4 cz-desktop">
      <button
        v-for="t in TUILES"
        :key="t.cle"
        type="button"
        class="cz-tile verif__tuile"
        :class="[`verif__tuile--${t.ton}`, { 'is-on': filtre === t.cle }]"
        :aria-pressed="filtre === t.cle"
        @click="basculer(t.cle)"
      >
        <div class="t">
          {{ t.libelle }}
        </div>
        <div class="v">
          {{ t.valeur }}
        </div>
      </button>
    </div>

    <table class="cz-table verif__table cz-desktop">
      <thead>
        <tr>
          <th>Ligne</th>
          <th>Prénom</th>
          <th>Nom</th>
          <th>Téléphone</th>
          <th>Statut</th>
          <th><span class="sr-only">Actions</span></th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="l in lignes"
          :key="l.ligne"
        >
          <td>{{ l.ligne }}</td>
          <td>
            <input
              v-if="l.statut === 'prenom_manquant' && !l.decision"
              v-model="l.prenom"
              class="verif__cellule"
              :class="{ 'is-invalide': tentees.includes(l.ligne) && !correctionValide(l) }"
              placeholder="Prénom manquant"
              :aria-label="`Prénom ligne ${l.ligne}`"
              @keydown.enter="surCorriger(l)"
            >
            <template v-else>
              {{ l.prenom }}
            </template>
          </td>
          <td>{{ l.nom }}</td>
          <td>
            <input
              v-if="l.statut === 'telephone_incomplet' && !l.decision"
              v-model="l.telephone"
              class="verif__cellule"
              inputmode="tel"
              :aria-label="`Téléphone ligne ${l.ligne}`"
              @keydown.enter="surCorriger(l)"
            >
            <span
              v-else
              class="cz-mono"
            >{{ l.telephone }}</span>
          </td>
          <td>
            <CzBadge :ton="statut(l).ton">
              {{ statut(l).texte }}
            </CzBadge>
          </td>
          <td class="num verif__actions">
            <CzButton
              v-if="corrigeable(l) && !l.decision"
              variante="secondaire"
              taille="sm"
              @click="surCorriger(l)"
            >
              Corriger
            </CzButton>
            <CzButton
              v-if="aTraiter(l)"
              variante="fantome"
              taille="sm"
              @click="surIgnorer(l)"
            >
              Ignorer
            </CzButton>
          </td>
        </tr>
        <tr v-if="!lignes.length">
          <td
            colspan="6"
            class="verif__vide"
          >
            Aucune ligne dans cette catégorie.
          </td>
        </tr>
      </tbody>
    </table>
    <p
      v-if="tentees.some(n => etat.lignes.find(l => l.ligne === n && !l.decision))"
      class="cz-error cz-desktop"
      role="alert"
    >
      <CzIcon nom="alerte" />Complétez la cellule en rouge (téléphone à 10 chiffres, prénom), puis « Corriger », ou ignorez la ligne.
    </p>

    <!-- Mobile -->
    <div class="verif__kpis cz-mobile">
      <CzKpi libelle="Prêts">
        <template #valeur>
          <span class="verif__ok">{{ compteurs.pretes }}</span>
        </template>
      </CzKpi>
      <CzKpi libelle="À corriger">
        <template #valeur>
          <span :class="compteurs.erreurs + compteurs.doublons ? 'verif__ko' : 'verif__ok'">{{ compteurs.erreurs + compteurs.doublons }}</span>
        </template>
      </CzKpi>
    </div>
    <ul class="cz-card verif__liste cz-mobile">
      <template
        v-for="l in aExaminer"
        :key="l.ligne"
      >
        <li v-if="aTraiter(l)">
          <div class="verif__ligne">
            <span class="verif__textes">
              <b>Ligne {{ l.ligne }} · {{ [l.prenom, l.nom].filter(Boolean).join(' ') }}</b>
              <span class="verif__probleme">{{ probleme(l) }}</span>
            </span>
            <CzButton
              v-if="corrigeable(l) && enCorrection !== l.ligne"
              variante="secondaire"
              taille="sm"
              @click="enCorrection = l.ligne"
            >
              Corriger
            </CzButton>
            <CzButton
              v-else-if="l.statut === 'doublon' || l.statut === 'erreur'"
              variante="secondaire"
              taille="sm"
              @click="surIgnorer(l)"
            >
              Ignorer
            </CzButton>
          </div>
          <div
            v-if="enCorrection === l.ligne"
            class="verif__saisie"
          >
            <CzInput
              v-if="l.statut === 'telephone_incomplet'"
              v-model="l.telephone"
              type="tel"
              :erreur="tentees.includes(l.ligne) && !correctionValide(l)"
              :label="`Téléphone ligne ${l.ligne}`"
            />
            <CzInput
              v-else
              v-model="l.prenom"
              placeholder="Prénom"
              :erreur="tentees.includes(l.ligne) && !correctionValide(l)"
              :label="`Prénom ligne ${l.ligne}`"
            />
            <CzButton
              taille="sm"
              @click="surCorriger(l)"
            >
              Valider
            </CzButton>
          </div>
        </li>
      </template>
      <li v-if="compteurs.comptesExistants">
        <div class="verif__ligne">
          <span class="verif__textes">
            <b>{{ pluriel(compteurs.comptesExistants, 'compte déjà existant', 'comptes déjà existants') }}</b>
            <span class="verif__aide">Ils seront rattachés, sans nouveau compte</span>
          </span>
          <CzBadge
            ton="info"
            petit
          >
            Info
          </CzBadge>
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.verif {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.verif__titre {
  margin: 0;
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 600;
  color: var(--text-strong);
}

.verif__tuile {
  border: 2px solid transparent;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.verif__tuile .t {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.verif__tuile.is-on {
  border-color: currentcolor;
}

.verif__tuile--success { background: var(--success-bg); color: var(--success-fg); }
.verif__tuile--info { background: var(--info-bg); color: var(--info-fg); }
.verif__tuile--danger { background: var(--danger-bg); color: var(--danger-fg); }
.verif__tuile--warning { background: var(--warning-bg); color: var(--warning-fg); }

.verif__cellule {
  width: 150px;
  height: 32px;
  padding: 0 var(--space-2);
  border: 1px solid var(--danger);
  border-radius: var(--r-sm);
  background: var(--danger-bg);
  font: inherit;
  color: var(--text-strong);
}

.verif__cellule::placeholder {
  color: var(--danger-fg);
}

.verif__cellule:focus {
  outline: none;
  box-shadow: var(--focus-ring-danger);
}

.verif__actions {
  white-space: nowrap;
}

.verif__actions :deep(.cz-btn + .cz-btn) {
  margin-left: var(--space-2);
}

.verif__vide {
  color: var(--text-muted);
  text-align: center;
}

.verif__kpis {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
}

.verif__ok {
  color: var(--success-fg);
}

.verif__ko {
  color: var(--danger-fg);
}

.verif__liste {
  margin: 0;
  padding: 0;
  list-style: none;
  overflow: hidden;
}

.verif__liste li {
  padding: var(--space-3) var(--space-4);
  border-top: 1px solid var(--divider);
}

.verif__liste li:first-child {
  border-top: 0;
}

.verif__ligne {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.verif__textes {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--space-1);
  font-size: 14px;
}

.verif__probleme,
.verif__aide {
  font-size: 12.5px;
  color: var(--danger-fg);
}

.verif__aide {
  color: var(--text-muted);
}

.verif__saisie {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: var(--space-2);
}

.verif__saisie > :first-child {
  flex: 1;
}

@media (max-width: 767px) {
  .verif {
    gap: var(--space-3);
  }
}
</style>
