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

     Both axes are set from the RENDERED frame, not from arithmetic on the
     sprite files. Each level was screenshotted twice — once with the item shown
     and once with it hidden — and the pixels that changed between the two are
     the item and nothing else. Measured at 1920x1080 so one screen pixel is one
     stage unit. That is what finally settled it: reasoning from sprite alpha put
     the six within 0px of each other on paper while the frame still showed an
     8px spread, because the artwork has soft edges the alpha threshold missed.

     Measured before this pass:
         bottom edge   [861, 867, 863, 859, 865, 861]   8px spread
         visual centre [336.7, 336.2, 330.4, 334.4, 346.2, 331.6]   15.8px spread
         plinth centre 326  — so every item sat right of its own plinth, the
                             shoe worst at 20px

     Targets: bottom on 861 (the mode), visual centre on the plinth centre 326.
     The "visual centre" is the intensity-weighted centre of the changed pixels,
     not the midpoint of the bounding box — for a boat with sails or a shoe with
     a toe those are not the same thing, and the weighted one is what the eye
     reads as the middle.
     --------------------------------------------------------------------- */
  { id: 'P6182470191076958758_8735811445333237610',
    note: 'L1 boat        bottom 861 -> 861   centre 336.7 -> 326', anchoredPos: [-2.7, 106] },
  { id: '8735811446612019836',
    note: 'L2 orange      bottom 867 -> 861   centre 336.2 -> 326', anchoredPos: [2, 115.5] },
  { id: '1587350453',
    note: 'L3 watermelon  bottom 863 -> 861   centre 330.4 -> 326', anchoredPos: [1.6, 124.5] },
  { id: '873686364',
    note: 'L4 pumpkin     bottom 859 -> 861   centre 334.4 -> 326', anchoredPos: [-0.4, 112.5] },
  { id: '1484843868',
    note: 'L5 shoe        bottom 865 -> 861   centre 346.2 -> 326', anchoredPos: [-5.2, 91.5],
    sizeDelta: [634, 423] },
  { id: '1639115993',
    note: 'L6 cup         bottom 861 -> 861   centre 331.6 -> 326', anchoredPos: [0.4, 94.5],
    sizeDelta: [634, 423] },

  /* -------------------------------------------------------------------------
     4. The decorative item copy under `Start Items`.

     Each level shows a still copy of its item on the plinth until the first
     instruction finishes and the real, draggable row takes over. Those copies
     carry their own coordinates and drifted the same way — a 24.5px spread —
     so the item appeared to hop the moment the row swapped. Same line, same
     arithmetic.
     --------------------------------------------------------------------- */
  { id: '8735811446667022693', note: 'L1 start copy, boat',       anchoredPos: [8, 106] },
  { id: '8735811444812058264', note: 'L2 start copy, orange',     anchoredPos: [13, 109.5] },
  { id: '284409989',           note: 'L3 start copy, watermelon', anchoredPos: [6, 122.5] },
  { id: '1419276867',          note: 'L4 start copy, pumpkin',    anchoredPos: [8, 114.5] },
  { id: '434464500',           note: 'L5 start copy, shoe',       anchoredPos: [6, 87.5] },
  { id: '754009483',           note: 'L6 start copy, cup',        anchoredPos: [6, 94.5] },

  /* -------------------------------------------------------------------------
     5. Level 1 drew the whole balance ~3% smaller than every other level.

     `controller`, `Support base` and both arms are authored 251x291 / 131x158
     in Level 1, where levels 2-6 AND the tutorial all use 259x300 / 135x163.
     None of these Images preserve their aspect, so the artwork stretches to the
     box and Level 1's stand and pan arms rendered visibly smaller. Level 1 is
     brought onto the majority size.

     Safe to change: every child here has centred anchors and a centred pivot,
     so growing a parent's box moves its centre nowhere and the pans, needle and
     beam keep their measured positions.
     --------------------------------------------------------------------- */
  { id: '571894881',  note: 'L1 controller   -> match levels 2-6', sizeDelta: [259, 300] },
  { id: '108770353',  note: 'L1 Support base -> match levels 2-6', sizeDelta: [259, 300] },
  { id: '1206703791', note: 'L1 left arm     -> match levels 2-6', sizeDelta: [135, 163] },
  { id: '1896114757', note: 'L1 right arm    -> match levels 2-6', sizeDelta: [135, 163] },

  /* -------------------------------------------------------------------------
     6. The two drop zones, again Level 1 only.

     These are the alpha-0 Images that items and blocks are parented into, so
     although nothing draws them they decide where everything lands inside the
     bowl. Level 1 authored the left one at [4.601, 128] / 282.797x95 and the
     right at [0, 124], where levels 2-6 AND the tutorial use [8.25, 98] / 250x95
     and [0, 98]. A dropped item therefore sat ~30 units higher in the bowl in
     Level 1 than anywhere else. Brought onto the shared value.
     --------------------------------------------------------------------- */
  { id: '357859291',  note: 'L1 left drop zone  -> match levels 2-6 + tutorial',
    anchoredPos: [8.25, 98], sizeDelta: [250, 95] },
  { id: '1007664004', note: 'L1 right drop zone -> match levels 2-6 + tutorial',
    anchoredPos: [0, 98] },

  /* -------------------------------------------------------------------------
     7. The guidance arrow's target marker.

     `GameObject` inside the left drop zone is what the dotted arrow aims at.
     It was authored at three different heights — y 30 in Level 1, 80 in levels
     2, 5 and 6, and 100 in levels 3 and 4 — so the arrowhead pointed at a
     different part of the bowl depending on the level. All six use the majority
     value.
     --------------------------------------------------------------------- */
  { id: '1673286253',  note: 'L1 arrow target (was 30)',  anchoredPos: [0, 80] },
  { id: '1720261514',  note: 'L2 arrow target',           anchoredPos: [0, 80] },
  { id: '717215848',   note: 'L3 arrow target (was 100)', anchoredPos: [0, 80] },
  { id: '1318447100',  note: 'L4 arrow target (was 100)', anchoredPos: [0, 80] },
  { id: '1137182624',  note: 'L5 arrow target',           anchoredPos: [0, 80] },
  { id: '1624096888',  note: 'L6 arrow target',           anchoredPos: [0, 80] }
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
