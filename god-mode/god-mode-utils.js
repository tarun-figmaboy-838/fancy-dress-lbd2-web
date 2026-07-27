/* ============================================================================
 *  god-mode-utils.js — shared primitives for the God Mode debug layer
 *  Loaded first; every other god-mode module depends on window.GodModeUtils.
 *  Nothing here touches the learner build: remove the tags and it is gone.
 * ========================================================================== */
(function () {
  'use strict';

  var REF = [1920, 1080];        // the design grid everything is measured in

  function isTypingInField(ev) {
    var t = ev && ev.target;
    if (!t) return false;
    var tag = (t.tagName || '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || t.isContentEditable;
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).catch(fallback);
    }
    return Promise.resolve(fallback());
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;left:-9999px;top:0;';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(ta);
    }
  }

  function isVisible(el) {
    if (!el) return false;
    var cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    if (parseFloat(cs.opacity || '1') < 0.02) return false;
    var r = el.getBoundingClientRect();
    return r.width > 0.5 && r.height > 0.5;
  }

  function stage() { return document.getElementById('stage'); }

  /* the letterbox factor #stage is drawn at */
  function stageScale() {
    if (window.Engine && Engine.scaleFactor) return Engine.scaleFactor() || 1;
    var s = stage();
    if (!s) return 1;
    return (s.getBoundingClientRect().width / REF[0]) || 1;
  }

  /* any element's box in design-grid coordinates (top-left origin, y down) */
  function stageRectOf(el) {
    var s = stage();
    if (!el || !s) return null;
    var r = el.getBoundingClientRect(), sr = s.getBoundingClientRect(), k = stageScale();
    return {
      x: (r.left - sr.left) / k, y: (r.top - sr.top) / k,
      w: r.width / k, h: r.height / k
    };
  }

  function clientToStage(cx, cy) {
    var s = stage();
    if (!s) return [0, 0];
    var sr = s.getBoundingClientRect(), k = stageScale();
    return [(cx - sr.left) / k, (cy - sr.top) / k];
  }

  function stageToClient(x, y) {
    var s = stage();
    if (!s) return [0, 0];
    var sr = s.getBoundingClientRect(), k = stageScale();
    return [sr.left + x * k, sr.top + y * k];
  }

  function qa(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  function round(n, d) {
    var p = Math.pow(10, d === undefined ? 1 : d);
    return Math.round(n * p) / p;
  }

  /* the Engine node that owns a DOM element, if any */
  function nodeOf(el) {
    if (!window.Engine) return null;
    var e = el;
    while (e && e !== document.body) {
      if (e.dataset && e.dataset.id) {
        var n = Engine.node(e.dataset.id);
        if (n) return n;
      }
      e = e.parentElement;
    }
    return null;
  }

  /* the level (or GamePlay) subtree currently on screen */
  function activeRoot() {
    if (!window.Engine) return null;
    var nodes = Engine.nodes(), best = null;
    Object.keys(nodes).forEach(function (k) {
      var n = nodes[k];
      if (!n.parent || !n.parent.isStage) return;
      if (!n.active) return;
      if (/^Level\d$/.test(n.name) || n.name === 'GamePlay' || n.name === 'Intro') {
        if (!best || n.name !== 'Intro') best = n;
      }
    });
    return best;
  }

  function toast(msg) {
    var t = qa('#godToast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'godToast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._tm);
    t._tm = setTimeout(function () { t.classList.remove('show'); }, 1600);
  }

  window.GodModeUtils = {
    REF: REF,
    isTypingInField: isTypingInField,
    copyText: copyText,
    isVisible: isVisible,
    getStage: stage,
    stageScale: stageScale,
    stageRectOf: stageRectOf,
    clientToStage: clientToStage,
    stageToClient: stageToClient,
    nodeOf: nodeOf,
    activeRoot: activeRoot,
    qa: qa, qsa: qsa, round: round, toast: toast
  };
})();
