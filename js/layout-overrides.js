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
 *  Ids are scene-local and twenty of them appear in BOTH scenes — Level 1 was
 *  built from the tutorial, so `Canvas`, `controller`, `needle`, both arms, both
 *  drop zones, the `items ` row and both counters carry the same id in each. An
 *  entry for one of those lands on the other scene too unless it says which
 *  scene it is for, so add `scene: 'Tutorial'` or `scene: 'Lbd2'` whenever the
 *  value is not also correct for the twin. The eight Level 1 entries below that
 *  hit a shared id were checked and are all no-ops in the tutorial, which is why
 *  they carry no scene.
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
    note: 'L4 pumpkin     bottom 859 -> 861   centre 334.4 -> 326  (+1, +1.82 for the plinth move in 8)',
    anchoredPos: [0.6, 114.32] },
  { id: '1484843868',
    note: 'L5 shoe        bottom 865 -> 861   centre 346.2 -> 326', anchoredPos: [-5.2, 91.5],
    sizeDelta: [634, 423] },
  { id: '1639115993',
    note: 'L6 cup         bottom 861 -> 861   centre 331.6 -> 326', anchoredPos: [0.4, 94.5],
    sizeDelta: [634, 423] },

  /* -------------------------------------------------------------------------
     4. The decorative copies under `Start Items` — no longer listed here.

     Each level shows a still copy of its item on the plinth until the first
     instruction finishes and the real, draggable row takes over. Those copies
     used to carry six hand-written positions of their own, and keeping two
     sets of numbers in step by hand did not survive first contact: the swap
     was later made to snap the playable item onto the intro copy, which threw
     away every measured value in section 3 and left the item wherever the
     intro copy happened to be authored — 4 to 11px off, the boat worst at
     10.7px, and no two levels agreeing.

     The copies are now landed on their playable twins at runtime instead, by
     `alignIntroRowToPlay` in js/controllers.js, so the measured value above is
     the only number for each item and the swap moves nothing by construction.
     That covers the item, the sample block and the + / - buttons in one pass.
     Nothing to list here; the entry is kept so the numbering still matches
     QA_CHECKLIST.md section 10.
     --------------------------------------------------------------------- */

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
  { id: '1624096888',  note: 'L6 arrow target',           anchoredPos: [0, 80] },

  /* -------------------------------------------------------------------------
     8. The two Group_485 counters themselves — Level 4.

     The plinths the item and the sample block stand on are authored
     [-634, -6.82] and [595, -6.82] in the tutorial and in five of the six
     levels. Level 4 alone uses [-633, -5] and [594, -7.5], so on entering it
     the left counter slid 1px right and 1.8px up and the right one 1px left
     and 0.7px down, carrying whatever stood on them. Small, but it is a large
     piece of furniture and it moves under a stationary item.

     The item's measured position in section 3 was measured against Level 4's
     own displaced plinth, so it is compensated by the same amount there and
     stays exactly where the frame measurement put it.
     --------------------------------------------------------------------- */
  { id: '1673506048', note: 'L4 left counter  (was [-633, -5])',   anchoredPos: [-634, -6.82] },
  { id: '1723979954', note: 'L4 right counter (was [594, -7.5])',  anchoredPos: [595, -6.82] },

  /* -------------------------------------------------------------------------
     9. The sample block on the right-hand counter.

     The block, ball or marble beside the + and - is authored at y 83, 84.2,
     83.6, 83.2, 85 and 86 in the six playable rows, while all six intro copies
     agree on [0, 84]. So it drifted 3px across the levels and, because the two
     rows disagree within a level too, twitched again at the swap.

     [0, 84] is the intro value, the mode of the playable ones and the middle
     of their range. Level 4's is quoted against its corrected plinth in 8, so
     all six now land on one point.
     --------------------------------------------------------------------- */
  { id: 'P4431814043077341934_835674479941016348',
    note: 'L1 sample block (was y 83)',   anchoredPos: [0, 84] },
  { id: '6430041245335531354',
    note: 'L2 sample block (was [-1.2, 84.2])', anchoredPos: [0, 84] },
  { id: '1301899156', note: 'L3 sample block (was y 83.6)', anchoredPos: [0, 84] },
  { id: '412690158',  note: 'L4 sample block (was y 83.2)', anchoredPos: [0, 84] },
  { id: '1910679753', note: 'L5 sample block (was y 85)',   anchoredPos: [0, 84] },
  { id: '934359594',  note: 'L6 sample block (was y 86)',   anchoredPos: [0, 84] },

  /* -------------------------------------------------------------------------
     10. The tutorial's counters, so the first screen change moves nothing.

     The tutorial is a separate scene and its gameplay group is composed on its
     own, but the two counters land within a pixel of the levels' — near enough
     that the remaining difference reads as a jolt rather than as a different
     screen. Measured in stage space with the whole ancestor chain applied:

         left counter    tutorial (-1594, -861.82)   levels (-1594, -861)
         right counter   tutorial (-362,  -870)      levels (-365,  -861)
         sample block    tutorial (-356,  -800)      levels (-365,  -777)

     So the right counter sat 3px right and 9px low, and the cube on it 9px
     right and 22px low — and that cube is the same 218x218 artwork Level 5
     uses for its ball, so the two are directly comparable and 22px apart.

     The counters are brought onto the levels' points and the cube onto the
     levels' [0, 84]. The + and - buttons are children of the right counter
     here, where the levels make them siblings, so they would otherwise ride
     the counter's move; they are given the levels' stage positions instead.

     Both counters carry the same id as Level 1's, so every entry here is
     pinned to the tutorial. Without that the first two would drag Level 1's
     counters 0.82px off the line the other five sit on.
     --------------------------------------------------------------------- */
  { id: '869446491', scene: 'Tutorial',
    note: 'tutorial left counter (was [-634, -6.82]) -> the levels\' line', anchoredPos: [-634, -6] },
  { id: '996004441', scene: 'Tutorial',
    note: 'tutorial right counter (was [598, -15])',                        anchoredPos: [595, -6] },
  { id: 'P4990759318186539232_5876910138987210187', scene: 'Tutorial',
    note: 'tutorial cube (was [6, 70]) -> the levels\' sample block',        anchoredPos: [0, 84] },
  { id: '1076061892', scene: 'Tutorial',
    note: 'tutorial + (was [119, -50])',                                    anchoredPos: [127, -59.68] },
  { id: '1399306987', scene: 'Tutorial',
    note: 'tutorial - (was [-94, -54])',                                    anchoredPos: [-98, -62.93] }
];

/* Applied by Game.loadScene(). Kept as a plain function on window so deleting
   this one file drops every override. */
window.applyLayoutOverrides = function () {
  var list = window.LAYOUT_OVERRIDES || [];
  var scene = document.body.dataset.scene;     // set by loadScene just before this
  var applied = 0;
  for (var i = 0; i < list.length; i++) {
    var o = list[i];
    if (o.scene && o.scene !== scene) continue;  // written for the twin scene
    if (!Engine.node(o.id)) continue;          // node belongs to the other scene
    if (o.anchoredPos) Engine.setAnchoredPos(o.id, o.anchoredPos[0], o.anchoredPos[1]);
    if (o.sizeDelta) Engine.setSizeDelta(o.id, o.sizeDelta[0], o.sizeDelta[1]);
    if (o.scale) Engine.setScale(o.id, o.scale[0], o.scale[1]);
    if (typeof o.rotation === 'number') Engine.setRotZ(o.id, o.rotation);
    applied++;
  }
  return applied;
};
