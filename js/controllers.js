/* ============================================================================
 *  controllers.js — Fancy Dress Lbd2
 *  One function per MonoBehaviour, ported line-by-line from the C#.
 *  Note: several DraggableItem instances in the scene still carry serialized
 *  fields from an older version of the script, so every field read falls back
 *  to the C# initializer exactly as Unity would.
 * ========================================================================== */
var Controllers = (function () {
  'use strict';

  var E = Engine;
  var COMP = {};
  var pending = [];

  function put(name, nodeId, inst) { (COMP[name] = COMP[name] || {})[String(nodeId)] = inst; }
  function get(name, nodeId) { return (COMP[name] || {})[String(nodeId)] || null; }

  function register(hostId, name, startFn) {
    pending.push({ hostId: String(hostId), name: name, startFn: startFn, started: false });
  }
  function tickControllers() {
    for (var i = 0; i < pending.length; i++) {
      var p = pending[i];
      if (p.started || !E.activeInHierarchy(p.hostId)) continue;
      p.started = true;
      try { p.startFn(); } catch (e) { console.error('[' + p.name + '] Start failed', e); }
    }
    suspendInactive();
  }

  /* A level that has been switched away from must not keep spending frames.
     Hiding it with SetActive(false) leaves its instruction typing, hint delays
     and tilt tweens registered, and six levels' worth of those add up. Every
     activation sweeps the controllers whose host is no longer on screen and
     cancels their coroutines. */
  var SUSPENDABLE = ['WeightGameTutorialController', 'WeightMeasuringGame', 'TutorialManager'];

  function suspendInactive() {
    SUSPENDABLE.forEach(function (name) {
      var m = COMP[name] || {};
      Object.keys(m).forEach(function (hostId) {
        var inst = m[hostId];
        var live = E.activeInHierarchy(hostId);
        if (live) { inst._suspended = false; return; }
        if (inst._suspended) return;
        inst._suspended = true;
        try {
          if (inst.runner) inst.runner.stopAll();
          if (inst.killAllHints) inst.killAllHints();
          if (inst.suspend) inst.suspend();
        } catch (e) { console.error('[' + name + '] suspend failed', e); }
      });
    });
  }

  /* field read with C# initializer fallback */
  function fld(f, key, dflt) {
    return (f[key] === undefined || f[key] === null) ? dflt : f[key];
  }

  // ------------------------------------------------------ coroutine runner --
  function Runner() { this.main = new E.TaskGroup(); this.named = {}; }
  Runner.prototype.fresh = function (n) {
    if (this.named[n]) this.named[n].kill();
    return (this.named[n] = new E.TaskGroup());
  };
  Runner.prototype.stop = function (n) {
    if (this.named[n]) { this.named[n].kill(); delete this.named[n]; }
  };
  Runner.prototype.stopAll = function () {
    this.main.kill();
    var s = this;
    Object.keys(this.named).forEach(function (k) { s.named[k].kill(); });
    this.named = {};
    this.main = new E.TaskGroup();
  };
  Runner.prototype.run = function (fn, tok) {
    var t = tok || this.main;
    Promise.resolve().then(function () { return fn(t); })
      .catch(function (e) { if (!E.isCancel(e)) console.error(e); });
    return t;
  };

  function doScale(id, to, dur, ease, tok) {
    var from = E.getScale(id)[0];
    return E.tween(dur, ease, function (u) { E.setScale(id, from + (to - from) * u); }, tok);
  }

  /* =========================================================================
     Highlight — reusable glow + a single pop, shared by every level
     -------------------------------------------------------------------------
     The glow is a filter on the sprite layer and the pop is a transform on the
     same layer, so neither can fight the RectTransform transform the engine
     writes onto the node element. The pop fires once, when the glow state
     begins; re-asking for a glow that is already on is a no-op, so repeated
     highlighting never stacks or restarts the animation.
     ======================================================================= */
  var glowing = [];

  /* setGlow(id, on, 'warm') — the pulse runs for as long as the highlight is
     on and stops the instant it is taken off. */
  function setGlow(nodeId, on, tone) {
    var n = nodeId && E.node(nodeId);
    if (!n) return;
    var el = n.el, i = glowing.indexOf(String(nodeId));
    if (on) {
      el.classList.toggle('glow-warm', tone === 'warm');
      if (el.classList.contains('is-glowing')) return;     // already glowing
      el.classList.add('is-glowing', 'item-pop');
      if (i < 0) glowing.push(String(nodeId));
      var off = function (ev) {
        if (ev.animationName !== 'item-pop') return;
        el.classList.remove('item-pop');
        el.removeEventListener('animationend', off);
      };
      el.addEventListener('animationend', off);
    } else {
      el.classList.remove('is-glowing', 'item-pop', 'glow-warm');
      if (i >= 0) glowing.splice(i, 1);
    }
  }
  function clearGlows() {
    glowing.slice().forEach(function (id) { setGlow(id, false); });
    glowing.length = 0;
  }

  /* A one-shot celebratory pop, with no glow attached. Used when the
     "weighs the same as N blocks" line is spoken: the item and every block
     bounce in turn, so the sentence and the picture agree. */
  function popNode(nodeId) {
    var n = nodeId && E.node(nodeId);
    if (!n) return;
    var el = n.el;
    el.classList.remove('pop-only');
    void el.offsetWidth;                       // restart even if mid-pop
    el.classList.add('pop-only');
    var off = function (ev) {
      if (ev.animationName !== 'item-pop') return;
      el.classList.remove('pop-only');
      el.removeEventListener('animationend', off);
    };
    el.addEventListener('animationend', off);
  }

  /* Pop a list of nodes one after another. Returns when the last one starts. */
  function popSequence(ids, gap, tok) {
    var list = (ids || []).filter(Boolean);
    if (!list.length) return Promise.resolve();
    var i = 0;
    var step = function () {
      if (i >= list.length) return Promise.resolve();
      popNode(list[i++]);
      return E.wait(gap, tok).then(step);
    };
    return step();
  }

  /* ------------------------------------------------------------------------
     When is a word spoken?

     The instruction typewriter already assumes the clip is read at a steady
     pace — it reveals characters at clipLength / textLength. The same mapping
     gives the moment any word in the line is heard, which is how the item and
     the blocks can pop exactly as they are named instead of all at once at the
     start of the sentence.
     ---------------------------------------------------------------------- */
  function wordTime(text, clip, word) {
    var msg = text || '', dur = E.Audio.len(clip);
    if (!msg.length || !dur || !word) return null;
    var at = msg.toLowerCase().indexOf(String(word).toLowerCase());
    if (at < 0) return null;
    return (at / msg.length) * dur;
  }

  /* the plural noun a level counts in, taken from the line itself */
  var BLOCK_WORDS = ['blocks', 'balls', 'marbles', 'marbels', 'cubes', 'block', 'ball', 'marble'];
  function blockWordIn(text) {
    var low = (text || '').toLowerCase();
    for (var i = 0; i < BLOCK_WORDS.length; i++)
      if (low.indexOf(BLOCK_WORDS[i]) >= 0) return BLOCK_WORDS[i];
    return null;
  }
  /* "The toy boat weighs the same as 4 blocks!" -> "toy boat" */
  function itemWordIn(text) {
    var m = /^\s*the\s+(.+?)\s+weighs\b/i.exec(text || '');
    return m ? m[1] : null;
  }

  /* Pop the item as its name is said, then the blocks as theirs is. Falls back
     to sensible fractions of the clip when a line cannot be parsed. */
  function popWithNarration(text, clip, itemIds, blockIds, tok) {
    var dur = E.Audio.len(clip) || 2.4;
    var tItem = wordTime(text, clip, itemWordIn(text));
    var tBlock = wordTime(text, clip, blockWordIn(text));
    if (tItem === null) tItem = dur * 0.14;
    if (tBlock === null || tBlock <= tItem) tBlock = dur * 0.62;
    var gap = Math.min(0.17, Math.max(0.07,
      (dur - tBlock) / Math.max(1, (blockIds || []).length)));
    return E.wait(tItem, tok)
      .then(function () { return popSequence(itemIds, 0.12, tok); })
      .then(function () { return E.wait(Math.max(0, tBlock - tItem - 0.12), tok); })
      .then(function () { return popSequence(blockIds, gap, tok); });
  }

  /* =========================================================================
     Guide — animated dotted path + hand hint, one instance for the whole game
     -------------------------------------------------------------------------
     Both are built from the real assets (Vector_10.png, drag-hand.png) and are
     anchored off getBoundingClientRect, so a single implementation serves the
     tutorial and all six levels at every viewport size. Only one guide can
     exist at a time, and it removes itself the moment the player interacts.
     ======================================================================= */
  var Guide = (function () {
    var ARROW = 'assets/img/Vector_10.webp';
    var HAND = 'assets/img/drag-hand.webp';
    var AW = 316, AH = 569;                 // Vector_10.png natural size
    // where the arrow's dotted tail and its arrowhead sit inside that artwork,
    // measured from the sprite's own alpha coverage rather than estimated
    var TAIL = [0.660, 0.998], HEAD = [0.948, 0.020];
    /* Every dot in Vector_10.webp, measured from the sprite's own alpha by
       flood-filling each blob, ordered tail -> arrowhead. [x, y, w, h] in
       source pixels. Rendering one element per dot is what lets the guide
       appear a dot at a time rather than as a band-by-band wipe, and lets each
       dot pop and glow on its own. The last entry is the arrowhead. */
    var DOTS = [[202,559,11,10],[181,546,14,12],[162,532,14,13],[142,518,14,12],
      [124,503,13,13],[106,488,13,12],[88,471,13,13],[72,453,13,14],[57,435,12,14],
      [43,415,12,15],[30,395,12,15],[20,374,11,15],[11,351,11,15],[5,328,9,15],
      [1,305,9,15],[0,281,8,15],[0,257,9,15],[4,233,9,16],[10,210,10,15],
      [18,188,11,15],[28,167,12,14],[40,147,12,14],[54,128,13,13],[70,110,13,13],
      [87,93,13,13],[105,78,13,12],[124,64,14,12],[144,52,15,11],[165,41,15,11],
      [187,32,15,11],[210,26,15,9],[234,22,15,9],[257,21,16,8],[281,23,15,9],
      [276,0,40,50]];

    var root = null, handEl = null, rippleEl = null;
    var anims = [], watch = null, cur = null, ready = null, broken = false;

    function preload() {
      if (ready) return ready;
      ready = E.preloadSprites([ARROW, HAND]).then(function (missing) {
        if (missing.indexOf(ARROW) >= 0) {
          broken = true;
          console.warn('[guide] Vector_10.png is unavailable — falling back to a drawn dotted path');
        }
        return missing;
      });
      return ready;
    }
    preload();

    var CYCLE = 3.0;             // one full tail-to-head sweep, then a hold
    var STAGGER = 0.052;         // gap between consecutive dots lighting up

    function buildSlices(host) {
      for (var i = 0; i < DOTS.length; i++) {
        var d = DOTS[i];
        var s = document.createElement('div');
        s.className = 'dot-guide__dot' + (i === DOTS.length - 1 ? ' is-head' : '');
        s.style.left = d[0] + 'px';
        s.style.top = d[1] + 'px';
        s.style.width = d[2] + 'px';
        s.style.height = d[3] + 'px';
        if (!broken) {
          s.style.backgroundImage = 'url("' + ARROW + '")';
          s.style.backgroundSize = AW + 'px ' + AH + 'px';
          s.style.backgroundPosition = (-d[0]) + 'px ' + (-d[1]) + 'px';
        }
        s.style.setProperty('--delay', (i * STAGGER).toFixed(3) + 's');
        s.style.setProperty('--cycle', CYCLE + 's');
        host.appendChild(s);
      }
    }

    function build() {
      if (root) return;
      var layer = E.overlay();
      if (!layer) return;
      root = document.createElement('div');
      root.className = 'dot-guide' + (broken ? ' fallback' : '');
      root.style.width = AW + 'px';
      root.style.height = AH + 'px';

      var glow = document.createElement('div');
      glow.className = 'dot-guide__glow';
      var path = document.createElement('div');
      path.className = 'dot-guide__path';
      buildSlices(glow);
      buildSlices(path);
      root.appendChild(glow);        // blurred copy underneath supplies the glow
      root.appendChild(path);

      handEl = document.createElement('div');
      handEl.className = 'hand-hint';
      handEl.style.width = '135px';
      handEl.style.height = '135px';
      handEl.style.backgroundImage = 'url("' + HAND + '")';
      rippleEl = document.createElement('div');
      rippleEl.className = 'hand-hint__ripple';
      handEl.appendChild(rippleEl);

      layer.appendChild(root);
      layer.appendChild(handEl);
    }

    /* the two ends of the guidance, in stage space, from live element bounds */
    function anchors(c) {
      var from = E.nodeStageRect(c.fromId), to = E.nodeStageRect(c.toId);
      if (!from || !to || !from.w || !to.w) return null;
      var A = {
        a: [from.cx, from.y + from.h * 0.15],       // just inside the item's top
        b: [to.cx, to.cy]                           // the pan's drop marker
      };
      // too close to point anywhere useful - e.g. the item is already in the pan
      if (Math.hypot(A.b[0] - A.a[0], A.b[1] - A.a[1]) < 90) return null;
      return A;
    }

    function sameAnchors(p, q) {
      if (!p || !q) return false;
      return Math.abs(p.a[0] - q.a[0]) < 0.5 && Math.abs(p.a[1] - q.a[1]) < 0.5 &&
             Math.abs(p.b[0] - q.b[0]) < 0.5 && Math.abs(p.b[1] - q.b[1]) < 0.5;
    }

    /* Map the artwork's tail->head vector onto the item->pan vector, so the
       arrow always physically connects the two, whatever the layout does.
       The same transform is kept so the hand can be walked along the very dots
       that are drawn — see dotStage(). */
    function layoutArrow(A) {
      var mirror = A.b[0] < A.a[0] ? -1 : 1;         // bow away from the balance
      var tx = TAIL[0] * AW, ty = TAIL[1] * AH;
      var vx = mirror * (HEAD[0] - TAIL[0]) * AW, vy = (HEAD[1] - TAIL[1]) * AH;
      var dx = A.b[0] - A.a[0], dy = A.b[1] - A.a[1];
      var vl = Math.hypot(vx, vy) || 1, dl = Math.hypot(dx, dy);
      var k = Math.max(0.25, Math.min(1.6, dl / vl));
      var rad = Math.atan2(dy, dx) - Math.atan2(vy, vx);
      root.style.left = (A.a[0] - tx) + 'px';
      root.style.top = (A.a[1] - ty) + 'px';
      root.style.transformOrigin = tx + 'px ' + ty + 'px';
      root.style.transform = 'rotate(' + (rad * 180 / Math.PI).toFixed(2) + 'deg) scale(' +
                             k.toFixed(4) + ')' + (mirror < 0 ? ' scaleX(-1)' : '');
      A.tf = { ax: A.a[0], ay: A.a[1], tx: tx, ty: ty, mirror: mirror, k: k,
               cos: Math.cos(rad), sin: Math.sin(rad) };
    }

    /* Where dot i actually ends up on screen, in stage space. Mirrors exactly
       what the CSS transform does to that element. */
    function dotStage(A, i) {
      var t = A.tf, d = DOTS[i];
      var cx = d[0] + d[2] / 2, cy = d[1] + d[3] / 2;
      var vx = t.mirror * (cx - t.tx) * t.k, vy = (cy - t.ty) * t.k;
      return [t.ax + vx * t.cos - vy * t.sin, t.ay + vx * t.sin + vy * t.cos];
    }

    function stopAnims() {
      anims.forEach(function (a) { try { a.cancel(); } catch (e) {} });
      anims.length = 0;
    }

    /* One Web Animations pass for the whole demonstration: appear at the item,
       travel the arc, press down, fade, hold, repeat. No interval-driven frame
       switching anywhere, and the ripple shares the same timeline so the tap
       can never drift out of sync. */
    function animateHand(A) {
      stopAnims();
      if (!handEl) return;
      /* The fingertip in drag-hand.webp sits at (59, 33) of its 135x135 box,
         measured from the sprite's alpha. Offsetting by that puts the fingertip
         itself on the path instead of the element's corner — which is what made
         the hand look like it was pointing somewhere else. */
      var HX = 59, HY = 33;
      // walk the dots that are actually drawn, so hand and arrow agree exactly
      var N = DOTS.length;
      function at(i) {
        var p = dotStage(A, Math.max(0, Math.min(N - 1, i)));
        return [p[0] - HX, p[1] - HY];
      }
      if (E.prefersReducedMotion()) {
        var p = at(Math.floor(N / 2));
        handEl.style.opacity = '.9';
        handEl.style.transform = 'translate3d(' + p[0] + 'px,' + p[1] + 'px,0)';
        return;
      }
      handEl.style.opacity = '';
      var STEPS = Math.min(20, N), TRAVEL = 0.44, frames = [];
      var s0 = at(0);
      frames.push({ offset: 0, opacity: 0, transform: 'translate3d(' + s0[0] + 'px,' + s0[1] + 'px,0) scale(.85)' });
      frames.push({ offset: 0.06, opacity: 1, transform: 'translate3d(' + s0[0] + 'px,' + s0[1] + 'px,0) scale(1)' });
      for (var i = 1; i <= STEPS; i++) {
        var u = i / STEPS, q = at(Math.round(u * (N - 1)));
        frames.push({
          offset: +(0.06 + TRAVEL * u).toFixed(4),
          opacity: 1,
          transform: 'translate3d(' + q[0].toFixed(1) + 'px,' + q[1].toFixed(1) + 'px,0) scale(1)',
          easing: 'linear'
        });
      }
      var e = at(N - 1);
      var T = 'translate3d(' + e[0].toFixed(1) + 'px,' + e[1].toFixed(1) + 'px,0)';
      frames.push({ offset: 0.58, opacity: 1, transform: T + ' scale(.9) translateY(10px)' });  // press
      frames.push({ offset: 0.66, opacity: 1, transform: T + ' scale(1)' });
      frames.push({ offset: 0.80, opacity: 0, transform: T + ' scale(1.02)' });
      frames.push({ offset: 1, opacity: 0, transform: T + ' scale(1.02)' });

      var DUR = 3400;
      anims.push(handEl.animate(frames, {
        duration: DUR, iterations: Infinity, easing: 'ease-in-out', fill: 'both'
      }));
      anims.push(rippleEl.animate([
        { offset: 0, opacity: 0, transform: 'scale(.3)' },
        { offset: 0.55, opacity: 0, transform: 'scale(.3)' },
        { offset: 0.60, opacity: .8, transform: 'scale(.45)' },
        { offset: 0.78, opacity: 0, transform: 'scale(1.5)' },
        { offset: 1, opacity: 0, transform: 'scale(1.5)' }
      ], { duration: DUR, iterations: Infinity, easing: 'ease-out', fill: 'both' }));
    }

    function place() {
      if (!cur || !root) return false;
      var A = anchors(cur);
      if (!A) return false;
      if (sameAnchors(A, cur._A)) return true;
      cur._A = A;
      layoutArrow(A);
      if (cur.hand) animateHand(A);
      return true;
    }

    /* cfg.hand — show the travelling hand as well as the dotted path.
       Off for button targets: the tap hand already sitting on the button
       demonstrates the press, and a second hand sliding a "drag" onto a button
       tells the child to do the wrong thing. */
    function show(cfg) {
      hide();                                      // never two guides at once
      preload().then(function () {
        if (!cfg || !E.node(cfg.fromId) || !E.node(cfg.toId)) return;
        build();
        if (!root) return;
        cur = {
          fromId: String(cfg.fromId), toId: String(cfg.toId),
          glowId: cfg.glowId || cfg.fromId,
          hand: cfg.hand !== false,
          /* cfg.follow === false pins the arrow to where its ends were when it
             was shown. The tutorial needs this: its clip physically carries the
             ball from the plinth to the pan, and an arrow that re-anchored to
             the moving ball shrank and swung away mid-flight instead of
             describing the route. */
          follow: cfg.follow !== false
        };
        if (handEl) handEl.style.display = cur.hand ? '' : 'none';
        if (!place()) { cur = null; return; }
        root.classList.add('on');
        setGlow(cur.glowId, true);
        if (watch) clearInterval(watch);
        if (cur.follow) watch = setInterval(place, 250);   // tracks pan movement
      });
    }

    /* Takes effect on the frame it is called: the watcher, the hand's animation
       and the item's glow all stop before the next paint, so touching the item
       cannot leave any of it lingering. */
    function hide() {
      if (watch) { clearInterval(watch); watch = null; }
      if (cur) { setGlow(cur.glowId, false); cur = null; }
      if (!root) return;
      stopAnims();
      root.classList.remove('on');
      if (handEl) { handEl.style.opacity = '0'; handEl.style.transform = ''; }
    }

    function destroy() {
      hide();
      if (root && root.parentNode) root.parentNode.removeChild(root);
      if (handEl && handEl.parentNode) handEl.parentNode.removeChild(handEl);
      root = handEl = rippleEl = null;
    }

    window.addEventListener('resize', function () {
      if (cur && cur.follow) { cur._A = null; place(); }
    });

    return { show: show, hide: hide, destroy: destroy, visible: function () { return !!cur; } };
  })();

  /* =========================================================================
     Idle — if the child stops doing anything, show them what to do next.

     One watcher for the whole game. Every pointer press resets it. On each
     timeout it asks the level's tutorial controller what the current step is
     and re-offers exactly that hint, so the child is never stuck staring at a
     screen with no idea what it wants. It keeps offering, with a longer gap
     each time, and stops as soon as they interact.
     ======================================================================= */
  var Idle = (function () {
    /* FIRST is the wait after the child themselves did something. SOON is the
       wait after the game has just finished telling them what to do — used by
       the Tutorial scene only, where a line ended and the board then sat silent
       for a full eight seconds before the hand appeared. The six levels stay on
       FIRST throughout, so their pacing is unchanged. */
    var FIRST = 8, SOON = 3, REPEAT = 12, MAX = 22, RETRY = 0.5;
    var timer = null, wait = FIRST, providers = [], on = false, offered = false;

    function clear() { if (timer) { clearTimeout(timer); timer = null; } }

    function fire() {
      timer = null;
      var any = false, busy = false;
      providers.slice().forEach(function (p) {
        try {
          var r = p.offer();
          if (r === 'busy') busy = true;
          else if (r) any = true;
        } catch (e) { console.error(e); }
      });
      offered = offered || any;
      /* A tick that lands while an instruction is still being spoken is our
         silence, not the child's. It used to count as a missed offer and push
         the next attempt out by another five seconds — three lines long enough
         to swallow a tick and the hand arrived 22 s late. Re-check as soon as
         the line is over instead. */
      if (busy && !any) { timer = setTimeout(fire, RETRY * 1000); return; }
      // if nothing was appropriate to offer, wait longer before asking again
      wait = Math.min(MAX, any ? REPEAT : wait + 5);
      arm();
    }

    function arm() {
      clear();
      if (!on || !providers.length) return;
      timer = setTimeout(fire, wait * 1000);
    }

    function restart(w) {
      if (offered) {
        offered = false;
        providers.slice().forEach(function (p) {
          if (!p.withdraw) return;
          try { p.withdraw(); } catch (e) { console.error(e); }
        });
      }
      wait = w;
      arm();
    }

    /* The child did something: take back whatever was being offered and start
       counting again from the full interval. */
    function poke() { restart(FIRST); }

    /* The game just finished saying what to do. If the child does not act,
       show them — and sooner than if they had been the last one to move. */
    function prompt() { restart(SOON); }

    /* offer() returns true if it actually put a hint on screen.
       withdraw() takes that hint back. */
    function register(offer, withdraw) {
      for (var i = 0; i < providers.length; i++) if (providers[i].offer === offer) return;
      providers.push({ offer: offer, withdraw: withdraw });
      on = true;
      arm();
    }

    function reset() {
      clear(); providers.length = 0; wait = FIRST; on = false; offered = false;
    }

    if (typeof window !== 'undefined') {
      ['pointerdown', 'keydown', 'wheel'].forEach(function (ev) {
        window.addEventListener(ev, poke, true);
      });
    }
    return { register: register, reset: reset, poke: poke, prompt: prompt };
  })();

  /* Instantiate(prefab, parent) then rect.position = target.position.
     The hand is one preloaded still frame driven by a CSS transform loop; the
     old 69-image `tap_anim` flipbook is no longer played. */
  var HAND_STILL = 'assets/img/frame_00_delay-0.02s.webp';
  E.preloadSprites([HAND_STILL]);

  function spawnHint(template, targetId) {
    var t = E.node(targetId);
    if (!template || !t) return null;
    var parentId = t.parent ? t.parent.id : Game.rootId();
    var id = E.instantiate(template.template || template, parentId);
    if (!id) return null;
    E.setActive(id, true);
    var p = E.stagePos(targetId);
    E.setStagePos(id, p[0], p[1]);
    tapLoop(id, true);
    setGlow(targetId, true);
    return id;
  }

  function tapLoop(nodeId, on) {
    var n = nodeId && E.node(nodeId);
    if (!n) return;
    n.el.classList.toggle('hand-tap', !!on);
    n.el.style.pointerEvents = 'none';       // a hint must never eat input
    if (n.hitEl) n.hitEl.style.pointerEvents = 'none';
  }

  /* =========================================================================
     Pan placement — one implementation for every level and the tutorial
     -------------------------------------------------------------------------
     placeItemInPan / removeItemFromPan / returnItemToOrigin /
     updateScaleFromPanContents are the only routines that move an item into or
     out of a pan, and the only ones that decide how far the balance tilts.
     Everything visible is rendered from the owning game's `scaleState`.
     ======================================================================= */

  function newScaleState() {
    return {
      leftItems: [],        // [{ id, weight, kind }]
      rightItems: [],
      leftWeight: 0,
      rightWeight: 0,
      /* signed tilt in [-1, 1]; +1 = the item's pan is fully down,
         -1 = the block pan is fully down, 0 = level */
      balanceValue: 0,
      interactionLocked: false
    };
  }

  /* Rest position inside a pan, derived from the pan's own rect rather than
     per-level constants: horizontally centred, sitting on the pan surface. */
  function panAnchor(itemId, panId) {
    var item = E.node(itemId), pan = E.node(panId);
    if (!item || !pan) return [0, 0];
    var ps = pan.size(), is = item.size();
    var sc = item.scale[0] || 1;
    // centre horizontally, and keep the artwork inside the pan if it is wider
    var x = 0;
    // lift just enough that a tall item rests on the surface instead of
    // sinking through it, but never so far that it floats off the pan
    var y = Math.min(Math.max(0, (is[1] * sc - ps[1]) * 0.06), 26);
    return [x, y];
  }

  /* Size a spawned block from the slot it is going into.

     The `Ball` prefab is authored at 218x218 — the size of level 1's cube
     artwork. Levels 3 and 4 reuse that same prefab with `ball_01.png`, which is
     634x423, and author every target slot (and the sample block beside the +/-
     buttons) at 634x423. Keeping the prefab's box meant a 634x423 sprite was
     stretched into a 218x218 square: the ball came out both far too small and
     squashed out of its aspect ratio, while the sample next to the buttons was
     the right size. Taking the box from the target slot gives every level the
     size its own artwork was drawn at, with no per-level constants. */
  function sizeBlockForSlot(blockId, targetId, sprite) {
    var t = targetId && E.node(targetId);
    var want = null;
    if (t) want = t.size();                                  // the authored slot
    else if (sprite && sprite.w) want = [sprite.w, sprite.h]; // sprite native size
    if (!want || !want[0] || !want[1]) return;
    E.setSizeDelta(blockId, want[0], want[1]);
  }

  /* ------------------------------------------------------------------------
     Tidy the pile inside a pan.

     The authored target slots carry the right *structure* — how many blocks sit
     in each row, and how high the rows stack — but their x positions were
     nudged by hand and drift by up to 20 px, which reads as a messy heap. Each
     row is therefore rebuilt: same row membership, same row height, but evenly
     spaced and centred on the pan. Nothing is hard-coded per level; the row
     grouping is read from the slots the level already ships.
     ---------------------------------------------------------------------- */
  var rowCache = {};

  /* The row structure a level ships: how many blocks belong on each shelf of the
     pile and how far apart, read from the authored slots and evened out. */
  function rowPlan(targetIds) {
    var key = (targetIds || []).join('|');
    if (rowCache[key]) return rowCache[key];
    var pts = (targetIds || []).map(function (id) {
      var n = E.node(id);
      return n ? { x: n.anchoredPos[0], y: n.anchoredPos[1] } : null;
    }).filter(Boolean);
    if (!pts.length) return (rowCache[key] = []);

    // group into rows by y; authored rows are ~90 px apart, jitter is under 20
    var rows = [];
    pts.slice().sort(function (a, b) { return a.y - b.y; }).forEach(function (p) {
      var row = rows[rows.length - 1];
      if (row && Math.abs(p.y - row.y) <= 45) { row.xs.push(p.x); row.y = (row.y + p.y) / 2; }
      else rows.push({ y: p.y, xs: [p.x] });
    });

    var plan = rows.map(function (row) {
      row.xs.sort(function (a, b) { return a - b; });
      var n = row.xs.length;
      var span = n > 1 ? row.xs[n - 1] - row.xs[0] : 0;
      return { y: +row.y.toFixed(2), cap: n,
               step: n > 1 ? +(span / (n - 1)).toFixed(3) : 0 };
    });
    rowCache[key] = plan;
    return plan;
  }

  /* Where block `index` of `count` sits.

     Rows fill from the bottom up, and each row is centred on **how many blocks
     are actually in it**, not on its capacity. Centring on capacity left a
     partly-filled top row hanging off to one side — with 4 blocks in a 3+2 pile
     the single top block sat half a step left of centre. */
  function pileSlot(targetIds, index, count) {
    var plan = rowPlan(targetIds);
    if (!plan.length) return null;
    var left = count, fill = [];
    for (var i = 0; i < plan.length; i++) {
      var take = Math.max(0, Math.min(plan[i].cap, left));
      fill.push(take);
      left -= take;
    }
    // anything beyond the planned capacity joins the top row
    if (left > 0) fill[fill.length - 1] += left;

    var acc = 0;
    for (var r = 0; r < plan.length; r++) {
      if (index < acc + fill[r]) {
        var k = index - acc, n = fill[r], mid = (n - 1) / 2;
        var step = plan[r].step || (plan[0].step || 0);
        return [+((k - mid) * step).toFixed(2), plan[r].y];
      }
      acc += fill[r];
    }
    return [0, plan[plan.length - 1].y];
  }

  function itemWeightOf(itemId, gm) {
    var d = get('DraggableItem', itemId);
    if (d && d.isCube) return 1;
    // the puzzle's whole point: the item weighs exactly N blocks
    return gm ? gm.correctCount() : 1;
  }

  function sideList(state, side) {
    return side === 'left' ? state.leftItems : state.rightItems;
  }

  function dropRecord(state, id) {
    ['leftItems', 'rightItems'].forEach(function (k) {
      for (var i = state[k].length - 1; i >= 0; i--)
        if (state[k][i].id === String(id)) state[k].splice(i, 1);
    });
  }

  /* Move an item into a pan without ever letting it disappear:
     - the screen position is preserved across the re-parent, then eased to the
       rest anchor, so there is no jump and no flicker
     - it becomes the pan zone's last child, which draws it above the inner pan
       surface and still behind the basket's foreground rim
     - the original is never destroyed; only its parent changes
     - a second drop while one is in flight is ignored                       */
  function placeItemInPan(itemId, panId, side, opts) {
    itemId = String(itemId); panId = String(panId);
    var o = opts || {};
    var gm = o.gm || null;
    var state = gm ? gm.scaleState : null;
    var item = E.node(itemId), pan = E.node(panId);
    if (!item || !pan) return Promise.resolve(false);
    if (state && state.interactionLocked && !o.force) return Promise.resolve(false);
    if (state) state.interactionLocked = true;

    var before = E.stagePos(itemId);
    E.setParent(itemId, panId, true);          // keeps the item where it looks
    E.setAsLastSibling(itemId);
    E.setStagePos(itemId, before[0], before[1]);
    E.setScale(itemId, 1);                     // never left shrunk by a tween

    var from = E.getAnchoredPos(itemId);
    var to = panAnchor(itemId, panId);
    var dur = o.instant ? 0 : (E.prefersReducedMotion() ? 0.12 : 0.26);

    return E.tween(dur, 'OutCubic', function (u) {
      E.setAnchoredPos(itemId, from[0] + (to[0] - from[0]) * u, from[1] + (to[1] - from[1]) * u);
    }).then(function () {
      E.setAnchoredPos(itemId, to[0], to[1]);
      if (state) {
        dropRecord(state, itemId);
        sideList(state, side).push({
          id: itemId, weight: itemWeightOf(itemId, gm), kind: o.kind || 'item'
        });
        state.interactionLocked = false;
        updateScaleFromPanContents(gm, o.settleDuration);
      }
      return true;
    }, function () {
      if (state) state.interactionLocked = false;
      return false;
    });
  }

  function removeItemFromPan(itemId, gm) {
    itemId = String(itemId);
    if (gm && gm.scaleState) {
      dropRecord(gm.scaleState, itemId);
      updateScaleFromPanContents(gm);
    }
  }

  /* A refused drop glides home instead of snapping, and can never be left in a
     parent that has since been hidden. */
  function returnItemToOrigin(itemId, home, homePos, homeStage) {
    itemId = String(itemId);
    if (!E.node(itemId)) return Promise.resolve(false);
    if (!home || !E.node(home) || !E.activeInHierarchy(home)) home = Game.rootId();
    E.setParent(itemId, home, true);
    var from = E.getAnchoredPos(itemId);
    var to = homePos;
    if (String(home) === String(Game.rootId()) && homeStage) {
      var cur = E.stagePos(itemId);
      to = [from[0] + (homeStage[0] - cur[0]), from[1] - (homeStage[1] - cur[1])];
    }
    var dur = E.prefersReducedMotion() ? 0.1 : 0.28;
    return E.tween(dur, 'OutCubic', function (u) {
      E.setAnchoredPos(itemId, from[0] + (to[0] - from[0]) * u, from[1] + (to[1] - from[1]) * u);
    }).then(function () {
      E.setAnchoredPos(itemId, to[0], to[1]);
      E.setScale(itemId, 1);
      return true;
    });
  }

  /* The single place the balance is told what to show. Beam, both pans and the
     needle all come out of one sampled pose, so they can never drift apart. */
  function updateScaleFromPanContents(gm, dur) {
    if (!gm) return;
    var s = gm.scaleState;
    var sum = function (a) { return a.reduce(function (t, x) { return t + x.weight; }, 0); };
    s.leftWeight = sum(s.leftItems);
    s.rightWeight = sum(s.rightItems);
    var itemLeft = gm.isItemOnLeft;
    var itemW = itemLeft ? s.leftWeight : s.rightWeight;
    var blockW = itemLeft ? s.rightWeight : s.leftWeight;
    var N = gm.correctCount() || 1;
    if (!itemW && !blockW) s.balanceValue = 0;
    else s.balanceValue = Math.max(-1, Math.min(1, (itemW - blockW) / N));
    gm.renderBalance(dur);
  }

  // =========================================================================
  //  ButtonAnimator  (Tutorial splash "Let's Go")
  // =========================================================================
  function ButtonAnimator(f, hostId) {
    var self = { runner: new Runner(), loop: null };
    register(hostId, 'ButtonAnimator', function start() {
      E.setScale(f.goButton, 1);
      self.loop = E.loopScale(f.goButton, 0.8, 1, 1, 'InOutSine');
      E.setActive(f.gameplayPanel, false);
      E.addClickListener(f.goButton, function () {
        E.Audio.source(f.audioSource).playOneShot(f.buttonClickAudio);
        if (self.loop) self.loop.kill();
        E.setInteractable(f.goButton, false);
        self.runner.run(function (tok) {
          return E.wait(fld(f, 'audioDelayBeforeDisable', 0.3), tok).then(function () {
            E.setActive(f.goButton, false);
            E.setActive(f.gameplayPanel, true);
            tickControllers();
          });
        });
      });
    });
    put('ButtonAnimator', hostId, self);
    return self;
  }

  // =========================================================================
  //  TutorialManager  (Tutorial scene: guided 3-block demo)
  // =========================================================================
  function TutorialManager(f, hostId) {
    var self = {
      runner: new Runner(),
      checkButtonActivated: false,
      currentCubeIndex: 0,
      cubesPlaced: 0,
      hintOn: null,
      animState: 'New State'
    };
    var TOTAL_CUBES = 3;
    var anim = E.animator(f.bookAnimator);
    var tiltRunner = new Runner();

    function src() { return E.Audio.source(f.audioSource); }

    /* ----------------------------------------------------------------------
       The tutorial balance moves per block, exactly like the six levels.

       BookAnimation drops the book in and leaves the item pan fully down;
       from there each cube the child adds eases the pans a third of the way
       back to level, instead of the original's single jump when the last one
       lands. Same sampled curve, same renderer, so the tutorial and the levels
       cannot look different.
       -------------------------------------------------------------------- */
    var BALANCE_PATHS = ['left ', 'Right', 'needle', 'plate'];
    self.tilt = 1;

    function setTutorialTilt(v) {
      self.tilt = v;
      var clip = v >= 0 ? 'Scale_LeftDown' : 'Scale_RightDown';
      /* samplePose, not the animator: BallAnimation is playing its own
         visibility curves on the same rig at this moment, and going through the
         animator would stop its ticker every frame and inherit its filter. */
      E.samplePose(f.bookAnimator, clip, Math.abs(v) * (E.clipLength(clip) || 0.75),
                   BALANCE_PATHS);
    }

    function animateTutorialTilt(target, dur) {
      var from = self.tilt;
      if (Math.abs(target - from) < 0.0005) { setTutorialTilt(target); return; }
      var tok = tiltRunner.fresh('tilt');
      tiltRunner.run(function (t) {
        return E.tween(dur, 'Smooth', function (u) {
          if (!E.activeInHierarchy(self.node)) return;
          setTutorialTilt(from + (target - from) * u);
        }, t);
      }, tok);
    }

    function tutorialTiltTarget() {
      return Math.max(0, 1 - self.cubesPlaced / TOTAL_CUBES);
    }

    /* The clip draws its own drag demonstration: a hand that carries the book
       from the plinth into the pan, plus a STATIC Vector_10 arrow beside it.
       Only the static arrow is replaced — the hand is the thing actually doing
       the dragging, and hiding it left the book sliding along on its own, which
       is what made the tutorial drag read wrongly. */
    function authoredArrowImages() {
      var out = [];
      ['items /Item 2/Hint hand/Image', 'items /Item 1/Hint hand (1)/Image'
      ].forEach(function (p) {
        var n = E.findByPath(f.bookAnimator, p);
        if (n) out.push(n);
      });
      return out;
    }
    function hideAuthoredArrow() {
      authoredArrowImages().forEach(function (n) { n.el.style.visibility = 'hidden'; });
    }

    function showTutorialDragArrow() {
      hideAuthoredArrow();
      /* The animated arrow traces the route the authored hand is about to take,
         from the plinth into the left pan.

         Anchored to the PLINTH, not to the ball: Guide.show resolves a preload
         promise before it measures, and by then the clip has already started
         carrying the ball, so anchoring to the ball froze the arrow around
         wherever it happened to be mid-flight. The plinth never moves.

         No travelling hand of our own either — the clip's hand is already
         carrying the ball along that route, and a second one would contradict
         it. */
      var from = f.Base1 && E.node(f.Base1) ? f.Base1 : f.bookImage;
      var to = E.findByPath(f.bookAnimator, 'left /Basket/Image');
      if (from && to) {
        Guide.show({ fromId: from, toId: to.id, glowId: f.bookImage,
                     hand: false, follow: false });
      }
    }

    self.setStep = function (s) { setStep(s); };   // for the god-mode tools

    function setStep(step) {
      anim.setInteger('Step', step);
      if (self.animState === 'New State' && step === 1) {
        self.animState = 'Book animation';
        /* The authored clip drags the book to the pan and flips on a static
           Vector_10 arrow while it does. That static copy is suppressed and the
           animated Guide is shown over the same route instead, so the tutorial
           gets the identical dot-by-dot arrow the six levels use. */
        /* The arrow draws itself first, so the child reads where the ball is
           going, and the clip then carries it along that exact route. */
        showTutorialDragArrow();
        self.runner.run(function (t) {
          return E.wait(1.1, t).then(function () {
            anim.play('BookAnimation', function () {
              self.tilt = 1;
              Guide.hide();
              hideAuthoredArrow();
            });
          });
        }, self.runner.fresh('bookAnim'));
      } else if (self.animState === 'Book animation' && step === 2) {
        self.animState = 'Ball Animation';
        // the clip keeps its item/cube visibility work; the pans are ours now
        anim.playExcept('BallAnimation', BALANCE_PATHS);
      }
    }

    /* IEnumerator TypeInstructionWithAudio */
    function typeWithAudio(msg, clip, tok) {
      src().stop();
      E.setText(f.instructionText, '');
      msg = msg || '';
      if (!clip) {
        var i = 0, cur = '';
        var step = function () {
          if (i >= msg.length) return Promise.resolve();
          cur += msg[i++]; E.setText(f.instructionText, cur);
          return E.wait(fld(f, 'minTypingSpeed', 0.02), tok).then(step);
        };
        return step();
      }
      var s = src();
      s.setClip(clip); s.play();
      var typingSpeed = E.Audio.len(clip) / Math.max(msg.length, 1);
      var k = 0, txt = '';
      var loop = function () {
        if (k >= msg.length) return E.waitUntil(function () { return !s.isPlaying(); }, tok);
        txt += msg[k++]; E.setText(f.instructionText, txt);
        return E.wait(typingSpeed, tok).then(loop);
      };
      return loop();
    }

    /* IEnumerator FadeInstructionBar — instructionBar is a CanvasGroup here */
    function fadeBar(show, dur, tok) {
      var from = E.node(f.instructionBar) && E.node(f.instructionBar).canvasGroup
        ? E.node(f.instructionBar).canvasGroup.alpha : 1;
      var to = show ? 1 : 0;
      E.tween(dur, 'Linear', function (u) {
        E.setCanvasGroupAlpha(f.instructionBar, from + (to - from) * u);
      }, tok);
      return E.wait(dur, tok);
    }

    function hideHintHand() {
      self.runner.stop('hint');
      E.setActive(f.hintHand, false);
      tapLoop(f.hintHand, false);
      if (self.hintOn) { setGlow(self.hintOn, false); self.hintOn = null; }
      Guide.hide();
    }

    function showHintOnButton(targetId) {
      hideHintHand();
      E.setActive(f.hintHand, true);
      E.setScale(f.hintHand, 0.3);
      // GetButtonPosition: screen point -> canvas rect local space
      var sp = E.stagePos(targetId), c = E.canvas();
      E.setAnchoredPos(f.hintHand, sp[0] - c[0] / 2, c[1] / 2 - sp[1]);
      tapLoop(f.hintHand, true);           // one still frame + a CSS tap loop
      setGlow(targetId, true, 'warm');
      self.hintOn = String(targetId);
      /* No dotted arrow here. The tap hand is sitting on the button already;
         an arrow drawn from the sample block to a button only added clutter and
         suggested a drag where the child has to tap. The arrow is reserved for
         the one gesture it describes: dragging the item onto a pan. */
    }

    /* The ball sample beside the +/- buttons. Same rule as the levels: the blue
       glow is a cue while the child is being asked to add blocks, and goes out
       the moment they add one. */
    function glowSampleBlock(on) {
      if (f.ballImage && E.node(f.ballImage)) setGlow(f.ballImage, !!on);
    }

    /* the book in the pan, then every cube the child added, in order */
    self.spawned = [];
    function placedThings() {
      var out = [];
      if (f.bookImage && E.node(f.bookImage)) {
        // the copy of the book that BookAnimation moves into the left pan
        var inPan = E.findByPath(f.bookAnimator, 'left /Basket/Image/Book');
        out.push(inPan ? inPan.id : f.bookImage);
      }
      return out.concat(self.spawned.filter(Boolean));
    }

    function spawnAndMoveCube(index, tok) {
      var id = E.instantiate((f.cubePrefab || {}).template, f.basket);
      if (!id) return E.wait(0.3, tok);
      self.spawned.push(id);
      var tp = (f.cubeTargetPositions || [])[index];
      sizeBlockForSlot(id, tp, null);
      if (tp) { var p = E.stagePos(tp); E.setStagePos(id, p[0], p[1]); }
      // even, centred rows for however many blocks are down so far
      var pos = pileSlot(f.cubeTargetPositions, index, index + 1);
      if (pos) E.setAnchoredPos(id, pos[0], pos[1]);
      self.spawned.slice(0, index).forEach(function (prev, i) {
        var q = pileSlot(f.cubeTargetPositions, i, index + 1);
        if (q) E.setAnchoredPos(prev, q[0], q[1]);
      });
      E.setScale(id, 0);
      doScale(id, 1, 0.3, 'OutBack', tok);
      return E.wait(0.3, tok);
    }

    function onPlusButtonClicked() {
      if (self.currentCubeIndex >= (f.cubeSpawnPoints || []).length ||
          self.cubesPlaced >= TOTAL_CUBES) return;
      hideHintHand();
      glowSampleBlock(false);            // the cue has been understood
      var idx = self.currentCubeIndex;
      self.runner.run(function (t) { return spawnAndMoveCube(idx, t); });
      self.currentCubeIndex++;
      self.cubesPlaced++;
      // the pans ease a third of the way back with every cube, in step with
      // the block landing rather than all at once at the end
      animateTutorialTilt(tutorialTiltTarget(), 0.5);

      if (self.cubesPlaced === 1) {
        E.setInteractable(f.minusButton, true);
        if (f.minusCanvasGroup) E.setCanvasGroupAlpha(f.minusCanvasGroup, 1);
      }
      if (self.cubesPlaced < TOTAL_CUBES) {
        // the next + hint comes from the Idle watcher, not a 0.5 s re-show
        if (!self.checkButtonActivated) Idle.poke();
      } else {
        setStep(2);
        self.runner.run(function (t) { return enableCheckButtonWithHint(t); });
      }
    }

    function enableCheckButtonWithHint(tok) {
      return E.wait(fld(f, 'cubeMoveDuration', 0.8) + 0.3, tok).then(function () {
        E.setActive(f.checkButton, true);
        E.setInteractable(f.checkButton, true);
        self.checkButtonActivated = true;
        hideHintHand();
        Idle.prompt();        // Check has just appeared; offer it soon
      });
    }

    function onCheckButtonClicked() {
      E.setActive(f.checkButton, false);
      hideHintHand();
      self.runner.stop('checkHint');
      // both Group_485 counters go together, and not before Check
      E.setActive(f.Base1, false);
      E.setActive(f.Base2, false);
      // the tutorial's Check is only offered once the demo is right, so it is
      // the same success beat the six levels celebrate
      E.Audio.sfx('correct');
      if (f.bookCorrectParticle) E.confetti(f.bookCorrectParticle);
      self.runner.run(showInstruction7AfterCheck);
    }

    function showInstruction7AfterCheck(tok) {
      return E.wait(1, tok)
        .then(function () { return typeWithAudio(f.instruction7, f.instruction7Audio, tok); })
        .then(function () { return fadeBar(false, 0.3, tok); })
        .then(function () {
          E.setActive(f.labelImage, true);
          /* "Weight of ball = weight of 3 blocks" — the ball pops as the ball is
             named and the blocks as theirs is, the same beat the levels use.
             This clip has no text line, so the wording is supplied to give
             popWithNarration the same two cues to aim at. */
          var placed = placedThings();
          self.runner.run(function (t) {
            return popWithNarration('The ball weighs the same as 3 blocks',
              f.instruction8Audio, placed.slice(0, 1), placed.slice(1), t);
          }, self.runner.fresh('equalPop'));
          if (f.instruction8Audio) {
            var s = src(); s.stop(); s.setClip(f.instruction8Audio); s.play();
            return E.waitUntil(function () { return !s.isPlaying(); }, tok);
          }
        })
        .then(function () {
          // Base2 went with Base1 back at Check
          E.setActive(f.nextButton, true);
          E.setInteractable(f.nextButton, true);
          Idle.prompt();
        });
    }

    function gameSequence(tok) {
      return typeWithAudio(f.instruction1, f.instruction1Audio, tok)
        .then(function () { return E.wait(1, tok); })
        .then(function () { return typeWithAudio(f.instruction2, f.instruction2Audio, tok); })
        .then(function () { return E.wait(1, tok); })
        .then(function () { return typeWithAudio(f.instruction3, f.instruction3Audio, tok); })
        .then(function () { return E.wait(1, tok); })
        .then(function () { return typeWithAudio(f.instruction4, f.instruction4Audio, tok); })
        .then(function () { return E.wait(1, tok); })
        .then(function () {
          setStep(1);
          E.setText(f.instructionText, '');
          return fadeBar(false, 0.3, tok);
        })
        .then(function () { return E.wait(3, tok); })
        .then(function () { return fadeBar(true, 0.3, tok); })
        .then(function () {
          // both counters stay up until Check, the same rule the six levels follow
          return typeWithAudio(f.instruction5, f.instruction5Audio, tok);
        })
        .then(function () { return E.wait(1, tok); })
        .then(function () {
          E.setInteractable(f.minusButton, false);
          if (f.minusCanvasGroup) E.setCanvasGroupAlpha(f.minusCanvasGroup, 0.5);
          return typeWithAudio(f.instruction6, f.instruction6Audio, tok);
        })
        .then(function () {
          E.setInteractable(f.plusButton, true);
          // "Tap the + button to add blocks" — light the block being counted
          glowSampleBlock(true);
          Idle.prompt();
        });
    }

    register(hostId, 'TutorialManager', function start() {
      E.setActive(f.nextButton, false);
      E.setActive(f.checkButton, false);
      E.setActive(f.hintHand, false);
      E.setActive(f.labelImage, false);
      E.setCanvasGroupAlpha(f.instructionBar, 1);
      E.setActive(f.Base1, true);
      E.setActive(f.Base2, true);
      E.setInteractable(f.bookButton, false);
      E.setInteractable(f.plusButton, false);
      E.addClickListener(f.plusButton, onPlusButtonClicked);
      E.addClickListener(f.checkButton, onCheckButtonClicked);
      E.setInteractable(f.checkButton, false);
      E.addClickListener(f.nextButton, function () {
        src().stop();
        self.runner.stopAll();
        Game.loadScene(fld(f, 'nextSceneIndex', 1));
      });
      Idle.register(offerIdleHint, function () {
        hideHintHand();
        glowSampleBlock(false);
      });
      self.runner.run(gameSequence, self.runner.fresh('gameSequence'));
    });

    /* The tutorial is a fixed sequence, so the idle nudge is simply "press the
       button the step is waiting on". */
    function offerIdleHint() {
      if (!E.activeInHierarchy(hostId)) return false;
      if (src().isPlaying()) return "busy";     // let the instruction finish
      var live = function (id) { return id && E.node(id) && E.activeInHierarchy(id); };
      if (live(f.nextButton) && E.isInteractable(f.nextButton)) {
        showHintOnButton(f.nextButton); return true;
      }
      if (live(f.checkButton) && E.isInteractable(f.checkButton)) {
        showHintOnButton(f.checkButton); return true;
      }
      if (live(f.plusButton) && E.isInteractable(f.plusButton) &&
          self.cubesPlaced < TOTAL_CUBES) {
        showHintOnButton(f.plusButton);
        glowSampleBlock(true);
        return true;
      }
      return false;
    }

    put('TutorialManager', hostId, self);
    return self;
  }

  // =========================================================================
  //  DraggableItem  (12 instances; the cube copies have isCube = true)
  // =========================================================================
  function DraggableItem(f, hostId) {
    var self = {
      node: String(hostId),
      isCube: !!fld(f, 'isCube', 0),
      snapDistance: fld(f, 'snapDistance', 150),
      basketTarget: f.basketTarget ? String(f.basketTarget) : null,
      gameManagerId: f.gameManager ? String(f.gameManager) : null,
      enabledComp: true,
      dropped: false,
      placing: false,
      startPos: [0, 0],
      startParent: null
    };
    var n = E.node(hostId);
    var activePointer = null, dragging = false, last = null;
    var DRAG_THRESHOLD = 10;

    function gm() { return get('WeightMeasuringGame', f.gameManager); }
    function tut() { return get('WeightGameTutorialController', f.tutorial); }

    function clampToCanvas() {
      var pad = (E.node(self.node).image || {}).pad || [0, 0, 0, 0];
      var r = E.stageRectYUp(self.node), c = E.canvas();
      var offLeft = (r.xMin + pad[0]);
      var offRight = (r.xMax - pad[2]) - c[0];
      var offBottom = (r.yMin + pad[1]);
      var offTop = (r.yMax - pad[3]) - c[1];
      var p = E.getAnchoredPos(self.node);
      if (offLeft < 0) p[0] -= offLeft;
      if (offRight > 0) p[0] -= offRight;
      if (offBottom < 0) p[1] -= offBottom;
      if (offTop > 0) p[1] -= offTop;
      E.setAnchoredPos(self.node, p[0], p[1]);
    }

    /* One route into a pan, shared by every level and by the tools. Guarded
       so a second release mid-animation cannot place the item twice. */
    self.acceptDrop = function (basketId, isLeftBasket) {
      var g = gm();
      if (!g) return Promise.resolve(false);
      if (self.dropped || self.placing || g.scaleState.interactionLocked)
        return Promise.resolve(false);
      self.placing = true;
      self.dropped = true;
      self.enabledComp = false;              // `enabled = false`
      Guide.hide();
      g.prepareForItem(isLeftBasket);
      return placeItemInPan(self.node, basketId, isLeftBasket ? 'left' : 'right', {
        gm: g, kind: 'item', settleDuration: g.itemSettleDuration()
      }).then(function (ok) {
        self.placing = false;
        if (!ok) { self.dropped = false; self.enabledComp = true; setCursorState(); return false; }
        setCursorState();
        g.afterItemPlaced();
        return true;
      });
    };

    function onBeginDrag() {
      if (self.isCube) return false;
      self.dropped = false;
      /* The original re-parents to the Canvas so the item draws above
         everything. That also lifts it out of its Level, so SetActive(false) on
         level change can no longer hide it and the item survives into the next
         level. Re-parent to the level root instead: still drawn above all other
         level content, but it cannot outlive the level. */
      var dragLayer = f.gameManager || Game.rootId();
      E.setParent(self.node, dragLayer, true);
      E.setAsLastSibling(self.node);
      var t = tut();
      if (t) t.onLeftItemDragStarted();
      return true;
    }

    function onDrag(dx, dy) {
      if (self.isCube) return;
      var p = E.getAnchoredPos(self.node);
      E.setAnchoredPos(self.node, p[0] + dx, p[1] + dy);
      clampToCanvas();
    }

    /* BasketDropZone implements IDropHandler, so in Unity releasing the pointer
       over a basket accepts the item outright. That path was missing, leaving
       only the snapDistance fallback below — which made dropping far harder
       than intended. The test uses the visible basket (the drop zone's parent)
       rather than the small invisible zone image, so the child can aim at what
       they can actually see. */
    function zoneUnderPointer(ev) {
      var zones = COMP['BasketDropZone'] || {};
      var best = null, bestDist = Infinity;
      Object.keys(zones).forEach(function (k) {
        var z = zones[k];
        var zn = E.node(z.node);
        if (!zn || !E.activeInHierarchy(z.node)) return;
        // only zones belonging to this item's game manager
        var owner = get('WeightMeasuringGame', f.gameManager);
        if (!owner) return;
        if (z.node !== String(owner.leftBasket()) && z.node !== String(owner.rightBasket())) return;
        var target = zn.parent ? zn.parent.el : zn.el;      // the visible basket
        var r = target.getBoundingClientRect();
        if (ev.clientX < r.left || ev.clientX > r.right ||
            ev.clientY < r.top || ev.clientY > r.bottom) return;
        var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        var d = Math.hypot(ev.clientX - cx, ev.clientY - cy);
        if (d < bestDist) { bestDist = d; best = z; }
      });
      return best;
    }

    function onEndDrag(ev) {
      if (self.isCube) return;
      var g = gm();
      if (!g) return;

      // ---- IDropHandler path: released over a basket ----
      var zone = ev ? zoneUnderPointer(ev) : null;
      if (zone) { self.acceptDrop(zone.node, zone.isLeftBasket); return; }

      // ---- OnEndDrag fallback: nearest basket within snapDistance ----
      // Unity measures this on world positions, which for a ScreenSpaceOverlay
      // canvas are screen pixels, so the comparison must be scaled.
      var k = E.scaleFactor();
      var me = E.stagePos(self.node);
      var lp = E.stagePos(g.leftBasket()), rp = E.stagePos(g.rightBasket());
      var leftDistance = Math.hypot(me[0] - lp[0], me[1] - lp[1]) * k;
      var rightDistance = Math.hypot(me[0] - rp[0], me[1] - rp[1]) * k;
      if (leftDistance < rightDistance && leftDistance <= self.snapDistance) {
        self.acceptDrop(g.leftBasket(), true);
      } else if (rightDistance <= self.snapDistance) {
        self.acceptDrop(g.rightBasket(), false);
      } else {
        // returning home: never drop the item into a parent that has since been
        // hidden, or it disappears from the board entirely
        returnItemToOrigin(self.node, self.startParent, self.startPos, self.homeStage);
      }
    }

    /* the cursor must say what this item can do right now */
    function setCursorState() {
      if (self.isCube) {
        /* The block beside the +/- buttons is a sample, not a control. It
           carries a Button component from the scene that nothing ever listens
           to, so it was advertising a pointer cursor and then doing nothing
           when a child tapped it. */
        n.el.classList.add('sample');
        return;
      }
      var el = n.el;
      el.classList.add('draggable');
      var can = self.enabledComp && !self.dropped && !self.placing;
      el.classList.toggle('nodrag', !can);
      el.classList.toggle('dragging', dragging);
      document.body.classList.toggle('dragging', dragging);
    }
    self.refreshCursor = setCursorState;

    function detach() {
      activePointer = null; last = null; dragging = false;
      window.removeEventListener('pointermove', winMove, true);
      window.removeEventListener('pointerup', winUp, true);
      window.removeEventListener('pointercancel', winUp, true);
      setCursorState();
    }
    function winMove(ev) {
      if (activePointer !== ev.pointerId || !last) return;
      var mdx = ev.clientX - last[0], mdy = ev.clientY - last[1];
      if (!dragging) {
        if (Math.hypot(mdx, mdy) < DRAG_THRESHOLD) return;
        if (!onBeginDrag()) { detach(); return; }
        dragging = true; last = [ev.clientX, ev.clientY];
        setCursorState();
        return;
      }
      last = [ev.clientX, ev.clientY];
      var k = E.scaleFactor();
      onDrag(mdx / k, -mdy / k);
    }
    function winUp(ev) {
      if (activePointer !== ev.pointerId) return;
      var was = dragging;
      detach();
      if (was) onEndDrag(ev);
    }
    n.el.addEventListener('pointerdown', function (ev) {
      if (self.isCube || !self.enabledComp || self.placing) return;
      if (!E.activeInHierarchy(self.node)) return;
      var g = gm();
      if (g && g.scaleState.interactionLocked) return;
      // any touch of the item stops the demonstration immediately
      Guide.hide();
      var t = tut();
      if (t) t.onLeftItemTouched();
      if (activePointer !== null) return;    // one pointer owns the item
      activePointer = ev.pointerId; last = [ev.clientX, ev.clientY]; dragging = false;
      window.addEventListener('pointermove', winMove, true);
      window.addEventListener('pointerup', winUp, true);
      window.addEventListener('pointercancel', winUp, true);
    });

    /* The level flow may nudge the item after start() has run; wherever it
       leaves it is where a released drag has to return to. */
    self.rehome = function () {
      self.startPos = E.getAnchoredPos(self.node);
      self.homeStage = E.stagePos(self.node);
    };

    register(hostId, 'DraggableItem', function start() {
      var nn = E.node(self.node);
      self.startParent = nn.parent ? nn.parent.id : Game.rootId();
      self.rehome();
      setCursorState();
    });

    put('DraggableItem', hostId, self);
    return self;
  }

  // =========================================================================
  //  BasketDropZone  (IDropHandler only)
  // =========================================================================
  function BasketDropZone(f, hostId) {
    var self = { node: String(hostId), isLeftBasket: !!fld(f, 'isLeftBasket', 1) };
    put('BasketDropZone', hostId, self);
    return self;
  }

  // =========================================================================
  //  WeightMeasuringGame  (6 instances — cube add/remove/check)
  // =========================================================================
  function WeightMeasuringGame(f, hostId) {
    var self = {
      node: String(hostId),
      cubeIndex: 0,
      firstPlusClicked: false,
      isResultChecked: false,
      isCubeMoving: false,
      celebrated: false,
      lastResult: 'None',
      scaleSide: 'Idle',           // which pan is down: Idle | Left | Right
      scaleState: newScaleState(), // the single source of truth for the balance
      tilt: 0,
      spawnedCubes: [],
      currentSpawnPoints: null,
      currentTargetPoints: null,
      activeCubeBasket: null,
      isItemOnLeft: true,
      correctCount: function () { return fld(f, 'correctCubeCount', 3); },
      leftBasket: function () { return f.leftBasket; },
      rightBasket: function () { return f.rightBasket; }
    };
    var anim = E.animator(f.scaleAnimator);
    var runner = new Runner();
    var tiltRunner = new Runner();

    var A = {
      idle: fld(f, 'idleAnimation', 'Idle'),
      left: fld(f, 'leftDownAnimation', 'Scale_LeftDown'),
      right: fld(f, 'rightDownAnimation', 'Scale_RightDown'),
      leftToIdle: fld(f, 'leftToIdleAnimation', 'Scale_LeftToIdle'),
      rightToIdle: fld(f, 'rightToIdleAnimation', 'Scale_RightToIdle')
    };

    function tut() { return get('WeightGameTutorialController', f.tutorial); }

    /* ------------------------------------------------------------------
       Continuous balance tilt.

       The original only re-plays a whole 0.75 s swing when the heavier side
       flips, so blocks 1..N-1 move the balance not at all and block N swings
       it all the way across in one go. Here the tilt is a continuous function
       of the block count, driven by sampling the very same authored curves at
       a fraction of their timeline, so every block visibly moves the pans.

       tilt: +1 = item side fully down, 0 = balanced, -1 = block side fully down.
       Sampling `Scale_LeftDown` at fraction f gives exactly the pose that
       `Scale_LeftToBalance` gives at (1 - f), so no fidelity is lost.
       ------------------------------------------------------------------ */
    function tiltTarget() { return self.scaleState.balanceValue; }

    function itemDownClip() { return self.isItemOnLeft ? A.left : A.right; }
    function blockDownClip() { return self.isItemOnLeft ? A.right : A.left; }

    /* Beam, both pans and the needle come from a single sampled pose of one
       authored clip, so they are physically incapable of disagreeing. Anything
       placed in a pan is a child of that pan and therefore rides with it. */
    function setTilt(v) {
      self.tilt = v;
      var clip = v >= 0 ? itemDownClip() : blockDownClip();
      var len = E.clipLength(clip);
      anim.sampleAt(clip, Math.abs(v) * len);
      if (Math.abs(v) < 0.001) self.scaleSide = 'Idle';
      else {
        var itemSideDown = v > 0;
        var leftDown = self.isItemOnLeft ? itemSideDown : !itemSideDown;
        self.scaleSide = leftDown ? 'Left' : 'Right';
      }
    }

    function animateTiltTo(target, dur) {
      var from = self.tilt;
      if (Math.abs(target - from) < 0.0005) { setTilt(target); return; }
      var tok = tiltRunner.fresh('tilt');
      tiltRunner.run(function (t) {
        return E.tween(dur, 'Smooth', function (u) {
          if (!E.activeInHierarchy(self.node)) return;   // level was left behind
          setTilt(from + (target - from) * u);
        }, t);
      }, tok);
    }
    self.animateTiltTo = animateTiltTo;
    self.tiltTarget = tiltTarget;

    /* the only renderer of the balance; everything else changes scaleState */
    self.renderBalance = function (dur) {
      animateTiltTo(self.scaleState.balanceValue, dur === undefined ? 0.45 : dur);
    };
    /* same pose, applied on this frame — for tools that need to read it back */
    self.renderBalanceNow = function () {
      tiltRunner.stop('tilt');
      setTilt(self.scaleState.balanceValue);
    };
    /* Re-centre the whole pile for the number of blocks now in it. Existing
       blocks glide the small distance rather than snapping, so adding one never
       makes the others jump. */
    function relayoutPile(skipId) {
      var ids = self.spawnedCubes.filter(Boolean);
      var slots = self.currentTargetPoints || [];
      ids.forEach(function (id, i) {
        var pos = pileSlot(slots, i, ids.length);
        if (!pos) return;
        if (String(id) === String(skipId)) { E.setAnchoredPos(id, pos[0], pos[1]); return; }
        var from = E.getAnchoredPos(id);
        if (Math.abs(from[0] - pos[0]) < 0.05 && Math.abs(from[1] - pos[1]) < 0.05) return;
        E.tween(0.18, 'OutCubic', function (u) {
          E.setAnchoredPos(id, from[0] + (pos[0] - from[0]) * u,
                               from[1] + (pos[1] - from[1]) * u);
        });
      });
    }
    self.relayoutPile = relayoutPile;

    /* record a cube in the state without touching the DOM */
    function noteCube(id, add) {
      var side = self.isItemOnLeft ? 'right' : 'left';
      var list = self.scaleState[side === 'left' ? 'leftItems' : 'rightItems'];
      if (add) list.push({ id: String(id), weight: 1, kind: 'cube' });
      else {
        for (var i = list.length - 1; i >= 0; i--)
          if (list[i].id === String(id)) { list.splice(i, 1); break; }
      }
    }

    function setButtonVisual(btnId, cgId, state) {
      E.setInteractable(btnId, state);
      if (cgId) E.setCanvasGroupAlpha(cgId, state ? fld(f, 'enabledAlpha', 1) : fld(f, 'disabledAlpha', 0.4));
    }

    self.enablePlusMinus = function () {
      setButtonVisual(f.plusButton, f.plusCanvasGroup, true);
      setButtonVisual(f.minusButton, f.minusCanvasGroup, true);
    };
    self.disablePlusMinus = function () {
      setButtonVisual(f.plusButton, f.plusCanvasGroup, false);
      setButtonVisual(f.minusButton, f.minusCanvasGroup, false);
    };

    self.setPlusMinusInteractableOnly = function (state) {
      E.setInteractable(f.plusButton, state);
      E.setInteractable(f.minusButton, state);
      if (f.plusCanvasGroup) E.setCanvasGroupAlpha(f.plusCanvasGroup, 1);
      if (f.minusCanvasGroup) E.setCanvasGroupAlpha(f.minusCanvasGroup, 1);
    };

    self.updatePlusMinusState = function () {
      var len = (self.currentSpawnPoints || []).length;
      var canAdd = self.cubeIndex < len;
      var canRemove = self.cubeIndex > 0;
      E.setInteractable(f.plusButton, canAdd);
      E.setInteractable(f.minusButton, canRemove);
      if (f.plusCanvasGroup)
        E.setCanvasGroupAlpha(f.plusCanvasGroup, canAdd ? fld(f, 'enabledAlpha', 1) : fld(f, 'disabledAlpha', 0.4));
      if (f.minusCanvasGroup)
        E.setCanvasGroupAlpha(f.minusCanvasGroup, canRemove ? fld(f, 'enabledAlpha', 1) : fld(f, 'disabledAlpha', 0.4));
    };

    /* Which pan the item went into, and therefore which pan the blocks use.
       Split out of onLeftItemDropped so the drop animation can settle the
       state before anything is rendered. */
    self.prepareForItem = function (droppedOnLeft) {
      self.isItemOnLeft = droppedOnLeft;
      if (droppedOnLeft) {
        self.activeCubeBasket = f.rightBasket;
        self.currentSpawnPoints = f.rightSpawnPoints;
        self.currentTargetPoints = f.rightTargetPoints;
      } else {
        self.activeCubeBasket = f.leftBasket;
        self.currentSpawnPoints = f.leftSpawnPoints;
        self.currentTargetPoints = f.leftTargetPoints;
      }
    };

    self.afterItemPlaced = function () {
      self.updatePlusMinusState();
      var t = tut();
      if (t) t.onLeftItemPlaced();
    };

    /* kept for callers that place the item themselves (tools, tests) */
    self.onLeftItemDropped = function (droppedOnLeft) {
      self.prepareForItem(droppedOnLeft);
      updateScaleFromPanContents(self, E.clipLength(itemDownClip()) || 0.75);
      self.afterItemPlaced();
    };

    self.itemSettleDuration = function () { return E.clipLength(itemDownClip()) || 0.75; };

    /* the level has been switched away from: drop every pending frame */
    self.suspend = function () {
      runner.stopAll();
      tiltRunner.stopAll();
      anim.stop();
    };

    function updateScaleDynamically() {
      if (self.isResultChecked) return;
      updateScaleFromPanContents(self, 0.45);
    }

    function enableCheckButton() {
      if (self.cubeIndex > 0 && !self.isResultChecked) {
        E.setActive(f.checkButton, true);
        var t = tut();
        if (t) t.startCheckHint();
      }
    }

    function addCube() {
      // rapid tapping must not queue two cubes for the same slot
      if (self.isCubeMoving || self.scaleState.interactionLocked) return;
      var t = tut();
      if (t) t.onPlusClicked();
      if (self.cubeIndex >= (self.currentSpawnPoints || []).length) return;
      runner.run(addCubeRoutine);
    }

    function addCubeRoutine(tok) {
      self.isCubeMoving = true;
      if (!self.firstPlusClicked) {
        self.firstPlusClicked = true;
        var t = tut();
        if (t) t.hideInstructionBar();
      }
      var id = E.instantiate((f.cubePrefab || {}).template, self.activeCubeBasket);
      if (id) {
        E.setAsLastSibling(id);
        var tp = self.currentTargetPoints[self.cubeIndex];
        // size before positioning: setStagePos measures from the final box
        sizeBlockForSlot(id, tp, f.normalCubeSprite);
        if (tp) { var p = E.stagePos(tp); E.setStagePos(id, p[0], p[1]); }
        E.setScale(id, 0);
        doScale(id, 1, 0.3, 'OutBack', tok);
        self.spawnedCubes[self.cubeIndex] = id;
        self.cubeIndex++;
        noteCube(id, true);
        if (f.normalCubeSprite) E.setSprite(id, f.normalCubeSprite);
        // even, centred rows instead of the authored hand-nudged scatter
        relayoutPile(id);
      }
      return E.wait(0.3, tok).then(function () {
        updateScaleDynamically();
        self.isCubeMoving = false;
        self.updatePlusMinusState();
        enableCheckButton();
      });
    }

    function removeCube() {
      if (self.isCubeMoving || self.scaleState.interactionLocked) return;
      var t = tut();
      if (t) t.onMinusClicked();
      if (self.cubeIndex <= 0) return;
      runner.run(removeCubeRoutine);
    }

    function removeCubeRoutine(tok) {
      self.isCubeMoving = true;
      var removeIndex = self.cubeIndex - 1;
      var id = self.spawnedCubes[removeIndex];
      if (!id) { self.isCubeMoving = false; return Promise.resolve(); }
      self.cubeIndex--;
      return doScale(id, 0, 0.2, 'InBack', tok)
        .then(function () {
          var sp = self.currentSpawnPoints[removeIndex];
          if (sp) { var p = E.stagePos(sp); E.setStagePos(id, p[0], p[1]); }
          E.setScale(id, 0);
          return doScale(id, 1, 0.25, 'OutBack', tok);
        })
        .then(function () {
          noteCube(id, false);
          E.destroy(id);
          self.spawnedCubes[removeIndex] = null;
          relayoutPile();            // the pile re-centres for what is left
          self.lastResult = 'None';
          E.setActive(f.checkButton, self.cubeIndex > 0);
          updateScaleDynamically();
          self.isCubeMoving = false;
          self.updatePlusMinusState();
          enableCheckButton();
        });
    }

    function highlightWrongCubes() {
      for (var i = 0; i < self.cubeIndex; i++) {
        if (!self.spawnedCubes[i]) continue;
        if (f.wrongCubeSprite) E.setSprite(self.spawnedCubes[i], f.wrongCubeSprite);
      }
    }

    self.resetCubeSprites = function () {
      for (var i = 0; i < self.cubeIndex; i++) {
        if (!self.spawnedCubes[i]) continue;
        if (f.normalCubeSprite) E.setSprite(self.spawnedCubes[i], f.normalCubeSprite);
      }
    };

    self.resetAllCubes = function () {
      for (var i = 0; i < self.spawnedCubes.length; i++) {
        if (self.spawnedCubes[i]) {
          noteCube(self.spawnedCubes[i], false);
          E.destroy(self.spawnedCubes[i]);
          self.spawnedCubes[i] = null;
        }
      }
      self.cubeIndex = 0;
      self.firstPlusClicked = false;
      self.lastResult = 'None';
      E.setActive(f.checkButton, false);
      self.updatePlusMinusState();
      // with no blocks the item side is heaviest again; the original left the
      // pans frozen wherever the failed attempt ended
      updateScaleFromPanContents(self, 0.5);
    };

    function checkResult() {
      var t = tut();
      if (t) t.onCheckClicked();
      self.disablePlusMinus();
      if (self.isResultChecked) return;
      self.isResultChecked = true;
      if (t) t.hideInstructionBar();

      var correct = fld(f, 'correctCubeCount', 3);
      if (self.cubeIndex === correct) {
        self.lastResult = 'Correct';
        E.setActive(f.checkButton, false);
        self.disablePlusMinus();
        self.scaleState.interactionLocked = true;    // the round is over
        Guide.hide();
        // the celebration belongs to the confirmed final success state only
        if (!self.celebrated) {
          self.celebrated = true;
          E.Audio.sfx('correct');
          if (f.correctParticle) E.confetti(f.correctParticle);
        }
        self.scaleState.balanceValue = 0;
        animateTiltTo(0, 0.5);               // settle to level
        if (t) t.onCorrectMatch();
        return;
      }

      E.setActive(f.checkButton, false);
      self.disablePlusMinus();
      var more = self.cubeIndex > correct;
      // The tilt already shows which side is heavier, so it is left where the
      // block count put it rather than re-swung to a hard stop.
      self.lastResult = more ? 'More' : 'Less';
      animateTiltTo(tiltTarget(), 0.35);
      highlightWrongCubes();
      if (t) { if (more) t.onMoreCubes(); else t.onLessCubes(); }
    }

    self.handleTryAgain = function () {
      self.isResultChecked = false;
      self.scaleState.interactionLocked = false;
      if (self.lastResult === 'Less') {
        self.resetAllCubes();           // note: this clears lastResult to 'None'
        self.updatePlusMinusState();
      } else if (self.lastResult === 'More') {
        self.updatePlusMinusState();
        E.setActive(f.checkButton, false);
        self.resetCubeSprites();
        var t = tut();
        if (t) { t.playInstruction7(); t.showMinusHint(); }
      }
    };

    register(hostId, 'WeightMeasuringGame', function start() {
      var n = Math.max((f.leftSpawnPoints || []).length, (f.rightSpawnPoints || []).length);
      self.spawnedCubes = new Array(n).fill(null);
      self.scaleSide = 'Idle';
      self.scaleState = newScaleState();
      self.celebrated = false;
      self.tilt = 0;
      // Animator default state is `idle`, which holds the Idle pose
      anim.play('Idle');
      E.addClickListener(f.plusButton, addCube);
      E.addClickListener(f.minusButton, removeCube);
      E.addClickListener(f.checkButton, checkResult);
      E.setInteractable(f.plusButton, false);
      E.setInteractable(f.minusButton, false);
      E.setActive(f.checkButton, false);
    });

    put('WeightMeasuringGame', hostId, self);
    return self;
  }

  // =========================================================================
  //  WeightGameTutorialController  (6 instances — instruction flow + hints)
  // =========================================================================
  function WeightGameTutorialController(f, hostId) {
    var self = {
      node: String(hostId),
      runner: new Runner(),
      leftItemPlaced: false,
      plusClicked: false,
      instruction3Completed: false,
      typing: false,
      activePlusHint: null,
      activeMinusHint: null,
      activeCheckHint: null,
      activeNextHint: null,
      activeTryAgainHint: null,
      ghostTween: null
    };

    function gm() { return get('WeightMeasuringGame', f.gameManager); }
    function src() { return E.Audio.source(f.audioSource); }

    // -------------------------------------------------------- typing system --
    function stopCurrentInstruction() {
      self.runner.stop('typing');
      self.typing = false;
      var s = src(); s.stop(); s.setClip(null);
    }

    function typeWithAudio(msg, clip, tok) {
      msg = msg || '';
      E.setText(f.instructionText, '');
      var s = src();
      if (s.isPlaying()) s.stop();
      var typingSpeed = fld(f, 'minTypingSpeed', 0.02);
      if (clip) {
        s.setClip(clip); s.play();
        typingSpeed = Math.max(typingSpeed, E.Audio.len(clip) / Math.max(msg.length, 1));
      }
      var i = 0, cur = '';
      var loop = function () {
        if (i >= msg.length) {
          if (clip) return E.waitUntil(function () { return !s.isPlaying(); }, tok);
          return Promise.resolve();
        }
        cur += msg[i++]; E.setText(f.instructionText, cur);
        return E.wait(typingSpeed, tok).then(loop);
      };
      return loop();
    }

    function playInstruction(msg, clip) {
      stopCurrentInstruction();
      onMinusClicked();
      self.typing = true;
      var tok = self.runner.fresh('typing');
      self.runner.run(function (t) {
        return typeWithAudio(msg, clip, t).then(function () { self.typing = false; });
      }, tok);
      return tok;
    }

    function playInstructionAndWait(msg, clip, tok) {
      playInstruction(msg, clip);
      return E.waitUntil(function () { return !self.typing; }, tok);
    }

    self.hideInstructionBar = function () {
      if (f.instructionBar) E.setActive(f.instructionBar, false);
      self.runner.stop('typing');
      self.typing = false;
      var s = src();
      if (s.isPlaying()) s.stop();
      E.setText(f.instructionText, '');
    };

    // ------------------------------------------------- drag demonstration ---
    /* The authored ghost-hand nodes are replaced by the shared Guide: the real
       Vector_10 dotted arrow between the item and the pan it belongs in, plus
       one preloaded hand that travels the same arc and taps. Both are anchored
       off live element bounds, so the same code is correct in every level. */
    function guideTarget() {
      if (f.ghostEndPoint && E.node(f.ghostEndPoint)) return f.ghostEndPoint;
      var d = itemComp();
      if (d && d.basketTarget && E.node(d.basketTarget)) return d.basketTarget;
      var g = gm();
      return g ? g.leftBasket() : null;
    }

    function itemComp() {
      var byField = f.leftItemSourceImage && get('DraggableItem', f.leftItemSourceImage);
      if (byField) return byField;
      var all = COMP['DraggableItem'] || {};
      var found = null;
      Object.keys(all).forEach(function (k) {
        var d = all[k];
        if (!d.isCube && String(d.gameManagerId) === String(f.gameManager)) found = d;
      });
      return found;
    }

    function guideSource() {
      if (f.ghostStartPoint && E.node(f.ghostStartPoint)) return f.ghostStartPoint;
      var d = itemComp();
      return d ? d.node : null;
    }

    function stopGhost() {
      self.runner.stop('ghostPath');
      Guide.hide();
      // the authored placeholders stay hidden; the Guide replaces them
      if (f.ghostHand) E.setActive(f.ghostHand, false);
      if (f.ghostItem) E.setActive(f.ghostItem, false);
    }

    function startGhostAnimation() {
      if (self.leftItemPlaced) return;
      var from = guideSource(), to = guideTarget();
      if (!from || !to) return;
      if (f.ghostHand) E.setActive(f.ghostHand, false);
      if (f.ghostItem) E.setActive(f.ghostItem, false);
      Guide.show({ fromId: from, toId: to, glowId: from });
    }

    /* Nothing schedules guidance on its own clock any more. Every hint in a
       level — the drag arrow, the +, Check, Next and Try Again hands — is
       offered by the single Idle watcher once the child has been still for its
       interval, and taken away the moment they act. That is the whole reason
       the hints used to feel like they were "on all the time". */

    // ------------------------------------------------------------- hints ----
    var hintTarget = {};       // hint key -> the button it was pointing at
    function killHint(key) {
      if (hintTarget[key]) { setGlow(hintTarget[key], false); delete hintTarget[key]; }
      if (self[key]) { E.destroy(self[key]); self[key] = null; }
    }
    function raiseHint(key, prefab, targetId) {
      if (self[key] || !prefab || !targetId) return;      // never two of the same
      self[key] = spawnHint(prefab, targetId);
      if (self[key]) hintTarget[key] = String(targetId);
    }
    self.killAllHints = function () {
      ['activePlusHint', 'activeMinusHint', 'activeCheckHint',
       'activeNextHint', 'activeTryAgainHint'].forEach(killHint);
    };

    /* the level has been switched away from */
    self.suspend = function () {
      stopCurrentInstruction();
      stopGhost();
      self.runner.stopAll();
    };

    self.onPlusClicked = function () {
      self.plusClicked = true;
      self.runner.stop('plusHint');
      killHint('activePlusHint');
      glowSampleBlock(false);        // the cue has been understood
    };

    function onMinusClicked() {
      killHint('activeMinusHint');
      self.runner.stop('minusHint');
    }
    self.onMinusClicked = onMinusClicked;

    /* The + hint is no longer put on a timer of its own; the Idle watcher will
       offer it if the child goes quiet. This just arms the idle clock so the
       first offer comes a full interval after the instruction finishes. */
    function showPlusHintAfterDelay() {
      if (!self.instruction3Completed) return;
      Idle.poke();
    }

    self.showMinusHint = function () {
      var tok = self.runner.fresh('minusHint');
      self.runner.run(function (t) {
        return E.wait(fld(f, 'minusHintDelay', 1.5), t).then(function () {
          raiseHint('activeMinusHint', f.minusHintHandPrefab, f.minusButtonTarget);
        });
      }, tok);
    };

    /* Same again: Check is offered by the Idle watcher, not on a 12 s timer. */
    self.startCheckHint = function () { Idle.poke(); };

    self.onCheckClicked = function () {
      self.runner.stop('checkHint');
      killHint('activeCheckHint');
      setCountersVisible(false);     // the answer is in; the counters are done
    };

    /* Every level draws its item twice: once in the Start Items display the
       level opens on, and once in the row the child actually plays with. The
       two copies are authored a few units apart — between 4 and 11 across the
       six levels — so the item visibly hopped sideways the moment the board
       swapped from one to the other. The intro copy is what the child has been
       looking at while the question was read, so the playable copy is landed
       exactly there and the swap becomes invisible.

       Matched on the sprite rather than the name, because only the artwork is
       reliably the same on both sides. */
    function introTwinOf(play) {
      var root = f.startitems && E.node(f.startitems);
      var want = play.image && play.image.sprite ? play.image.sprite.path : null;
      if (!root || !want) return null;
      var hit = null;
      (function walk(n) {
        (n.children || []).forEach(function (ch) {
          if (hit) return;
          if (ch.image && ch.image.sprite && ch.image.sprite.path === want) hit = ch;
          else walk(ch);
        });
      })(root);
      return hit;
    }

    function alignPlayItemToIntro() {
      var d = itemComp();
      var play = d && E.node(d.node);
      var intro = play && introTwinOf(play);
      if (!intro) return;
      var p = E.stagePos(intro.id);
      E.setStagePos(play.id, p[0], p[1]);
      d.rehome();                    // a released drag returns here now
    }

    // ------------------------------------------------------------- flow -----
    function tutorialFlow(tok) {
      return playInstructionAndWait(f.instruction1, f.instruction1Audio, tok)
        .then(function () { return E.wait(0.5, tok); })
        .then(function () {
          E.setActive(f.itemmain, true);
          alignPlayItemToIntro();          // before the intro copy goes away
          E.setActive(f.startitems, false);
          // "Place the toy boat on the balance" — start the idle clock from here
          Idle.poke();
          return playInstructionAndWait(f.instruction2, f.instruction2Audio, tok);
        });
    }

    /* Any touch of the item takes the demonstration away at once. It comes back
       only through the Idle watcher, a full interval after they stop. */
    self.onLeftItemTouched = function () {
      stopGhost();
      self.runner.stop('ghost');
      Idle.poke();
    };

    self.onLeftItemDragStarted = self.onLeftItemTouched;

    /* The two Group_485 counters — the one the item starts on and the one the
       sample block sits on — are part of the picture for the whole round. They
       used to be taken away the instant the item was dropped in a pan, so the
       table went bare while the child still had every block to add. They now go
       only when Check is pressed, and come back if Try Again resumes the round.

       The item's counter is a serialized field; the block's is not, so it is
       taken from the sample block's parent, the same way glowSampleBlock finds
       the sample itself. */
    function blockCounterId() {
      var s = sampleBlockId(), n = s && E.node(s);
      return n && n.parent ? n.parent.id : null;
    }
    /* The + and − are siblings of the block counter rather than children of it,
       so hiding the counter alone left them hovering over bare table. They are
       already disabled by the time Check is pressed, so they go with it. */
    function setCountersVisible(on) {
      [f.Base1, blockCounterId(), f.plusButtonTarget, f.minusButtonTarget]
        .forEach(function (id) {
          if (id && E.node(id)) E.setActive(id, !!on);
        });
    }

    self.onLeftItemPlaced = function () {
      if (self.leftItemPlaced) return;
      self.leftItemPlaced = true;
      stopGhost();
      self.runner.stop('ghost');
      var g = gm();
      if (g) g.setPlusMinusInteractableOnly(false);
      self.runner.run(playInstruction3ThenPlusHint);
    };

    function playInstruction3ThenPlusHint(tok) {
      self.instruction3Completed = false;
      self.plusClicked = false;
      var g = gm();
      if (g) g.setPlusMinusInteractableOnly(false);
      return playInstructionAndWait(f.instruction3, f.instruction3Audio, tok).then(function () {
        self.instruction3Completed = true;
        if (g) g.updatePlusMinusState();
        // "Tap the + button to add blocks" — light the block being counted
        glowSampleBlock(true);
        showPlusHintAfterDelay();
      });
    }

    self.onCorrectMatch = function () {
      E.setActive(f.instructionBar, true);
      self.runner.run(correctSequence);
    };

    /* what is on the balance, split so each group can pop on its own cue */
    function balanceContents() {
      var g = gm();
      if (!g) return { items: [], blocks: [] };
      var all = g.scaleState.leftItems.concat(g.scaleState.rightItems);
      var pick = function (k) {
        return all.filter(function (x) { return x.kind === k; })
                  .map(function (x) { return x.id; });
      };
      return { items: pick('item'), blocks: pick('cube') };
    }

    function correctSequence(tok) {
      return playInstructionAndWait(f.instruction4, f.instruction4Audio, tok)
        .then(function () { return E.wait(2, tok); })
        .then(function () {
          /* "The toy boat weighs the same as 4 blocks!" — the boat pops as the
             boat is named and the blocks pop as the blocks are, so nothing
             bounces before the child has heard why. */
          var c = balanceContents();
          self.runner.run(function (t) {
            return popWithNarration(f.instruction8, f.instruction8Audio,
                                    c.items, c.blocks, t);
          }, self.runner.fresh('equalPop'));
          return playInstructionAndWait(f.instruction8, f.instruction8Audio, tok);
        })
        .then(function () {
          if (f.isLastLevel) {
            return E.wait(1.5, tok).then(function () {
              E.setActive(f.nextButton, false);
              if (f.gameOverPanel) E.setActive(f.gameOverPanel, true);
              if (f.finalVO) { var s = src(); s.stop(); s.setClip(f.finalVO); s.play(); }
            });
          }
          E.setActive(f.nextButton, true);
          Idle.poke();       // Next is offered by the Idle watcher if they wait
        });
    }

    self.onLessCubes = function () {
      E.setActive(f.instructionBar, true);
      self.runner.run(function (tok) {
        return playInstructionAndWait(f.instruction5, f.instruction5Audio, tok).then(function () {
          E.setActive(f.tryAgainButton, true);
          startTryAgainHint();
        });
      });
    };

    self.onMoreCubes = function () {
      E.setActive(f.instructionBar, true);
      self.runner.run(function (tok) {
        return playInstructionAndWait(f.instruction6, f.instruction6Audio, tok).then(function () {
          E.setActive(f.tryAgainButton, true);
          startTryAgainHint();
        });
      });
    };

    /* Try Again is offered by the Idle watcher too. */
    function startTryAgainHint() { Idle.poke(); }

    self.playInstruction7 = function () {
      E.setActive(f.instructionBar, true);
      playInstruction(f.instruction7, f.instruction7Audio);
    };

    function onTryAgain() {
      self.runner.stop('tryAgainHint');
      killHint('activeTryAgainHint');
      stopCurrentInstruction();
      E.setActive(f.tryAgainButton, false);
      E.setActive(f.instructionBar, false);
      var g = gm();
      /* The original reads gameManager.lastResult *after* HandleTryAgain(), but
         the "too few" path calls ResetAllCubes() which sets it back to None —
         so the re-prompt below could never run and the child was left with a
         cleared basket, a blank instruction bar and no spoken prompt. The
         result is captured before the reset so the intended branch fires. */
      var resultBefore = g ? g.lastResult : 'None';
      // the round is live again, so the board goes back to how it plays
      setCountersVisible(true);
      if (g) g.handleTryAgain();
      if (g && resultBefore === 'Less') {
        self.plusClicked = false;
        self.instruction3Completed = true;
        E.setActive(f.instructionBar, true);   // OnTryAgain just hid it
        playInstruction(f.instruction3, f.instruction3Audio);
        g.enablePlusMinus();
        showPlusHintAfterDelay();
      }
    }

    register(hostId, 'WeightGameTutorialController', function start() {
      E.setActive(f.startitems, true);
      E.setActive(f.itemmain, false);
      setCountersVisible(true);
      if (f.gameOverPanel) E.setActive(f.gameOverPanel, false);
      E.setActive(f.instructionBar, true);
      E.setActive(f.tryAgainButton, false);
      E.addClickListener(f.tryAgainButton, onTryAgain);
      self.plusClicked = false;
      self.instruction3Completed = false;
      self.leftItemPlaced = false;
      // a level always starts with no guidance left over from the previous one
      Guide.hide();
      clearGlows();
      self.killAllHints();
      Idle.register(offerIdleHint, withdrawIdleHint);
      self.runner.run(tutorialFlow, self.runner.fresh('tutorial'));
    });

    /* Everything offerIdleHint can put on screen, taken back together. */
    function withdrawIdleHint() {
      Guide.hide();
      self.killAllHints();
      glowSampleBlock(false);
    }

    /* The block / ball / marble sample beside the +/- buttons. Its blue glow is
       a cue, not decoration: it pulses only while the child is being asked to
       add blocks, and goes out as soon as they do. */
    function sampleBlockId() {
      var all = COMP['DraggableItem'] || {}, found = null;
      Object.keys(all).forEach(function (k) {
        var d = all[k];
        if (d.isCube && String(d.gameManagerId) === String(f.gameManager)) found = d.node;
      });
      return found;
    }
    function glowSampleBlock(on) { setGlow(sampleBlockId(), !!on); }

    /* What does the child need to do right now? Re-offer that, and only that.
       Called by the Idle watcher after a stretch of no input. */
    function offerIdleHint() {
      if (!E.activeInHierarchy(self.node)) return false;
      // never talk over the instruction that is still being spoken
      if (self.typing || src().isPlaying()) return false;
      var g = gm();

      // a button is sitting there waiting to be pressed — point at it
      var waiting = [[f.tryAgainButton, 'activeTryAgainHint'],
                     [f.nextButton, 'activeNextHint']];
      for (var i = 0; i < waiting.length; i++) {
        var b = waiting[i][0];
        if (b && E.node(b) && E.activeInHierarchy(b)) {
          raiseHint(waiting[i][1], f.buttonHintHandPrefab, b);
          return true;
        }
      }

      // the item is still on its plinth: re-run the drag demonstration
      if (!self.leftItemPlaced) { startGhostAnimation(); return true; }

      if (!g || g.scaleState.interactionLocked) return false;

      // blocks are down and Check is live — nudge Check
      if (g.cubeIndex > 0 && f.checkButtonTarget && E.node(f.checkButtonTarget) &&
          E.activeInHierarchy(f.checkButtonTarget)) {
        raiseHint('activeCheckHint', f.checkHintHandPrefab, f.checkButtonTarget);
        return true;
      }

      // nothing on the balance yet — nudge the + button and light the block
      if (g.cubeIndex === 0 && f.plusButtonTarget && E.isInteractable(f.plusButtonTarget)) {
        raiseHint('activePlusHint', f.plusHintHandPrefab, f.plusButtonTarget);
        glowSampleBlock(true);
        return true;
      }
      return false;
    }

    put('WeightGameTutorialController', hostId, self);
    return self;
  }

  return {
    /* Called before every scene load. Everything that could outlive a level —
       the guidance layer, glows, celebration particles — is torn down here, so
       no animation loop, timer or listener survives the transition. */
    reset: function () {
      Guide.destroy();
      clearGlows();
      Idle.reset();
      E.confettiClear();
      rowCache = {};
      COMP = {};
      pending = [];
    },
    tickControllers: tickControllers,
    get: get,
    all: function (name) { return COMP[name] || {}; },
    // reusable placement API, also used by the god-mode tools
    placeItemInPan: placeItemInPan,
    removeItemFromPan: removeItemFromPan,
    returnItemToOrigin: returnItemToOrigin,
    updateScaleFromPanContents: updateScaleFromPanContents,
    setGlow: setGlow,
    Guide: Guide,
    ButtonAnimator: ButtonAnimator,
    TutorialManager: TutorialManager,
    DraggableItem: DraggableItem,
    BasketDropZone: BasketDropZone,
    WeightMeasuringGame: WeightMeasuringGame,
    WeightGameTutorialController: WeightGameTutorialController
  };
})();
