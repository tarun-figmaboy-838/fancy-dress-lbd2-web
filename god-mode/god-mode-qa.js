/* ============================================================================
 *  god-mode-qa.js — automated checks against the live DOM and game state
 *  Everything is measured in design-grid units, so the letterbox scale can
 *  never turn a passing layout into a failure or the other way round.
 * ========================================================================== */
(function () {
  'use strict';

  var U = window.GodModeUtils;

  function GodModeQA() { this.lines = []; }
  var P = GodModeQA.prototype;

  P.out = function (kind, msg) {
    this.lines.push({ kind: kind, msg: msg });
    var box = U.qa('#godQaOut');
    if (box) {
      var d = document.createElement('div');
      d.className = 'godQa-' + kind;
      d.textContent = (kind === 'pass' ? '✓ ' : kind === 'fail' ? '✗ ' : kind === 'warn' ? '! ' : '  ') + msg;
      box.appendChild(d);
      box.scrollTop = box.scrollHeight;
    }
    if (kind === 'fail') console.warn('[QA] ' + msg);
  };
  P.pass = function (m) { this.out('pass', m); };
  P.fail = function (m) { this.out('fail', m); };
  P.warn = function (m) { this.out('warn', m); };
  P.head = function (m) { this.out('head', m); };
  P.check = function (ok, m, detail) { (ok ? this.pass : this.fail).call(this, m + (detail ? '  — ' + detail : '')); };

  P.clear = function () {
    this.lines = [];
    var box = U.qa('#godQaOut');
    if (box) box.innerHTML = '';
  };

  // --------------------------------------------------------------- helpers --
  function activeLevel() { return U.activeRoot(); }
  function gmOf(root) {
    return root && window.Controllers ? Controllers.get('WeightMeasuringGame', root.id) : null;
  }
  function effectiveOpacity(el) {
    var o = 1, p = el;
    while (p && p !== document.body) { o *= parseFloat(getComputedStyle(p).opacity || '1'); p = p.parentElement; }
    return o;
  }

  // ----------------------------------------------------------- smoke test --
  P.smoke = function () {
    this.clear();
    this.head('— smoke test —');
    this.check(!!window.Engine, 'Engine present');
    this.check(!!window.Controllers, 'Controllers present');
    this.check(!!window.Game, 'Game present');
    this.check(!!U.getStage(), '#stage present');
    var root = activeLevel();
    this.check(!!root, 'a scene root is active', root && root.name);
    ['placeItemInPan', 'removeItemFromPan', 'returnItemToOrigin', 'updateScaleFromPanContents']
      .forEach(function (k) {
        this.check(typeof Controllers[k] === 'function', 'Controllers.' + k + ' exists');
      }, this);
    ['confetti', 'overlay', 'stageRectOf', 'preloadSprites', 'prefersReducedMotion']
      .forEach(function (k) {
        this.check(typeof Engine[k] === 'function', 'Engine.' + k + ' exists');
      }, this);
    var gm = gmOf(root);
    if (gm) {
      var s = gm.scaleState;
      this.check(!!s && Array.isArray(s.leftItems) && Array.isArray(s.rightItems) &&
        typeof s.balanceValue === 'number' && typeof s.interactionLocked === 'boolean',
        'scaleState is the single source of truth', JSON.stringify({
          left: s.leftItems.length, right: s.rightItems.length,
          bv: U.round(s.balanceValue, 3), locked: s.interactionLocked
        }));
    } else this.warn('no WeightMeasuringGame on the active root (tutorial scene?)');
    return this.lines;
  };

  // ------------------------------------------------------------- asset test --
  P.assets = function () {
    this.clear();
    this.head('— asset test —');
    var self = this;
    var want = ['assets/img/Vector_10.webp', 'assets/img/drag-hand.webp',
                'assets/img/frame_00_delay-0.02s.webp'];
    return Engine.preloadSprites(want).then(function (missing) {
      want.forEach(function (p) {
        self.check(missing.indexOf(p) < 0, 'loads ' + p);
      });
      // is the dotted arrow actually painted somewhere with real size?
      var slices = U.qsa('.dot-guide__path .dot-guide__slice');
      if (!slices.length) {
        self.warn('dotted guide not on screen right now — press "Show guide" first');
      } else {
        var g = U.qa('.dot-guide');
        var b = U.stageRectOf(g);
        self.check(slices.length > 6, 'dotted guide is sliced for progressive reveal', slices.length + ' slices');
        self.check(/Vector_10/.test(getComputedStyle(slices[0]).backgroundImage),
          'dotted guide draws the real Vector_10.png');
        self.check(b && b.w > 40 && b.h > 40, 'dotted guide has a real size',
          b && (U.round(b.w) + '×' + U.round(b.h)));
        self.check(effectiveOpacity(g) > 0.1, 'dotted guide is not hidden by an opacity cascade',
          'eff=' + U.round(effectiveOpacity(g), 3));
        var fx = U.qa('.fx-layer');
        self.check(fx && +getComputedStyle(fx).zIndex >= 40, 'guidance layer sits above the board',
          fx && getComputedStyle(fx).zIndex);
        self.check(getComputedStyle(g).pointerEvents === 'none', 'dotted guide does not block input');
      }
      var hand = U.qa('.hand-hint');
      if (hand) {
        self.check(getComputedStyle(hand).pointerEvents === 'none', 'hand hint does not block input');
        self.check(U.qsa('.hand-hint').length === 1, 'only one hand hint exists',
          U.qsa('.hand-hint').length + ' found');
      }
      self.check(!document.documentElement.classList.contains('assetMissing'),
        'no sprite reported a load failure');
      return self.lines;
    });
  };

  // ------------------------------------------------------- placement test --
  P.placement = function () {
    this.clear();
    this.head('— item placement test —');
    var root = activeLevel(), gm = gmOf(root);
    if (!gm) { this.warn('no level active'); return this.lines; }
    var items = Controllers.all('DraggableItem'), item = null;
    Object.keys(items).forEach(function (k) {
      var d = items[k];
      if (!d.isCube && d.gameManagerId === root.id) item = d;
    });
    if (!item) { this.fail('no draggable item found for ' + root.name); return this.lines; }
    var n = Engine.node(item.node);
    var before = n.el.getBoundingClientRect();
    this.check(!!n, 'draggable item resolves', item.node);
    this.check(effectiveOpacity(n.el) > 0.9, 'item visible before the drop',
      'eff=' + U.round(effectiveOpacity(n.el), 3));

    var zone = item.basketTarget || gm.leftBasket();
    var self = this;
    return Controllers.placeItemInPan(item.node, zone, 'left',
      { gm: gm, kind: 'item', force: true, instant: true }).then(function () {
      var after = n.el.getBoundingClientRect();
      var zr = Engine.node(zone).el.getBoundingClientRect();
      self.check(effectiveOpacity(n.el) > 0.9, 'item still visible after the drop',
        'eff=' + U.round(effectiveOpacity(n.el), 3));
      self.check(Math.abs(after.width - before.width) < 1.5 && Math.abs(after.height - before.height) < 1.5,
        'item kept its size and aspect ratio',
        Math.round(before.width) + '×' + Math.round(before.height) + ' → ' +
        Math.round(after.width) + '×' + Math.round(after.height));
      self.check(Math.abs((after.left + after.width / 2) - (zr.left + zr.width / 2)) < 12,
        'item is centred in the pan');
      self.check(U.qsa('[data-id="' + item.node + '"]').length === 1, 'item was not duplicated');
      var inZone = false, p = n.el;
      while (p) { if (p === Engine.node(zone).el) { inZone = true; break; } p = p.parentElement; }
      self.check(inZone, 'item is a child of the pan, so it rides with it');

      /* The basket is authored as back-plate / drop-zone / front rim, three
         siblings under the arm. The item belongs inside the drop zone, so it
         must paint after the back plate and before the rim. */
      var branch = n, arm = n.parent;
      while (arm && arm.parent && !/^(left |Right)$/.test(arm.name)) { branch = arm; arm = arm.parent; }
      if (!arm || !arm.children) {
        self.warn('could not resolve the basket arm for a layering check');
      } else {
        var idx = arm.children.indexOf(branch);
        var later = arm.children.slice(idx + 1).filter(function (c) { return c.active; });
        self.check(idx >= 0, 'item resolves to a basket branch under ' + arm.name.trim());
        self.check(later.length > 0, 'a foreground rim still draws over the item',
          later.map(function (c) { return c.name.trim(); }).join(', ') || 'none');
      }
      return self.lines;
    });
  };

  // ----------------------------------------------------------- scale test --
  P.scaleMechanics = function () {
    this.clear();
    this.head('— scale mechanics test —');
    var root = activeLevel(), gm = gmOf(root);
    if (!gm) { this.warn('no level active'); return this.lines; }
    var s = gm.scaleState;
    var beam = Engine.findByPath(root.id, 'controller/plate');
    var needle = Engine.findByPath(root.id, 'controller/needle');
    var left = Engine.findByPath(root.id, 'controller/left ');
    var right = Engine.findByPath(root.id, 'controller/Right');
    this.check(!!beam && !!needle && !!left && !!right, 'beam, needle and both arms resolve');
    if (!beam) return this.lines;
    var pivot0 = getComputedStyle(needle.el).transformOrigin;
    var poseAt = function (v) {
      s.balanceValue = v;
      gm.renderBalanceNow();                 // synchronous, so it can be read back
      return { beam: U.round(beam.rotZ, 2), needle: U.round(needle.rotZ, 2),
               left: U.round(left.anchoredPos[1], 1), right: U.round(right.anchoredPos[1], 1),
               pivot: getComputedStyle(needle.el).transformOrigin };
    };
    var was = s.balanceValue;
    // +1 = item pan fully down, 0 = level, -1 = block pan fully down
    var itemLeft = gm.isItemOnLeft;
    var a = poseAt(1), b = poseAt(0), c = poseAt(-1);
    var down = itemLeft ? 'left' : 'right', up = itemLeft ? 'right' : 'left';
    this.check(a[down] < b[down] && b[down] < c[down], 'the item pan rises as blocks are added',
      a[down] + ' → ' + b[down] + ' → ' + c[down] + '  (' + down + ')');
    this.check(a[up] > b[up] && b[up] > c[up], 'the block pan falls as blocks are added',
      a[up] + ' → ' + b[up] + ' → ' + c[up] + '  (' + up + ')');
    this.check(a.needle !== b.needle && b.needle !== c.needle, 'needle tracks the weight difference',
      a.needle + '° → ' + b.needle + '° → ' + c.needle + '°');
    this.check(Math.abs(b.needle) < 0.01 && Math.abs(b.beam) < 0.01, 'needle and beam are level at 0',
      'needle ' + b.needle + '°, beam ' + b.beam + '°');
    this.check(a.pivot === b.pivot && b.pivot === c.pivot && c.pivot === pivot0,
      'needle pivot never moves', pivot0);
    s.balanceValue = was;
    gm.renderBalanceNow();
    this.check(Math.abs(gm.tilt - was) < 0.001, 'state restored after probing', U.round(gm.tilt, 3));
    return this.lines;
  };

  // ------------------------------------------------------------ layout test --
  P.layout = function () {
    this.clear();
    this.head('— layout / overflow test —');
    var de = document.documentElement;
    this.check(de.scrollWidth <= window.innerWidth + 1, 'no horizontal scrollbar',
      de.scrollWidth + ' vs ' + window.innerWidth);
    this.check(de.scrollHeight <= window.innerHeight + 1, 'no vertical scrollbar',
      de.scrollHeight + ' vs ' + window.innerHeight);
    var root = activeLevel();
    if (!root) { this.warn('no level active'); return this.lines; }
    var off = [];
    (function walk(n) {
      if (!n.active) return;
      if (n.el && U.isVisible(n.el)) {
        var b = U.stageRectOf(n.el);
        if (b && (b.x + b.w < -2 || b.y + b.h < -2 || b.x > U.REF[0] + 2 || b.y > U.REF[1] + 2))
          off.push(n.name + ' @ ' + U.round(b.x) + ',' + U.round(b.y));
      }
      (n.children || []).forEach(walk);
    })(root);
    this.check(!off.length, 'nothing visible is off-stage', off.slice(0, 4).join('; '));
    var stage = U.getStage();
    var sr = stage.getBoundingClientRect();
    this.check(Math.abs(sr.width / sr.height - 16 / 9) < 0.02, 'stage keeps the 16:9 ratio',
      U.round(sr.width / sr.height, 4));
    this.check(sr.left >= -1 && sr.top >= -1 &&
      sr.right <= window.innerWidth + 1 && sr.bottom <= window.innerHeight + 1,
      'stage is letterboxed inside the viewport');
    return this.lines;
  };

  // -------------------------------------------------------------- run all --
  P.runAll = function () {
    var self = this;
    var all = [];
    var collect = function (r) { all = all.concat(r || []); };
    collect(this.smoke());
    var s1 = this.lines.slice();
    return Promise.resolve(this.assets()).then(function (r) {
      var s2 = self.lines.slice();
      return Promise.resolve(self.placement()).then(function () {
        var s3 = self.lines.slice();
        self.scaleMechanics();
        var s4 = self.lines.slice();
        self.layout();
        var s5 = self.lines.slice();
        self.lines = s1.concat(s2, s3, s4, s5);
        self.renderAll();
        return self.lines;
      });
    });
  };

  P.renderAll = function () {
    var box = U.qa('#godQaOut');
    if (!box) return;
    box.innerHTML = '';
    var f = 0, p = 0;
    this.lines.forEach(function (l) {
      var d = document.createElement('div');
      d.className = 'godQa-' + l.kind;
      d.textContent = (l.kind === 'pass' ? '✓ ' : l.kind === 'fail' ? '✗ ' : l.kind === 'warn' ? '! ' : '') + l.msg;
      box.appendChild(d);
      if (l.kind === 'fail') f++;
      if (l.kind === 'pass') p++;
    });
    var sum = document.createElement('div');
    sum.className = f ? 'godQa-fail' : 'godQa-pass';
    sum.textContent = '\n' + p + ' passed, ' + f + ' failed';
    box.appendChild(sum);
  };

  P.copyReport = function () {
    var txt = ['Fancy Dress Lbd2 — God Mode QA report',
               new Date().toISOString(),
               'viewport ' + window.innerWidth + '×' + window.innerHeight, ''];
    this.lines.forEach(function (l) {
      txt.push((l.kind === 'pass' ? '[PASS] ' : l.kind === 'fail' ? '[FAIL] ' :
                l.kind === 'warn' ? '[WARN] ' : '') + l.msg);
    });
    U.copyText(txt.join('\n'));
    U.toast('QA report copied');
  };

  P.init = function () {};

  window.GodModeQA = GodModeQA;
})();
