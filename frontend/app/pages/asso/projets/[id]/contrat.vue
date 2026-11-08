<!--
  MgProjetContrat — consulter le contrat du projet (verrouillé depuis la création) et suivre les signatures.
  Desktop : bandeau « Contrat verrouillé — signé par 51 souscripteurs sur 52 » (V2), contrat au format document
  (association, « Télécharger le PDF », texte, signatures) et, à droite, le suivi des signatures.
  Mobile : suivi des signatures en tête, bandeau « plus modifiable », résumé de l'engagement, texte, PDF en pied.
  États : nominal (Fatou Traoré n'a pas signé), tous-signes (scénario).
-->
<script setup lang="ts">
import type { ContratProjet } from '~~/types'
import { estDate, formatDate, formatFCFA } from '~/utils/format'
import { paragraphesContrat } from '~/utils/contrat'

definePageMeta({ ongletProjet: 'contrat' })

const route = useRoute()
const id = computed(() => String(route.params.id))
const { data: projet } = useProjet(id)
const { data: contrat, pending, error, refresh } = useContratProjet(id)
const { relances, envoi, relancer } = useRelancesProjet(id)

const paragraphes = computed(() => (contrat.value ? paragraphesContrat(contrat.value.texte) : []))
const signeLe = computed(() => {
  const d = contrat.value?.signataire?.signeLe
  return estDate(d) ? formatDate(d, 'numerique') : '[DATE]'
})
/** « A. Koné » : paraphe de l'association. */
const paraphe = computed(() => {
  const [prenom, ...nom] = (contrat.value?.signataire?.nom ?? '').split(' ')
  return prenom ? `${prenom[0]}. ${nom.join(' ')}` : ''
})

/** Mobile : « 50 000 F à l'entrée, puis 25 000 F par mois pendant 18 mois. Total : 500 000 F. » */
const engagement = computed(() => {
  const p = projet.value
  if (!p) return ''
  const entree = p.fondsEntree ? `${formatFCFA(p.fondsEntree)} à l’entrée, puis ` : ''
  const rythme = p.frequence === 'mensuelle' ? 'par mois' : `par échéance (${p.frequence})`
  const duree = p.nbEcheances ? (p.frequence === 'mensuelle' ? ` pendant ${p.nbEcheances} mois` : ` pendant ${p.nbEcheances} échéances`) : ''
  const total = p.engagementParSouscripteur ? ` Total : ${formatFCFA(p.engagementParSouscripteur)}.` : ''
  return `${entree}${formatFCFA(p.montantEcheance)} ${rythme}${duree}.${total}`
})

function relancerSignature(n: ContratProjet['nonSignataires'][number]) {
  relancer([n.souscripteurId], { message: `${n.nom} a reçu un rappel pour signer le contrat.` })
}

function telecharger() {
  // Modèle du contrat : impression du navigateur (enregistrable en PDF). Le serveur produit le PDF de chaque signature
  // (lot 4.1), téléchargé par le souscripteur depuis son contrat.
  window.print()
}
</script>

<template>
  <CzErreurChargement
    v-if="error"
    titre="Impossible d’afficher le contrat"
    @reessayer="refresh()"
  />

  <div
    v-else-if="pending && !contrat"
    class="contrat-projet"
    aria-busy="true"
  >
    <CzSkeleton
      :hauteur="52"
      class="contrat-projet__bandeau"
    />
    <div class="contrat-projet__grille">
      <CzSkeleton :hauteur="480" />
      <CzSkeleton :hauteur="200" />
    </div>
  </div>

  <div
    v-else-if="contrat"
    class="contrat-projet"
  >
    <CzAlert
      ton="info"
      icone="cadenas"
      class="contrat-projet__bandeau cz-desktop"
    >
      <b>Contrat verrouillé</b> — signé par {{ contrat.signes }} souscripteurs sur {{ contrat.total }}.
      <template #action>
        <CzSoon petit>
          V2
        </CzSoon>
      </template>
    </CzAlert>

    <div class="contrat-projet__grille">
      <article class="cz-card contrat-projet__document">
        <div class="contrat-projet__haut cz-desktop">
          <span class="contrat-projet__asso">{{ contrat.association.nom }}<template v-if="contrat.association.ville"> · {{ contrat.association.ville }}</template></span>
          <CzButton
            variante="secondaire"
            taille="sm"
            icone="telecharger"
            @click="telecharger"
          >
            Télécharger le PDF
          </CzButton>
        </div>
        <h2 class="contrat-projet__titre cz-desktop">
          Contrat de souscription — {{ projet?.nom }}
        </h2>
        <div
          v-if="engagement"
          class="contrat-projet__engagement cz-mobile"
        >
          <b>Engagement :</b> {{ engagement }}
        </div>
        <p
          v-for="(p, i) in paragraphes"
          :key="i"
          class="contrat-projet__paragraphe"
          :class="{ 'is-note': p.length === 1 && p[0]!.texte.startsWith('[') }"
        >
          <template
            v-for="(m, j) in p"
            :key="j"
          >
            <b v-if="m.gras">{{ m.texte }}</b><template v-else>
              {{ m.texte }}
            </template>
          </template>
        </p>

        <div class="contrat-projet__signatures cz-desktop">
          <div>
            <div class="contrat-projet__role">
              Pour l’association
            </div>
            <b>{{ contrat.signataire?.nom ?? '[SIGNATAIRE]' }}<template v-if="contrat.signataire?.fonction">, {{ contrat.signataire.fonction }}</template></b>
            <div
              v-if="paraphe"
              class="contrat-projet__paraphe"
              aria-hidden="true"
            >
              {{ paraphe }}
            </div>
            <div class="contrat-projet__role">
              Signé le {{ signeLe }}
            </div>
          </div>
          <div>
            <div class="contrat-projet__role">
              Le souscripteur
            </div>
            <b>{nom_souscripteur}</b>
            <div class="contrat-projet__ligne-signature" />
          </div>
        </div>
        <div class="contrat-projet__mention cz-mobile">
          Signé pour l’association par {{ contrat.signataire?.nom ?? '[SIGNATAIRE]' }} le {{ signeLe }}
        </div>
      </article>

      <SuiviSignatures
        class="contrat-projet__suivi cz-desktop"
        :signes="contrat.signes"
        :total="contrat.total"
        :non-signataires="contrat.nonSignataires"
        :voir-tous="{ path: `/asso/projets/${id}/souscripteurs`, query: { statut: 'signature_attendue' } }"
        :relances="relances"
        :envoi="envoi"
        @relancer="relancerSignature"
      />
      <SuiviSignatures
        class="contrat-projet__suivi-mobile cz-mobile"
        compact
        :signes="contrat.signes"
        :total="contrat.total"
        :non-signataires="contrat.nonSignataires"
        :relances="relances"
        :envoi="envoi"
        @relancer="relancerSignature"
      />
      <CzAlert
        ton="info"
        sans-icone
        class="contrat-projet__verrou-mobile cz-mobile"
      >
        Ce contrat n’est plus modifiable : il a été accepté par vos souscripteurs.
      </CzAlert>
      <CzButton
        variante="secondaire"
        bloc
        class="contrat-projet__pdf-mobile cz-mobile"
        @click="telecharger"
      >
        Télécharger le PDF
      </CzButton>
    </div>
  </div>
</template>

<style scoped>
.contrat-projet {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.contrat-projet__grille {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  gap: var(--space-6) var(--space-4);
  align-items: start;
}

.contrat-projet__document {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-12);
  font-size: 14.5px;
  line-height: 1.7;
}

.contrat-projet__haut {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
}

.contrat-projet__asso,
.contrat-projet__role {
  font-size: 12px;
  color: var(--text-muted);
}

.contrat-projet__titre {
  margin: 0;
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 600;
  line-height: 1.3;
  text-align: center;
  color: var(--text-strong);
}

.contrat-projet__paragraphe {
  margin: 0;
}

.contrat-projet__paragraphe b {
  color: var(--text-strong);
}

.contrat-projet__paragraphe.is-note {
  color: var(--text-muted);
}

.contrat-projet__signatures {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-6);
  margin-top: var(--space-6);
  padding-top: var(--space-4);
  border-top: 1px solid var(--divider);
  line-height: 1.5;
}

.contrat-projet__signatures b {
  display: block;
  margin-top: var(--space-1);
  color: var(--text-strong);
}

.contrat-projet__paraphe {
  margin-top: var(--space-2);
  font-family: var(--font-display);
  font-size: 22px;
  font-style: italic;
  color: var(--brand-dark);
}

.contrat-projet__ligne-signature {
  height: 34px;
  margin-top: var(--space-2);
  border-bottom: 1px dashed var(--border);
}

.contrat-projet__engagement {
  padding: var(--space-3) var(--space-4);
  border-radius: var(--r-md);
  background: var(--brand-pale);
  font-size: 14px;
  color: var(--ink-title);
}

.contrat-projet__mention {
  padding-top: var(--space-3);
  border-top: 1px solid var(--border);
  font-size: 12.5px;
  color: var(--text-muted);
}

@media (max-width: 1023px) {
  .contrat-projet__grille {
    grid-template-columns: minmax(0, 1fr);
  }

  .contrat-projet__document {
    padding: var(--space-8);
  }
}

@media (max-width: 767px) {
  .contrat-projet__grille {
    gap: var(--space-4);
  }

  /* Ordre de la maquette mobile : signatures, bandeau, contrat, PDF. */
  .contrat-projet__suivi-mobile {
    order: -2;
  }

  .contrat-projet__verrou-mobile {
    order: -1;
  }

  .contrat-projet__document {
    gap: var(--space-3);
    padding: var(--space-6);
    font-size: 15px;
  }
}

@media print {
  .contrat-projet__bandeau,
  .contrat-projet__suivi,
  .contrat-projet__haut :deep(.cz-btn) {
    display: none !important;
  }
}
</style>
