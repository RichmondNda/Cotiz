<!--
  Confirmation de demande (/demande/confirmation) : icône de succès animée, email de réponse et référence de la
  demande qui vient d'être envoyée, frise « Et maintenant ? », retour à l'accueil.
  Accès direct ou rechargement : la demande n'est plus en mémoire, le texte reste générique (sans email ni référence).
-->
<script setup lang="ts">
definePageMeta({ layout: 'formulaire', theme: 'manager' })
useHead({ title: 'Demande envoyée — Cotiz' })

const demande = useDemandeEnvoyee()
</script>

<template>
  <div class="confirmation">
    <div class="cz-card cz-card--lg confirmation__carte">
      <CzIconeSucces />
      <h1 class="confirmation__titre">
        Demande envoyée !
      </h1>
      <p class="confirmation__texte">
        Nous examinons votre demande et revenons vers vous sous 48&nbsp;h ouvrées<template v-if="demande">
          à l’adresse <b>{{ demande.email }}</b>
        </template>.
      </p>
      <div
        v-if="demande"
        class="confirmation__reference"
      >
        <span>Référence</span><span class="confirmation__code">{{ demande.reference }}</span>
      </div>
      <div class="confirmation__suite">
        <h2 class="confirmation__h2">
          Et maintenant ?
        </h2>
        <Frise
          label="Suite de la demande"
          :evenements="[
            { titre: 'Demande reçue', detail: 'Aujourd’hui · c’est fait', ton: 'success' },
            { titre: 'Vérification par notre équipe', detail: 'Sous 48\u00A0h ouvrées', ton: 'warning' },
            { titre: 'Réception de vos accès', detail: 'Par email, pour configurer votre espace', ton: 'info' },
          ]"
        />
      </div>
      <CzButton
        variante="secondaire"
        to="/"
        class="confirmation__retour"
      >
        Retour à l’accueil
      </CzButton>
    </div>
  </div>
</template>

<style scoped>
.confirmation {
  display: flex;
  justify-content: center;
  padding: calc(var(--space-12) + var(--space-2)) var(--space-12);
}

.confirmation__carte {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-4);
  width: 600px;
  max-width: 100%;
  padding: calc(var(--space-8) + var(--space-2)) var(--space-12);
  text-align: center;
}

.confirmation__titre {
  margin: 0;
  font-family: var(--font-display);
  font-size: 30px;
  font-weight: 600;
  color: var(--text-strong);
}

.confirmation__texte {
  max-width: 460px;
  margin: 0;
  font-size: 15px;
  line-height: 1.6;
  color: var(--text);
}

.confirmation__reference {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--border);
  border-radius: var(--r-field);
  background: var(--surface-subtle);
}

.confirmation__reference span:first-child {
  font-size: 12.5px;
  color: var(--text-muted);
}

.confirmation__code {
  font-family: var(--font-mono);
  font-size: 14px;
  color: var(--text-strong);
}

.confirmation__suite {
  width: 100%;
  max-width: 420px;
  margin-top: var(--space-2);
  text-align: left;
}

.confirmation__h2 {
  margin: 0 0 var(--space-3);
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 600;
  color: var(--text-strong);
}

.confirmation__retour {
  margin-top: var(--space-2);
}

@media (max-width: 767px) {
  .confirmation {
    padding: var(--space-6) var(--space-4);
  }

  .confirmation__carte {
    padding: var(--space-6) var(--space-4);
  }

  .confirmation__titre {
    font-size: 26px;
  }

  .confirmation__retour {
    width: 100%;
    height: var(--control-lg);
  }
}
</style>
