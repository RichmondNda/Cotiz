# Écarts entre les maquettes et l'implémentation

Les maquettes Claude Design ont été produites avant la décision « aucun fournisseur externe avant le groupe 6 ». Ce fichier liste ce qui change à l'écran. **Il prime sur les maquettes.**

> La V0 du front (`frontend/`) reproduit encore les textes de la maquette. Chaque écart ci-dessous est appliqué dans le lot où l'écran devient réel (`realAtLot` de `screens.yaml`), ou dans le lot indiqué pour les écrans à maquetter. Pour tout le reste, la maquette `design/` fait foi.

## Textes et comportements modifiés

| Écran | Maquette | Implémentation |
|---|---|---|
| Connexion souscripteur (`pub-login-mb`) | « Vos identifiants vous ont été envoyés par votre association par SMS ou email » | « Votre association vous a remis un code d'activation (en main propre, par WhatsApp ou SMS depuis son téléphone). » |
| Mot de passe oublié (`pub-reset`) | Mot de passe oublié en 3 étapes avec code reçu par SMS ou email | Étape 1 : saisir son identifiant → message « Votre demande est transmise à votre association (ou à l'équipe Cotiz pour un gestionnaire). Elle vous remettra un code. » Étapes 2 et 3 inchangées (saisie du code, nouveau mot de passe). |
| Ajout manuel d'un souscripteur (`mg-add-souscripteur`) | Envoi des identifiants : SMS / email | Après l'ajout : carte « Code d'activation » avec le code, sa date d'expiration et les boutons Copier, WhatsApp, SMS (ouvre l'application du téléphone), Imprimer. |
| Import Excel (`mg-import`) | Canal des invitations : SMS / email / les deux | Option supprimée tant que le groupe 6 n'est pas activé ; à la fin de l'import, lien vers « Codes à remettre » et fiche imprimable groupée. |
| Relances (`mg-relances`) | Règles « 3 jours avant · SMS », « Le jour J · SMS + email », compteur de caractères SMS (160) | Canaux proposés : Dans l'application, Notification push. SMS et email n'apparaissent que si la fonctionnalité est activée (features). Le compteur de 160 caractères reste utile pour le message prêt à copier. |
| Profil et paramètres (`mb-profil`) | Notifications : interrupteurs SMS / email par type (V2) | Interrupteurs « Dans l'application » et « Notifications push » par type ; SMS / email masqués tant que non activés. |
| Traitement d'une demande (`sa-demande-detail`) | Email de bienvenue envoyé automatiquement à l'approbation | Après approbation : carte « Accès du gestionnaire » avec identifiant, code d'activation et message prêt (Copier, WhatsApp, lien mailto qui ouvre la messagerie du super-admin). |
| Traitement d'une demande (`sa-demande-detail`), modales (lot 1.3) | Modale d'approbation : « … recevra ses identifiants par email », message personnalisé « joint à l'email » ; modale de refus : « Aperçu de l'email », toast « L'email a été envoyé à … », résumé « Envoyé … à <email> » | Approbation : « Vous transmettrez ensuite ses accès à … : code d'activation et message prêt », message personnalisé ajouté au message prêt. Refus : aucun email ; aperçu « Message à transmettre », puis carte « Message de refus » (Copier, lien mailto) sous le résumé « Refusée le … ». |
| Création directe d'une association (`sa-nouvelle-association`, lot 1.3) | Section « Envoi » : « Envoyer les identifiants maintenant — le gestionnaire principal les reçoit par email » | « Remettre les accès maintenant » : après la création, carte « Accès du gestionnaire » (code d'activation, message prêt) à la place du formulaire ; sans ce choix, aucun code n'est affiché à la création. |
| Utilisateurs plateforme (`sa-users`) | Invitation du personnel par email | Invitation par lien d'activation à usage unique affiché une fois, à transmettre soi-même. |
| Comptes gestionnaires (`mg-equipe`) | Invitation de gestionnaires par email | Invitation par code d'activation affiché avec message prêt, comme pour les souscripteurs. |
| Plans d'abonnement (`sa-plans`) | Note sous les cartes : « Nombre d'abonnés par plan : données illustratives. Quotas : seuls ceux du plan Pro figurent dans la spécification. » | Note retirée : abonnés et quotas viennent du back (lot 1.2). |
| Création de projet (`mg-projet-new`, lot 2.2, **temporaire**) | Assistant en 6 étapes, dont « Contrat » (modèle, signataire, signature) | Étape « Contrat » masquée et absente du récapitulatif : assistant en 5 étapes jusqu'aux contrats (lot 4.1), `pr.create` refusant `contract`. |
| Projets du gestionnaire (`mg-projets`, `mg-projet-overview`, lot 2.2, **temporaire**) | Chiffres de Centre communautaire : 9 594 000 F collectés, 82 % de recouvrement, 14 en retard, collecte par échéance | Chiffres réels du back : nuls (0 souscripteur, 0 F, recouvrement « — ») tant que les inscriptions (lot 2.3) et les paiements (lot 2.4) ne sont pas réels ; la structure des écrans est inchangée. Paramètres : cadenas « Non modifiable : fixé par le contrat » au lieu de « des paiements ont été enregistrés » tant qu'aucun paiement n'est réel. |
| Paramètres d'un projet (`mg-projet-params`, lot 2.2) | « Supprimer » refusé seulement quand des paiements existent | Suppression d'un brouillon seulement (`pr.delete`) : bouton désactivé sinon, avec « Impossible : seul un brouillon peut être supprimé. Clôturez le projet pour l'arrêter. » (ou le texte des paiements enregistrés). |

## Écrans à maquetter (absents des maquettes)

Réaliser une maquette simple au démarrage du lot indiqué, avec les composants existants de la bibliothèque (cartes, tableaux, badges, `HandoffCard`).

| Écran | Route | Lot | Endpoints | Contenu |
|---|---|---|---|---|
| Codes à remettre (`mg-codes`) | `/asso/souscripteurs/codes` | 2.3 | `mb.codes`, `mb.resend` | Liste des comptes non activés : nom, téléphone, code, date d'expiration, boutons Copier / WhatsApp / SMS depuis le téléphone / Imprimer la fiche (avec QR), case « remis ». |
| Demandes de réinitialisation (`mg-resets`) | `/asso/souscripteurs/reinitialisations` | 3.1 | `as.resets` | Souscripteurs ayant demandé un nouveau mot de passe ; bouton « Générer un code » qui affiche le code une fois avec message prêt. |
| Demandes de réinitialisation (gestionnaires) (`sa-resets`) | `/plateforme/reinitialisations` | 1.4 | `pf.resets` | Idem pour les gestionnaires, traité par le super-admin. |
| Relances — onglet « À relancer » (`mg-a-relancer`) | `/asso/relances?onglet=a-relancer` | 4.3 | `rm.queue` | File quotidienne des retardataires avec message prêt, marquage relancé / ignoré. S'ajoute aux trois onglets existants. |
| Rapprochement de relevés (`mg-rapprochement`) | `/asso/rapprochement` | 5.1 | `bk.statements`, `bk.match`, `fl.upload` | Relevé importé à gauche, déclarations à droite, propositions avec score, confirmation en lot. |
| API et webhooks (`mg-developpeurs`) | `/asso/parametres/developpeurs` | 5.2 | `dev.keys`, `dev.webhooks` | Clés d'API et webhooks sortants. |

## Nouveau composant : `HandoffCard`

Carte affichée partout où un humain doit transmettre un code ou un message : titre, destinataire, code en grand (police mono, groupes de 4), date d'expiration, message prêt (zone de texte en lecture seule), boutons **Copier le message**, **WhatsApp** (`https://wa.me/<numéro>?text=<message>`), **SMS** (`sms:<numéro>?body=<message>`), **Partager** (partage natif mobile), **Imprimer la fiche** (A6 : logo de l'association, nom, lien et QR d'activation, code), case « Remis ». Couleur de l'espace courant, jamais de couleur fonctionnelle pour la décoration.
