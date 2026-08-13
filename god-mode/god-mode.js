/* ============================================================================
 *  god-mode.js — the God Mode controller for Fancy Dress Lbd2
 *
 *  A fully removable debug, QA and design-review layer. Delete the god-mode
 *  <link> and <script> tags from index.html and the learner build is byte for
 *  byte what it was. Turning God Mode off at runtime tears down every
 *  affordance — debug classes, layout edits, selection, animation speed — so a
 *  learner can never see any of it.
 *
 *  Press Shift + G.
 * ========================================================================== */
(function () {
  'use strict';

  var U = window.GodModeUtils;

  function GodMode() {
    this.on = false;
    this.editor = null;
    this.qa = null;
    this.speed = 1;
  }
  var P = GodMode.prototype;

  // ------------------------------------------------------------------ boot --
  P.init = function () {
    var self = this;
    var root = document.createElement('div');
    root.id = 'godModeRoot';
    document.body.appendChild(root);

    return fetch('god-mode/god-mode-panel.html')
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); })
      .catch(function () {
        console.warn('[god-mode] panel template unavailable (file:// ?), using the inline fallback');
        return INLINE_PANEL;
      })
      .then(function (html) {
        root.innerHTML = html;
        self.editor = new window.GodModeLiveEditor();
        self.editor.init();
        self.qa = new window.GodModeQA();
        self.qa.init();
        self.bind();
        self.rescan();
        console.log('%c⚡ God Mode ready — press Shift + G', 'color:#3DF5C4;font-weight:700');
      });
  };

  // --------------------------------------------------------------- toggling --
  P.toggle = function (force) {
    this.on = force === undefined ? !this.on : !!force;
    document.body.classList.toggle('godMode', this.on);
    if (this.on) { this.rescan(); return; }
    // full teardown
    ['godShowBounds', 'godShowSafe', 'godShowGrid', 'godShowAnchors', 'godPauseAnimations']
      .forEach(function (c) { document.body.classList.remove(c); });
    U.qsa('#godPanel input[type=checkbox]').forEach(function (c) { c.checked = false; });
    this.setSpeed(1);
    if (this.editor) this.editor.resetAll();
    if (this.qa) this.qa.clear();
    // anything a debug button put on screen goes away with the panel
    if (window.Controllers) Controllers.Guide.hide();
    if (window.Engine) Engine.confettiClear();
  };

  // ------------------------------------------------------------ scene flow --
  P.level = function () { return U.activeRoot(); };
  P.gm = function () {
    var r = this.level();
    return r && window.Controllers ? Controllers.get('WeightMeasuringGame', r.id) : null;
  };
  P.item = function () {
    var r = this.level();
    if (!r || !window.Controllers) return null;
    var all = Controllers.all('DraggableItem'), found = null;
    Object.keys(all).forEach(function (k) {
      var d = all[k];
      if (!d.isCube && d.gameManagerId === r.id) found = d;
    });
    return found;
  };

  P.levelNodes = function () {
    var nodes = Engine.nodes(), out = {};
    Object.keys(nodes).forEach(function (k) {
      var n = nodes[k];
      if (/^Level\d$/.test(n.name) && n.parent && n.parent.isStage) out[n.name] = n.id;
    });
    return out;
  };

  P.gotoLevel = function (i) {
    if (Game.currentScene() !== 'Lbd2') {
      var self = this;
      Game.loadScene('Lbd2');
      setTimeout(function () { self.gotoLevel(i); }, 350);
      return;
    }
    var L = this.levelNodes();
    Object.keys(L).forEach(function (name) {
      Engine.setActive(L[name], name === 'Level' + i);
    });
    Controllers.tickControllers();
    U.toast('Level ' + i);
    this.rescan();
  };

  P.step = function (d) {
    var r = this.level();
    var m = r && /^Level(\d)$/.exec(r.name);
    var i = m ? +m[1] : 1;
    var next = Math.max(1, Math.min(6, i + d));
    this.gotoLevel(next);
  };

  P.revealItem = function () {
    var r = this.level();
    if (!r) return;
    var ids = {};
    (function w(n) { ids[n.name] = ids[n.name] || n.id; (n.children || []).forEach(w); })(r);
    if (ids['Start Items']) Engine.setActive(ids['Start Items'], false);
    if (ids['items ']) Engine.setActive(ids['items '], true);
    U.toast('item revealed');
    this.rescan();
  };

  P.drop = function (left) {
    var it = this.item(), g = this.gm();
    if (!it || !g) { U.toast('no draggable item here'); return; }
    this.revealItem();
    var zone = left ? g.leftBasket() : g.rightBasket();
    it.dropped = false; it.placing = false;
    g.scaleState.interactionLocked = false;
    it.acceptDrop(zone, !!left);
    U.toast('dropped on the ' + (left ? 'left' : 'right') + ' pan');
  };

  P.returnItem = function () {
    var it = this.item(), g = this.gm();
    if (!it) return;
    if (g) {
      Controllers.removeItemFromPan(it.node, g);
      g.scaleState.interactionLocked = false;
    }
    Controllers.returnItemToOrigin(it.node, it.startParent, it.startPos, it.homeStage);
    it.dropped = false; it.enabledComp = true;
    // a spent item is passive; putting it back has to make it a drag target again
    if (it.refreshCursor) it.refreshCursor();
    U.toast('item returned home');
  };

  P.tap = function (name) {
    var r = this.level();
    if (!r) return;
    var id = null;
    (function w(n) { if (n.name === name && id === null) id = n.id; (n.children || []).forEach(w); })(r);
    if (!id) { U.toast('no ' + name); return; }
    Engine.setActive(id, true);
    Engine.node(id).el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  };

  P.solve = function () {
    var g = this.gm();
    if (!g) return;
    var self = this;
    g.enablePlusMinus();
    var need = g.correctCount() - g.cubeIndex;
    var i = 0;
    (function nextCube() {
      if (i++ >= need) { U.toast('block count set to ' + g.correctCount()); return; }
      self.tap('plus (1)');
      setTimeout(nextCube, 420);
    })();
  };

  P.showGuide = function () {
    var it = this.item(), g = this.gm();
    if (!it || !g) { U.toast('no item on this screen'); return; }
    this.revealItem();
    Controllers.Guide.show({
      fromId: it.node,
      toId: it.basketTarget || g.leftBasket(),
      glowId: it.node
    });
    U.toast('guidance shown');
  };

  // ----------------------------------------------------------- visual debug --
  P.setSpeed = function (s) {
    this.speed = s;
    document.documentElement.style.setProperty('--god-animation-speed', String(s));
    document.body.classList.toggle('godPauseAnimations', s === 0);
    if (document.getAnimations) {
      document.getAnimations().forEach(function (a) {
        try { a.playbackRate = s || 0.0001; } catch (e) {}
      });
    }
    U.qsa('#godPanel [data-speed]').forEach(function (b) {
      b.classList.toggle('on', +b.dataset.speed === s);
    });
  };

  P.resizeViewport = function (spec) {
    var wh = spec.split('x');
    // only possible when the page owns its window; otherwise report the delta
    var dw = +wh[0] - window.innerWidth, dh = +wh[1] - window.innerHeight;
    try { window.resizeBy(dw, dh); } catch (e) {}
    setTimeout(function () {
      U.toast('viewport ' + window.innerWidth + '×' + window.innerHeight +
        (Math.abs(window.innerWidth - +wh[0]) > 2 ? '  (browser refused the resize)' : ''));
    }, 120);
  };

  // -------------------------------------------------------------- catalogue --
  P.rescan = function () {
    if (!this.editor) return;
    var sel = U.qa('#godPick');
    if (!sel) return;
    var list = this.editor.catalogue();
    var keep = sel.value;
    sel.innerHTML = '';
    var groups = {};
    list.forEach(function (e) {
      if (!groups[e.group]) {
        var g = document.createElement('optgroup');
        g.label = e.group;
        sel.appendChild(g);
        groups[e.group] = g;
      }
      var o = document.createElement('option');
      o.value = e.id;
      o.textContent = e.label + '   (' + e.id.slice(0, 10) + ')';
      o.title = e.path;
      groups[e.group].appendChild(o);
    });
    if (keep && sel.querySelector('option[value="' + keep + '"]')) sel.value = keep;
  };

  // ------------------------------------------------------------------ bind --
  P.bind = function () {
    var self = this, ed = this.editor;

    // panel dragging by its header
    var hdr = U.qa('#godHeader'), panel = U.qa('#godPanel'), drag = null;
    hdr.addEventListener('pointerdown', function (ev) {
      if (ev.target.id === 'godMin') return;
      var r = panel.getBoundingClientRect();
      drag = { dx: ev.clientX - r.left, dy: ev.clientY - r.top };
      hdr.classList.add('grabbing');
      ev.preventDefault();
    });
    window.addEventListener('pointermove', function (ev) {
      if (!drag) return;
      var w = panel.offsetWidth, h = panel.offsetHeight;
      var x = Math.min(Math.max(0, ev.clientX - drag.dx), window.innerWidth - 60);
      var y = Math.min(Math.max(0, ev.clientY - drag.dy), window.innerHeight - 30);
      panel.style.left = x + 'px';
      panel.style.top = y + 'px';
      panel.style.right = 'auto';
    });
    window.addEventListener('pointerup', function () { drag = null; hdr.classList.remove('grabbing'); });
    U.qa('#godMin').addEventListener('click', function () { panel.classList.toggle('min'); });

    // buttons
    var ACT = {
      tutorial: function () { Game.loadScene('Tutorial'); setTimeout(function () { self.rescan(); }, 400); },
      lbd2: function () { Game.loadScene('Lbd2'); setTimeout(function () { self.rescan(); }, 400); },
      prev: function () { self.step(-1); },
      next: function () { self.step(1); },
      restart: function () {
        var r = self.level();
        var m = r && /^Level(\d)$/.exec(r.name);
        if (m) { self.gotoLevel(+m[1]); }
        else { Game.loadScene(Game.currentScene()); setTimeout(function () { self.rescan(); }, 400); }
      },
      revealItem: function () { self.revealItem(); },
      dropLeft: function () { self.drop(true); },
      dropRight: function () { self.drop(false); },
      returnItem: function () { self.returnItem(); },
      plus: function () { self.tap('plus (1)'); },
      minus: function () { self.tap('Minus (1)'); },
      solve: function () { self.solve(); },
      check: function () { self.tap('Check Btn '); },
      resetCubes: function () { var g = self.gm(); if (g) g.resetAllCubes(); },
      showGuide: function () { self.showGuide(); },
      hideGuide: function () { Controllers.Guide.hide(); U.toast('guidance hidden'); },
      confetti: function () {
        Engine.confettiClear();
        var r = self.level();
        var id = null;
        if (r) (function w(n) { if (/Confetti/i.test(n.name) && id === null) id = n.id; (n.children || []).forEach(w); })(r);
        Engine.confetti(id || (r && r.id));
        U.toast('confetti replayed');
      },
      /* Play every interaction sound in turn, so the layer can be heard
         without having to reach the moment in the game that triggers each one. */
      sfx: function () {
        var names = Engine.Audio.sfxNames ? Engine.Audio.sfxNames() : [];
        if (!names.length) { U.toast('no sfx registered'); return; }
        var i = 0;
        (function nextOne() {
          if (i >= names.length) { U.toast('played ' + names.length + ' sounds'); return; }
          var n = names[i++];
          U.toast('sfx: ' + n);
          Engine.Audio.sfx(n, { i: i });   // the counting sounds walk up the scale
          setTimeout(nextOne, 750);
        })();
      },
      rescan: function () { self.rescan(); U.toast('list rebuilt'); },
      copySel: function () { ed.copySelected(); },
      copyPatch: function () { ed.copyAllEdits(); },
      copyAll: function () { ed.copyEverything(); },
      save: function () { ed.save(); },
      load: function () { ed.load(); },
      clearSaved: function () { ed.clearSaved(); },
      resetSel: function () { ed.resetSelected(); },
      resetAll: function () { ed.resetAll(); U.toast('all edits reset'); },
      qaAll: function () { self.qa.runAll(); },
      qaSmoke: function () { self.qa.smoke(); },
      qaAssets: function () { self.qa.assets(); },
      qaPlace: function () { self.qa.placement(); },
      qaScale: function () { self.qa.scaleMechanics(); },
      qaLayout: function () { self.qa.layout(); },
      qaCursors: function () { self.qa.cursors(); },
      qaPress: function () { self.qa.press(); },
      qaCopy: function () { self.qa.copyReport(); }
    };

    U.qa('#godPanel').addEventListener('click', function (ev) {
      var b = ev.target.closest('button');
      if (!b) return;
      if (b.dataset.act && ACT[b.dataset.act]) { ACT[b.dataset.act](); return; }
      if (b.dataset.level) { self.gotoLevel(+b.dataset.level); return; }
      if (b.dataset.speed !== undefined) { self.setSpeed(+b.dataset.speed); return; }
      if (b.dataset.vp) { self.resizeViewport(b.dataset.vp); return; }
    });

    // element picker
    U.qa('#godPick').addEventListener('change', function () { ed.select(this.value); });

    // toggles
    U.qa('#godCursor').addEventListener('change', function () { ed.setCursorEdit(this.checked); });
    U.qa('#godSnap').addEventListener('change', function () { ed.snap = this.checked; });
    U.qa('#godLock').addEventListener('change', function () { ed.locked = this.checked; });
    U.qsa('#godPanel [data-cls]').forEach(function (c) {
      c.addEventListener('change', function () {
        document.body.classList.toggle(c.dataset.cls, c.checked);
      });
    });

    // numeric fields
    var FIELDS = { godX: 'x', godY: 'y', godW: 'w', godH: 'h', godAX: 'ax', godAY: 'ay',
                   godScale: 'scale', godRot: 'rot', godOpacity: 'opacity', godZ: 'z' };
    Object.keys(FIELDS).forEach(function (id) {
      var el = U.qa('#' + id);
      if (!el) return;
      var apply = function () { ed.applyField(FIELDS[id], parseFloat(el.value)); };
      el.addEventListener('change', apply);
      el.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') { apply(); el.blur(); }
        ev.stopPropagation();
      });
    });

    // keyboard
    window.addEventListener('keydown', function (ev) {
      if (ev.key === 'G' && ev.shiftKey && !U.isTypingInField(ev)) {
        self.toggle(); ev.preventDefault(); return;
      }
      if (!self.on || U.isTypingInField(ev)) return;
      var step = ev.shiftKey ? 10 : 1;
      switch (ev.key) {
        case 'ArrowLeft':  ed.nudge(-step, 0); ev.preventDefault(); return;
        case 'ArrowRight': ed.nudge(step, 0);  ev.preventDefault(); return;
        case 'ArrowUp':    ed.nudge(0, -step); ev.preventDefault(); return;
        case 'ArrowDown':  ed.nudge(0, step);  ev.preventDefault(); return;
      }
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'c') { ed.copySelected(); return; }
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'e') { ed.copyAllEdits(); return; }
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      switch (ev.key.toLowerCase()) {
        case 'n': self.step(1); break;
        case 'p': self.step(-1); break;
        case 'r': ACT.restart(); break;
        case 'd': self.drop(true); break;
        case 'f': self.solve(); break;
        case 'c': self.tap('Check Btn '); break;
        case 'h': self.showGuide(); break;
        case 'b': self.flip('godShowBounds'); break;
        case 's': self.flip('godShowSafe'); break;
        case 'g': self.flip('godShowGrid'); break;
        case 'q': self.qa.runAll(); break;
        case '1': self.setSpeed(0); break;
        case '2': self.setSpeed(0.5); break;
        case '3': self.setSpeed(1); break;
        case '4': self.setSpeed(2); break;
      }
    });

    // picking from the screen keeps the dropdown in step, and vice versa
    document.addEventListener('godEditorSelectionChanged', function (ev) {
      var pick = U.qa('#godPick');
      if (!pick) return;
      if (!pick.querySelector('option[value="' + ev.detail.id + '"]')) self.rescan();
      if (pick.querySelector('option[value="' + ev.detail.id + '"]')) pick.value = ev.detail.id;
    });
  };

  P.flip = function (cls) {
    var on = !document.body.classList.contains(cls);
    document.body.classList.toggle(cls, on);
    var box = U.qa('#godPanel [data-cls="' + cls + '"]');
    if (box) box.checked = on;
  };

  /* Identical markup to god-mode-panel.html, used when fetch() is unavailable
     (running the build straight off the filesystem). */
  var INLINE_PANEL = '<div id="godBadge">⚡ GOD MODE</div>' +
    '<div id="godSelBox"><span id="godSelLabel"></span>' +
    ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se'].map(function (h) {
      return '<i class="godHandle" data-h="' + h + '"></i>';
    }).join('') + '</div>' +
    '<div id="godPanel"><header id="godHeader"><span class="godTitle">God Mode — Layout &amp; QA</span>' +
    '<button id="godMin">−</button></header><div id="godBody">' +
    '<section><h4>Scene flow</h4><div class="godRow">' +
    '<button data-act="tutorial">Tutorial</button><button data-act="lbd2">Lbd2</button>' +
    '<button data-act="prev">◀ Level</button><button data-act="next">Level ▶</button>' +
    '<button data-act="restart">Restart</button></div>' +
    '<div class="godRow godLevels">' + [1, 2, 3, 4, 5, 6].map(function (i) {
      return '<button data-level="' + i + '">' + i + '</button>';
    }).join('') + '</div>' +
    '<div class="godRow"><button data-act="revealItem">Reveal item</button>' +
    '<button data-act="dropLeft">Drop → left</button><button data-act="dropRight">Drop → right</button>' +
    '<button data-act="returnItem">Return item</button></div>' +
    '<div class="godRow"><button data-act="plus">+ block</button><button data-act="minus">− block</button>' +
    '<button data-act="solve">Fill correct</button><button data-act="check">Check</button>' +
    '<button data-act="resetCubes">Clear blocks</button></div>' +
    '<div class="godRow"><button data-act="showGuide">Show guide</button>' +
    '<button data-act="hideGuide">Hide guide</button><button data-act="sfx">Play all SFX</button>' +
    '<button data-act="confetti">Replay confetti</button>' +
    '</div></section>' +
    '<section><h4>Live layout editor <em id="godSelName">nothing selected</em></h4>' +
    '<div class="godRow"><select id="godPick"></select><button data-act="rescan">⟳</button></div>' +
    '<div class="godRow godToggles"><label><input type="checkbox" id="godCursor"> Cursor edit</label>' +
    '<label><input type="checkbox" id="godSnap"> Snap 10</label>' +
    '<label><input type="checkbox" id="godLock"> Lock</label></div><div class="godGrid">' +
    [['godX', 'X'], ['godY', 'Y'], ['godW', 'W'], ['godH', 'H'], ['godAX', 'aPos X'], ['godAY', 'aPos Y'],
     ['godScale', 'Scale'], ['godRot', 'Rot'], ['godOpacity', 'Alpha'], ['godZ', 'Order']]
      .map(function (f) { return '<label>' + f[1] + '<input type="number" id="' + f[0] + '"></label>'; }).join('') +
    '</div><p class="godHint">X/Y are design-grid pixels (1920×1080, top-left origin). ' +
    'aPos is the Unity anchoredPos. Arrow keys nudge 1px, Shift+arrows 10px.</p>' +
    '<div class="godRow"><button data-act="copySel">Copy values</button>' +
    '<button data-act="copyPatch">Copy patch</button><button data-act="copyAll">Copy all</button></div>' +
    '<div class="godRow"><button data-act="save">Save</button><button data-act="load">Load</button>' +
    '<button data-act="clearSaved">Clear saved</button><button data-act="resetSel">Reset one</button>' +
    '<button data-act="resetAll">Reset all</button></div></section>' +
    '<section><h4>Visual debug</h4><div class="godRow godToggles">' +
    '<label><input type="checkbox" data-cls="godShowBounds"> Bounds</label>' +
    '<label><input type="checkbox" data-cls="godShowSafe"> Safe area</label>' +
    '<label><input type="checkbox" data-cls="godShowGrid"> Grid</label>' +
    '<label><input type="checkbox" data-cls="godShowAnchors"> Anchors</label></div>' +
    '<div class="godRow"><span class="godLabel">Speed</span>' +
    '<button data-speed="0">‖</button><button data-speed="0.5">.5×</button>' +
    '<button data-speed="1">1×</button><button data-speed="2">2×</button></div></section>' +
    '<section><h4>QA</h4><div class="godRow"><button data-act="qaAll">Run all</button>' +
    '<button data-act="qaSmoke">Smoke</button><button data-act="qaAssets">Assets</button>' +
    '<button data-act="qaPlace">Placement</button><button data-act="qaScale">Scale</button>' +
    '<button data-act="qaLayout">Layout</button><button data-act="qaCursors">Cursors</button>' +
    '<button data-act="qaPress">Press</button><button data-act="qaCopy">Copy report</button></div>' +
    '<pre id="godQaOut"></pre></section></div></div>';

  // ------------------------------------------------------------------ start --
  function start() {
    if (!window.Engine || !window.Controllers || !window.Game) {
      console.warn('[god-mode] the game did not load; God Mode is not starting');
      return;
    }
    var g = new GodMode();
    window.FancyDressGodMode = g;
    g.init();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
