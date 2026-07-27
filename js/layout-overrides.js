/* ============================================================================
 *  layout-overrides.js — alignment corrections
 *
 *  js/data.js is generated from the Unity scene and must not be hand-edited, so
 *  positions that need correcting live here instead. Each entry is applied once
 *  per scene load, after the tree is built and before anything is shown.
 *
 *  Values are Unity RectTransform values, exactly as the God Mode panel reports
 *  them (Shift + G -> pick an element -> read aPos X / Y). Copy them straight in.
 *
 *  Everything below came out of a measurement, not an eyeball — see
 *  QA_CHECKLIST.md section 10 for the numbers.
 * ========================================================================== */
window.LAYOUT_OVERRIDES = [

  /* -------------------------------------------------------------------------
     1. The + and - buttons.

     The six levels author them a few pixels apart — + spans x 715..726 and
     y -63..-69, - spans x 495..501 and y -67..-72.5 — so the buttons twitch as
     the child moves between levels. Their parents (`items ` and `Item 1`) are
     byte-identical in all six, so one shared value is safe. The median of the
     authored values is used, which keeps every level within ~5px of where its
     artist put it while making all six agree.
     --------------------------------------------------------------------- */
  { id: '1964523580',  note: 'L1 +', anchoredPos: [722, -66.5] },
  { id: '223936034',   note: 'L2 +', anchoredPos: [722, -66.5] },
  { id: '201509262',   note: 'L3 +', anchoredPos: [722, -66.5] },
  { id: '1089954281',  note: 'L4 +', anchoredPos: [722, -66.5] },
  { id: '1545127305',  note: 'L5 +', anchoredPos: [722, -66.5] },
  { id: '1204852187',  note: 'L6 +', anchoredPos: [722, -66.5] },

  { id: '1290318',     note: 'L1 -', anchoredPos: [497, -69.75] },
  { id: '613314095',   note: 'L2 -', anchoredPos: [497, -69.75] },
  { id: '1040755245',  note: 'L3 -', anchoredPos: [497, -69.75] },
  { id: '1168211150',  note: 'L4 -', anchoredPos: [497, -69.75] },
  { id: '1496711350',  note: 'L5 -', anchoredPos: [497, -69.75] },
  { id: '2037826191',  note: 'L6 -', anchoredPos: [497, -69.75] },

  /* -------------------------------------------------------------------------
     2. The needle.

     Level 1 authors it at [0, 26]; the other five levels and the tutorial all
     use [-4.9, 24.7]. Level 1 is the odd one out, so it is brought into line
     with the majority — the beam it hangs from is at [1, 71] in all six.
     --------------------------------------------------------------------- */
  { id: '1417654962', note: 'L1 needle -> match the other five', anchoredPos: [-4.9, 24.7] },

  /* -------------------------------------------------------------------------
     3. The item on its plinth.

     The six items sit in differently sized boxes with different amounts of
     transparent padding, so their anchoredPos values say nothing about whether
     they look like they are standing on the plinth. Measuring the sprites' own
     alpha instead, the visible bottom edges spanned 33.5px: Level 1's boat
     floated 17px high and Level 5's shoe sat 16.5px low, sunk into the plinth's
     grey rim, while levels 2, 3, 4 and 6 clustered within 12px of each other.

     Levels 1-4 are put on that cluster's line: with these values all four land
     their visible bottom at stage y = 861, measured.

     Levels 5 and 6 use values supplied by the designer from God Mode instead.
     A designer eyeballing each object per-shape beats a single arithmetic rule
     here — a flat-soled shoe reads as resting lower than a soft-based cup — so
     these win over the computed line. What they cost, measured: the shoe sits
     16.5px below the other four and the cup 6px above. Both remain a one-number
     change if that is not the intent.
     --------------------------------------------------------------------- */
  { id: 'P6182470191076958758_8735811445333237610',
    note: 'L1 boat  (was 123; floated 17px high)  -> line 861', anchoredPos: [8, 106] },
  { id: '8735811446612019836',
    note: 'L2 orange                              -> line 861', anchoredPos: [12.2, 109.5] },
  { id: '1587350453',
    note: 'L3 watermelon                          -> line 861', anchoredPos: [6, 122.5] },
  { id: '873686364',
    note: 'L4 pumpkin                             -> line 861', anchoredPos: [8, 112.7] },

  /* designer values, God Mode — these override the computed line */
  { id: '1484843868',
    note: 'L5 shoe  (designer)                     -> line 877.5', anchoredPos: [14.98, 71],
    sizeDelta: [634, 423] },
  { id: '1639115993',
    note: 'L6 cup   (designer)                     -> line 855',   anchoredPos: [6, 100.5],
    sizeDelta: [634, 423] }
];

/* Applied by Game.loadScene(). Kept as a plain function on window so deleting
   this one file drops every override. */
window.applyLayoutOverrides = function () {
  var list = window.LAYOUT_OVERRIDES || [];
  var applied = 0;
  for (var i = 0; i < list.length; i++) {
    var o = list[i];
    if (!Engine.node(o.id)) continue;          // node belongs to the other scene
    if (o.anchoredPos) Engine.setAnchoredPos(o.id, o.anchoredPos[0], o.anchoredPos[1]);
    if (o.sizeDelta) Engine.setSizeDelta(o.id, o.sizeDelta[0], o.sizeDelta[1]);
    if (o.scale) Engine.setScale(o.id, o.scale[0], o.scale[1]);
    if (typeof o.rotation === 'number') Engine.setRotZ(o.id, o.rotation);
    applied++;
  }
  return applied;
};
