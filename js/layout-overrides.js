/* ============================================================================
 *  layout-overrides.js — alignment corrections measured in God Mode
 *
 *  js/data.js is generated from the Unity scene and must not be hand-edited, so
 *  positions that need correcting live here instead. Each entry is applied once
 *  per scene load, after the tree is built and before anything is shown.
 *
 *  Values are Unity RectTransform values, exactly as the God Mode panel reports
 *  them (Shift + G -> pick an element -> read aPos X / Y, sizeDelta, scale).
 *  Copy them straight in.
 * ========================================================================== */
window.LAYOUT_OVERRIDES = [
  {
    /* Level 5 — the item node is named "Watermelon" in the scene but carries
       the shoe artwork; the name is stale from a duplicated object in the
       original project. It sat low and left of the other levels' items, so the
       shoe hung off the plinth. */
    id: '1484843868',
    note: 'Level 5 item (shoe) — align with the other levels\' plinth',
    anchoredPos: [14.98, 71],
    sizeDelta: [634, 423]
  }
];

/* Applied by Game.loadScene(). Kept as a plain function on window so removing
   this one file is enough to drop every override. */
window.applyLayoutOverrides = function () {
  var list = window.LAYOUT_OVERRIDES || [];
  var applied = 0;
  for (var i = 0; i < list.length; i++) {
    var o = list[i], n = Engine.node(o.id);
    if (!n) continue;                       // node belongs to the other scene
    if (o.anchoredPos) Engine.setAnchoredPos(o.id, o.anchoredPos[0], o.anchoredPos[1]);
    if (o.sizeDelta) Engine.setSizeDelta(o.id, o.sizeDelta[0], o.sizeDelta[1]);
    if (o.scale) Engine.setScale(o.id, o.scale[0], o.scale[1]);
    if (typeof o.rotation === 'number') Engine.setRotZ(o.id, o.rotation);
    applied++;
  }
  return applied;
};
