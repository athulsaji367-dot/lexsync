/* ============================================================
   LexSync FULL — js/xrefs.js
   Cross-references between acts/codes, curated by hand in
   data/xrefs.json. Only topics the author was confident about are
   included; every entry is marked curated:true in the data.

   Exposes: LS.Xrefs.relatedFor(slug, number, ds)
            -> [{topic, note, links:[{act, section, label, shortName}]}]
   ============================================================ */
var LS = window.LS || {};
window.LS = LS;

LS.Xrefs = (function () {
  // Find xref topics that mention this exact act+section.
  function relatedFor(slug, number, ds) {
    var out = [];
    (ds.xrefs || []).forEach(function (x) {
      var mine = (x.links || []).filter(function (l) {
        return l.act === slug && String(l.section) === String(number);
      });
      if (!mine.length) return;
      var others = (x.links || []).filter(function (l) {
        return !(l.act === slug && String(l.section) === String(number));
      }).map(function (l) {
        return {
          act: l.act,
          section: String(l.section),
          label: l.label || ('Section ' + l.section),
          shortName: ds.shortName(l.act)
        };
      });
      if (others.length) {
        out.push({ topic: x.topic, note: x.note || '', links: others, curated: !!x.curated });
      }
    });
    return out;
  }

  // Render the "Related provisions" block for a section detail card.
  function renderRelated(slug, number, ds) {
    var groups = relatedFor(slug, number, ds);
    if (!groups.length) return '';
    var esc = LS.esc;
    return '<div class="xref-block"><div class="xref-title">🔗 Related provisions <span class="xref-curated">curated</span></div>' +
      groups.map(function (g) {
        return '<div class="xref-group"><div class="xref-topic">' + esc(g.topic) + '</div>' +
          (g.note ? '<div class="xref-note">' + esc(g.note) + '</div>' : '') +
          '<div class="xref-links">' + g.links.map(function (l) {
            return '<button class="xref-link" data-act="' + esc(l.act) + '" data-sec="' + esc(l.section) + '">' +
              esc(l.shortName) + ' · Sec ' + esc(l.section) + '</button>';
          }).join('') + '</div></div>';
      }).join('') + '</div>';
  }

  // Wire click handlers on rendered xref links (called after each render).
  function wireXrefLinks(root) {
    (root || document).querySelectorAll('.xref-link').forEach(function (el) {
      el.addEventListener('click', function (ev) {
        ev.stopPropagation();
        LS.openProvision(el.getAttribute('data-act'), el.getAttribute('data-sec'));
      });
    });
  }

  return { relatedFor: relatedFor, renderRelated: renderRelated, wireXrefLinks: wireXrefLinks };
})();
