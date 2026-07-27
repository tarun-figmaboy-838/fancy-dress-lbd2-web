# The Fancy Dress Competition — How Many Blocks? (static web build)

A dependency-free HTML/CSS/JS rebuild of the Unity project **Fancy Dress Lbd2**.
No Unity, no WebGL build, no frameworks, no build step. Deploy the folder as-is.

```
index.html
css/style.css
js/data.js          extracted scene trees, configs, animation curves, prefab templates
js/engine.js        uGUI-compatible runtime (layout, CanvasScaler, Animator, audio, tweens)
js/controllers.js   the four MonoBehaviours, ported one function each
js/main.js          scene bootstrap, asset preloader + SceneManager equivalent
god-mode/           developer / design-review layer — fully removable, see GOD-MODE.md
.github/workflows/  GitHub Pages deploy (strips god-mode from the published build)
QA_CHECKLIST.md     verified QA results for this revision
assets/img          sprites (WebP)
assets/audio        voice-over clips (Vorbis .ogg)
assets/fonts        LilitaOne-Regular.ttf
```

## Run it

```bash
python3 -m http.server 8000     # then open http://localhost:8000
```

Vercel / Netlify / GitHub Pages: drop the folder in, no configuration. It also
runs from `file://` (data is embedded, never fetched), though a local server is
better for audio autoplay policy.

## Publish

```bash
gh repo create fancy-dress-lbd2 --public --source=. --push
```

Then **Settings → Pages → Source: GitHub Actions**. Every push to `main` runs
`.github/workflows/deploy.yml`, which deletes the `god-mode/` layer and its
`<script>` tags from the published copy, verifies that every asset a scene
references exists, and deploys. The learner build that goes live therefore
carries no developer tooling.

## Payload

The whole game is **2.1 MB**, down from 13.3 MB:

| | before | after | |
|---|---|---|---|
| sprites | 9.45 MB PNG/GIF | **0.89 MB** WebP | −90.5% |
| audio | 2.17 MB mixed mp3/ogg | **1.21 MB** Vorbis ogg, mono 24 kHz q3 | −44% |
| dead hand frames | 0.52 MB | **0** | removed |

Every sprite is decoded behind a boot screen before the game appears, so there
is no pop-in and scene or level changes are instant afterwards (~360 ms to
ready on localhost).

## Devices

The board is authored 1920×1080 and letterboxed to fit, sized from
`visualViewport` so a collapsing mobile URL bar cannot make it jump, and inset
by `env(safe-area-inset-*)` so a notch never covers the balance. Verified with
no scrollbars and nothing off-stage on 13 profiles from a 653×280 folded phone
to a 2560×1080 ultrawide. Portrait **phones** get a rotate-to-landscape prompt;
portrait tablets get the game, since there is enough width to play.

## The game

A cube-counting balance puzzle, quite different from Lbd1. The child drags one
item onto either pan, then uses **+** / **−** to add or remove blocks on the
opposite pan until the balance evens out, then presses **Check**.

| Level | Item | Blocks needed | Cube prefab |
|---|---|---|---|
| 1 | toy boat | 4 | Ball |
| 2 | orange | 4 | Glass ball |
| 3 | watermelon | 7 | Ball |
| 4 | pumpkin | 6 | Ball |
| 5 | shoe | 6 | cube |
| 6 | cup | 7 | Glass ball (last level → game over panel + final VO) |

Plus a `Tutorial` scene: a guided three-block demo with an animated hand, then
hand-off to the main scene.

## What was ported

| Script | Instances |
|---|---|
| `WeightMeasuringGame` | 6 |
| `WeightGameTutorialController` | 6 |
| `DraggableItem` | 12 (6 draggable items + 6 non-draggable cube samples) |
| `BasketDropZone` | 12 |
| `TutorialManager` | 1 |
| `ButtonAnimator` | 1 |

Scene node counts: `Tutorial` 57, `Lbd2` 396.

**Level progression** has no script behind it — the original wires it through
inspector `OnClick` persistent calls (`SetActive(false)` on the current level,
`SetActive(true)` on the next). All five transitions were extracted and are
replayed by the same mechanism.

## Things that needed care

**Runtime `Instantiate()`.** Unlike Lbd1, this game spawns objects that never
appear in the scene YAML: the cube prefab (three variants) and the hint-hand
prefab used for the +, −, Check, Next and Try Again hints. Those prefab subtrees
are extracted whole into `window.TEMPLATES` and cloned at runtime with fresh
ids, then positioned from the target's world position. Verified: a spawned hint
lands on its target at dx = 0, dy = 0.

**Stale serialized fields.** Several `DraggableItem` components still carry
fields from an older version of the script (`itemData`, `itemImage`,
`tutorialController`, `leftBalanceImage`, `dragLayer`) alongside the current
ones, and some are missing `isCube` / `snapDistance` entirely. Unity ignores
unknown keys and falls back to the C# initializer for missing ones, so every
field read here does the same (`isCube` → false, `snapDistance` → 150).

**Animation names come from the scene, not the code.** The C# defaults say
`Scale_LeftToIdle` / `Scale_RightToIdle`, but the serialized values are
`Scale_LeftToBalance` / `Scale_RightToBalance`. Reading the defaults would have
silently broken the return-to-balance animation.

**The balance moves one block at a time (changed from the original).** The
authored clips are used, but not as whole swings. In the original,
`UpdateScaleDynamically()` only re-plays a 0.75 s animation when the heavier
*side* flips — so with 4 blocks needed, blocks 1, 2 and 3 move the pans not at
all and block 4 swings them all the way across in one jump. Here the tilt is a
continuous value driven by the block count and rendered by sampling the very
same `Scale_LeftDown` / `Scale_RightDown` curves at a *fraction* of their
timeline, so every block visibly moves the balance closer to level:

| blocks (of 4) | tilt | left pan | right pan | needle |
|---|---|---|---|---|
| 0 | 1.00 | −34 | 79 | 20° |
| 1 | 0.75 | −25.9 | 69.5 | 16.9° |
| 2 | 0.50 | −8.0 | 48.5 | 10.0° |
| 3 | 0.25 | 9.8 | 27.6 | 3.1° |
| 4 | 0.00 | 18 | 18 | 0° |
| 5 | −0.25 | 27.9 | 10.9 | −3.1° |

Removing blocks reverses it just as smoothly. No fidelity is lost in the poses:
sampling `Scale_LeftDown` at fraction *f* produces exactly the pose
`Scale_LeftToBalance` gives at (1 − *f*), and the extreme poses (0 and 1) are
identical to the original's. `Scale_LeftToBalance` / `Scale_RightToBalance` are
therefore no longer played directly; they are redundant with the down clips.

Two related consequences, both improvements:
- **Check no longer re-swings the pans.** The tilt already shows which side is
  heavier, so a wrong answer leaves it where the block count put it instead of
  slamming to a hard stop.
- **Reset returns the pans to the zero-block position.** The original left them
  frozen wherever the failed attempt ended.

**CanvasScaler.** `ScreenMatchMode.MatchWidthOrHeight` with `match = 0.5`, so
the scale is the log-space blend `exp(lerp(log sw, log sh, 0.5))` and the canvas
rect is resized to `screenSize / scale` on every resize. A hardcoded
`min(sw, sh)` would misplace everything anchored away from centre.

**Sprites.** All images are draw type Simple with white tints (one at alpha
0.992), so no atlas crop rects, no `border-image`, and no Linear-space tint
conversion — the project is Linear but with no non-white tints it makes no
difference. 14 images use `preserveAspect` and are rendered with
`background-size: contain`. 7 carry non-zero `raycastPadding`, reproduced with
an inset pointer target so taps match the artwork rather than the transparent
box.

## Size and alignment — measured, not eyeballed

Unity's `RectTransform` layout was re-implemented independently in Python and
compared against the browser's actual DOM rectangles for every node with all
six levels active:

- **259 nodes compared — maximum positional error 0.023 px**
- 23 nodes differ by more than 0.01 px, all around 0.02 px (browser sub-pixel
  rounding, not a layout error)
- Separately, 5 scaled nodes checked for size: **0 mismatches**
- Nothing renders off-stage on any of the 6 levels

CanvasScaler verified exact at 1920×1080, 1366×768, 1024×1366 and 820×1180
(the last two portrait).

## Known approximations

1. **`ConfettiBlast` particle system** — the correct-answer burst is a CSS
   particle effect placed at the particle object's position, not a port of the
   Unity particle module settings.
2. **Ghost-hint path easing** — the original is a DOTween `Sequence` with
   `SetEase(InOutSine)` across the whole sequence timeline; here the ease is
   applied per path segment. The Catmull-Rom path, arc offset, 1.2 s duration,
   0.3 s hold and infinite loop all match.

Everything else is driven by extracted data. This is still a second
implementation in a different renderer, so it targets ~95–99% fidelity rather
than pixel-identity.

## Verification performed

Headless Chromium 141:

- Tutorial scene end to end: Let's Go → instructions 1–6 → `BookAnimation` →
  three runtime-spawned cubes → Check → confetti → label → Next → loads `Lbd2`
- Level 1 end to end with a real mouse drag onto the left pan, four cubes added,
  Check → correct, Next → level 2
- Balance poses match the extracted curve values exactly at every step
  (pans −34/79 with needle 20° tilted left; 18/18 with needle 0° balanced;
  82/−28 with needle −20° tilted right)
- **Too few blocks**: `lastResult = Less`, pan tilts left, both cubes switch to
  the wrong-cube sprite, instruction 5 plays, Try Again appears, reset clears
  all cubes
- **Too many blocks**: `lastResult = More`, pan tilts right, Try Again keeps the
  cubes, resets their sprites, plays instruction 7 and spawns the minus hint;
  removing one block returns the scale to balance and Check then succeeds
- All 6 levels start both controllers and lay out with nothing off-stage
- Scene switch Tutorial → Lbd2 leaves **zero stale animators and zero stray
  tweens**; pans and item visibility are stable with no input
- Layout re-audited after the tilt change: **243 nodes, max error 0.0263 px,
  none above 0.05 px**
- **0 console errors, 0 failed requests, 0 missing assets**

## Analytics

`Assets/Plugins/WebGL/TrackingPlugin.jslib` declares five hooks, and as in Lbd1
**no C# imports or calls any of them** — there is no `DllImport` in
`Assets/scripts`. The original build emitted no events and neither does this
one. If you want telemetry, the natural call sites are `checkResult` in
`WeightMeasuringGame` and the level-activation path in `main.js`.

## Fixed in this revision (third review)

Full verified results in [`QA_CHECKLIST.md`](QA_CHECKLIST.md).

**1. `Image.color.a` was rendered as CSS opacity — the real cause of both the
vanishing item and the invisible `Vector_10.png`.** `Node.applyImage()` wrote the
Unity tint's alpha to `el.style.opacity` on the node's own element. CSS opacity
cascades to children; Unity's `Image.color.a` does not — it tints that one
Graphic only. Both balance drop zones (`Image #357859291`, `Image (1) #1007664004`)
and the tutorial's `Hint hand` containers are authored at **alpha 0**, so
*anything* re-parented or instantiated inside them rendered at effective opacity
0 and looked deleted: the dragged item on every drop, the spawned cubes, and the
`Vector_10` arrow. Measured before the fix — item effective opacity **0.0** after
a successful drop on level 1.

The sprite and its alpha now live on a dedicated `.un-bg` layer inside the node.
It paints first, so the parent Graphic still sits below its children exactly as
Unity draws it, and `el.style.opacity` is reserved for `CanvasGroup`, which
really does cascade. Verified: effective opacity **1.0** after the drop in all six
levels, and the tutorial's cube spawn is visible too.

**2. One reusable placement path.** `placeItemInPan` / `removeItemFromPan` /
`returnItemToOrigin` / `updateScaleFromPanContents` replace the per-caller logic.
A drop now preserves the item's screen position across the re-parent and *then*
eases to a rest anchor derived from the pan's own rect, so there is no jump; a
refused drop glides home instead of snapping; and a second release mid-animation
is ignored. The item is never destroyed, only re-parented.

**3. A single source of truth for the balance.** Each `WeightMeasuringGame` owns
`scaleState = { leftItems, rightItems, leftWeight, rightWeight, balanceValue,
interactionLocked }`. Beam, both pans, needle and placed items are all rendered
from one sampled pose of one authored clip, so they cannot disagree. The tilt
value is unchanged: `balanceValue = (itemWeight − blockWeight) / N`, which is
algebraically identical to the previous `tiltTarget()`.

**4. The dotted guidance is the real asset, animated.** `Vector_10.png` is cut
into 14 horizontal slices that fade in one after another from the tail to the
arrowhead, with a blurred duplicate underneath supplying a soft glow pulse —
transform and opacity only. The arrow's tail and head are mapped onto the live
item → pan vector, so it physically connects the two at any viewport size; the
tail/head points were measured from the sprite's own alpha coverage and land on
their anchors to within 0.01 px. A blocked `Vector_10.png` logs a warning naming
the file and falls back to CSS-drawn dots.

**5. The hand hint is no longer a flipbook.** `tap_anim` swapped **69 separate
GIF files** at ~30 fps. It is never played now: button hints use the single
preloaded `frame_00_delay-0.02s.gif` with a CSS press loop, and the drag
demonstration is one Web Animations pass along the same arc as the dotted guide —
appear at the item, travel, press, ripple, fade, repeat only while the child is
idle. The ripple shares the timeline, so the tap cannot drift. Only **1** of the
69 frame files is requested at runtime now; none were deleted.

**6. Glow and pop.** `.is-glowing` and `.item-pop` run on the sprite layer, never
on the element the engine positions, so a pop can never fight a RectTransform
transform. The pop fires once when the glow begins and removes itself.

**7. The confetti burst is now a shower.** Nine staggered emitters across the top,
an opening wave then a shower then a taper over ~2.0–3.8 s, varied size, sway,
spin and fall speed. Every particle starts *above* the stage so no row forms
along the edge, the centre gameplay column is deliberately sparse (7 of 68
particles), and each particle removes itself on `animationend` with a safety
timeout behind it. One celebration at a time, only on a confirmed correct answer.

**8. Level changes no longer leak frames.** Hiding a level with
`SetActive(false)` left its instruction typing, hint delays and tilt tweens
registered. Controllers whose host is no longer on screen are now suspended.
Measured: after 6 scene reloads tickers 2 → 2, nodes 393 → 393, DOM 912 → 912;
after 18 level switches tickers 2 → 0 (was 2 → 12).

**9. God Mode.** A removable developer layer under `god-mode/`, built to
`GOD-MODE.md` and adapted to this project: pick any element from a dropdown or
straight off the screen, read and edit its **X / Y** in design-grid pixels
(the Figma reading) alongside its Unity `anchoredPos`, drag it 1:1 with the
cursor, resize from eight handles, nudge with the arrow keys, snap to a 10 px
grid, then copy a pasteable `Engine.setAnchoredPos(...)` patch. Plus scene-flow
jumps, visual-debug overlays and an in-page QA suite. Delete the six tags from
`index.html` and the learner build is unchanged.

## Fixed in the previous revision (second review)

**1. The board rendered unscaled and spilled off the window — the real "items
vanish" cause.** `#stage` carries the letterbox scale and centring transform,
but the root node's `applyLayout()` also writes to that same element, so every
relayout overwrote `transform` with `''` and reset `left`/`top` to 0. The game
therefore drew at 1:1 from the top-left corner on any window that was not
exactly 1920x1080, pushing the left item, the +/- buttons and the right pan
outside the viewport. Measured at 1024x768 before the fix: 6 gameplay elements
off screen, including the draggable item. `applyLayout()` now leaves the stage
element alone.

**2. Aspect-ratio handling.** The project's CanvasScaler uses
MatchWidthOrHeight with match 0.5, which makes the canvas rect *narrower* than
the authored 1920-wide layout on any non-16:9 screen — at 1024x768 the canvas
comes out 1663 wide and the left item's edge lands at x = -75. That is Unity's
real behaviour, but it silently clips the board. The build now letterboxes the
full 1920x1080 reference canvas so nothing is ever cut off at any ratio. Set
`window.GAME_FIT = 'unity'` before load to restore the original match-0.5
behaviour for comparison.

Verified after both fixes, at 1920x1080, 1366x768, 1024x768, 1440x900,
2560x1080 and 820x1180 portrait: stage correctly scaled and centred,
**zero clipped nodes**, zero console errors.

**3. Dragging the item failed except on a pixel-perfect release.** Two causes.
`BasketDropZone` implements `IDropHandler`, so in Unity releasing the pointer
over a basket accepts the item outright — that path was never implemented,
leaving only the `snapDistance` fallback. And that fallback compared distances
in canvas units while Unity's `snapDistance = 150` is in screen pixels, making
the target roughly 30% tighter at 1366px and worse on smaller screens. Both are
fixed: releasing anywhere over the visible basket now accepts the drop, and the
distance fallback is measured in screen pixels as Unity does. Verified
`dropped = true` at all six viewports above.

**4. A failed drop can no longer lose the item.** `ReturnToOriginalPosition`
reparented to the node captured at `Start()`; if that parent had since been
hidden the item became invisible. It now falls back to the canvas root and
restores its original on-screen position.

## Fixed after first review

Three issues were reported against the first build and are fixed here.

**1. Items vanished mid-play (critical).** `Engine.boot()` did not tear down the
previous scene's runtime, so `Animator` tickers from the Tutorial kept running
after the switch to `Lbd2`. Because fileIDs repeat across the two scenes, the
stale clip's curve paths resolved into the *new* scene's objects: `BookAnimation`
and `BallAnimation` carry `m_IsActive` curves, so they were deactivating live
items, and their pan/needle curves fought the balance animator. Measured before
the fix — with no user input at all, the pans drifted 18/18 → 4.5/34.6 → 18/18
and the dropped item flipped to inactive. `boot()` now stops every animator and
clears every scheduled tween first; verified afterwards as zero drift and zero
stray tickers.

**2. The balance jumped instead of moving per block.** See the table above.

**3. Tutorial guidance.** Verified working: the animated hand appears on the
**+** button and lands on it exactly (dx = 0, dy = 0) with `tap_anim` looping,
then moves to **Check** and **Next** in turn. The earlier report was reproduced
as an observation error in the test harness, not a defect — no code change was
needed, but it is now covered by a regression check.

## One original behaviour worth knowing

Ported verbatim rather than "fixed" — tell me if you want it changed:

**Try Again after too few blocks leaves the instruction bar blank.**
`HandleTryAgain()` calls `ResetAllCubes()`, which sets `lastResult = None`;
`OnTryAgain()` then tests `lastResult == Less`, which can no longer be true, so
the branch that replays instruction 3 and restarts the plus hint never runs. The
child gets a cleared basket and an enabled **+** button but no spoken prompt.
The too-many path is unaffected — it plays instruction 7 and shows the minus
hint correctly.

Level 6's instruction 7 also reads "Tap the **+** to reduce the marbels!" where
the other levels say "−"; the audio clip is the minus one. Text is used exactly
as authored.
