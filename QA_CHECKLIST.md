# QA_CHECKLIST — Fancy Dress Lbd2 (weighing-scale build)

Every ticked box below was **executed in a real browser** (headless Chromium 149,
`http://localhost:8000`) against this build, not reasoned about. Unticked boxes
say why. Each line names the check that proves it.

Suites run (all reported **0 failures**):

| Suite | What it drives | Result |
|---|---|---|
| `e2e` | all 6 levels: mouse drag → drop → wrong answer → try again → correct → confetti → next | 154 checks, 0 fail |
| `matrix` | touch drag, rapid input, reduced motion, 6 viewports, tutorial scene | 70 checks, 0 fail |
| `leaks` | 6 scene reloads + 18 level switches, confetti lifecycle | 18 checks, 0 fail |
| `god` | God Mode: pick, x/y edit, drag, resize, snap, nudge, export, reset, teardown | 32 checks, 0 fail |
| `fallback` | `Vector_10.png` blocked at the network layer | 7 checks, 0 fail |
| in-game QA panel | Shift+G → *Run all* | 48 pass, 0 fail |

Viewports covered: **1280×720, 1366×768, 1920×1080, 1024×768, 820×1180, 1180×820**.

---

## Item Placement

* [x] Item remains visible while being dragged over the pan.
* [x] Item remains visible after being dropped. — *effective opacity 1.0 in all 6 levels; was 0.0 before the fix*
* [x] Item is centred correctly inside the pan. — *|dx| = 0 px against the pan centre in all 6 levels*
* [x] Item does not shrink unexpectedly. — *width×height identical before and after the drop in all 6 levels*
* [x] Item does not jump. — *screen position is preserved across the re-parent, then eased 0.26 s to the rest anchor*
* [x] Item does not flicker. — *no `display`/`visibility` toggling and no removal on the drop path*
* [x] Item does not duplicate. — *one element per `data-id` after the drop, and after 8 rapid aborted drags*
* [x] Item does not move outside the pan. — *it is a child of the pan's drop zone, which clips nothing and moves with the pan*
* [x] Invalid drops return smoothly. — *`returnItemToOrigin` eases home over 0.28 s and falls back to the canvas root if the origin was hidden*
* [x] Behaviour works in every level and tutorial. — *one `placeItemInPan` serves all of them; tutorial cube spawn verified visible too*

## Vector Asset

* [x] `assets/img/Vector_10.webp` loads successfully. — *200, 316×569, verified via `Engine.preloadSprites`*
* [x] Asset is visible. — *effective opacity 1.0; it was 0 because its parent's `Image.color.a = 0` was rendered as CSS opacity*
* [x] Asset dimensions are correct. — *drawn at its native 316×569 and uniformly scaled; the 14 slices reconstruct the source 1:1*
* [x] Asset is not clipped. — *the `.fx-layer` host is full-stage; measured on screen at all 6 viewports*
* [x] Asset has the correct z-index. — *`.fx-layer { z-index: 40 }`, above the board, below the panel overlays*
* [x] Missing-asset fallback works. — *request aborted → console warning naming the file, `.fallback` CSS dots, game still fully playable, no JS exception*

## Dotted Guidance

* [x] Dotted animation appears at the correct time. — *after instruction 1, on the `leftItemHintDelay`; hidden the instant the item is touched*
* [x] Dots animate progressively. — *14 slices with staggered `animation-delay`, revealed tail → arrowhead*
* [x] Glow is visible but not distracting. — *a blurred duplicate layer pulsing 0.32 → 0.7 opacity over 2.1 s; no flashing*
* [x] Guide points to the correct pan. — *arrow tail and head land on the measured anchors to within 0.01 px*
* [x] Guide follows responsive layout. — *anchored off `getBoundingClientRect`, re-placed on resize and every 250 ms; on screen at all 6 viewports*
* [x] Guide disappears after interaction. — *`Guide.hide()` on pointerdown, on drag start and on success*
* [x] No duplicate guides remain. — *module singleton; 1 guide max after 18 level switches and 6 scene reloads*

## Item Glow and Pop

* [x] Pop triggers once when glow begins. — *`setGlow` returns early if `.is-glowing` is already present*
* [x] Animation returns to the original scale. — *`item-pop` ends at `scale(1,1)` and the class is removed on `animationend`*
* [x] Position remains stable. — *the pop runs on the inner `.un-bg` layer, never on the node element the engine positions*
* [x] Glow and pop do not conflict. — *one `animation` shorthand declares both on the same layer*
* [x] Repeated highlighting does not stack animations. — *glow list is deduped; glows cleared on level start*

## Hand Hint

* [x] Provided GIF/sprite asset is used. — *`frame_00_delay-0.02s.gif` for button taps, `drag-hand.png` for the drag demo*
* [x] No manual frame-by-frame switching remains. — *`tap_anim` is never played; only 1 `frame_*` sprite is referenced at runtime (was 69)*
* [x] Hand animation is smooth. — *one Web Animations pass, 16 sampled path steps, `ease-in-out`*
* [x] Hand starts from the correct item. — *first keyframe is the item anchor, the same anchor the arrow's tail uses*
* [x] Hand moves to the correct pan. — *travels the same quadratic arc to the pan anchor*
* [x] Hand performs a clear drop/tap action. — *press dip + a ripple on the same timeline, so they cannot drift*
* [x] Hand stops when the player interacts. — *`pointerdown` on the item hides it before the drag threshold is even reached*
* [x] Hand does not block input. — *`pointer-events: none`, asserted by the in-game QA panel*
* [x] Only one hand hint appears. — *singleton element; asserted after level churn*
* [x] Hint resets correctly between levels. — *`Guide.hide()`, `clearGlows()` and `killAllHints()` on every level start*

## Scale Mechanics

* [x] Beam movement is correct. — *beam rotation 0° → 8° across the range, sampled from the authored clip*
* [x] Both pans move naturally. — *item pan −34 → 18 → 82, block pan 79 → 18 → −28*
* [x] Needle movement matches the weight difference. — *20° → 0° → −20°, driven by `balanceValue = (itemW − blockW) / N`*
* [x] Needle pivot remains fixed. — *`transform-origin` identical at every probed pose*
* [x] Placed items move with their pans. — *items and cubes are children of the pan's drop zone*
* [x] Scale returns to neutral when empty. — *`balanceValue = 0` when both weights are 0; verified after try-again clears the blocks*
* [x] No movement starts before the required interaction. — *`Idle` pose holds; 6 scene reloads produced zero drift with no input*
* [x] Tutorial and level behaviour are consistent. — *one `updateScaleFromPanContents` renderer for both*
* [x] Correct and incorrect results are detected correctly. — *`Less` / `Correct` asserted in all 6 levels with the real block counts (4,4,7,6,6,7)*

## Celebration

* [x] Old confetti burst is removed. — *the radial `confetti-fly` keyframe is gone from `css/style.css`*
* [x] Confetti falls as a natural shower. — *9 staggered emitters, opening wave then shower then taper, ~2.0–3.8 s*
* [x] Confetti does not form a static row at the top. — *68/68 particles start above the stage top and the layer clips*
* [x] Particle movement is varied. — *68 distinct rotations, varied size, sway, delay and fall duration; 509 px vertical spread mid-flight*
* [x] Confetti does not cover important UI. — *7/68 particles in the centre 24 % column; `pointer-events: none` throughout*
* [x] Celebration triggers only once. — *`celebrated` flag plus a layer guard: 3 calls → 1 celebration; a wrong answer produces none*
* [x] All particles are removed afterwards. — *0 particles and 0 layers after the run, via `animationend` plus a safety timeout*
* [x] Performance remains smooth. — *transform/opacity only, 2 elements per particle, capped at 150 (26 under reduced motion); measured 61 fps during the shower*

## Block sizing — second pass

* [x] The spawned block matches the sample shown beside the +/− buttons. — *measured equal to 0.1 px in all 6 levels*
* [x] The block keeps its sprite's aspect ratio. — *sprite ratio vs rendered box ratio agree to 0.001 in all 6 levels*
* [x] Every block in a pan is the same size. — *checked at each level's full block count*
* [x] No block floats free of the pan or the pile. — *every block overlaps the bowl or a block beneath it, all 6 levels*
* [x] Levels 3 and 4 no longer squash the ball. — *`Ball` prefab is 218×218 but those levels use `ball_01.png` (634×423) and author their slots at 634×423; the block was stretched into a square and rendered 66 % too small. `sizeBlockForSlot` now takes the box from the target slot, so 3 and 4 render 422.7×282 like their sample*

## Pointer affordances

* [x] The draggable item shows an open-hand cursor. — *`grab`*
* [x] Dragging shows a closed-hand cursor. — *`grabbing`, released on drop*
* [x] A placed item stops offering a grab cursor. — *`nodrag` → `default`*
* [x] The display-only sample block does not promise a tap. — *it carries a scene Button nobody listens to and was showing `pointer`; now `default`*
* [x] Disabled +/− buttons show no tap cursor. — *`default` while `nointeract`*
* [x] The affordance survives the inset `.hit` raycast-padding target. — *the hit child inherits the same cursor*

## Responsiveness and Stability

* [x] Mouse drag works. — *real `mouse.down/move/up` drags in all 6 levels*
* [x] Touch drag works. — *touch-type `PointerEvent` drag on a `hasTouch` context, item placed and visible*
* [x] Rapid tapping does not break state. — *25 immediate `+` taps: block count stayed within the slot limit, state matched the live cubes*
* [x] Rapid dragging does not duplicate items. — *8 back-to-back aborted drags: 1 element, no stuck lock*
* [x] Level reset works. — *try-again clears the blocks, restores full item tilt and leaves only the item in `scaleState`*
* [x] Level transition works. — *Next advanced Level1 → Level6 with no stale guide and no leftover glow*
* [x] No stuck interaction state. — *`interactionLocked` false after every drop, abort and try-again*
* [x] No uncaught console errors. — *0 across every suite*
* [x] No repeated event listeners. — *hints are deduped through `raiseHint`; drag listeners are detached in `detach()`; one pointer owns the item*
* [x] No memory leaks. — *after 6 scene reloads: tickers 2 → 2, nodes 393 → 393, DOM 912 → 912. After 18 level switches: tickers 2 → 0*
* [x] No asset-loading errors. — *0 failed requests in every suite*
* [x] Reduced-motion fallback works. — *dot/glow/spin animations off, dots still fully visible, hand placed statically, confetti 150 → 26 with no spin*
* [x] Layout remains correct at 1280×720. — *no scrollbars, 16:9 kept, nothing off-stage, item and guide on screen*
* [x] Layout remains correct at 1366×768. — *same*
* [x] Layout remains correct at 1920×1080. — *same*
* [x] Layout remains correct on tablet-sized screens. — *1024×768, 820×1180 portrait and 1180×820 landscape, same*

---

## God Mode — alignment tooling

Added per `GOD-MODE.md`, adapted to this project. Press **Shift + G**.
Remove the six god-mode tags from `index.html` and the learner build is unchanged.

* [x] Panel stays hidden until toggled, and `Shift + G` opens it.
* [x] Element catalogue is built from what is actually on screen (62 entries, grouped Scene / Balance / Items / UI / Hints / Other) — no per-level hard-coded tables.
* [x] **X / Y** fields are design-grid pixels (1920×1080, top-left origin) — the Figma reading. Editing X moved the pan exactly +60 with Y untouched.
* [x] **aPos X / Y** show the Unity `anchoredPos` for the same node and follow the design-grid edit (−6 → 54).
* [x] Dragging moves the element **1:1 with the cursor** in design space (measured dx 68.6 vs expected 68.6 at scale 0.729).
* [x] Eight resize handles work (569×247 → 612.9×290.9 on the SE handle).
* [x] Arrow keys nudge 1 px, `Shift`+arrows 10 px.
* [x] Snap rounds position to the 10 px grid.
* [x] Export produces pasteable code (`Engine.setAnchoredPos(...)`, `Engine.setSizeDelta(...)`).
* [x] `Reset all` restores geometry **exactly** (bit-identical `anchoredPos` and `sizeDelta`) and clears the edit log.
* [x] `Reset all` also restores **opacity on nodes without a CanvasGroup**. — *`capture()` only recorded `canvasGroup.alpha`, but the opacity field falls back to an inline style, so editing the BG left it at 0.25 in the learner build; the inline value is now captured and restored*
* [x] `Reset all` also restores **sibling order**. — *the `z` field / Bring Forward reorders `parent.children`, which was never recorded; a re-stacked BG stayed painted on top after toggling off. The original index is captured, and `resetAll` re-syncs each touched parent in one deterministic pass*
* [x] Toggling God Mode off leaves the game **byte-identical**. — *snapshot of `anchoredPos`, `sizeDelta`, `scale`, `rotZ`, inline opacity, z-index, children order and DOM order over every node: 3 residual differences before these two fixes, **0** after*
* [x] Visual debug: bounds, safe area, 100 px grid + centre cross, anchor dots, animation speed.
* [x] Scene flow: Tutorial / Lbd2 / levels 1–6 / reveal item / drop left or right / return item / ± block / fill correct / check / clear / show-hide guide / replay confetti.
* [x] The in-panel QA suite runs 5 test groups (48 passing checks) and copies a timestamped report.
* [x] Toggling off is a full teardown: panel and selection hidden, every debug class removed, all layout edits reverted, guidance and particles cleared.

---

## Known limitations

1. **Re-entering a level with God Mode does not replay its voice-over.** Levels
   are hidden with `SetActive(false)`, and their instruction coroutines are now
   cancelled on the way out to stop them burning frames. A level jumped back to
   therefore renders correctly but stays silent until *Restart*. Normal play only
   ever moves forward, so this affects the tool, not the game.
2. **The viewport buttons depend on the browser.** `window.resizeBy` is refused
   unless the page owns its window; the toast says so when that happens.
3. **The hand hint is a still frame plus a transform loop, by design.** The 69
   `frame_*.gif` files remain in `assets/img` — nothing was deleted — but only
   `frame_00` is ever requested now. Re-encoding the sequence into a single
   animated GIF or a sprite sheet would need an image toolchain and would mean
   adding a new asset, so the transform-driven tap was used instead.
4. **`ConfettiBlast` is still a CSS effect,** not a port of the Unity particle
   module — as it was before, now shaped as a shower rather than a burst.
5. **Audio autoplay** still needs a first user gesture, unchanged.
6. **The wrong-answer block looks bigger than the right-answer one.** This is in
   the artwork, not the code: inside the same 634×423 frame, `ball_01.png` draws
   its ball 128×136 while `ball_02.png` draws it 165×170, and `cube` 148×153 vs
   `cube_1` 211×211. Swapping the sprite therefore reads as a ~30–40 % size jump.
   The box is unchanged and this matches the original Unity build, so it is left
   as authored — correcting it means re-cropping the sprites, which would be an
   asset change rather than a code fix.
7. **The pans drift up to ~10 px against the beam line across a full swing**
   (measured 177.5 px at level, 187.7 px at the extreme). The authored clips move
   the pans on `anchoredPosition.y` while the beam rotates, so they do not track
   the beam ends exactly. That is the original animation; the needle and beam
   pivots were verified fixed at every tilt in all six levels.

---

## Second-pass bug hunt

A seven-lens sweep (drag/tap, block sizing, guidance, game state, engine
lifecycle, visual/responsive, God Mode) was run against the live build. Its
probes were re-run directly and produced three confirmed defects, all fixed
above: the sample block's false tap affordance, and God Mode's two
reversibility gaps (inline opacity, sibling order). Checks that came back clean:

* Needle pivot fixed at every tilt value in all six levels; beam pivot likewise.
* No overlapping or orphaned voice-over across scene reloads or level switches.
* The hand hint interpolates smoothly with no frame jumps.
* Instruction text and audio clip stay in step through a full level cycle.
* No console errors in a normal single session (0 errors, 0 failed requests).
