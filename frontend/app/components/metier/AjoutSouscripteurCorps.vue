<!--
  Corps du formulaire d'ajout d'un souscripteur (partagé par la modale desktop et l'écran plein écran mobile) :
  téléphone, puis selon la recherche : compte existant retrouvé · nouveau compte · déjà inscrit au projet ; après la
  création d'un compte, carte « Code d'activation » à remettre soi-même (docs/specs/ui-deviations.md).
-->
<script setup lang="ts">
import { useAjoutSouscripteur } from '~/composables/useAjoutSouscripteur'
import { formatMois } from '~/utils/format'

const { etat, erreurs, passes, courant, libellePasses, masqueDate, rechercher, projet } = useAjoutSouscripteur()
const r = computed(() => etat.resultat)
const { data: association } = useAssociationGestionnaire()
</script>

<template>
  <div
    v-if="etat.etape === 'code' && etat.acces"
    class="ajout"
  >
    <HandoffCard
      titre="Code d’activation"
      :destinataire="etat.acces.destinataire"
      :code="etat.acces.code"
      :expire-le="etat.acces.expireLe"
      :message="etat.acces.message"
      :whatsapp="etat.acces.whatsapp"
      :sms="etat.acces.sms"
      :lien="etat.acces.lien"
      :association="association?.nom"
    />
    <p class="ajout__aide">
      Ce code reste disponible dans « Codes à remettre » jusqu’à l’activation du compte.
    </p>
  </div>
  <div
    v-else
    class="ajout"
  >
    <div class="ajout__bloc ajout__bloc--tel">
      <CzField
        label="Téléphone"
        :erreur="erreurs.telephone"
      >
        <CzInput
          v-model="etat.telephone"
          type="telephone"
          :erreur="etat.etape === 'deja_inscrit'"
          autocomplete="tel"
          @keydown.enter.prevent="rechercher"
        />
      </CzField>
      <p class="ajout__aide">
        <span class="cz-desktop">Nous vérifions si cette personne a déjà un compte Cotiz.</span>
        <span class="cz-mobile">Le téléphone identifie chaque personne : si elle a déjà un compte Cotiz, on le retrouve.</span>
      </p>
    </div>

    <!-- Compte existant -->
    <div
      v-if="r?.cas === 'compte_existant'"
      class="ajout__bloc ajout__trouve"
    >
      <span class="ajout__surtitre cz-mobile">Compte Cotiz trouvé</span>
      <div class="cz-person">
        <CzAvatar :nom="`${r.souscripteur.prenom} ${r.souscripteur.nom}`" />
        <div>
          <b>{{ r.souscripteur.prenom }} {{ r.souscripteur.nom }}</b>
          <div class="sub">
            <span class="cz-desktop">Membre de {{ r.nbAssociations }} association{{ r.nbAssociations > 1 ? 's' : '' }} sur Cotiz</span>
            <span
              v-if="r.projets.length"
              class="cz-mobile"
            >Déjà membre : {{ r.projets.join(', ') }}</span>
            <span
              v-else
              class="cz-mobile"
            >Membre de {{ r.nbAssociations }} association{{ r.nbAssociations > 1 ? 's' : '' }}</span>
          </div>
        </div>
      </div>
      <p class="ajout__texte">
        <span class="cz-desktop">Cette personne a déjà un compte. Elle sera rattachée à votre projet et recevra une invitation.</span>
        <span class="cz-mobile">Aucun nouveau compte ne sera créé. Cette personne recevra une notification pour signer le contrat de ce projet.</span>
      </p>
    </div>

    <!-- Nouveau compte -->
    <div
      v-else-if="etat.etape === 'nouveau'"
      class="ajout__bloc ajout__nouveau"
    >
      <CzAlert
        ton="info"
        sans-icone
        class="cz-mobile"
      >
        Aucun compte avec ce numéro : un compte sera créé, avec un code d’activation à lui remettre.
      </CzAlert>
      <div class="ajout__grille">
        <CzField
          label="Prénom"
          requis
          :erreur="erreurs.prenom"
        >
          <CzInput
            v-model="etat.prenom"
            autocomplete="given-name"
          />
        </CzField>
        <CzField
          label="Nom"
          requis
          :erreur="erreurs.nom"
        >
          <CzInput
            v-model="etat.nom"
            autocomplete="family-name"
          />
        </CzField>
        <CzField label="Email">
          <CzInput
            v-model="etat.email"
            type="email"
            placeholder="Optionnel"
            autocomplete="email"
          />
        </CzField>
        <CzField label="Adresse">
          <CzInput
            v-model="etat.adresse"
            placeholder="Optionnelle"
            autocomplete="street-address"
          />
        </CzField>
        <CzField
          label="Date d’entrée"
          :erreur="erreurs.dateEntree"
        >
          <CzInput
            :model-value="etat.dateEntree"
            placeholder="JJ/MM/AAAA"
            inputmode="numeric"
            @update:model-value="masqueDate"
          />
        </CzField>
      </div>
      <fieldset
        v-if="passes.length || courant"
        class="ajout__rattrapage"
      >
        <legend class="cz-label">
          Échéances à rattraper
        </legend>
        <div class="ajout__cases">
          <CzCheckbox
            v-if="projet().fondsEntree"
            :model-value="true"
            disabled
          >
            Fonds d’entrée
          </CzCheckbox>
          <CzCheckbox
            v-if="passes.length"
            v-model="etat.rattrapage.passes"
          >
            {{ libellePasses }}
          </CzCheckbox>
          <CzCheckbox
            v-if="courant"
            :model-value="etat.rattrapage.courant || etat.rattrapage.passes"
            :disabled="etat.rattrapage.passes"
            @update:model-value="(v: boolean) => (etat.rattrapage.courant = v)"
          >
            {{ formatMois(courant.date, 'seul') }}
          </CzCheckbox>
        </div>
      </fieldset>
    </div>

    <!-- Déjà inscrit -->
    <template v-else-if="r?.cas === 'deja_inscrit'">
      <CzAlert
        ton="info"
        class="cz-desktop"
      >
        Cette personne participe déjà à ce projet ({{ r.souscripteur.prenom }} {{ r.souscripteur.nom }}).
      </CzAlert>
      <CzAlert
        ton="warning"
        sans-icone
        class="cz-mobile"
      >
        <b>{{ r.souscripteur.prenom }} {{ r.souscripteur.nom }} participe déjà à ce projet.</b> Vérifiez le numéro ou ouvrez sa fiche.
      </CzAlert>
    </template>
  </div>
</template>

<style scoped>
.ajout {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.ajout__bloc {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.ajout__aide {
  margin: 0;
  font-size: 12.5px;
  color: var(--text-muted);
}

.ajout__trouve {
  gap: var(--space-3);
}

.ajout__trouve .cz-person {
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: var(--r-md);
}

.ajout__surtitre {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-muted);
}

.ajout__texte {
  margin: 0;
  font-size: 13.5px;
  line-height: 1.6;
  color: var(--text);
}

.ajout__grille {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3);
}

.ajout__rattrapage {
  margin: 0;
  padding: 0;
  border: 0;
}

.ajout__cases {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2) var(--space-4);
  margin-top: 6px;
}

@media (max-width: 767px) {
  .ajout__bloc {
    padding: var(--space-6);
    border-radius: var(--r-card);
    background: var(--surface);
    box-shadow: var(--shadow);
  }

  .ajout__trouve {
    border: 2px solid var(--brand);
  }

  .ajout__trouve .cz-person {
    padding: 0;
    border: 0;
  }

  .ajout__grille {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
