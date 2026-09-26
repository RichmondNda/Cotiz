<!-- Pied de page public : logo et slogan, 4 colonnes (Produit, Ressources, Légal, Contact), mention légale. Mobile : 2 colonnes. -->
<script setup lang="ts">
const COLONNES = [
  {
    titre: 'Produit',
    liens: [
      { label: 'Fonctionnement', to: '/#fonctionnement' },
      { label: 'Tarifs', to: '/#tarifs' },
      { label: 'FAQ', to: '/#faq' },
      { label: 'Créer mon association', to: '/demande' },
    ],
  },
  {
    titre: 'Ressources',
    liens: [
      { label: 'Espace association', to: '/connexion/association' },
      { label: 'Espace souscripteur', to: '/connexion' },
      { label: 'Mot de passe oublié', to: '/mot-de-passe' },
    ],
  },
  {
    titre: 'Légal',
    liens: [
      { label: 'Conditions générales', to: '/legal/cgu' },
      { label: 'Confidentialité', to: '/legal/confidentialite' },
      { label: 'Mentions légales', to: '/legal/mentions' },
    ],
  },
]
</script>

<template>
  <footer class="pub-pied">
    <div class="pub-pied__grille">
      <div class="pub-pied__marque">
        <NuxtLink
          to="/"
          class="pub-pied__logo"
          aria-label="Cotiz — accueil"
        >
          <CzLogo
            :taille="28"
            :taille-texte="19"
          />
        </NuxtLink>
        <span class="pub-pied__slogan">votre association organisée</span>
        <!-- Réseaux sociaux : adresses non fournies (maquette : liens vides). -->
        <div class="pub-pied__reseaux">
          <span
            class="cz-btn cz-btn--icon cz-btn--sm"
            aria-label="Facebook"
            role="img"
          >f</span>
          <span
            class="cz-btn cz-btn--icon cz-btn--sm"
            aria-label="LinkedIn"
            role="img"
          >in</span>
          <span
            class="cz-btn cz-btn--icon cz-btn--sm"
            aria-label="WhatsApp"
            role="img"
          >wa</span>
        </div>
      </div>
      <nav
        v-for="c in COLONNES"
        :key="c.titre"
        class="pub-pied__colonne"
        :aria-label="c.titre"
      >
        <div class="pub-pied__titre">
          {{ c.titre }}
        </div>
        <NuxtLink
          v-for="l in c.liens"
          :key="l.label"
          :to="l.to"
        >
          {{ l.label }}
        </NuxtLink>
      </nav>
      <div
        id="contact"
        class="pub-pied__colonne"
      >
        <div class="pub-pied__titre">
          Contact
        </div>
        <span>[ADRESSE EMAIL DE CONTACT]</span>
        <span>Abidjan, Côte d’Ivoire</span>
      </div>
    </div>
    <div class="pub-pied__bas">
      © 2026 Cotiz · Tous droits réservés
    </div>
  </footer>
</template>

<style scoped>
.pub-pied {
  background: var(--surface);
  border-top: 1px solid var(--border);
  font-family: var(--font-text);
  font-size: 13.5px;
}

.pub-pied__grille {
  display: grid;
  grid-template-columns: 1.6fr repeat(4, minmax(0, 1fr));
  gap: var(--space-8);
  max-width: 1440px;
  padding: var(--space-12) var(--space-12) var(--space-6);
}

.pub-pied__marque {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.pub-pied__logo {
  display: flex;
  text-decoration: none;
}

.pub-pied__slogan {
  color: var(--corail-dark);
}

.pub-pied__reseaux {
  display: flex;
  gap: var(--space-3);
  margin-top: var(--space-3);
}

.pub-pied__reseaux .cz-btn {
  cursor: default;
}

.pub-pied__colonne {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  color: var(--text-muted);
}

.pub-pied__colonne a {
  color: var(--text-muted);
  text-decoration: none;
}

.pub-pied__colonne a:hover {
  color: var(--brand-dark);
}

.pub-pied__titre {
  font-family: var(--font-display);
  font-size: 13px;
  font-weight: 600;
  color: var(--text-strong);
}

.pub-pied__bas {
  padding: var(--space-4) var(--space-12) var(--space-6);
  border-top: 1px solid var(--divider-row);
  font-size: 12px;
  color: var(--text-muted);
}

@media (max-width: 767px) {
  .pub-pied__grille {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-6) var(--space-4);
    padding: var(--space-8) var(--space-4) var(--space-6);
  }

  .pub-pied__bas {
    padding: var(--space-3) var(--space-4) var(--space-6);
  }
}
</style>
