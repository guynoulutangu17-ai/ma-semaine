/* Ma semaine : compléments d'interface de la refonte (ui.css). N'altère aucune donnée.
   - sépare la ligne « date / professeur » de la carte du prochain cours (pour y mettre des icônes) ;
   - raccourci « Mes rappels » de la cloche. */
(function () {
  "use strict";
  var hs = document.getElementById("hs");
  function split() {
    if (!hs || hs.childNodes.length !== 1 || hs.firstChild.nodeType !== 3) return;
    var t = hs.textContent, i = t.indexOf(" avec ");
    if (i < 0) return;
    var d = document.createElement("span"), w = document.createElement("span");
    d.className = "hs-date"; w.className = "hs-who";
    d.textContent = t.slice(0, i); w.textContent = t.slice(i + 6);
    hs.textContent = "";
    hs.appendChild(d); hs.appendChild(w);
  }
  if (hs && window.MutationObserver) { new MutationObserver(split).observe(hs, { childList: true }); split(); }

  var bell = document.getElementById("bell");
  if (bell) bell.addEventListener("click", function () {
    var tab = document.getElementById("t-horaire");
    if (tab && tab.getAttribute("aria-selected") !== "true") tab.click();
    var v = document.getElementById("v-day");
    if (v && v.getAttribute("aria-pressed") !== "true") v.click();
    setTimeout(function () {
      var c = document.getElementById("remcard");
      if (c) { c.scrollIntoView({ behavior: "smooth", block: "center" }); var i = document.getElementById("reminput"); if (i) i.focus({ preventScroll: true }); }
    }, 120);
  });
})();
