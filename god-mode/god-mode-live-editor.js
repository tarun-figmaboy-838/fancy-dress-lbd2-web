/* ============================================================================
 *  god-mode-live-editor.js — Figma-style layout editing for the live game
 *
 *  Pick any element, read and edit its geometry, drag it, resize it, nudge it
 *  with the arrow keys, then copy exact values (or a ready-to-paste patch) for
 *  a developer. Two coordinate systems are shown side by side:
 *
 *    X / Y      the design-grid box position (top-left origin, y DOWN) —
 *               what a designer reads off a 1920x1080 Figma frame
 *    aPos       Unity's anchoredPos for the same node (y UP, pivot relative) —
 *               what actually goes back into the scene
 *
 *  Every edit is recorded so it can be undone exactly; turning God Mode off
 *  restores the learner build byte for byte.
 * ========================================================================== */
(function () {
  'use strict';

  var U = window.GodModeUtils;
  var STORE = 'fancyDressGodLayout';

  function GodModeLiveEditor() {
    this.sel = null;           // { node } or { el } for runtime-only elements
    this.originals = {};       // id -> captured geometry, for exact reset
    this.edits = {};           // id -> { label, from, to }
    this.cursorEdit = false;
    this.snap = false;
    this.locked = false;
    this.grid = 10;
    this._drag = null;
  }

  var P = GodModeLiveEditor.prototype;

  // ------------------------------------------------------------- geometry --
  /* box in design-grid space; the Figma-style numbers */
  P.boxOf = function (node) {
    if (!node) return null;
    return node.el ? U.stageRectOf(node.el) : null;
  };

  /* move the node so its box's top-left lands on (x, y) in design space */
  P.setBoxPos = function (node, x, y) {
    var b = U.stageRectOf(node.el);
    if (!b) return;
    var p = Engine.stagePos(node.id);
    Engine.setStagePos(node.id, p[0] + (x - b.x), p[1] + (y - b.y));
  };

  P.setBoxSize = function (node, w, h) {
    var b = U.stageRectOf(node.el);
    if (!b) return;
    var sc = node.scale[0] || 1, scy = node.scale[1] || 1;
    var cur = node.size();
    var dw = (w / sc) - cur[0], dh = (h / scy) - cur[1];
    Engine.setSizeDelta(node.id, node.sizeDelta[0] + dw, node.sizeDelta[1] + dh);
  };

  P.capture = function (node) {
    if (!node || this.originals[node.id]) return;
    this.originals[node.id] = {
      anchoredPos: node.anchoredPos.slice(),
      sizeDelta: node.sizeDelta.slice(),
      scale: node.scale.slice(),
      rotZ: node.rotZ,
      cssZ: node.el.style.zIndex || '',
      opacity: node.canvasGroup ? node.canvasGroup.alpha : null,
      /* Nodes without a CanvasGroup take their opacity as an inline style, and
         the z field reorders siblings. Both were being changed but not
         recorded, so toggling God Mode off left the learner build with a
         see-through element and a permanently re-stacked layer. */
      inlineOpacity: node.el.style.opacity || '',
      sib: node.parent ? node.parent.children.indexOf(node) : -1
    };
  };

  /* Put a parent's DOM order back in step with its children array. */
  P.syncOrder = function (parent) {
    if (!parent) return;
    parent.children.forEach(function (k) { parent.el.appendChild(k.el); });
  };

  // ------------------------------------------------------------ selection --
  /* Everything meaningful in whatever is on screen right now, grouped. Built
     from the live tree instead of a hard-coded list, so it is correct in the
     tutorial and in every level without six copies of the same table. */
  var GROUPS = [
    ['Balance', ['controller', 'plate', 'Support base', 'needle', 'left ', 'Right',
                 'Basket', 'Basket ', 'Image', 'Image (1)', 'Sahadow']],
    ['Items',   ['items ', 'Start Items', 'Item 1', 'Item 2', 'Book', 'Ball', 'cube',
                 'plus', 'plus (1)', 'Minus', 'Minus (1)', 'Plus Button', 'Minus Button ']],
    ['UI',      ['Message bar', 'Text (TMP)', 'Check Btn ', 'Next Btn', 'Tryagain Btn',
                 'Check btn', 'Next btn', 'Label', 'BG', 'Image (2)']],
    ['Hints',   ['Left arrow', 'Right arrow', 'Hint hand', 'Hint hand (1)', 'Hand Tut',
                 'Ghost hand', 'Ghost hint', 'hand', 'Hint Hand', 'Arrows']]
  ];

  P.catalogue = function () {
    var root = U.activeRoot();
    var out = [];
    if (!root) return out;
    var seen = {};
    var byName = {};
    (function walk(n, path) {
      var p = path ? path + ' / ' + n.name : n.name;
      (byName[n.name] = byName[n.name] || []).push({ node: n, path: p });
      (n.children || []).forEach(function (c) { walk(c, p); });
    })(root, '');

    GROUPS.forEach(function (g) {
      g[1].forEach(function (name) {
        (byName[name] || []).forEach(function (hit) {
          if (seen[hit.node.id]) return;
          seen[hit.node.id] = 1;
          out.push({ group: g[0], id: hit.node.id, label: hit.node.name, path: hit.path });
        });
      });
    });
    // anything left over, so nothing on screen is unreachable
    Object.keys(byName).forEach(function (name) {
      byName[name].forEach(function (hit) {
        if (seen[hit.node.id]) return;
        seen[hit.node.id] = 1;
        out.push({ group: 'Other', id: hit.node.id, label: hit.node.name, path: hit.path });
      });
    });
    out.unshift({ group: 'Scene', id: root.id, label: root.name + '  (level root)', path: root.name });
    return out;
  };

  P.select = function (nodeOrId) {
    var node = typeof nodeOrId === 'object' && nodeOrId && nodeOrId.el
      ? nodeOrId : Engine.node(nodeOrId);
    if (!node) return;
    this.capture(node);
    this.sel = node;
    this.refreshFields();
    this.drawSelectionBox();
    document.dispatchEvent(new CustomEvent('godEditorSelectionChanged', {
      detail: { id: node.id, name: node.name, node: node }
    }));
  };

  P.clearSelection = function () {
    this.sel = null;
    var b = U.qa('#godSelBox');
    if (b) b.style.display = 'none';
  };

  // ------------------------------------------------------------- rendering --
  P.drawSelectionBox = function () {
    var box = U.qa('#godSelBox');
    if (!box) return;
    if (!this.sel || !this.sel.el) { box.style.display = 'none'; return; }
    var r = this.sel.el.getBoundingClientRect();
    box.style.display = 'block';
    box.style.left = r.left + 'px';
    box.style.top = r.top + 'px';
    box.style.width = r.width + 'px';
    box.style.height = r.height + 'px';
    var b = this.boxOf(this.sel);
    var lab = U.qa('#godSelLabel', box);
    if (lab && b) {
      lab.textContent = this.sel.name + '  ·  ' +
        Math.round(b.w) + '×' + Math.round(b.h) + '  @  ' +
        Math.round(b.x) + ', ' + Math.round(b.y);
    }
  };

  P.refreshFields = function () {
    var n = this.sel;
    var set = function (id, v) { var e = U.qa(id); if (e && document.activeElement !== e) e.value = v; };
    var name = U.qa('#godSelName');
    if (!n) {
      if (name) name.textContent = 'nothing selected';
      return;
    }
    var b = this.boxOf(n) || { x: 0, y: 0, w: 0, h: 0 };
    if (name) name.textContent = n.name + '  #' + n.id;
    set('#godX', U.round(b.x, 1));
    set('#godY', U.round(b.y, 1));
    set('#godW', U.round(b.w, 1));
    set('#godH', U.round(b.h, 1));
    set('#godAX', U.round(n.anchoredPos[0], 1));
    set('#godAY', U.round(n.anchoredPos[1], 1));
    set('#godScale', U.round(n.scale[0], 3));
    set('#godRot', U.round(n.rotZ, 1));
    set('#godOpacity', n.canvasGroup ? U.round(n.canvasGroup.alpha, 2) : 1);
    var zi = U.qa('#godZ');
    if (zi && document.activeElement !== zi) {
      zi.value = n.parent ? n.parent.children.indexOf(n) : 0;
    }
  };

  // ---------------------------------------------------------------- edits --
  P.noteEdit = function () {
    var n = this.sel;
    if (!n) return;
    var o = this.originals[n.id];
    this.edits[n.id] = {
      label: n.name,
      from: o,
      to: {
        anchoredPos: n.anchoredPos.slice(),
        sizeDelta: n.sizeDelta.slice(),
        scale: n.scale.slice(),
        rotZ: n.rotZ
      }
    };
  };

  P.applyField = function (which, value) {
    var n = this.sel;
    if (!n || isNaN(value)) return;
    var b = this.boxOf(n);
    switch (which) {
      case 'x': this.setBoxPos(n, value, b.y); break;
      case 'y': this.setBoxPos(n, b.x, value); break;
      case 'w': this.setBoxSize(n, value, b.h); break;
      case 'h': this.setBoxSize(n, b.w, value); break;
      case 'ax': Engine.setAnchoredPos(n.id, value, null); break;
      case 'ay': Engine.setAnchoredPos(n.id, null, value); break;
      case 'scale': Engine.setScale(n.id, value); break;
      case 'rot': Engine.setRotZ(n.id, value); break;
      case 'opacity':
        if (n.canvasGroup) Engine.setCanvasGroupAlpha(n.id, value);
        else n.el.style.opacity = String(value);
        break;
      case 'z': this.setSiblingIndex(n, value); break;
    }
    this.noteEdit();
    this.refreshFields();
    this.drawSelectionBox();
  };

  P.setSiblingIndex = function (n, idx) {
    if (!n.parent) return;
    var kids = n.parent.children;
    idx = Math.max(0, Math.min(kids.length - 1, Math.round(idx)));
    var cur = kids.indexOf(n);
    if (cur < 0 || cur === idx) return;
    kids.splice(cur, 1);
    kids.splice(idx, 0, n);
    // mirror the order into the DOM so painting matches
    kids.forEach(function (k) { n.parent.el.appendChild(k.el); });
  };

  P.nudge = function (dx, dy) {
    if (!this.sel) return;
    var b = this.boxOf(this.sel);
    this.setBoxPos(this.sel, b.x + dx, b.y + dy);
    this.noteEdit();
    this.refreshFields();
    this.drawSelectionBox();
  };

  // ------------------------------------------------------- cursor editing --
  P.setCursorEdit = function (on) {
    this.cursorEdit = !!on;
    document.body.classList.toggle('godCursorEdit', this.cursorEdit);
  };

  P.hitTest = function (ev) {
    var el = document.elementFromPoint(ev.clientX, ev.clientY);
    if (!el) return null;
    // .intro-vo is a real control, not a scene node — picking it would only
    // swallow the click and select the canvas root
    if (el.closest && el.closest('#godPanel, #godSelBox, #godBadge, #godToast, .intro-vo')) return null;
    return U.nodeOf(el);
  };

  P.onPointerDown = function (ev) {
    if (!this.cursorEdit) return;
    var handle = ev.target && ev.target.classList && ev.target.classList.contains('godHandle')
      ? ev.target.dataset.h : null;
    var node = handle ? this.sel : this.hitTest(ev);
    if (!node) return;
    ev.preventDefault();
    ev.stopPropagation();
    if (node !== this.sel) this.select(node);
    if (this.locked && !handle) return;
    var b = this.boxOf(this.sel);
    this._drag = {
      handle: handle, sx: ev.clientX, sy: ev.clientY,
      box: b, moved: false
    };
    window.addEventListener('pointermove', this._onMove, true);
    window.addEventListener('pointerup', this._onUp, true);
  };

  P.applyDrag = function (ev) {
    var d = this._drag;
    if (!d || !this.sel) return;
    var k = U.stageScale();
    var dx = (ev.clientX - d.sx) / k, dy = (ev.clientY - d.sy) / k;
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) d.moved = true;
    var snap = this.snap || ev.shiftKey;
    var g = this.grid;
    var q = function (v) { return snap ? Math.round(v / g) * g : v; };
    var b = d.box;

    if (!d.handle) {
      this.setBoxPos(this.sel, q(b.x + dx), q(b.y + dy));
    } else {
      var x = b.x, y = b.y, w = b.w, h = b.h;
      if (d.handle.indexOf('w') >= 0) { x = b.x + dx; w = b.w - dx; }
      if (d.handle.indexOf('e') >= 0) { w = b.w + dx; }
      if (d.handle.indexOf('n') >= 0) { y = b.y + dy; h = b.h - dy; }
      if (d.handle.indexOf('s') >= 0) { h = b.h + dy; }
      w = Math.max(20, q(w)); h = Math.max(20, q(h));
      this.setBoxSize(this.sel, w, h);
      this.setBoxPos(this.sel, q(x), q(y));
    }
    this.noteEdit();
    this.refreshFields();
    this.drawSelectionBox();
  };

  // ---------------------------------------------------------------- export --
  P.valuesFor = function (node) {
    var b = this.boxOf(node) || { x: 0, y: 0, w: 0, h: 0 };
    var L = [];
    L.push(node.name + '   #' + node.id);
    L.push('  x, y        ' + U.round(b.x, 1) + ', ' + U.round(b.y, 1) + '   (design grid, top-left origin)');
    L.push('  w, h        ' + U.round(b.w, 1) + ' x ' + U.round(b.h, 1));
    L.push('  anchoredPos ' + U.round(node.anchoredPos[0], 2) + ', ' + U.round(node.anchoredPos[1], 2));
    L.push('  sizeDelta   ' + U.round(node.sizeDelta[0], 2) + ', ' + U.round(node.sizeDelta[1], 2));
    L.push('  scale       ' + U.round(node.scale[0], 3) + ', ' + U.round(node.scale[1], 3));
    L.push('  rotation    ' + U.round(node.rotZ, 2));
    L.push('  pivot       ' + node.pivot[0] + ', ' + node.pivot[1]);
    L.push('  anchors     min ' + node.anchorMin.join(',') + '   max ' + node.anchorMax.join(','));
    return L.join('\n');
  };

  P.copySelected = function () {
    if (!this.sel) { U.toast('nothing selected'); return; }
    U.copyText(this.valuesFor(this.sel));
    U.toast('copied values for ' + this.sel.name);
  };

  P.copyAllEdits = function () {
    var keys = Object.keys(this.edits);
    if (!keys.length) { U.toast('no edits yet'); return; }
    var self = this;
    var out = ['/* God Mode layout patch — apply after the scene boots */'];
    keys.forEach(function (id) {
      var e = self.edits[id], n = Engine.node(id);
      if (!n) return;
      out.push('// ' + e.label);
      out.push("Engine.setAnchoredPos('" + id + "', " +
        U.round(n.anchoredPos[0], 2) + ', ' + U.round(n.anchoredPos[1], 2) + ');');
      if (e.from && (e.from.sizeDelta[0] !== n.sizeDelta[0] || e.from.sizeDelta[1] !== n.sizeDelta[1]))
        out.push("Engine.setSizeDelta('" + id + "', " +
          U.round(n.sizeDelta[0], 2) + ', ' + U.round(n.sizeDelta[1], 2) + ');');
      if (e.from && e.from.scale[0] !== n.scale[0])
        out.push("Engine.setScale('" + id + "', " + U.round(n.scale[0], 4) + ');');
      if (e.from && e.from.rotZ !== n.rotZ)
        out.push("Engine.setRotZ('" + id + "', " + U.round(n.rotZ, 2) + ');');
    });
    U.copyText(out.join('\n'));
    U.toast('copied a patch for ' + keys.length + ' element(s)');
  };

  P.copyEverything = function () {
    var self = this, out = [];
    this.catalogue().forEach(function (e) {
      var n = Engine.node(e.id);
      if (n) out.push(self.valuesFor(n));
    });
    U.copyText(out.join('\n\n'));
    U.toast('copied every element on screen');
  };

  // ------------------------------------------------------- persist / reset --
  P.save = function () {
    var out = {};
    var self = this;
    Object.keys(this.edits).forEach(function (id) {
      var n = Engine.node(id);
      if (!n) return;
      out[id] = {
        name: n.name,
        anchoredPos: n.anchoredPos.slice(),
        sizeDelta: n.sizeDelta.slice(),
        scale: n.scale.slice(),
        rotZ: n.rotZ
      };
    });
    try { localStorage.setItem(STORE, JSON.stringify(out)); U.toast('layout saved'); }
    catch (e) { U.toast('could not save: ' + e.message); }
  };

  P.load = function () {
    var raw;
    try { raw = JSON.parse(localStorage.getItem(STORE) || '{}'); } catch (e) { raw = {}; }
    var n = 0, self = this;
    Object.keys(raw).forEach(function (id) {
      var node = Engine.node(id);
      if (!node) return;
      self.capture(node);
      node.anchoredPos = raw[id].anchoredPos.slice();
      node.sizeDelta = raw[id].sizeDelta.slice();
      node.scale = raw[id].scale.slice();
      node.rotZ = raw[id].rotZ;
      node.refreshTree();
      self.edits[id] = { label: raw[id].name, from: self.originals[id], to: raw[id] };
      n++;
    });
    this.refreshFields();
    this.drawSelectionBox();
    U.toast(n ? ('loaded ' + n + ' element(s)') : 'nothing saved');
  };

  P.clearSaved = function () {
    try { localStorage.removeItem(STORE); } catch (e) {}
    this.resetAll();
    U.toast('saved layout cleared');
  };

  P.resetNode = function (id) {
    var o = this.originals[id], n = Engine.node(id);
    if (!o || !n) return;
    n.anchoredPos = o.anchoredPos.slice();
    n.sizeDelta = o.sizeDelta.slice();
    n.scale = o.scale.slice();
    n.rotZ = o.rotZ;
    n.el.style.zIndex = o.cssZ;
    if (o.opacity !== null && n.canvasGroup) Engine.setCanvasGroupAlpha(n.id, o.opacity);
    n.el.style.opacity = o.inlineOpacity;
    // undo any Bring Forward / Send Backward / z-field reordering
    if (o.sib >= 0 && n.parent) {
      var kids = n.parent.children, cur = kids.indexOf(n);
      if (cur >= 0 && cur !== o.sib) {
        kids.splice(cur, 1);
        kids.splice(Math.min(o.sib, kids.length), 0, n);
        this.syncOrder(n.parent);
      }
    }
    n.refreshTree();
    delete this.edits[id];
  };

  P.resetSelected = function () {
    if (!this.sel) return;
    this.resetNode(this.sel.id);
    this.refreshFields();
    this.drawSelectionBox();
    U.toast('reset');
  };

  P.resetAll = function () {
    var self = this;
    var parents = [];
    Object.keys(this.originals).forEach(function (id) {
      var n = Engine.node(id);
      if (n && n.parent && parents.indexOf(n.parent) < 0) parents.push(n.parent);
      self.resetNode(id);
    });
    /* One deterministic pass at the end: individual restores can shuffle each
       other when several siblings were moved, so the DOM is re-synced from the
       final children arrays once everything is back in place. */
    parents.forEach(function (p) { self.syncOrder(p); });
    this.originals = {};
    this.edits = {};
    this.clearSelection();
    this.setCursorEdit(false);
  };

  // ------------------------------------------------------------------ init --
  P.init = function () {
    var self = this;
    this._onMove = function (ev) { self.applyDrag(ev); };
    this._onUp = function (ev) {
      window.removeEventListener('pointermove', self._onMove, true);
      window.removeEventListener('pointerup', self._onUp, true);
      if (self._drag && self._drag.moved) self._swallowNextClick = true;
      self._drag = null;
    };
    window.addEventListener('pointerdown', function (ev) { self.onPointerDown(ev); }, true);
    // a pick or a drag must never also count as a tap on the game
    window.addEventListener('click', function (ev) {
      if (!self._swallowNextClick) return;
      self._swallowNextClick = false;
      ev.stopPropagation();
      ev.preventDefault();
    }, true);
    window.addEventListener('resize', function () { self.drawSelectionBox(); });
    // the selection box tracks the element even while the game animates it
    (function tick() {
      if (self.sel && document.body.classList.contains('godMode')) self.drawSelectionBox();
      requestAnimationFrame(tick);
    })();
  };

  window.GodModeLiveEditor = GodModeLiveEditor;
})();
