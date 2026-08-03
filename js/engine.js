/* ============================================================================
 *  engine.js — minimal uGUI-compatible runtime
 *  Reproduces the subset of Unity behaviour this game uses:
 *  RectTransform layout, CanvasScaler, Image, TextMeshPro, Button, CanvasGroup,
 *  Animator (curve playback), AudioSource, coroutines and DOTween-style tweens.
 * ========================================================================== */
var Engine = (function () {
  'use strict';

  var stage = null;
  var scalerCfg = { mode: 1, ref: [1920, 1080], matchMode: 0, match: 0.5 };
  var scaleFactor = 1;
  var canvasSize = [1920, 1080];   // Unity: screenSize / scaleFactor
  var nodes = {};          // id -> Node
  var tickers = [];        // per-frame callbacks
  var lastTime = 0;

  // ---------------------------------------------------------------- easing --
  var Ease = {
    Linear:    function (t) { return t; },
    InQuad:    function (t) { return t * t; },
    OutQuad:   function (t) { return t * (2 - t); },
    InOutQuad: function (t) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; },
    InSine:    function (t) { return 1 - Math.cos(t * Math.PI / 2); },
    OutSine:   function (t) { return Math.sin(t * Math.PI / 2); },
    InOutSine: function (t) { return -(Math.cos(Math.PI * t) - 1) / 2; },
    InCubic:   function (t) { return t * t * t; },
    OutCubic:  function (t) { return 1 - Math.pow(1 - t, 3); },
    OutBack:   function (t) {
      var c1 = 1.70158, c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    },
    OutElastic: function (t) {
      var c4 = (2 * Math.PI) / 3;
      return t === 0 ? 0 : t === 1 ? 1
        : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
    },
    // Unity AnimationCurve with zero tangents at both ends
    Smooth:    function (t) { return t * t * (3 - 2 * t); }
  };

  // ------------------------------------------------------- colour helpers --
  function rgba(c) {
    return 'rgba(' + Math.round(c[0] * 255) + ',' + Math.round(c[1] * 255) + ',' +
      Math.round(c[2] * 255) + ',' + c[3] + ')';
  }

  // ============================================================== Node ====
  function Node(data, parent) {
    this.id = data.id;
    this.name = data.name;
    this.data = data;
    this.parent = parent || null;
    this.children = [];

    // live RectTransform state (mutable, like Unity)
    this.anchoredPos = (data.anchoredPos || data.localPos || [0, 0]).slice();
    this.sizeDelta = (data.sizeDelta || [0, 0]).slice();
    this.anchorMin = (data.anchorMin || [0.5, 0.5]).slice();
    this.anchorMax = (data.anchorMax || [0.5, 0.5]).slice();
    this.pivot = (data.pivot || [0.5, 0.5]).slice();
    this.scale = (data.scale || [1, 1]).slice();
    this.rotZ = data.rotZ || 0;
    this.active = !!data.active;
    this.isRect = data.rect !== false;

    var el = document.createElement('div');
    el.className = 'un';
    el.dataset.id = this.id;
    el.dataset.name = this.name;
    this.el = el;

    var c = data.components || {};

    // ---- Image -------------------------------------------------------
    if (c.image) {
      this.image = {
        sprite: c.image.sprite,
        color: c.image.color.slice(),
        raycast: !!c.image.raycast,
        preserveAspect: !!c.image.preserveAspect,
        enabled: !!c.image.enabled,
        pad: (c.image.raycastPadding || [0, 0, 0, 0]).slice()
      };
      el.classList.add('img');
      /* The sprite is drawn on a dedicated layer, NOT on `el` itself.
         Unity's Image.color.a tints only that one Graphic; CSS opacity on the
         node element would cascade into every child. Both balance drop zones
         and the tutorial hint-hand containers are authored at alpha 0, so the
         old `el.style.opacity` made the dropped item, the spawned cubes and
         Vector_10.png render at effective opacity 0 - they looked deleted.
         `el.style.opacity` is now reserved for CanvasGroup, which really does
         cascade in Unity. The layer is the first child, so the parent Graphic
         paints below its children exactly as Unity draws it. */
      var bg = document.createElement('div');
      bg.className = 'un-bg';
      el.appendChild(bg);
      this.bgEl = bg;
      // Unity Image.raycastPadding shrinks the hit rect (left, bottom, right, top).
      // Reproduced with an inset child that is the real pointer target; events
      // still bubble to this element, so listeners stay where they are.
      var p = this.image.pad;
      if (p[0] || p[1] || p[2] || p[3]) {
        var hit = document.createElement('div');
        hit.className = 'hit';
        hit.style.left = p[0] + 'px';
        hit.style.top = p[3] + 'px';
        hit.style.right = p[2] + 'px';
        hit.style.bottom = p[1] + 'px';
        el.appendChild(hit);
        this.hitEl = hit;
      }
    }

    // ---- TextMeshPro -------------------------------------------------
    if (c.tmp) {
      var t = c.tmp;
      this.tmp = {
        text: t.text, fontSize: t.fontSize, color: t.color.slice(),
        alignH: t.alignH, alignV: t.alignV, wrap: !!t.wrap,
        charSpacing: t.charSpacing, lineSpacing: t.lineSpacing,
        margin: t.margin.slice(), enabled: !!t.enabled, raycast: !!t.raycast,
        autoSize: !!t.autoSize, sizeMin: t.fontSizeMin, sizeMax: t.fontSizeMax
      };
      var area = document.createElement('div');
      area.className = 'tmp-inner';
      var span = document.createElement('span');
      span.className = 'tmp-text';
      area.appendChild(span);
      el.appendChild(area);
      this.textArea = area;
      this.textEl = span;
      el.classList.add('tmp');
    }

    // ---- Button ------------------------------------------------------
    if (c.button) {
      this.button = {
        interactable: !!c.button.interactable,
        target: c.button.target,
        onClick: c.button.onClick || [],
        listeners: []
      };
    }

    // ---- CanvasGroup -------------------------------------------------
    if (c.canvasGroup) {
      this.canvasGroup = {
        alpha: c.canvasGroup.alpha,
        interactable: !!c.canvasGroup.interactable,
        blocksRaycasts: !!c.canvasGroup.blocksRaycasts
      };
    }

    // ---- Animator ----------------------------------------------------
    if (c.animator) this.animatorCfg = c.animator;

    // ---- AudioSource -------------------------------------------------
    if (c.audioSource) this.audioCfg = c.audioSource;

    // ---- ParticleSystem ----------------------------------------------
    if (c.particle) this.particle = true;

    nodes[this.id] = this;
  }

  Node.prototype.parentSize = function () {
    if (!this.parent) return canvasSize.slice();
    return this.parent.size();
  };

  // Unity: size = (anchorMax - anchorMin) * parentSize + sizeDelta
  Node.prototype.size = function () {
    var P = this.parentSize();
    return [
      Math.max(0, (this.anchorMax[0] - this.anchorMin[0]) * P[0] + this.sizeDelta[0]),
      Math.max(0, (this.anchorMax[1] - this.anchorMin[1]) * P[1] + this.sizeDelta[1])
    ];
  };

  // bottom-left of the rect, in parent space (Unity y-up)
  Node.prototype.rectMin = function () {
    var P = this.parentSize(), s = this.size(), out = [0, 0];
    for (var a = 0; a < 2; a++) {
      var ar = this.anchorMin[a] * P[a] +
               this.pivot[a] * (this.anchorMax[a] - this.anchorMin[a]) * P[a];
      out[a] = ar + this.anchoredPos[a] - this.pivot[a] * s[a];
    }
    return out;
  };

  Node.prototype.applyLayout = function () {
    // The root node IS the #stage element; its size, centring and scale are
    // owned by computeScale(). Writing layout here wiped the letterbox
    // transform, which made the whole board render unscaled at 1:1 and spill
    // off the window on any non-16:9 screen.
    if (this.isStage) return;
    if (!this.isRect) {
      // plain Transform (ParticleSystem roots): localPosition is measured from
      // the parent's pivot. No rect, and the transform scale is a world-space
      // particle scale we deliberately do not apply to the DOM box.
      var PP = this.parentSize();
      var ppv = this.parent ? this.parent.pivot : [0.5, 0.5];
      this.el.style.left = (ppv[0] * PP[0] + this.anchoredPos[0]) + 'px';
      this.el.style.top = ((1 - ppv[1]) * PP[1] - this.anchoredPos[1]) + 'px';
      this.el.style.width = '0px';
      this.el.style.height = '0px';
      this.el.style.transformOrigin = '50% 50%';
      this.el.style.transform = this.rotZ ? 'rotate(' + (-this.rotZ) + 'deg)' : '';
      return;
    }
    var P = this.parentSize(), s = this.size(), mn = this.rectMin();
    var st = this.el.style;
    st.left = mn[0] + 'px';
    st.top = (P[1] - (mn[1] + s[1])) + 'px';
    st.width = s[0] + 'px';
    st.height = s[1] + 'px';
    st.transformOrigin = (this.pivot[0] * 100) + '% ' + ((1 - this.pivot[1]) * 100) + '%';
    var tr = '';
    if (this.rotZ) tr += 'rotate(' + (-this.rotZ) + 'deg) ';
    if (this.scale[0] !== 1 || this.scale[1] !== 1)
      tr += 'scale(' + this.scale[0] + ',' + this.scale[1] + ')';
    st.transform = tr;
  };

  Node.prototype.applyImage = function () {
    if (!this.image || !this.bgEl) return;
    var st = this.bgEl.style, im = this.image;
    if (!im.enabled || !im.sprite || !im.sprite.path) {
      st.backgroundImage = 'none';
    } else {
      st.backgroundImage = 'url("' + im.sprite.path + '")';
      st.backgroundSize = im.preserveAspect ? 'contain' : '100% 100%';
      st.backgroundPosition = 'center';
      st.backgroundRepeat = 'no-repeat';
      guardSprite(this.bgEl, im.sprite.path);
    }
    // alpha stays on the sprite layer so it can never hide child objects
    st.opacity = (im.color[3] === 1) ? '' : String(im.color[3]);
  };

  /* Asset guard: one console warning per missing sprite, and a dashed box in
     place of the artwork so a broken path is obvious instead of silently
     blank. Loaded sprites cost nothing after the first check. */
  var spriteState = {};      // path -> 'ok' | 'missing'
  var spriteWaiting = {};    // path -> [elements to mark if it fails]

  function guardSprite(el, path) {
    var s = spriteState[path];
    if (s === 'ok') return;
    if (s === 'missing') { el.classList.add('assetMissing-box'); return; }
    if (spriteWaiting[path]) { spriteWaiting[path].push(el); return; }
    spriteWaiting[path] = [el];
    var probe = new Image();
    probe.onload = function () {
      spriteState[path] = 'ok';
      delete spriteWaiting[path];
    };
    probe.onerror = function () {
      spriteState[path] = 'missing';
      console.warn('[assets] sprite failed to load, check the path and filename casing: ' + path);
      document.documentElement.classList.add('assetMissing');
      (spriteWaiting[path] || []).forEach(function (e) { e.classList.add('assetMissing-box'); });
      delete spriteWaiting[path];
    };
    probe.src = path;
  }
  function spriteStatus(path) { return spriteState[path] || 'pending'; }

  /* Preload a list of sprites and resolve with the ones that failed. Used by
     the guidance layer so it can fall back before anything is shown. */
  function preloadSprites(paths) {
    return Promise.all((paths || []).map(function (p) {
      return new Promise(function (res) {
        if (spriteState[p]) { res({ path: p, ok: spriteState[p] === 'ok' }); return; }
        var im = new Image();
        im.onload = function () { spriteState[p] = 'ok'; res({ path: p, ok: true }); };
        im.onerror = function () {
          spriteState[p] = 'missing';
          console.warn('[assets] sprite failed to load: ' + p);
          res({ path: p, ok: false });
        };
        im.src = p;
      });
    })).then(function (r) { return r.filter(function (x) { return !x.ok; }).map(function (x) { return x.path; }); });
  }

  Node.prototype.applyText = function () {
    if (!this.tmp) return;
    var t = this.tmp, st = this.el.style, ar = this.textArea.style, is = this.textEl.style;
    st.color = rgba(t.color);
    is.fontFamily = '"' + (window.FONT.family) + '", sans-serif';
    is.fontSize = t.fontSize + 'px';
    is.lineHeight = (t.fontSize * (window.FONT.lineHeight / window.FONT.pointSize) +
                     (t.lineSpacing || 0) * t.fontSize / 100) + 'px';
    is.letterSpacing = ((t.charSpacing || 0) * t.fontSize / 100) + 'px';
    is.whiteSpace = t.wrap ? 'pre-wrap' : 'pre';

    /* TMP m_margin is (left, top, right, bottom) and insets the text area.
       Values here are often NEGATIVE, which expands the area well beyond the
       RectTransform - so it must resize the box, not become CSS padding
       (browsers discard negative padding and the text would wrap early). */
    var m = t.margin;
    function ext(a, b) {
      var d = -(a + b);
      return d >= 0 ? 'calc(100% + ' + d + 'px)' : 'calc(100% - ' + (-d) + 'px)';
    }
    ar.left = m[0] + 'px';
    ar.top = m[1] + 'px';
    ar.width = ext(m[0], m[2]);
    ar.height = ext(m[1], m[3]);

    // TMP horizontal: 1 Left, 2 Center, 4 Right, 8 Justified
    ar.justifyContent = t.alignH === 2 ? 'center' : t.alignH === 4 ? 'flex-end' : 'flex-start';
    is.textAlign = t.alignH === 2 ? 'center' : t.alignH === 4 ? 'right' : 'left';
    // TMP vertical: 256 Top, 512 Middle, 1024 Bottom
    ar.alignItems = t.alignV === 256 ? 'flex-start' : t.alignV === 1024 ? 'flex-end' : 'center';

    this.textEl.textContent = t.enabled ? t.text : '';
  };

  Node.prototype.applyActive = function () {
    this.el.style.display = this.active ? '' : 'none';
  };

  Node.prototype.applyPointer = function () {
    var pe = true;
    if (this.image && !this.image.raycast) pe = false;
    if (this.tmp && !this.tmp.raycast) pe = false;
    if (!this.image && !this.tmp && !this.button) pe = false;
    if (this.button) pe = true;
    if (this.canvasGroup && !this.canvasGroup.blocksRaycasts) pe = false;
    if (this.hitEl) {
      this.el.style.pointerEvents = 'none';
      this.hitEl.style.pointerEvents = pe ? 'auto' : 'none';
    } else {
      this.el.style.pointerEvents = pe ? 'auto' : 'none';
    }
    if (this.canvasGroup) {
      this.el.style.opacity = String(this.canvasGroup.alpha);
      if (!this.canvasGroup.interactable) {
        this.el.style.pointerEvents = 'none';
        if (this.hitEl) this.hitEl.style.pointerEvents = 'none';
      }
    }
  };

  Node.prototype.refresh = function () {
    this.applyLayout(); this.applyImage(); this.applyText();
    this.applyActive(); this.applyPointer();
  };

  // relayout this node and everything under it (sizes cascade)
  Node.prototype.refreshTree = function () {
    this.applyLayout();
    for (var i = 0; i < this.children.length; i++) this.children[i].refreshTree();
  };

  // screen-space rect of this node's pivot point (like Transform.position)
  Node.prototype.screenRect = function () {
    return this.el.getBoundingClientRect();
  };

  /* Offset of this node's pivot from its parent's pivot, in the parent's
     local frame (Unity y-up). */
  Node.prototype.localOffset = function () {
    var s = this.size(), mn = this.rectMin();
    var P = this.parentSize();
    var ppv = this.parent ? this.parent.pivot : [0.5, 0.5];
    if (!this.isRect) return [this.anchoredPos[0], this.anchoredPos[1]];
    return [mn[0] + this.pivot[0] * s[0] - ppv[0] * P[0],
            mn[1] + this.pivot[1] * s[1] - ppv[1] * P[1]];
  };

  /* Pivot position in stage coordinates: origin top-left of the 1920x1080
     reference stage, x right, y DOWN. Equivalent to Unity's Transform.position
     for a ScreenSpaceOverlay canvas (up to the uniform canvas scale). */
  Node.prototype.stagePos = function () {
    var off = this.localOffset();
    var x = off[0], y = off[1];
    var p = this.parent;
    while (p) {
      // apply the parent's local rotation + scale to the accumulated offset
      var sx = p.scale[0], sy = p.scale[1];
      x *= sx; y *= sy;
      if (p.rotZ) {
        var r = p.rotZ * Math.PI / 180, cs = Math.cos(r), sn = Math.sin(r);
        var nx = x * cs - y * sn, ny = x * sn + y * cs;
        x = nx; y = ny;
      }
      if (!p.parent) break;               // p is the stage root
      var po = p.localOffset();
      x += po[0]; y += po[1];
      p = p.parent;
    }
    return [canvasSize[0] / 2 + x, canvasSize[1] / 2 - y];
  };

  /* Move this node so its pivot lands on the given stage point.
     Mirrors `transform.position = ...` for our canvas. */
  Node.prototype.setStagePos = function (sx, sy) {
    var cur = this.stagePos();
    var dx = sx - cur[0], dy = sy - cur[1];
    // convert the stage-space delta into this node's parent local frame
    var k = 1, r = 0, p = this.parent;
    while (p) { k *= p.scale[0]; r += p.rotZ; if (!p.parent) break; p = p.parent; }
    if (!k) k = 1;
    var lx = dx / k, ly = -dy / k;
    if (r) {
      var a = -r * Math.PI / 180, cs = Math.cos(a), sn = Math.sin(a);
      var nx = lx * cs - ly * sn, ny = lx * sn + ly * cs;
      lx = nx; ly = ny;
    }
    this.anchoredPos[0] += lx;
    this.anchoredPos[1] += ly;
    this.refreshTree();
  };

  // ======================================================= build / boot ====
  function build(data, parentNode, container) {
    var n = new Node(data, parentNode);
    container.appendChild(n.el);
    if (parentNode) parentNode.children.push(n);
    var kids = data.children || [];
    for (var i = 0; i < kids.length; i++) build(kids[i], n, n.el);
    return n;
  }

  /* The usable box, in CSS pixels.
     visualViewport is the honest number on phones — window.innerHeight lies
     while the URL bar is collapsing, which made the board jump mid-scroll. The
     safe-area insets are subtracted so a notch or a rounded corner never eats
     part of the balance. */
  function viewportBox() {
    var vv = window.visualViewport;
    var w = vv ? vv.width : window.innerWidth;
    var h = vv ? vv.height : window.innerHeight;
    var cs = getComputedStyle(document.getElementById('game') || document.body);
    var pad = function (v) { return parseFloat(cs.getPropertyValue(v)) || 0; };
    w -= pad('padding-left') + pad('padding-right');
    h -= pad('padding-top') + pad('padding-bottom');
    return [Math.max(1, w), Math.max(1, h)];
  }

  function computeScale() {
    var vp = viewportBox();
    var sw = vp[0] / scalerCfg.ref[0];
    var sh = vp[1] / scalerCfg.ref[1];
    var s;

    /* Fit mode (default).
       The project's CanvasScaler uses MatchWidthOrHeight with match 0.5, which
       makes the canvas rect narrower than the 1920-wide authored layout on any
       screen that is not 16:9. The board is built at 1920x1080 with items
       anchored +/-634 from centre, so on a 4:3 window the canvas comes out
       1663 wide and the left item's edge lands at x = -75 - off screen. That is
       Unity's real behaviour, but it silently clips the game.
       Fitting the whole reference canvas and letterboxing guarantees nothing is
       ever cut off at any aspect ratio. Set window.GAME_FIT = 'unity' before
       load to get the original match-0.5 behaviour instead. */
    var mode = (typeof window !== 'undefined' && window.GAME_FIT) || 'fit';

    if (mode === 'fit') {
      s = Math.min(sw, sh);
      scaleFactor = s;
      canvasSize = [scalerCfg.ref[0], scalerCfg.ref[1]];
      if (stage) {
        stage.style.width = canvasSize[0] + 'px';
        stage.style.height = canvasSize[1] + 'px';
        stage.style.transform = 'translate(-50%,-50%) scale(' + s + ')';
        var rf = nodes[stage.dataset.id];
        if (rf) rf.refreshTree();
      }
      return;
    }

    if (scalerCfg.mode !== 1) {           // ConstantPixelSize / Physical
      s = 1;
    } else if (scalerCfg.matchMode === 0) { // MatchWidthOrHeight (log-space lerp)
      var m = scalerCfg.match;
      s = Math.exp(Math.log(sw) * (1 - m) + Math.log(sh) * m);
    } else if (scalerCfg.matchMode === 1) { // Expand
      s = Math.min(sw, sh);
    } else {                                // Shrink
      s = Math.max(sw, sh);
    }
    scaleFactor = s;
    canvasSize = [vp[0] / s, vp[1] / s];
    if (stage) {
      stage.style.width = canvasSize[0] + 'px';
      stage.style.height = canvasSize[1] + 'px';
      stage.style.transform = 'translate(-50%,-50%) scale(' + s + ')';
      var r = nodes[stage.dataset.id];
      if (r) r.refreshTree();
    }
  }

  /* Scene teardown. Without this, Animator tickers and tweens from the previous
     scene keep running; their curve paths then resolve into the NEW scene's
     nodes (fileIDs repeat across scenes), drifting the balance and firing
     m_IsActive curves that deactivate live objects. */
  function resetRuntime() {
    Object.keys(animators).forEach(function (k) {
      try { animators[k].stop(); } catch (e) {}
      delete animators[k];
    });
    tickers.length = 0;
    cloneSeq = 0;
    lastTime = 0;
    confettiClear();
    clearOverlay();
  }

  function boot(sceneData, mount) {
    resetRuntime();
    nodes = {};
    scalerCfg = sceneData.scaler || scalerCfg;
    mount.innerHTML = '';
    stage = document.createElement('div');
    stage.id = 'stage';
    mount.appendChild(stage);

    // the Canvas node itself becomes the stage: render its children directly
    var root = sceneData.tree;
    var rootNode = new Node({
      id: root.id, name: root.name, active: 1, rect: true,
      anchoredPos: [0, 0], sizeDelta: [0, 0],
      anchorMin: [0, 0], anchorMax: [1, 1], pivot: [0.5, 0.5],
      scale: [1, 1], rotZ: 0, components: {}, children: []
    }, null);
    rootNode.el = stage;
    rootNode.isStage = true;
    nodes[root.id] = rootNode;
    stage.dataset.id = root.id;

    var kids = root.children || [];
    for (var i = 0; i < kids.length; i++) build(kids[i], rootNode, stage);

    // extra (non-canvas) roots — audio holders etc, no visual
    (sceneData.extra || []).forEach(function (e) {
      var holder = new Node(e, null);
      holder.el.style.display = 'none';
      stage.appendChild(holder.el);
    });

    Object.keys(nodes).forEach(function (k) { if (nodes[k] !== rootNode) nodes[k].refresh(); });
    computeScale();
    wireButtons();
    return rootNode;
  }

  // ================================================================ API ====
  function node(id) { return nodes[String(id)] || null; }

  function setActive(id, on) {
    var n = node(id); if (!n) return;
    n.active = !!on;
    n.applyActive();
    if (on) {
      n.refreshTree();
      fireActivated(n);
    }
  }
  function activeSelf(id) { var n = node(id); return n ? n.active : false; }

  function activeInHierarchy(id) {
    var n = node(id);
    while (n) { if (!n.active) return false; n = n.parent; }
    return true;
  }

  var activatedHandlers = [];
  function onActivated(fn) { activatedHandlers.push(fn); }
  function resetActivatedHandlers() { activatedHandlers.length = 0; }
  function fireActivated(n) {
    activatedHandlers.forEach(function (f) { try { f(n); } catch (e) { console.error(e); } });
  }

  function setSprite(id, sprite) {
    var n = node(id); if (!n || !n.image) return;
    n.image.sprite = sprite;
    n.image.enabled = true;
    n.applyImage();
  }
  function setNativeSize(id) {
    var n = node(id);
    if (!n || !n.image || !n.image.sprite || !n.image.sprite.w) return;
    n.sizeDelta = [n.image.sprite.w, n.image.sprite.h];
    n.refreshTree();
  }

  function setText(id, str) {
    var n = node(id); if (!n || !n.tmp) return;
    n.tmp.text = str;
    n.textEl.textContent = str;
  }
  function getText(id) { var n = node(id); return n && n.tmp ? n.tmp.text : ''; }

  function setAnchoredPos(id, x, y) {
    var n = node(id); if (!n) return;
    if (x !== null && x !== undefined) n.anchoredPos[0] = x;
    if (y !== null && y !== undefined) n.anchoredPos[1] = y;
    n.refreshTree();
  }
  function getAnchoredPos(id) { var n = node(id); return n ? n.anchoredPos.slice() : [0, 0]; }

  function setSizeDelta(id, x, y) {
    var n = node(id); if (!n) return;
    if (x !== null && x !== undefined) n.sizeDelta[0] = x;
    if (y !== null && y !== undefined) n.sizeDelta[1] = y;
    n.refreshTree();
  }

  function setScale(id, sx, sy) {
    var n = node(id); if (!n) return;
    n.scale[0] = sx; n.scale[1] = (sy === undefined ? sx : sy);
    n.applyLayout();
  }
  function getScale(id) { var n = node(id); return n ? n.scale.slice() : [1, 1]; }

  function setRotZ(id, deg) {
    var n = node(id); if (!n) return;
    n.rotZ = deg; n.applyLayout();
  }

  function setInteractable(id, on) {
    var n = node(id); if (!n || !n.button) return;
    n.button.interactable = !!on;
    n.el.classList.toggle('nointeract', !on);
  }
  function isInteractable(id) { var n = node(id); return !!(n && n.button && n.button.interactable); }

  /* Unity greys a non-interactable Button through the ColorTint transition,
     which this port does not implement, so callers dim buttons through their
     CanvasGroup instead. Most buttons in the scenes carry one; the tutorial's
     `+` does not, and the call used to be a silent no-op that left a dead
     button looking live. One is made on demand — alpha 1 and fully raycasting,
     so a node that gets one behaves exactly as it did until something sets an
     alpha on it. */
  function setCanvasGroupAlpha(id, a) {
    var n = node(id); if (!n) return;
    if (!n.canvasGroup) n.canvasGroup = { alpha: 1, interactable: true, blocksRaycasts: true };
    n.canvasGroup.alpha = a; n.el.style.opacity = String(a);
  }
  function setBlocksRaycasts(id, on) {
    var n = node(id); if (!n || !n.canvasGroup) return;
    n.canvasGroup.blocksRaycasts = !!on;
    n.applyPointer();
  }

  // ---- reparent / sibling order (Unity SetParent / SetAsLastSibling) ----
  function setParent(id, parentId, worldStays) {
    var n = node(id), p = node(parentId);
    if (!n || !p) return;
    var keep = (worldStays === undefined) ? true : !!worldStays;
    var before = keep ? n.stagePos() : null;
    if (n.parent) {
      var i = n.parent.children.indexOf(n);
      if (i >= 0) n.parent.children.splice(i, 1);
    }
    n.parent = p;
    p.children.push(n);
    p.el.appendChild(n.el);
    n.refreshTree();
    if (before) n.setStagePos(before[0], before[1]);
  }
  function setAsLastSibling(id) {
    var n = node(id); if (!n || !n.parent) return;
    n.parent.el.appendChild(n.el);
    var i = n.parent.children.indexOf(n);
    if (i >= 0) { n.parent.children.splice(i, 1); n.parent.children.push(n); }
  }
  function setAsFirstSibling(id) {
    var n = node(id); if (!n || !n.parent) return;
    n.parent.el.insertBefore(n.el, n.parent.el.firstChild);
    var i = n.parent.children.indexOf(n);
    if (i >= 0) { n.parent.children.splice(i, 1); n.parent.children.unshift(n); }
  }

  // ------------------------------------------------------------ clicking --
  function addClickListener(id, fn) {
    var n = node(id); if (!n || !n.button) return;
    n.button.listeners.push(fn);
  }
  function removeAllClickListeners(id) {
    var n = node(id); if (!n || !n.button) return;
    n.button.listeners.length = 0;
  }

  function wireButtons() {
    Object.keys(nodes).forEach(function (k) { wireButton(nodes[k]); });
  }

  function wireButtonsFor(root) {
    var stack = [root];
    while (stack.length) {
      var n = stack.pop();
      wireButton(n);
      for (var i = 0; i < n.children.length; i++) stack.push(n.children[i]);
    }
  }

  function wireButton(n) {
    (function () {
      if (!n.button || n._wired) return;
      n._wired = true;
      n.el.classList.add('btn');
      if (!n.button.interactable) n.el.classList.add('nointeract');
      n.el.addEventListener('pointerdown', function (e) {
        if (!n.button.interactable) return;
        n.el.classList.add('pressed');
      });
      n.el.addEventListener('pointerup', function () { n.el.classList.remove('pressed'); });
      n.el.addEventListener('pointerleave', function () { n.el.classList.remove('pressed'); });
      n.el.addEventListener('click', function (e) {
        if (!n.button.interactable || !activeInHierarchy(n.id)) return;
        e.stopPropagation();
        // Unity persistent (inspector-wired) calls run first
        n.button.onClick.forEach(function (c) {
          if (c.state === 0) return;              // Off
          runPersistentCall(c);
        });
        n.button.listeners.slice().forEach(function (f) {
          try { f(); } catch (err) { console.error(err); }
        });
      });
    })();
  }

  function runPersistentCall(c) {
    if (c.method === 'SetActive' && c.type === 'UnityEngine.GameObject') {
      setActive(c.target, !!c.bool);
    } else if (c.method === 'Play' && c.type === 'UnityEngine.AudioSource') {
      Audio2.sourcePlay(c.target);
    } else if (c.method === 'Stop' && c.type === 'UnityEngine.AudioSource') {
      Audio2.sourceStop(c.target);
    }
  }

  // ============================================== coroutines and tweens ====
  function TaskGroup() { this.dead = false; this.tweens = []; }
  TaskGroup.prototype.kill = function () {
    this.dead = true;
    this.tweens.forEach(function (t) { t.dead = true; });
    this.tweens.length = 0;
  };
  TaskGroup.prototype.check = function () { if (this.dead) throw CANCEL; };

  var CANCEL = { cancelled: true };

  function isCancel(e) { return e === CANCEL; }

  function wait(sec, tok) {
    return new Promise(function (res, rej) {
      var t = 0;
      var f = function (dt) {
        if (tok && tok.dead) { remove(f); rej(CANCEL); return; }
        t += dt;
        if (t >= sec) { remove(f); res(); }
      };
      add(f);
    });
  }

  function waitUntil(pred, tok) {
    return new Promise(function (res, rej) {
      var f = function () {
        if (tok && tok.dead) { remove(f); rej(CANCEL); return; }
        if (pred()) { remove(f); res(); }
      };
      add(f);
    });
  }

  function tween(dur, easeFn, apply, tok) {
    if (typeof easeFn === 'string') easeFn = Ease[easeFn] || Ease.Linear;
    return new Promise(function (res, rej) {
      if (dur <= 0) { apply(1); res(); return; }
      var t = 0;
      var f = function (dt) {
        if (tok && tok.dead) { remove(f); rej(CANCEL); return; }
        t += dt;
        var u = Math.min(1, t / dur);
        apply(easeFn(u));
        if (u >= 1) { remove(f); res(); }
      };
      add(f);
    });
  }

  /* DOScale(...).SetLoops(-1, Yoyo).SetEase(...) */
  function loopScale(id, from, to, dur, easeFn) {
    if (typeof easeFn === 'string') easeFn = Ease[easeFn] || Ease.InOutSine;
    var handle = { dead: false };
    var t = 0, dir = 1;
    var f = function (dt) {
      if (handle.dead) { remove(f); return; }
      t += dt * dir;
      if (t >= dur) { t = dur; dir = -1; }
      else if (t <= 0) { t = 0; dir = 1; }
      var u = easeFn(t / dur);
      var s = from + (to - from) * u;
      setScale(id, s);
    };
    add(f);
    handle.kill = function () { handle.dead = true; remove(f); };
    return handle;
  }

  function add(f) { tickers.push(f); }
  function remove(f) { var i = tickers.indexOf(f); if (i >= 0) tickers.splice(i, 1); }

  function frame(now) {
    if (!lastTime) lastTime = now;
    var dt = Math.min(0.1, (now - lastTime) / 1000);
    lastTime = now;
    var list = tickers.slice();
    for (var i = 0; i < list.length; i++) {
      try { list[i](dt); } catch (e) { if (!isCancel(e)) console.error(e); }
    }
    requestAnimationFrame(frame);
  }

  // ============================================================== audio ====
  var Audio2 = (function () {
    var cache = {};
    var durations = {};
    var sources = {};   // nodeId -> {clip, el}

    function get(src) {
      if (!cache[src]) {
        var a = new Audio(src);
        a.preload = 'auto';
        cache[src] = a;
      }
      return cache[src];
    }

    function duration(src) {
      return new Promise(function (res) {
        if (!src) { res(0); return; }
        if (durations[src] !== undefined) { res(durations[src]); return; }
        var a = get(src);
        if (a.readyState >= 1 && isFinite(a.duration)) {
          durations[src] = a.duration; res(a.duration); return;
        }
        var done = false;
        var ok = function () {
          if (done) return; done = true;
          durations[src] = isFinite(a.duration) ? a.duration : 2;
          res(durations[src]);
        };
        a.addEventListener('loadedmetadata', ok, { once: true });
        a.addEventListener('error', ok, { once: true });
        setTimeout(ok, 4000);
        try { a.load(); } catch (e) { ok(); }
      });
    }

    /* an AudioSource component: one clip at a time, .Stop()/.Play()/.isPlaying */
    function Source(id) {
      this.id = id; this.clip = null; this.el = null; this.playing = false;
    }
    Source.prototype.setClip = function (src) { this.clip = src; };
    Source.prototype.play = function () {
      var self = this;
      this.stop();
      if (!this.clip) return;
      var a = get(this.clip);
      this.el = a;
      try { a.currentTime = 0; } catch (e) {}
      this.playing = true;
      a.onended = function () { self.playing = false; };
      var p = a.play();
      if (p && p.catch) p.catch(function () { self.playing = false; });
    };
    Source.prototype.playOneShot = function (src) {
      if (!src) return;
      var a = get(src).cloneNode();
      var p = a.play(); if (p && p.catch) p.catch(function () {});
    };
    Source.prototype.stop = function () {
      if (this.el) { try { this.el.pause(); this.el.currentTime = 0; } catch (e) {} }
      this.playing = false;
    };
    Source.prototype.isPlaying = function () {
      return this.playing && this.el && !this.el.paused && !this.el.ended;
    };

    function source(id) {
      id = String(id);
      if (!sources[id]) {
        sources[id] = new Source(id);
        var n = node(id);
        if (n && n.audioCfg && n.audioCfg.clip) sources[id].setClip(n.audioCfg.clip);
      }
      return sources[id];
    }

    /* Unity knows AudioClip.length instantly; we preload metadata at boot so
       the ported coroutines can read it synchronously and keep their timing. */
    function preload(list) {
      return Promise.all(list.filter(Boolean).map(duration));
    }
    function len(src) {
      if (!src) return 0;
      return durations[src] !== undefined ? durations[src] : 2;
    }

    /* ---- synthesised SFX ---------------------------------------------
       The original project has no success sting, and shipping one would add an
       asset to a build whose whole point is 2.1 MB. WebAudio synthesises it.

       A bare arpeggio read as a doorbell, so the correct-answer sting is built
       in four layers that arrive in turn, the way an arcade reward does:

         thump    a low sine dropping 190 -> 70 Hz, so the sting lands on
                  something rather than starting in mid-air
         run      C6 E6 G6 C7 climbing in 70 ms steps, triangle for brightness
                  with a square underneath for bite
         chord    C7 E7 G7 held together and detuned a few cents apart, which
                  is what turns the last step of the run into an arrival
         sparkle  seven short high blips scattered above the chord — the star
                  shower that keeps the tail moving after the notes stop

       Everything but the thump feeds a slap-back echo; that is most of what
       separates "celebration" from "notification". The thump stays dry because
       echoing it just muddies the low end. Peak gain is held down because the
       correct-answer voice-over starts on the same beat and has to stay
       intelligible over the top. */
    var ctx = null, sfxBus = null;

    function audioCtx() {
      var C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      if (!ctx) { try { ctx = new C(); } catch (e) { return null; } }
      // a context created before the first gesture starts out suspended
      if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }
      return ctx;
    }

    /* the shared echo bus, built once per context */
    function bus(c) {
      if (sfxBus && sfxBus.ctx === c) return sfxBus.out;
      var out = c.createGain();
      out.connect(c.destination);
      var delay = c.createDelay(0.5), fb = c.createGain(), wet = c.createGain();
      delay.delayTime.value = 0.115;
      fb.gain.value = 0.28;                  // three or four audible repeats
      wet.gain.value = 0.2;
      out.connect(delay); delay.connect(fb); fb.connect(delay);
      delay.connect(wet); wet.connect(c.destination);
      sfxBus = { ctx: c, out: out };
      return out;
    }

    /* one note: fast attack, exponential decay, its own envelope */
    function note(c, t0, freq, dur, peak, type, detune, dest) {
      var g = c.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(peak, t0 + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      g.connect(dest || bus(c));
      var o = c.createOscillator();
      o.type = type || 'triangle';
      o.frequency.setValueAtTime(freq, t0);
      if (detune) o.detune.setValueAtTime(detune, t0);
      o.connect(g);
      o.start(t0); o.stop(t0 + dur + 0.02);
    }

    function thump(c, t0) {
      var g = c.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.26, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
      g.connect(c.destination);              // dry on purpose
      var o = c.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(190, t0);
      o.frequency.exponentialRampToValueAtTime(70, t0 + 0.2);
      o.connect(g);
      o.start(t0); o.stop(t0 + 0.24);
    }

    var RUN = [1046.50, 1318.51, 1567.98, 2093.00];          // C6 E6 G6 C7
    var CHORD = [2093.00, 2637.02, 3135.96];                 // C7 E7 G7
    var SPARKLE = [3136, 2637, 3520, 2794, 4186, 3520, 4699];

    function correctSting(c, t0) {
      thump(c, t0);
      RUN.forEach(function (f, i) {
        note(c, t0 + i * 0.07, f, 0.26, 0.15, 'triangle');
        note(c, t0 + i * 0.07, f, 0.09, 0.045, 'square');     // the bite
      });
      /* the chord is the loudest musical moment on purpose: the run is the
         wind-up and this is the arrival it winds up to */
      var land = t0 + RUN.length * 0.07;
      CHORD.forEach(function (f, i) {
        note(c, land, f, 0.85, 0.13, 'triangle', (i - 1) * 7);
      });
      SPARKLE.forEach(function (f, i) {
        note(c, land + 0.09 + i * 0.055, f, 0.16, 0.06, 'sine');
      });
    }

    var STINGS = { correct: correctSting };

    function sfx(name) {
      var make = STINGS[name]; if (!make) return;
      var c = audioCtx(); if (!c) return;
      make(c, c.currentTime + 0.01);
    }

    return {
      get: get, duration: duration, source: source,
      preload: preload, len: len, sfx: sfx,
      sourcePlay: function (id) { source(id).play(); },
      sourceStop: function (id) { source(id).stop(); },
      reset: function () { sources = {}; }
    };
  })();

  // =========================================================== animator ====
  var animators = {};

  function evalCurve(keys, time) {
    if (!keys.length) return 0;
    if (time <= keys[0].t) return keys[0].v;
    var last = keys[keys.length - 1];
    if (time >= last.t) return last.v;
    for (var i = 0; i < keys.length - 1; i++) {
      var k1 = keys[i], k2 = keys[i + 1];
      if (time >= k1.t && time <= k2.t) {
        if (k1.step || k2.step) return k1.v;            // discrete (bool/int)
        var dt = k2.t - k1.t;
        if (dt <= 0) return k2.v;
        var u = (time - k1.t) / dt;
        var m1 = (typeof k1.o === 'number' ? k1.o : 0) * dt;
        var m2 = (typeof k2.i === 'number' ? k2.i : 0) * dt;
        var u2 = u * u, u3 = u2 * u;
        return (2 * u3 - 3 * u2 + 1) * k1.v + (u3 - 2 * u2 + u) * m1 +
               (-2 * u3 + 3 * u2) * k2.v + (u3 - u2) * m2;
      }
    }
    return last.v;
  }

  function findByPath(hostId, path) {
    var n = node(hostId);
    if (!n) return null;
    if (!path) return n;
    var parts = path.split('/');
    for (var i = 0; i < parts.length; i++) {
      var want = parts[i], found = null;
      for (var j = 0; j < n.children.length; j++) {
        if (n.children[j].name === want) { found = n.children[j]; break; }
      }
      if (!found) {  // tolerate trailing-space mismatches in Unity names
        for (var j2 = 0; j2 < n.children.length; j2++) {
          if (n.children[j2].name.trim() === want.trim()) { found = n.children[j2]; break; }
        }
      }
      if (!found) return null;
      n = found;
    }
    return n;
  }

  function readAttr(target, attr) {
    if (!target) return 0;
    switch (attr) {
      case 'm_AnchoredPosition.x': return target.anchoredPos[0];
      case 'm_AnchoredPosition.y': return target.anchoredPos[1];
      case 'm_SizeDelta.x': return target.sizeDelta[0];
      case 'm_SizeDelta.y': return target.sizeDelta[1];
      case 'localEulerAnglesRaw.z': return target.rotZ;
      case 'm_IsActive': return target.active ? 1 : 0;
      default: return 0;
    }
  }

  function applyAttr(target, attr, val) {
    if (!target) return;
    switch (attr) {
      case 'm_AnchoredPosition.x': target.anchoredPos[0] = val; target.refreshTree(); break;
      case 'm_AnchoredPosition.y': target.anchoredPos[1] = val; target.refreshTree(); break;
      case 'm_SizeDelta.x': target.sizeDelta[0] = val; target.refreshTree(); break;
      case 'm_SizeDelta.y': target.sizeDelta[1] = val; target.refreshTree(); break;
      case 'localEulerAnglesRaw.z': target.rotZ = val; target.applyLayout(); break;
      case 'localEulerAnglesRaw.x': case 'localEulerAnglesRaw.y': break;
      case 'm_IsActive': setActive(target.id, val >= 0.5); break;
      default: break;
    }
  }

  function Animator(hostId) {
    this.hostId = hostId;
    this.enabled = true;
    this.params = {};
    this.current = null;
    this._ticker = null;
    this.time = 0;
  }

  Animator.prototype.sample = function (clip, time, blend) {
    var i;
    for (i = 0; i < clip.curves.length; i++) {
      var c = clip.curves[i];
      // a clip can be played for part of its job only — see playExcept()
      if (this._skip && this._skip.indexOf(c.path) >= 0) continue;
      var target = findByPath(this.hostId, c.path);
      if (!target) continue;
      var v = evalCurve(c.keys, time);
      // Animator.CrossFade blends the previous pose into the new clip.
      // Discrete (bool/int) curves are not blended, matching Unity.
      if (blend !== undefined && blend < 1 && c.attr !== 'm_IsActive') {
        var from = this._snap ? this._snap[i] : v;
        v = from + (v - from) * blend;
      }
      applyAttr(target, c.attr, v);
    }
    for (i = 0; i < (clip.pptr || []).length; i++) {
      var pc = clip.pptr[i];
      var t2 = findByPath(this.hostId, pc.path);
      if (!t2) continue;
      var fr = pc.frames[0];
      for (var k = 0; k < pc.frames.length; k++) {
        if (pc.frames[k].t <= time) fr = pc.frames[k]; else break;
      }
      if (fr && fr.sprite) setSprite(t2.id, fr.sprite);
    }
  };

  /* Sample a clip at an arbitrary time without starting playback. Used to drive
     the balance continuously from the block count instead of in whole swings. */
  Animator.prototype.sampleAt = function (clipName, time) {
    var clip = window.ANIMS[clipName];
    if (!clip) return;
    this.stop();
    this.current = clipName;
    this._snap = null;
    this.sample(clip, time);
  };

  Animator.prototype.stop = function () {
    if (this._ticker) { remove(this._ticker); this._ticker = null; }
  };

  Animator.prototype.play = function (clipName, onDone, fade) {
    var clip = window.ANIMS[clipName];
    if (!clip) { if (onDone) onDone(); return; }
    var self = this;
    this.stop();
    this.current = clipName;
    this.time = 0;
    fade = fade || 0;

    // snapshot the outgoing pose so CrossFade can blend out of it
    this._snap = null;
    if (fade > 0) {
      this._snap = clip.curves.map(function (c) {
        return readAttr(findByPath(self.hostId, c.path), c.attr);
      });
    }

    if (clip.stop <= 0) {
      if (fade > 0) {                       // blend into a single-key pose
        var g = function (dt) {
          if (!self.enabled) return;
          if (!activeInHierarchy(self.hostId)) return;
          self.time += dt;
          var b = Math.min(1, self.time / fade);
          self.sample(clip, 0, b);
          if (b >= 1) { remove(g); self._ticker = null; self._snap = null; if (onDone) onDone(); }
        };
        this._ticker = g; add(g); return;
      }
      this.sample(clip, 0);
      if (onDone) onDone();
      return;
    }

    var f = function (dt) {
      if (!self.enabled) return;
      if (!activeInHierarchy(self.hostId)) return;   // Unity skips inactive objects
      self.time += dt;
      var t = self.time;
      if (clip.loop) t = t % clip.stop;
      else if (t > clip.stop) t = clip.stop;
      var b = fade > 0 ? Math.min(1, self.time / fade) : undefined;
      self.sample(clip, t, b);
      if (!clip.loop && self.time >= clip.stop) {
        remove(f); self._ticker = null; self._snap = null;
        if (onDone) onDone();
      }
    };
    this._ticker = f;
    add(f);
  };

  /* Animator.CrossFade(state, dur) — blend the live pose into the new clip
     over `dur` seconds while the clip advances, as Unity does. Without this
     the balance pans snap back to their neutral y before re-tilting. */
  Animator.prototype.crossFade = function (clipName, dur, onDone) {
    this.play(clipName, onDone, dur || 0);
  };

  /* Play a clip but leave the listed curve paths alone.
     The tutorial's BallAnimation does two jobs at once: it swings the balance
     AND it swaps which items are visible. The swing is now driven per block so
     the pans move with every cube instead of jumping at the end, so the clip is
     played for its visibility work only. */
  Animator.prototype.playExcept = function (clipName, skipPaths, onDone) {
    var self = this;
    this._skip = skipPaths || null;
    this.play(clipName, function () {
      self._skip = null;
      if (onDone) onDone();
    });
  };

  Animator.prototype.setInteger = function (name, v) {
    this.params[name] = v;
    if (this.onParam) this.onParam(name, v);
  };

  function animator(hostId) {
    hostId = String(hostId);
    if (!animators[hostId]) animators[hostId] = new Animator(hostId);
    return animators[hostId];
  }

  /* Sample a clip's pose once, directly, touching no animator state and no
     ticker. This is how a continuous value (the balance tilt) can drive part of
     a rig while a clip is independently playing the rest of it — going through
     Animator.sampleAt would stop that clip's ticker every frame, and would also
     inherit its playExcept filter. */
  function samplePose(hostId, clipName, time, only) {
    var clip = window.ANIMS[clipName];
    if (!clip) return;
    for (var i = 0; i < clip.curves.length; i++) {
      var c = clip.curves[i];
      if (only && only.indexOf(c.path) < 0) continue;
      var target = findByPath(hostId, c.path);
      if (!target) continue;
      applyAttr(target, c.attr, evalCurve(c.keys, time));
    }
  }

  /* ---------------------------------------------------------------------
     Unity Instantiate(prefab, parent) / Destroy(go).
     Prefabs referenced only by scripts never appear in the scene YAML, so the
     whole subtree travels in window.TEMPLATES and is cloned here with fresh
     ids. Returns the new root node id.
     ------------------------------------------------------------------- */
  var cloneSeq = 0;

  function cloneTree(data, parentNode, container, suffix) {
    var copy = {};
    for (var k in data) if (k !== 'children') copy[k] = data[k];
    copy.id = data.id + '#' + suffix;
    // components carry mutable arrays; Node's constructor slices them, but the
    // sprite/colour objects must not be shared between clones
    if (data.components) {
      copy.components = {};
      for (var ck in data.components) {
        var src = data.components[ck], dst = {};
        for (var f in src) dst[f] = Array.isArray(src[f]) ? src[f].slice() : src[f];
        copy.components[ck] = dst;
      }
    }
    var n = new Node(copy, parentNode);
    container.appendChild(n.el);
    if (parentNode) parentNode.children.push(n);
    (data.children || []).forEach(function (c) {
      cloneTree(c, n, n.el, suffix);
    });
    return n;
  }

  function instantiate(templateName, parentId) {
    var tpl = (window.TEMPLATES || {})[templateName];
    if (!tpl) { console.warn('no template', templateName); return null; }
    var parent = node(parentId) || nodes[stage.dataset.id];
    var suffix = 'i' + (++cloneSeq);
    var root = cloneTree(tpl, parent, parent.el, suffix);
    var stack = [root];
    while (stack.length) {
      var n = stack.pop();
      n.refresh();
      for (var i = 0; i < n.children.length; i++) stack.push(n.children[i]);
    }
    wireButtonsFor(root);
    return root.id;
  }

  function destroy(id) {
    var n = node(id);
    if (!n) return;
    var stack = [n], all = [];
    while (stack.length) {
      var x = stack.pop(); all.push(x);
      for (var i = 0; i < x.children.length; i++) stack.push(x.children[i]);
    }
    all.forEach(function (x) {
      if (animators[x.id]) { animators[x.id].stop(); delete animators[x.id]; }
      delete nodes[x.id];
    });
    if (n.parent) {
      var idx = n.parent.children.indexOf(n);
      if (idx >= 0) n.parent.children.splice(idx, 1);
    }
    if (n.el.parentNode) n.el.parentNode.removeChild(n.el);
  }

  // ================================================ celebration confetti ====
  /* A falling shower, not a single radial burst. Particles are emitted from
     several staggered points across the top of the stage, start above the
     visible area so they never pile up in a row along the edge, and are biased
     away from the middle column so the balance and the instruction bar stay
     readable. Every particle removes itself on animationend; the layer removes
     itself when the last one is gone. */
  function prefersReducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  var confettiLayer = null, confettiPending = 0, confettiTimer = null;

  function confettiClear() {
    if (confettiTimer) { clearTimeout(confettiTimer); confettiTimer = null; }
    if (confettiLayer && confettiLayer.parentNode) confettiLayer.parentNode.removeChild(confettiLayer);
    confettiLayer = null;
    confettiPending = 0;
  }

  function confetti(nodeId, opts) {
    if (confettiLayer) return;                 // one celebration at a time
    if (!stage) return;
    var reduced = prefersReducedMotion();
    var o = opts || {};
    var N = o.count || (reduced ? 26 : 150);

    var layer = document.createElement('div');
    layer.className = 'confetti-layer';
    stage.appendChild(layer);
    confettiLayer = layer;
    confettiPending = N;

    var colors = ['#ffd23f', '#ff6b6b', '#4ecdc4', '#a06cd5', '#f9f871', '#ff9f1c', '#5ec8ff'];
    var W = canvasSize[0], H = canvasSize[1];
    var EMITTERS = reduced ? 5 : 15;

    function done() {
      if (--confettiPending > 0) return;
      confettiClear();
    }

    for (var i = 0; i < N; i++) {
      // spread emission points across the top, thinning out the middle column
      var e = i % EMITTERS;
      var ex = (e + 0.5) / EMITTERS;
      if (ex > 0.38 && ex < 0.62 && i % 3 !== 0) ex = ex < 0.5 ? ex - 0.28 : ex + 0.28;
      var x = (0.04 + 0.92 * ex) * W + (Math.random() - 0.5) * (W / EMITTERS) * 0.7;

      var fall = document.createElement('div');
      fall.className = 'cf';
      var piece = document.createElement('i');
      fall.appendChild(piece);

      var w = 8 + Math.random() * 10;
      var h = w * (0.55 + Math.random() * 0.9);
      piece.style.width = w + 'px';
      piece.style.height = h + 'px';
      piece.style.background = colors[(i * 3 + e) % colors.length];
      if (i % 5 === 0) piece.style.borderRadius = '50%';

      // the opening wave lands first, then a steady shower, then a taper
      var wave = i / N;
      var delay = (wave < 0.35 ? Math.random() * 0.18 : 0.18 + (wave - 0.35) * (reduced ? 0.7 : 1.35)) +
                  Math.random() * 0.12;
      var dur = (reduced ? 1.3 : 1.9) + Math.random() * (reduced ? 0.3 : 1.0);

      fall.style.left = x + 'px';
      fall.style.setProperty('--y0', (-90 - Math.random() * 220) + 'px');
      fall.style.setProperty('--y1', (H + 90) + 'px');
      fall.style.setProperty('--dur', dur + 's');
      fall.style.setProperty('--delay', delay + 's');

      piece.style.setProperty('--sway', ((Math.random() < 0.5 ? -1 : 1) * (18 + Math.random() * 62)) + 'px');
      piece.style.setProperty('--spin', ((Math.random() < 0.5 ? -1 : 1) * (180 + Math.random() * 620)) + 'deg');
      piece.style.setProperty('--sdur', (0.7 + Math.random() * 0.8) + 's');

      fall.addEventListener('animationend', function () {
        if (this.parentNode) this.parentNode.removeChild(this);
        done();
      }, { once: true });

      layer.appendChild(fall);
    }

    // safety net: nothing is ever left behind if an animationend is missed
    confettiTimer = setTimeout(confettiClear, (reduced ? 2600 : 4600));
  }

  /* client coords -> stage coords (top-left origin, y DOWN) */
  function clientToStage(cx, cy) {
    var r = stage.getBoundingClientRect();
    return [(cx - r.left) / scaleFactor, (cy - r.top) / scaleFactor];
  }

  /* Any DOM element's on-screen box expressed in stage coordinates (top-left
     origin, y DOWN, 1920x1080 design grid). Everything that has to line up
     with the artwork is anchored off this rather than hard-coded numbers, so
     it stays correct at every viewport size and after any pan movement. */
  function stageRectOf(el) {
    if (!el || !stage) return null;
    var r = el.getBoundingClientRect(), s = stage.getBoundingClientRect();
    return {
      x: (r.left - s.left) / scaleFactor,
      y: (r.top - s.top) / scaleFactor,
      w: r.width / scaleFactor,
      h: r.height / scaleFactor,
      cx: (r.left + r.width / 2 - s.left) / scaleFactor,
      cy: (r.top + r.height / 2 - s.top) / scaleFactor
    };
  }
  function nodeStageRect(id) {
    var n = node(id);
    return n ? stageRectOf(n.el) : null;
  }

  /* A non-Unity overlay layer inside the stage, for effects that are authored
     here rather than in the scene (guidance path, hand hint). It scales and
     letterboxes with the board for free, and is torn down with the scene. */
  var fxLayer = null;
  function overlay() {
    if (!stage) return null;
    if (!fxLayer || !fxLayer.parentNode) {
      fxLayer = document.createElement('div');
      fxLayer.className = 'fx-layer';
      stage.appendChild(fxLayer);
    } else if (fxLayer !== stage.lastElementChild) {
      stage.appendChild(fxLayer);          // keep it on top of late-added nodes
    }
    return fxLayer;
  }
  function clearOverlay() {
    if (fxLayer && fxLayer.parentNode) fxLayer.parentNode.removeChild(fxLayer);
    fxLayer = null;
  }

  /* a node's rect in stage coords, Unity-style y-UP from the stage bottom */
  function stageRectYUp(id) {
    var n = node(id); if (!n) return null;
    var sp = n.stagePos();                 // pivot, y-down
    var sz = n.size();
    var w = sz[0] * n.scale[0], h = sz[1] * n.scale[1];
    var cx = sp[0], cyUp = canvasSize[1] - sp[1];
    return {
      xMin: cx - n.pivot[0] * w, xMax: cx + (1 - n.pivot[0]) * w,
      yMin: cyUp - n.pivot[1] * h, yMax: cyUp + (1 - n.pivot[1]) * h,
      w: w, h: h, pivotX: cx, pivotY: cyUp
    };
  }

  // ------------------------------------------------------------- exports --
  /* Every way a mobile browser can change the usable box. The rAF coalesces the
     burst of events an orientation change fires, so the board is re-laid out
     once rather than a dozen times. */
  var relayoutQueued = false;
  function relayout() {
    if (relayoutQueued) return;
    relayoutQueued = true;
    requestAnimationFrame(function () { relayoutQueued = false; computeScale(); });
  }
  window.addEventListener('resize', relayout);
  window.addEventListener('orientationchange', function () {
    relayout();
    // iOS reports the old size for a beat after the rotation completes
    setTimeout(computeScale, 120);
    setTimeout(computeScale, 400);
  });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', relayout);
    window.visualViewport.addEventListener('scroll', relayout);
  }
  requestAnimationFrame(frame);

  return {
    boot: boot, node: node, nodes: function () { return nodes; },
    setActive: setActive, activeSelf: activeSelf, activeInHierarchy: activeInHierarchy,
    onActivated: onActivated, resetActivatedHandlers: resetActivatedHandlers,
    setSprite: setSprite, setNativeSize: setNativeSize,
    setText: setText, getText: getText,
    setAnchoredPos: setAnchoredPos, getAnchoredPos: getAnchoredPos,
    setSizeDelta: setSizeDelta,
    setScale: setScale, getScale: getScale, setRotZ: setRotZ,
    setInteractable: setInteractable, isInteractable: isInteractable,
    setCanvasGroupAlpha: setCanvasGroupAlpha, setBlocksRaycasts: setBlocksRaycasts,
    setParent: setParent, setAsLastSibling: setAsLastSibling, setAsFirstSibling: setAsFirstSibling,
    addClickListener: addClickListener, removeAllClickListeners: removeAllClickListeners,
    TaskGroup: TaskGroup, CANCEL: CANCEL, isCancel: isCancel,
    wait: wait, waitUntil: waitUntil, tween: tween, loopScale: loopScale,
    Ease: Ease, add: add, remove: remove,
    Audio: Audio2, animator: animator, samplePose: samplePose, findByPath: findByPath,
    confetti: confetti, confettiClear: confettiClear,
    prefersReducedMotion: prefersReducedMotion,
    preloadSprites: preloadSprites, spriteStatus: spriteStatus,
    overlay: overlay, clearOverlay: clearOverlay,
    stageRectOf: stageRectOf, nodeStageRect: nodeStageRect, clientToStage: clientToStage,
    instantiate: instantiate, destroy: destroy,
    resetRuntime: resetRuntime,
    clipLength: function (n) { return (window.ANIMS[n] || {}).stop || 0; },
    tickerCount: function () { return tickers.length; },
    stageRectYUp: stageRectYUp,
    stagePos: function (id) { var n = node(id); return n ? n.stagePos() : [0, 0]; },
    setStagePos: function (id, x, y) { var n = node(id); if (n) n.setStagePos(x, y); },
    scaleFactor: function () { return scaleFactor; },
    stage: function () { return stage; },
    ref: function () { return scalerCfg.ref.slice(); },
    canvas: function () { return canvasSize.slice(); }
  };
})();
