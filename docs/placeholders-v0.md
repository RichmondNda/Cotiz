# Placeholders restants — V0

Valeurs laissées entre crochets parce que `design/DONNEES-REFERENCE.md` et la maquette ne les fournissent pas
(règle du projet : ne pas inventer). Elles seront remplacées par les vraies données du back-end NestJS.
Inventaire fait sur `frontend/server/` et `frontend/app/` (hors écrans de démonstration `_dev`) au lot 09.

| Placeholder | Occurrences | Où il apparaît | Donnée attendue |
|---|---|---|---|
| `[DATE]` | 48 | Mocks : inscriptions, contrats, factures d’abonnement, événements de compte ; pages légales (« Dernière mise à jour ») | Date réelle (`AAAA-MM-JJ`) |
| `[N]` | 38 | KPI plateforme (souscripteurs sur la plateforme), quotas des plans Découverte et Essentiel, projets envisagés d’une demande, compteurs du projet Voyage solidaire | Entier |
| `[MONTANT]` | 25 | Collecté cumulé (fiches association plateforme), KPI de facturation V2, montants dus des relances, Voyage solidaire | Montant entier en F CFA (`formatFCFA`) |
| `[PRIX]` | 23 | Prix mensuel et annuel des 3 plans (landing, abonnement gestionnaire, plans plateforme, factures) | Grille tarifaire commerciale |
| `[email]` | 21 | Emails de contacts non fournis (responsables, gestionnaires invités, équipe plateforme, souscripteurs) | Adresse email |
| `[XX XX XX XX]`, `[XX XX XX XX XX]` | 13 | Téléphones non fournis (`+225 07 [XX XX XX XX]`) | Numéro ivoirien |
| `[URL]`, `[FICHIER]` | 10 | Preuves de paiement (image, PDF) des mocks | URL de stockage du fichier déposé |
| `[SIGNATAIRE]` | 6 | Signataire côté association d’un contrat quand aucun gestionnaire principal n’est défini | « Prénom Nom, fonction » |
| `[Responsable]` | 6 | Contact principal des associations Ressortissants de Man et Jeunesse Bouaké | Nom du gestionnaire principal |
| `[RÉFÉRENCE]`, `[RÉF. DEMANDE]`, `[RÉF. DE LA DEMANDE]`, `OM-…-[XXXX]` | 8 | Référence d’une demande de création, référence de transaction d’un paiement | Référence générée par le back-end |
| `[TEXTE DU CONTRAT]` | 5 | Texte des contrats qui n’ont pas de modèle dans les données de référence | Texte du modèle de contrat du projet |
| `[N° FACTURE]`, `[PÉRIODE EN COURS]`, `[PÉRIODE PRÉCÉDENTE]` | 7 | Factures d’abonnement de l’association (espace gestionnaire) | Numéro et période de facture |
| `[domaine]` | 4 | Emails des demandeurs (`m.ouattara@[domaine]`) | Domaine réel |
| `[LOGO]` | 4 | Nom du logo déposé dans les paramètres de l’association (pas de stockage en V0) | URL du logo stocké |
| `[Opérateur]` | 3 | Opérateur mobile money des moyens de paiement de l’association | Orange Money, MTN, Moov, Wave… |
| `[IBAN DE L’ASSOCIATION]`, `CI[XX] [XXXX XXXX XXXX XXXX XXXX]` | 2 | Coordonnées bancaires des associations (« Comment payer ») | IBAN |
| `[ADRESSE EMAIL DE CONTACT]` | 3 | Email de contact Cotiz (pied de page, connexion) | Adresse de support |
| `[DESCRIPTION]`, `[FONCTION]`, `[TÉLÉPHONE]`, `[SOURCE]` | 4 | Détail des demandes de création autres que Tontine d’Adjamé | Saisies du demandeur |
| `[Gestionnaire invité]`, `[Nouveau gestionnaire]` | 2 | Équipe gestionnaire (invitation en attente) | Prénom et nom |
| `[Membre de l’équipe]`, `[Nom]`, `[date]` | 4 | Équipe plateforme (V2) et profil super-admin | Nom, date de dernière connexion |
| `[Souscripteur]` | 1 | Notification « contrat signé » du gestionnaire | Nom du souscripteur |
| `[Prénom Nom]` | 1 | Témoignage de la landing | Nom de la personne citée |
| `[Suite du texte.]` | 1 | Pages légales (CGU, confidentialité, mentions) | Textes juridiques validés |
| `[ASSOCIATION]`, `[PROJET]`, `[NOM DU PROJET]` | 3 | Valeurs de repli des aperçus (création de projet, import) tant que le nom n’est pas chargé | — (repli d’interface, à conserver) |
