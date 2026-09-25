/* @ds-bundle: {"format": 4, "namespace": "Cotiz", "components": [{"name": "Palette"}, {"name": "Typographie"}, {"name": "Espacements"}, {"name": "Icones"}, {"name": "Bouton"}, {"name": "ChampTexte"}, {"name": "Selection"}, {"name": "ZoneDepot"}, {"name": "Badge"}, {"name": "Carte"}, {"name": "CarteKPI"}, {"name": "Tableau"}, {"name": "Navigation"}, {"name": "Retours"}, {"name": "Superpositions"}, {"name": "EtatsVides"}, {"name": "Avatar"}, {"name": "GrilleEcheances"}, {"name": "SelecteurEcheances"}, {"name": "CarteProjet"}, {"name": "CarteSynthese"}, {"name": "CarteAssociation"}, {"name": "VisionneusePreuve"}, {"name": "Notification"}, {"name": "Frise"}, {"name": "Graphiques"}, {"name": "GabaritBackOffice"}, {"name": "GabaritSouscripteur"}, {"name": "GabaritPublic"}, {"name": "GabaritConnexion"}]} */
(function () {
  'use strict';
  var ICONS = {"echeance": "<path d=\"M3 10h18M6 3v3M18 3v3\"/><rect x=\"3\" y=\"6\" width=\"18\" height=\"15\" rx=\"3\"/>", "souscripteurs": "<circle cx=\"9\" cy=\"8\" r=\"3.5\"/><path d=\"M2.5 20a6.5 6.5 0 0 1 13 0M17 11.5a3 3 0 1 0 0-6M18 20a6 6 0 0 0-2.5-4.9\"/>", "paiement": "<rect x=\"2.5\" y=\"5.5\" width=\"19\" height=\"13\" rx=\"3\"/><path d=\"M2.5 10h19M6 15h4\"/>", "contrat": "<path d=\"M14 3v5h5\"/><path d=\"M14 3H7a2.5 2.5 0 0 0-2.5 2.5v13A2.5 2.5 0 0 0 7 21h10a2.5 2.5 0 0 0 2.5-2.5V8z\"/><path d=\"M8.5 14h7M8.5 17.5h4\"/>", "notification": "<path d=\"M12 3a6 6 0 0 0-6 6c0 4-2 5-2 5h16s-2-1-2-5a6 6 0 0 0-6-6zM10 20a2 2 0 0 0 4 0\"/>", "plateforme": "<path d=\"M12 2.5l7.5 3v6c0 4.6-3.2 8.4-7.5 10-4.3-1.6-7.5-5.4-7.5-10v-6z\"/><path d=\"M9 12l2 2 4-4\"/>", "valide": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M8 12.5l2.7 2.7L16.5 9.5\"/>", "rejete": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M15 9l-6 6M9 9l6 6\"/>", "alerte": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 7.5V13M12 16.3v.2\"/>", "projet": "<path d=\"M12 3l2.6 5.5 6 .9-4.3 4.3 1 6L12 17l-5.3 2.7 1-6L3.4 9.4l6-.9z\"/>", "mon-espace": "<path d=\"M12 20.5s-7.5-4.4-7.5-9.6A4.2 4.2 0 0 1 12 8.3a4.2 4.2 0 0 1 7.5 2.6c0 5.2-7.5 9.6-7.5 9.6z\"/>", "tableau-de-bord": "<rect x=\"3\" y=\"3\" width=\"7.5\" height=\"9\" rx=\"2\"/><rect x=\"13.5\" y=\"3\" width=\"7.5\" height=\"5\" rx=\"2\"/><rect x=\"13.5\" y=\"11\" width=\"7.5\" height=\"10\" rx=\"2\"/><rect x=\"3\" y=\"15\" width=\"7.5\" height=\"6\" rx=\"2\"/>", "recherche": "<circle cx=\"11\" cy=\"11\" r=\"7\"/><path d=\"M20.5 20.5l-4.5-4.5\"/>", "parametres": "<path d=\"M4 7h10M18 7h2M4 17h4M12 17h8\"/><circle cx=\"16\" cy=\"7\" r=\"2\"/><circle cx=\"10\" cy=\"17\" r=\"2\"/>", "aide": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.5v.4M12 16.8v.2\"/>", "ajouter": "<path d=\"M12 5v14M5 12h14\"/>", "actions": "<circle cx=\"5.5\" cy=\"12\" r=\"1\"/><circle cx=\"12\" cy=\"12\" r=\"1\"/><circle cx=\"18.5\" cy=\"12\" r=\"1\"/>", "modifier": "<path d=\"M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z\"/><path d=\"M13.5 6.5l4 4\"/>", "telecharger": "<path d=\"M12 4v11M7 10.5l5 5 5-5M4.5 20h15\"/>", "importer": "<path d=\"M12 16V5M7 9.5l5-5 5 5M4.5 20h15\"/>", "fermer": "<path d=\"M6 6l12 12M18 6L6 18\"/>", "coche": "<path d=\"M5 12.5l4.5 4.5L19 7.5\"/>", "chevron-droite": "<path d=\"M9.5 6l6 6-6 6\"/>", "chevron-gauche": "<path d=\"M14.5 6l-6 6 6 6\"/>", "chevron-bas": "<path d=\"M6 9.5l6 6 6-6\"/>", "menu": "<path d=\"M4 6.5h16M4 12h16M4 17.5h16\"/>", "accueil": "<path d=\"M3.5 10.5L12 3.5l8.5 7\"/><path d=\"M5.5 9v9.5a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V9\"/><path d=\"M10 20.5V15h4v5.5\"/>", "historique": "<path d=\"M3.5 12a8.5 8.5 0 1 0 2.5-6\"/><path d=\"M3.5 4v4h4\"/><path d=\"M12 7.5V12l3 2\"/>", "profil": "<circle cx=\"12\" cy=\"8\" r=\"4\"/><path d=\"M4.5 20.5a7.5 7.5 0 0 1 15 0\"/>", "relance": "<path d=\"M21 3L10.5 13.5\"/><path d=\"M21 3l-6.5 18-4-7.5-7.5-4z\"/>", "en-attente": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 7v5l3.5 2\"/>", "information": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 11v5.5M12 7.7v.2\"/>", "association": "<rect x=\"4\" y=\"3\" width=\"16\" height=\"18\" rx=\"2.5\"/><path d=\"M9 21v-4h6v4M8.5 7.5h1M14.5 7.5h1M8.5 11.5h1M14.5 11.5h1\"/>", "deconnexion": "<path d=\"M9.5 20.5H6A2.5 2.5 0 0 1 3.5 18V6A2.5 2.5 0 0 1 6 3.5h3.5\"/><path d=\"M15.5 16.5L20 12l-4.5-4.5M20 12H9.5\"/>", "filtre": "<path d=\"M3.5 5h17l-6.5 7.5v6l-4 2v-8z\"/>", "tri": "<path d=\"M12 5v14M6.5 13.5L12 19l5.5-5.5\"/>", "voir": "<path d=\"M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z\"/><circle cx=\"12\" cy=\"12\" r=\"3\"/>", "supprimer": "<path d=\"M4 6.5h16M9.5 6.5v-2h5v2M6.5 6.5l1 13a1.5 1.5 0 0 0 1.5 1.5h6a1.5 1.5 0 0 0 1.5-1.5l1-13\"/>", "copier": "<rect x=\"8.5\" y=\"8.5\" width=\"12\" height=\"12\" rx=\"2.5\"/><path d=\"M15.5 8.5V6A2.5 2.5 0 0 0 13 3.5H6A2.5 2.5 0 0 0 3.5 6v7A2.5 2.5 0 0 0 6 15.5h2.5\"/>", "tendance": "<path d=\"M3 17l6-6 4 4 8-8\"/><path d=\"M15 7h6v6\"/>", "image": "<rect x=\"3\" y=\"4\" width=\"18\" height=\"16\" rx=\"3\"/><circle cx=\"9\" cy=\"10\" r=\"2\"/><path d=\"M21 16l-5-5-9 9\"/>", "telephone": "<rect x=\"6.5\" y=\"2.5\" width=\"11\" height=\"19\" rx=\"2.5\"/><path d=\"M11 18h2\"/>", "plans": "<path d=\"M12 3l9 5-9 5-9-5z\"/><path d=\"M3 13l9 5 9-5\"/>", "facturation": "<path d=\"M5.5 3h13v18l-3-2-3.5 2-3.5-2-3 2z\"/><path d=\"M9 8h6M9 12h6\"/>"};

  var MARK = '<svg viewBox="0 0 100 100" aria-hidden="true"><defs><mask id="__ID__"><rect width="100" height="100" fill="#fff"/><path d="M 61.9 29.3 A 23.9 23.9 0 1 0 61.9 70.7" fill="none" stroke="#000" stroke-width="9" stroke-linecap="round"/></mask></defs><circle cx="50" cy="50" r="40" fill="#7F77DD" mask="url(#__ID__)"/><circle cx="75.5" cy="50" r="5" fill="#D85A30"/></svg>';
  var markCount = 0;

  function icon(name, size) {
    var body = ICONS[name];
    if (!body) return '';
    var s = size || 24;
    return '<svg class="cz-icon" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + '</svg>';
  }

  function mark(size) {
    markCount += 1;
    var s = size || 32;
    return MARK.replace(/__ID__/g, 'cz-mark-' + markCount).replace('<svg ', '<svg width="' + s + '" height="' + s + '" ');
  }

  /* 25000 -> "25 000 F" (espace fine insécable comme séparateur de milliers, pas de décimales) */
  function formatFCFA(n, withUnit) {
    var neg = n < 0, v = Math.round(Math.abs(n)).toString();
    var out = v.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return (neg ? '−' : '') + out + (withUnit === false ? '' : ' F');
  }

  /* Pré-sélection du sélecteur d'échéances couvertes : de la plus ancienne non payée
     à la plus récente, jusqu'à épuisement du montant. La dernière couverte peut être partielle. */
  function allocate(amount, dues) {
    var rest = amount;
    var lines = dues.map(function (d) {
      var due = d.amount - (d.paid || 0);
      var take = Math.max(0, Math.min(due, rest));
      rest -= take;
      return { id: d.id, label: d.label, amount: d.amount, allocated: take,
               state: take === 0 ? 'none' : (take < due ? 'partial' : 'full') };
    });
    return { lines: lines, remaining: rest, covered: lines.filter(function (l) { return l.allocated > 0; }).length };
  }

  function hydrate(root) {
    var scope = root || document;
    Array.prototype.forEach.call(scope.querySelectorAll('[data-icon]'), function (el) {
      if (el.getAttribute('data-done')) return;
      el.innerHTML = icon(el.getAttribute('data-icon'), +(el.getAttribute('data-size') || 0) || undefined);
      el.setAttribute('data-done', '1');
    });
    Array.prototype.forEach.call(scope.querySelectorAll('[data-mark]'), function (el) {
      if (el.getAttribute('data-done')) return;
      el.innerHTML = mark(+(el.getAttribute('data-mark') || 32));
      el.setAttribute('data-done', '1');
    });
  }

  function setRole(el, role) { (el || document.body).setAttribute('data-theme', role); }

  window.Cotiz = { icons: Object.keys(ICONS), icon: icon, mark: mark, formatFCFA: formatFCFA,
                   allocate: allocate, hydrate: hydrate, setRole: setRole };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { hydrate(); });
  else hydrate();
})();
