<!--
  Vérification de la couche de données (développement uniquement) : composables/api → handlers Nitro mockés.
  Tester ?scenario=aucun-projet (vide), ?scenario=erreur, ?scenario=chargement (squelettes).
-->
<script setup lang="ts">
import { formatFCFA, formatRelatif } from '~/utils/format'
import { libelleFrequence } from '~/utils/statuts'

definePageMeta({ middleware: ['dev-uniquement', 'espace-gestionnaire'], layout: 'backoffice', espace: 'gestionnaire', titre: 'Données mockées' })

const { data: projets, pending, error, refresh } = useProjets()
const { data: paiements, pending: chargePaiements } = usePaiements({ statut: 'en_attente' })

function sousTitre(p: NonNullable<typeof projets.value>[number]) {
  const base = `${libelleFrequence(p.frequence)} · ${formatFCFA(p.montantEcheance)}`
  return p.typeCalendrier === 'cycle_roulant' ? `Cycle roulant · ${formatFCFA(p.montantEcheance)}` : base
}
</script>

<template>
  <div class="dev-colonne">
    <EnTetePage
      titre="Données mockées"
      sous-titre="useProjets() et usePaiements() — latence 200–400 ms, ?scenario= propagé"
    />
    <div
      v-if="pending"
      class="dev-grille"
    >
      <div
        v-for="n in 3"
        :key="n"
        class="cz-card"
      >
        <CzSkeleton
          :hauteur="14"
          largeur="70%"
        />
        <CzSkeleton
          :hauteur="8"
          forme="pilule"
          class="dev-mt"
        />
      </div>
    </div>
    <CzEmpty
      v-else-if="error"
      icone="alerte"
      ton="danger"
      titre="Une erreur est survenue"
      description="Nous n'avons pas pu charger les projets."
    >
      <template #action>
        <CzButton
          variante="secondaire"
          taille="sm"
          @click="refresh()"
        >
          Réessayer
        </CzButton>
      </template>
    </CzEmpty>
    <CzEmpty
      v-else-if="!projets?.length"
      icone="projet"
      titre="Aucun projet pour l'instant"
      description="Créez votre premier projet pour commencer à inscrire des souscripteurs."
    />
    <div
      v-else
      class="dev-grille"
    >
      <CarteProjet
        v-for="p in projets"
        :key="p.id"
        :nom="p.nom"
        :sous-titre="sousTitre(p)"
        :statut="p.statut"
        :progression="typeof p.avancement === 'number' ? p.avancement : 30"
        :progression-gauche="p.statut === 'inscriptions_ouvertes' ? `${p.nbSouscripteurs} / ${p.souscripteursRequis} souscripteurs` : `${formatFCFA(p.montantCollecte)} collectés`"
        :progression-droite="`${p.avancement} %`"
        :alerte="p.nbEnRetard ? { texte: `${p.nbEnRetard} en retard`, ton: 'danger' } : p.nbSignaturesAttendues ? { texte: `${p.nbSignaturesAttendues} signature attendue`, ton: 'warning' } : undefined"
      />
    </div>
    <h2 class="cz-h2">
      Paiements à valider
    </h2>
    <CzTable
      :colonnes="[
        { cle: 'souscripteur', label: 'Souscripteur', squelette: 'personne' },
        { cle: 'projet', label: 'Projet' },
        { cle: 'declareLe', label: 'Déclaré' },
        { cle: 'montant', label: 'Montant', num: true },
      ]"
      :lignes="(paiements ?? []) as unknown as Record<string, unknown>[]"
      :chargement="chargePaiements"
      :cliquable="false"
    >
      <template #cell-souscripteur="{ ligne }">
        <div class="cz-person">
          <CzAvatar
            :nom="`${(ligne as any).souscripteur.prenom} ${(ligne as any).souscripteur.nom}`"
            taille="sm"
          /><b>{{ (ligne as any).souscripteur.prenom }} {{ (ligne as any).souscripteur.nom }}</b>
        </div>
      </template>
      <template #cell-projet="{ ligne }">
        {{ (ligne as any).projet.nom }}
      </template>
      <template #cell-declareLe="{ valeur }">
        {{ formatRelatif(String(valeur)) }}
      </template>
      <template #cell-montant="{ valeur }">
        {{ formatFCFA(Number(valeur)) }}
      </template>
      <template #vide>
        <CzEmpty
          icone="valide"
          ton="success"
          titre="Rien à valider"
          description="Tous les paiements déclarés ont été traités."
          integre
        />
      </template>
    </CzTable>
  </div>
</template>

<style scoped>
.dev-colonne {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.dev-grille {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-4);
}

.dev-mt {
  margin-top: var(--space-4);
}

@media (max-width: 767px) {
  .dev-grille {
    grid-template-columns: 1fr;
  }
}
</style>
