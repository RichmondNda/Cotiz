# SelecteurEcheances

Sélecteur d'échéances couvertes par un paiement déclaré.

- Pré-sélection à la saisie du montant : de la plus ancienne non payée à la plus récente jusqu'à épuisement (`Cotiz.allocate(montant, échéances)`).
- Montant insuffisant : la dernière couverte passe en « partielle » avec le montant affecté (10 000 / 25 000 F).
- Ajustement manuel : cocher / décocher ; « Reste à répartir » mis à jour en direct, en `danger-fg` si négatif.
- Ordre : retards en premier sur `danger-bg`, puis échéance courante, puis futures (non cochées à 55 %).
- Bouton d'envoi désactivé tant que le reste ≠ 0 ou que la preuve est absente.
