/* ============================================================================
 *  main.js — scene bootstrap and Unity SceneManager equivalent (Lbd2)
 * ========================================================================== */
var Game = (function () {
  'use strict';

  var SCENE_ORDER = ['Tutorial', 'Lbd2'];   // Assets/Scenes build order
  var current = null, rootNodeId = null, pendingAwakeAudio = [];

  function collectAudio(obj, out) {
    if (typeof obj === 'string') {
      if (obj.indexOf('assets/audio/') === 0 && out.indexOf(obj) < 0) out.push(obj);
      return out;
    }
    if (Array.isArray(obj)) { obj.forEach(function (o) { collectAudio(o, out); }); return out; }
    if (obj && typeof obj === 'object') Object.keys(obj).forEach(function (k) { collectAudio(obj[k], out); });
    return out;
  }

  /* Instantiation order sets Start() order; it follows the component order on
     each Level object (WeightMeasuringGame before WeightGameTutorialController). */
  var ORDER = ['DraggableItem', 'BasketDropZone', 'WeightMeasuringGame',
               'ButtonAnimator', 'TutorialManager', 'WeightGameTutorialController'];

  function loadScene(indexOrName) {
    var name = typeof indexOrName === 'number' ? SCENE_ORDER[indexOrName] : indexOrName;
    var data = window.SCENES[name];
    if (!data) { console.error('unknown scene', indexOrName); return Promise.resolve(); }

    Controllers.reset();
    Engine.Audio.reset();
    Engine.resetActivatedHandlers();
    Engine.resetRuntime();
    var root = Engine.boot(data, document.getElementById('game'));
    rootNodeId = root.id;
    current = name;
    document.body.dataset.scene = name;
    hideBuildTags();

    ORDER.forEach(function (sname) {
      (data.scripts[sname] || []).forEach(function (sc) {
        try { Controllers[sname](sc.fields, sc.node); }
        catch (e) { console.error('instantiate ' + sname + ' failed', e); }
      });
    });

    pendingAwakeAudio = [];
    var all = Engine.nodes();
    var clips = collectAudio(data.scripts, []);
    Object.keys(all).forEach(function (k) {
      var n = all[k];
      if (n.audioCfg && n.audioCfg.clip) {
        clips.push(n.audioCfg.clip);
        if (n.audioCfg.playOnAwake) pendingAwakeAudio.push(k);
      }
    });

    var go = function () {
      Controllers.tickControllers();
      Engine.onActivated(function () { Controllers.tickControllers(); });
      flushAwakeAudio();
    };
    // resolves once the scene's clip lengths are known, so the caller can wait
    return Engine.Audio.preload(clips).then(go, go);
  }

  /* Internal build stamps (the "vMT_02_04" label on the intro) are authored
     into the scene for the studio's own tracking. They are not learner-facing
     copy, so they are hidden wherever they appear rather than being deleted
     from the generated scene data. */
  var BUILD_TAG = /^\s*v[A-Za-z]{0,4}[_-]?\d+([._-]\d+)*\s*$/;

  function hideBuildTags() {
    var all = Engine.nodes();
    Object.keys(all).forEach(function (k) {
      var n = all[k];
      if (!n.tmp || !BUILD_TAG.test(n.tmp.text || '')) return;
      Engine.setText(n.id, '');        // gone from the DOM, not just hidden
      Engine.setActive(n.id, false);
    });
  }

  function flushAwakeAudio() {
    pendingAwakeAudio.forEach(function (id) {
      var s = Engine.Audio.source(id);
      if (!s.isPlaying()) s.play();
    });
  }

  window.addEventListener('pointerdown', function once() {
    window.removeEventListener('pointerdown', once);
    flushAwakeAudio();
  });

  /* ==========================================================================
     Boot: decode every sprite once, then start.

     The whole image set is 0.9 MB after the WebP pass, so loading all of it up
     front costs a moment at the title and buys instant, flicker-free scene and
     level changes for the rest of the session — no half-drawn board, no pop-in
     when a level first appears.
     ====================================================================== */
  function collectSprites() {
    var out = [], seen = {};
    var add = function (o) {
      if (typeof o === 'string') {
        if (o.indexOf('assets/img/') === 0 && !seen[o]) { seen[o] = 1; out.push(o); }
        return;
      }
      if (Array.isArray(o)) { o.forEach(add); return; }
      if (o && typeof o === 'object') Object.keys(o).forEach(function (k) { add(o[k]); });
    };
    add(window.SCENES); add(window.ANIMS); add(window.TEMPLATES);
    return out;
  }

  function decodeAll(paths, onProgress) {
    var done = 0, total = paths.length || 1;
    return Promise.all(paths.map(function (p) {
      return new Promise(function (res) {
        var im = new Image();
        var tick = function () { onProgress(++done / total); res(); };
        im.onload = tick;
        im.onerror = function () { console.warn('[boot] could not load ' + p); tick(); };
        im.src = p;
      });
    }));
  }

  function boot() {
    var el = function (id) { return document.getElementById(id); };
    var bar = el('bootBar'), pct = el('bootPct'), screen = el('boot');
    var setPct = function (f) {
      var v = Math.max(0, Math.min(1, f));
      if (bar) bar.style.width = (v * 100).toFixed(0) + '%';
      if (pct) pct.textContent = v >= 1 ? 'Ready' : 'Loading… ' + Math.round(v * 100) + '%';
    };

    var sprites = collectSprites();
    var fonts = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();

    // sprites are 90% of the bar; the scene's own audio metadata is the rest
    decodeAll(sprites, function (f) { setPct(f * 0.9); })
      .then(function () { return fonts; })
      .catch(function () {})
      .then(function () {
        setPct(0.94);
        return loadScene(0);
      })
      .then(function () {
        setPct(1);
        document.body.classList.add('ready');
        if (!screen) return;
        screen.classList.add('done');
        var drop = function () { if (screen.parentNode) screen.parentNode.removeChild(screen); };
        screen.addEventListener('transitionend', drop, { once: true });
        setTimeout(drop, 900);          // in case the transition never fires
      });
  }

  return {
    loadScene: loadScene,
    rootId: function () { return rootNodeId; },
    currentScene: function () { return current; },
    scenes: SCENE_ORDER,
    boot: boot
  };
})();

if (typeof document !== 'undefined' && document.getElementById('game')) Game.boot();
