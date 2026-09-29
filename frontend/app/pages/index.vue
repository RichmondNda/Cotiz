<!--
  Landing (/) : héros, problème, fonctionnement en 3 étapes, deux publics, tarifs (API /plans), témoignages,
  FAQ, appel final. Sections alternées corail pâle / blanc. Mobile : héros empilé (téléphone seul),
  tarifs en carrousel horizontal, plan mis en avant en premier.
  Les visuels produit et les étapes illustrées sont des aperçus statiques (données de DONNEES-REFERENCE).
-->
<script setup lang="ts">
import type { NomIcone } from '~/utils/icons'
import { formatFCFA } from '~/utils/format'

definePageMeta({ layout: 'public' })
useHead({ title: 'Cotiz — Les cotisations de votre association, enfin sous contrôle' })

const { data: plans, pending, error, refresh } = usePlans({ statut: 'actif' })
// Mobile (carrousel) : le plan mis en avant d'abord. En desktop, l'ordre CSS rétablit l'ordre de l'API.
const plansOrdonnes = computed(() => (plans.value ?? []).filter(p => p.statut === 'actif'))

const PROBLEMES: { icone: NomIcone, titre: string, texte: string }[] = [
  { icone: 'contrat', titre: 'Le cahier qui se perd', texte: 'Des années de cotisations notées à la main, dans un seul cahier que personne d’autre ne peut consulter.' },
  { icone: 'relance', titre: 'Les relances par WhatsApp une par une', texte: 'Des soirées entières à écrire le même message à chaque membre en retard.' },
  { icone: 'aide', titre: 'Personne ne sait qui a payé quoi', texte: 'Et chaque réunion commence par un débat sur les comptes.' },
]

const PUBLICS: { titre: string, classe: string, points: { icone: NomIcone, texte: string }[] }[] = [
  {
    titre: 'Pour les gestionnaires',
    classe: 'public--gestionnaires',
    points: [
      { icone: 'projet', texte: 'Créez vos projets en quelques minutes' },
      { icone: 'echeance', texte: 'Voyez d’un coup d’œil qui est à jour' },
      { icone: 'valide', texte: 'Validez les paiements déclarés' },
      { icone: 'relance', texte: 'Relancez sans y passer vos soirées' },
    ],
  },
  {
    titre: 'Pour vos membres',
    classe: 'public--membres',
    points: [
      { icone: 'paiement', texte: 'Ils savent combien ils doivent' },
      { icone: 'en-attente', texte: 'Ils voient leur prochaine échéance' },
      { icone: 'importer', texte: 'Ils déclarent chaque virement avec une preuve' },
      { icone: 'telephone', texte: 'Tout se consulte depuis leur téléphone' },
    ],
  },
]

const FAQ = [
  { q: 'L’argent passe-t-il par Cotiz ?', r: 'Non. Vos membres versent directement à l’association, par virement, mobile money ou espèces, puis déclarent leur paiement dans Cotiz avec une preuve. Vous vérifiez sur vos comptes et validez.' },
  { q: 'Mes membres doivent-ils installer une application ?', r: '[Réponse à confirmer selon le mode de distribution retenu pour l’espace souscripteur.]' },
  { q: 'Un membre peut-il cotiser dans plusieurs associations ?', r: 'Oui. Il retrouve tous ses projets, groupés par association, dans un seul espace souscripteur.' },
  { q: 'Combien de temps faut-il pour démarrer ?', r: 'Votre demande est examinée sous 48\u00A0h ouvrées. Dès réception de vos accès, vous créez votre premier projet en quelques minutes.' },
  { q: 'Puis-je importer mes membres existants ?', r: 'Oui : un par un, ou en une fois à partir de votre fichier Excel.' },
  { q: 'Mes données sont-elles sécurisées ?', r: '[Réponse à rédiger : hébergement, sauvegardes, accès.]' },
]
const faqOuverte = ref(0)
</script>

<template>
  <div class="landing">
    <!-- 1 · Héros -->
    <section class="landing__section landing__section--pale landing-heros">
      <div class="landing-heros__texte">
        <h1 class="landing-heros__titre">
          Les cotisations de votre association, enfin sous contrôle
        </h1>
        <p class="landing-heros__sous-titre">
          Projets, échéances, paiements, relances : tout au même endroit. Vos membres savent ce qu’ils doivent,
          vous savez qui a payé.
        </p>
        <div class="landing-heros__actions">
          <CzButton
            taille="lg"
            to="/demande"
          >
            Créer mon association
          </CzButton>
          <NuxtLink
            to="#fonctionnement"
            class="landing-heros__lien"
          >
            Voir comment ça marche ↓
          </NuxtLink>
        </div>
        <p class="landing-heros__reassurance">
          Sans engagement · Mise en place en 48&nbsp;h · Données hébergées en sécurité
        </p>
      </div>
      <div class="landing-heros__visuel">
        <ApercuTableauBord class="landing-heros__tdb" />
        <ApercuTelephone class="landing-heros__tel" />
      </div>
    </section>

    <!-- 2 · Problème -->
    <section class="landing__section">
      <h2 class="landing__h2">
        Ça vous parle ?
      </h2>
      <div class="landing__grille3">
        <div
          v-for="p in PROBLEMES"
          :key="p.titre"
          class="cz-card landing-probleme"
        >
          <span class="landing-probleme__icone"><CzIcon :nom="p.icone" /></span>
          <h3 class="landing__h3">
            {{ p.titre }}
          </h3>
          <p class="landing__texte">
            {{ p.texte }}
          </p>
        </div>
      </div>
    </section>

    <!-- 3 · Fonctionnement -->
    <section
      id="fonctionnement"
      class="landing__section landing__section--pale"
    >
      <h2 class="landing__h2">
        Comment ça marche
      </h2>
      <ol class="landing__grille3 landing-etapes">
        <li class="landing-etape">
          <div class="landing-etape__titre">
            <span class="landing-etape__numero">1</span><b>Créez vos projets</b>
          </div>
          <p class="landing__texte">
            Montant, fréquence, durée : un projet se configure en quelques minutes.
          </p>
          <div
            class="cz-pcard landing-etape__carte"
            aria-hidden="true"
          >
            <div class="hd">
              <div>
                <div class="nm">
                  Centre communautaire
                </div>
                <div class="as">
                  Mensuel · {{ formatFCFA(25_000) }} · depuis mars 2026
                </div>
              </div>
              <span class="cz-badge cz-badge--success">En cours</span>
            </div>
            <div class="cz-bar">
              <i style="width: 37%" />
            </div>
            <div class="row">
              <span>{{ formatFCFA(9_594_000) }} collectés</span><span>37&nbsp;%</span>
            </div>
          </div>
        </li>
        <li class="landing-etape">
          <div class="landing-etape__titre">
            <span class="landing-etape__numero">2</span><b>Inscrivez vos membres</b>
          </div>
          <p class="landing__texte">
            Un par un, ou d’un coup avec votre fichier Excel.
          </p>
          <div
            class="cz-card landing-etape__carte landing-etape__liste"
            aria-hidden="true"
          >
            <div class="cz-person">
              <CzAvatar
                nom="Awa Koné"
                taille="sm"
              />
              <div>
                <b>Awa Koné</b>
                <div class="sub">
                  +225 07 08 09 10 11
                </div>
              </div>
              <span class="cz-badge cz-badge--success cz-badge--sm landing-etape__badge">À jour</span>
            </div>
            <div class="cz-person">
              <CzAvatar
                nom="Fatou Traoré"
                taille="sm"
                ton="warning"
              />
              <div>
                <b>Fatou Traoré</b>
                <div class="sub">
                  +225 01 22 33 44 55
                </div>
              </div>
              <span class="cz-badge cz-badge--warning cz-badge--sm landing-etape__badge">Signature attendue</span>
            </div>
          </div>
        </li>
        <li class="landing-etape">
          <div class="landing-etape__titre">
            <span class="landing-etape__numero">3</span><b>Suivez et validez</b>
          </div>
          <p class="landing__texte">
            Vos membres déclarent leurs virements, vous confirmez la réception.
          </p>
          <div
            class="cz-card landing-etape__carte landing-etape__liste"
            aria-hidden="true"
          >
            <div class="landing-etape__paiement">
              <div>
                <b>Awa Koné · {{ formatFCFA(75_000) }}</b>
                <div class="landing-etape__mois">
                  septembre, octobre, novembre
                </div>
              </div>
              <span class="cz-badge cz-badge--warning cz-badge--sm">En attente</span>
            </div>
            <div class="landing-etape__boutons">
              <span class="cz-btn cz-btn--danger-outline cz-btn--sm">Rejeter</span>
              <span class="cz-btn cz-btn--success cz-btn--sm">Valider le paiement</span>
            </div>
          </div>
        </li>
      </ol>
    </section>

    <!-- 4 · Deux publics -->
    <section class="landing__section">
      <h2 class="landing__h2">
        Deux publics, un seul outil
      </h2>
      <div class="landing__grille2">
        <div
          v-for="p in PUBLICS"
          :key="p.titre"
          class="landing-public"
          :class="p.classe"
        >
          <h3 class="landing-public__titre">
            {{ p.titre }}
          </h3>
          <ul class="landing-public__liste">
            <li
              v-for="pt in p.points"
              :key="pt.texte"
            >
              <CzIcon
                :nom="pt.icone"
                :taille="22"
              />{{ pt.texte }}
            </li>
          </ul>
        </div>
      </div>
    </section>

    <!-- 5 · Tarifs -->
    <section
      id="tarifs"
      class="landing__section landing__section--pale"
    >
      <h2 class="landing__h2">
        Tarifs
      </h2>
      <div
        v-if="pending"
        class="landing-tarifs"
        aria-busy="true"
      >
        <div
          v-for="i in 3"
          :key="i"
          class="cz-price landing-tarifs__squelette"
        >
          <CzSkeleton
            largeur="40%"
            :hauteur="16"
          />
          <CzSkeleton
            largeur="60%"
            :hauteur="28"
          />
          <CzSkeleton largeur="80%" />
          <CzSkeleton largeur="70%" />
          <CzSkeleton largeur="75%" />
          <CzSkeleton
            :hauteur="42"
            forme="pilule"
          />
        </div>
      </div>
      <CzEmpty
        v-else-if="error"
        icone="alerte"
        ton="danger"
        titre="Les tarifs n’ont pas pu être chargés"
        description="Vérifiez votre connexion puis réessayez."
      >
        <template #action>
          <CzButton
            variante="secondaire"
            @click="refresh()"
          >
            Réessayer
          </CzButton>
        </template>
      </CzEmpty>
      <CzEmpty
        v-else-if="!plansOrdonnes.length"
        icone="plans"
        ton="neutral"
        titre="Tarifs bientôt disponibles"
        description="Contactez-nous pour connaître nos formules."
      />
      <div
        v-else
        class="landing-tarifs"
      >
        <CarteTarif
          v-for="(p, i) in plansOrdonnes"
          :key="p.id"
          :plan="p"
          class="landing-tarifs__carte"
          :style="{ '--ordre-desktop': i }"
          :class="{ 'is-avant': p.misEnAvant }"
        />
      </div>
      <p class="landing-tarifs__plus">
        Besoin de plus ? <NuxtLink
          to="#contact"
          class="cz-tap"
        >
          Contactez-nous
        </NuxtLink>
      </p>
    </section>

    <!-- 6 · Témoignages -->
    <section class="landing__section">
      <h2 class="landing__h2">
        Ils organisent leur association avec Cotiz
      </h2>
      <div class="landing__grille3">
        <figure
          v-for="i in 3"
          :key="i"
          class="cz-card cz-card--flat landing-temoignage"
        >
          <blockquote class="landing-temoignage__citation">
            « [Citation d’un responsable d’association, à recueillir] »
          </blockquote>
          <figcaption class="cz-person">
            <CzAvatar initiales="··" />
            <div>
              <b>[Prénom Nom]</b>
              <div class="sub">
                [Rôle] · [Association]
              </div>
            </div>
          </figcaption>
        </figure>
      </div>
    </section>

    <!-- 7 · FAQ -->
    <section
      id="faq"
      class="landing__section landing__section--pale"
    >
      <h2 class="landing__h2">
        Questions fréquentes
      </h2>
      <div class="landing-faq">
        <CzAccordeon
          v-for="(f, i) in FAQ"
          :key="f.q"
          :titre="f.q"
          :ouvert="faqOuverte === i"
          @update:ouvert="faqOuverte = $event ? i : -1"
        >
          {{ f.r }}
        </CzAccordeon>
      </div>
    </section>

    <!-- 8 · Appel final -->
    <section class="cz-cta-band landing-cta">
      <b>Prêt à organiser votre association ?</b>
      <CzButton
        variante="blanc"
        taille="lg"
        to="/demande"
      >
        Créer mon association
      </CzButton>
    </section>
  </div>
</template>

<style scoped>
/* Largeur utile 1200 px (gouttières de 120 px à 1440 px), rythme vertical 72 px. */
.landing__section {
  --gouttiere: max(var(--space-12), calc((100% - 1200px) / 2));

  padding: calc(var(--space-12) + var(--space-6)) var(--gouttiere);
  background: var(--surface);
  scroll-margin-top: 72px;
}

.landing__section--pale {
  background: var(--corail-page);
}

.landing__h2 {
  margin: 0 0 var(--space-8);
  font-family: var(--font-display);
  font-size: 32px;
  font-weight: 600;
  line-height: 1.2;
  color: var(--ink-title);
  text-align: center;
}

.landing__h3 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 17px;
  font-weight: 600;
  color: var(--text-strong);
}

.landing__texte {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-muted);
}

.landing__grille3,
.landing__grille2 {
  display: grid;
  gap: var(--space-6);
}

.landing__grille3 {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.landing__grille2 {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

/* ------------------------------------------------------------ Héros */
.landing-heros {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-12);
  align-items: center;
  padding-bottom: calc(var(--space-12) + var(--space-8));
}

.landing-heros__texte {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.landing-heros__titre {
  margin: 0;
  font-family: var(--font-display);
  font-size: 44px;
  font-weight: 600;
  line-height: 1.15;
  letter-spacing: -.01em;
  color: var(--ink-title);
}

.landing-heros__sous-titre {
  max-width: 520px;
  margin: 0;
  font-size: 16px;
  line-height: 1.6;
  color: var(--text);
}

.landing-heros__actions {
  display: flex;
  align-items: center;
  gap: var(--space-6);
}

.landing-heros__lien {
  padding: var(--space-3) var(--space-1);
  font-size: 14.5px;
  font-weight: 600;
  color: var(--violet-dark);
  text-decoration: none;
}

.landing-heros__lien:hover {
  color: var(--ink-title);
}

.landing-heros__reassurance {
  margin: 0;
  font-size: 13px;
  color: var(--text-muted);
}

.landing-heros__visuel {
  position: relative;
  height: 380px;
}

.landing-heros__tdb {
  position: absolute;
  left: 0;
  top: 20px;
}

.landing-heros__tel {
  position: absolute;
  right: 0;
  bottom: -10px;
}

/* ------------------------------------------------------------ Problème */
.landing-probleme {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.landing-probleme__icone {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: var(--r-md);
  background: var(--corail-pale);
  color: var(--corail-dark);
}

/* ------------------------------------------------------------ Étapes */
.landing-etapes {
  margin: 0;
  padding: 0;
  list-style: none;
}

.landing-etape {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.landing-etape__titre {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.landing-etape__titre b {
  font-family: var(--font-display);
  font-size: 17px;
  font-weight: 600;
  color: var(--text-strong);
}

.landing-etape__numero {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--violet);
  color: var(--on-brand);
  font-family: var(--font-display);
  font-weight: 600;
}

.landing-etape__carte.cz-pcard {
  width: auto;
  cursor: default;
}

.landing-etape__liste {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
}

.landing-etape__badge {
  margin-left: auto;
}

.landing-etape__paiement {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-2);
}

.landing-etape__paiement b {
  font-size: 13.5px;
  color: var(--text-strong);
}

.landing-etape__mois {
  font-size: 12px;
  color: var(--text-muted);
}

.landing-etape__boutons {
  display: flex;
  gap: var(--space-2);
}

.landing-etape__boutons .cz-btn {
  cursor: default;
}

/* ------------------------------------------------------------ Deux publics */
.landing-public {
  padding: var(--space-6);
  border-radius: var(--r-card);
}

.public--gestionnaires {
  background: var(--violet-pale);
}

.public--membres {
  background: var(--corail-page);
}

.landing-public__titre {
  margin: 0 0 var(--space-4);
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 600;
}

.public--gestionnaires .landing-public__titre {
  color: var(--violet-dark);
}

.public--membres .landing-public__titre {
  color: var(--corail-dark);
}

.landing-public__liste {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 14.5px;
}

.landing-public__liste li {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.landing-public__liste .cz-icon {
  flex-shrink: 0;
}

.public--gestionnaires .cz-icon {
  color: var(--violet);
}

.public--membres .cz-icon {
  color: var(--corail);
}

/* ------------------------------------------------------------ Tarifs */
.landing-tarifs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-6);
  align-items: stretch;
}

.landing-tarifs__carte {
  order: var(--ordre-desktop);
}

.landing-tarifs__squelette {
  gap: var(--space-4);
}

.landing-tarifs__plus {
  margin: var(--space-6) 0 0;
  font-size: 14px;
  color: var(--text-muted);
  text-align: center;
}

.landing-tarifs__plus a {
  color: var(--text-muted);
  text-decoration: none;
}

.landing-tarifs__plus a:hover {
  color: var(--violet-dark);
}

/* ------------------------------------------------------------ Témoignages */
.landing-temoignage {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  margin: 0;
}

.landing-temoignage__citation {
  margin: 0;
  font-size: 15px;
  font-style: italic;
  color: var(--text-muted);
}

/* ------------------------------------------------------------ FAQ */
.landing-faq {
  display: flex;
  flex-direction: column;
  max-width: 760px;
  margin: 0 auto;
}

/* ------------------------------------------------------------ Appel final */
.landing-cta {
  padding: var(--space-12) max(var(--space-12), calc((100% - 1200px) / 2));
}

.landing-cta b {
  font-size: 26px;
}

/* ------------------------------------------------------------ Tablette */
@media (max-width: 1023px) {
  .landing-heros {
    grid-template-columns: 1fr;
  }

  .landing-heros__visuel {
    height: auto;
    display: flex;
    justify-content: center;
  }

  .landing-heros__tdb {
    display: none;
  }

  .landing-heros__tel {
    position: static;
  }
}

/* ------------------------------------------------------------ Mobile */
@media (max-width: 767px) {
  .landing__section {
    padding: calc(var(--space-8) + var(--space-2)) var(--space-4);
  }

  .landing__h2 {
    margin-bottom: var(--space-6);
    font-size: 24px;
  }

  .landing__grille3,
  .landing__grille2 {
    grid-template-columns: 1fr;
    gap: var(--space-4);
  }

  .landing-heros {
    gap: var(--space-8);
    padding: var(--space-8) var(--space-4) calc(var(--space-8) + var(--space-2));
  }

  .landing-heros__titre {
    font-size: 32px;
  }

  .landing-heros__actions {
    flex-direction: column;
    align-items: stretch;
    gap: var(--space-2);
  }

  .landing-heros__actions .cz-btn {
    width: 100%;
  }

  .landing-heros__lien {
    align-self: flex-start;
  }

  .landing-tarifs {
    display: flex;
    gap: var(--space-4);
    margin: 0 calc(-1 * var(--space-4));
    padding: var(--space-1) var(--space-4) var(--space-3);
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    scroll-padding: 0 var(--space-4);
  }

  .landing-tarifs__carte {
    flex: 0 0 280px;
    order: 0;
    scroll-snap-align: start;
  }

  /* Carrousel : le plan mis en avant en premier. */
  .landing-tarifs__carte.is-avant {
    order: -1;
  }

  .landing-cta {
    flex-direction: column;
    align-items: stretch;
    gap: var(--space-4);
    padding: var(--space-8) var(--space-4);
  }

  .landing-cta .cz-btn {
    width: 100%;
  }
}
</style>
