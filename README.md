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

| blocks (of 4) | balanceValue | left pan | right pan | needle |
|---|---|---|---|---|
| 0 | 1.00 | −34.0 | 79.0 | 20° |
| 1 | 0.75 | −28.8 | 72.9 | 18° |
| 2 | 0.50 | −23.6 | 66.8 | 16° |
| 3 | 0.25 | −18.4 | 60.7 | 14° |
| 4 | 0.00 | 18.0 | 18.0 | 0° |
| 5 | −0.25 | 62.8 | −14.2 | −14° |

*(Which pose a block count maps to was changed again in the fourth review, so
that one block out is unmistakable rather than 1–3° from level — see “Being one
block out now looks wrong” below. The table above is the current mapping.)*

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

## Fixed in this revision (fourth review)

**1. Artwork that answered a tap.** The bar says *"Tap the + button to add
blocks!"* and then the block beside the buttons responds to a click — pointer
cursor, press flash — while doing nothing whatsoever. The block is not the
problem. Unity attaches a `Button` to a great deal of scenery in these two
scenes, and this port was handing every one of them the full control treatment.

Counted across both scenes there are **162 Buttons, and 34 of them do anything**:

| | |
|---|---|
| real controls (+, −, Check, Next, Try Again, Let's Go, the intro) | 34 |
| the draggable item — never clicked, but it owns its own drag | 6 |
| alpha-0 slot markers parented inside the two pans | 88 |
| the `Start Items` copies of the item, the sample block and the + / − | 24 |
| the sample block beside the + / − — 6 levels **and** the tutorial | 7 |
| the tutorial's book, the tutorial's `−`, level 6's unused Next | 3 |

The rule is now stated once, in `Engine`: **a `Button` is a control only while
something is listening to it** — an inspector-wired persistent call, or a
runtime `addClickListener`. Anything else is `setPassive`, which drops the node
out of hit testing altogether, so a tap falls straight through to the artwork
behind it: no cursor, no press flash, no click. Nothing moves and nothing
changes size. It is re-evaluated whenever either of those changes, so a level
that wires itself up on activation goes live at exactly that moment, and a level
that has not been reached yet is inert rather than half-armed.

Three things sit outside that rule and are named explicitly:

- **The draggable item** binds its own `pointerdown`, so `DraggableItem` claims
  the node with `Engine.ownPointer` and the rule leaves it alone. Once the item
  is resting in a pan it is spent — the round is played out on the + and the −
  from there — so it becomes passive then, instead of sitting in the bowl
  flashing under every tap.
- **Spawned blocks.** The `cube` and `Glass_ball` prefabs carry an empty
  `Button` and the `Ball` prefab carries none, so every block the child adds was
  clickable in four levels and inert in two. Both are made scenery the same way.
- **The tutorial's `−`.** It had no listener in the original, so it did nothing
  at all — and it was lit from the first block onward regardless, which is a
  control inviting a tap it cannot answer. **It now removes a block**, the way
  the six levels do: the pile re-centres, the pans ease back by exactly the step
  the block put in, and the block animates home to the sample it came from. It
  can only ever run at one or two blocks — at three, `onPlusButtonClicked`
  disables both buttons and hands over to `BallAnimation` and Check, and that
  clip is one-way, so the scripted sequence is never re-entered backwards.

God Mode is unaffected — cursor edit outranks the inline `pointer-events` with
an `!important` rule, so scenery can still be picked off the screen, and the
bounds overlay draws inert Buttons grey instead of pink.

**2. The title voice-over has a button.** The start screen is authored as one
full-screen `Button` whose only job is `Play()` on the Intro's own
`AudioSource`. The title line was therefore reachable but invisible: nothing
said it was there, and a child who missed it had no way to ask again. There is
now a speaker button in the **top-left corner** — press to play, press again to
stop, waves animate while it speaks, and a ring breathes around it until it has
been used once. It drives that same `AudioSource`, so the authored `Stop()` on
**Let's Go** still applies and two copies of the line can never overlap. It is a
real `<button>`, so Enter, Space and assistive tech work; it lives in the
stage's overlay layer, so it letterboxes and scales with the board; and it is
taken down, with the clip, the moment Let's Go is pressed.

**3. Buttons answer the mouse now.** Unity's `ColorTint` transition only fires
on *press*, so hovering **Next** or **Try Again** did nothing at all: with a
mouse there was no way to tell them from the artwork around them until you had
already clicked. Every live control now lifts and brightens under the pointer
(`scale 1.05`, `brightness 1.07`) and pushes back down on press (`scale 0.96`,
`brightness 0.92`), over 0.13 s. That is all six levels' **Next**, **Try
Again**, **Check**, **+** and **−**, plus the tutorial's, **Let's Go** and the
new title-voice button — one rule, no per-button styling.

Three things it deliberately does *not* do:

- **It never writes `transform`.** `applyLayout()` owns that property on every
  `.un` and rewrites it on any relayout, and Let's Go has a scale tween writing
  to it every frame — a hover in `transform` would be wiped or would fight the
  RectTransform. The independent `scale` property composes with `transform`
  instead, about the same pivot, and degrades to brightness-only where it is
  unsupported. The transition list omits `transform` for the same reason:
  easing it would turn every relayout into a slide.
- **It never fires on a touchscreen.** Hover is behind
  `@media (hover: hover) and (pointer: fine)`, because on touch `:hover` sticks
  after a tap and would leave the last button pressed looking permanently lit.
  The press feedback is outside that query, so touch still gets its own.
- **It never lights up something that cannot be used.** Four exclusions, each
  measured rather than guessed: `.nointeract` (a button the game has switched
  off — a greyed `+` at the block limit), `.passive` (scenery), `.backdrop`
  and `.draggable`. The last two are the same bug living somewhere else, and
  are worth spelling out:

  **The start screen is a Button the size of the screen.** `Intro` is anchored
  `0,0 → 1,1`, so the whole 1920×1080 picture is a control whose only job is
  `Play()` on the title line. A hover rule applied to it would have zoomed and
  brightened the *entire screen* whenever the mouse was anywhere on it — which
  is always — and it was already dimming the whole picture on every tap, and
  showing a pointer cursor over every pixel. `wireButton` now marks any Button
  covering half the canvas or more as a backdrop: no cursor, no feedback. It is
  a measurement, not a list — the largest real control in either scene is Let's
  Go at **8.5%** of the canvas, so the 50% threshold cannot catch one.

  It no longer answers taps at all, either. That full-screen button's only job
  was `Play()` on the title line, which made the whole banner a hair-trigger:
  a tap anywhere — reaching for Let's Go, steadying the tablet, a stray finger —
  restarted the line over whatever was already speaking. The voice-over button
  takes that job over and switches the backdrop off, but only once it is
  actually on screen, so a missing clip leaves the authored behaviour as the
  fallback rather than making the line unreachable.

  **The draggable item carries a Button too, and its `interactable` flag is
  inconsistent in the source data** — `0` in levels 1 and 2, `1` in levels 3 to
  6. Leaving it to the button rule would have given four levels a hover pop and
  press dim and the other two nothing at all. It is excluded and given its own
  rule keyed on the engine's own drag state, so all six behave identically: a
  gentler `scale 1.03` lift that says *pick me up*, and it holds still once the
  drag begins, because in flight the item has to read at its true size for the
  child to judge whether it fits the pan.

Under `prefers-reduced-motion` the brightness stays and the movement goes. God
Mode holds buttons and the item still while it is open, so a hover pop can never
land in a measurement.

**4. The cursor now tells the truth, and there is a test that says so.** The
same 128 Buttons that were answering taps were also claiming a **hand cursor**,
which is what made the balance arms, the pans and the whole start screen look
directly clickable before the child had done anything. Resolving the cursor for
every node in both scenes, across all six levels and the tutorial:

| | wrongly showing a hand |
|---|---|
| before | **115 nodes** |
| after | **0** |

Almost all of it was the 88 alpha-0 slot markers parented inside the two pans —
invisible, but sitting exactly over the plates and arms — plus the intro-row
copies, and the build stamp inheriting `pointer` from the screen-sized backdrop
Button behind it. Nothing new was needed to fix it: passivity and the backdrop
rule already covered every case. What was added is the guarantee:

- The board now **states** its baseline, `#stage { cursor: default }`, instead
  of relying on the absence of a rule. `cursor` inherits, so a single stray
  declaration higher up would otherwise put a hand over the entire game. It sits
  on the stage rather than on `.un`, so a button that ever gains a child label
  still passes its own cursor down to it.
- God Mode has a **Cursors** check (`qa.cursors()`, and part of *Run all*). It
  reads the cursor the browser actually resolved for every visible node and
  fails on any hand that is not a Button with a listener or an item that can
  still be picked up. It runs last in the suite, straight after the placement
  test has dropped an item into a pan, so it also proves a spent item stops
  advertising a drag.

The one hand that stays is `grab` on the item while it is waiting to be placed
— it is dragged, that is the whole mechanic, and `grab` is the cursor that says
so. It is a different cursor from `pointer`, it appears only once the bar has
asked for the item, and it is gone the moment the item is in a pan.

**5. Being one block out now looks wrong.** With 7 blocks needed, 8 blocks and
7 blocks were the same picture: **1.1° of needle** between them, out of a
possible 20°.

The cause is a curve, not a constant. Every curve in `Scale_LeftDown` /
`Scale_RightDown` is two keys with zero tangents, so the authored pose at clip
fraction *t* is exactly `smoothstep(t) = 3t² − 2t³` of the way from level to the
extreme — and smoothstep is **flat at both ends**. Sampling it at the raw weight
ratio put the one reading the child actually has to make in the flattest part of
the curve: one block out of seven is a ratio of 0.143, which smoothstep
collapses to 0.055.

So the **pose** is chosen first now, and the clip time is derived from it by
inverting the smoothstep (exact in closed form for a two-key zero-tangent
curve). Any imbalance at all leans at least `TILT_MIN = 0.6` of full tilt:

| blocks (of 7) | needle | left pan | right pan | | needle **before** |
|---|---|---|---|---|---|
| 0 | 20.00° | −34.0 | 79.0 | | 20.00° |
| 1 | 18.86° | −31.0 | 75.5 | | 18.89° |
| 2 | 17.71° | −28.1 | 72.0 | | 16.03° |
| 3 | 16.57° | −25.1 | 68.5 | | 12.13° |
| 4 | 15.43° | −22.1 | 65.1 | | 7.87° |
| 5 | 14.29° | −19.1 | 61.6 | | 3.97° |
| 6 | 13.14° | −16.2 | 58.1 | | **1.11°** |
| **7** | **0.00°** | **18.0** | **18.0** | | 0.00° |
| 8 | −13.14° | 60.1 | −12.2 | | **−1.11°** |

The comparison in the report — 8 balls against 7 — goes from **1.1° to 13.1°**,
a **12×** difference, and the last block now swings the pan 34 units instead of
3. One block out lands at **14.0°** (levels 1–2), **13.3°** (levels 4–5),
**13.1°** (levels 3, 6) and **14.7°** (tutorial), against the 12°–15° asked for.
Too many blocks leans the other way by the same amount, so *too few* and *too
many* are opposite pictures rather than two shades of almost-level.

Three properties are kept:

- **Every block still moves the balance**, which is what an earlier review
  asked for. It moves it by an *equal* step now — 1.1° a block at N=7 — where
  before the steps ran 1.1 · 2.9 · 3.9 · 4.3 · 3.9 · 2.9 · 1.1 and spent all
  their travel in the middle of the count, where nothing is being decided.
- **The authored poses are untouched.** Pose 0 is exactly level (18/18, needle
  0°) and pose 1 is exactly the authored extreme (−34/79, needle 20°, beam 8°).
  Only which pose a given block count maps to has changed.
- **The tween interpolates the pose, not the ratio.** `tiltPose` has a
  deliberate step at balance, and easing the ratio through it would hold the
  beam tilted for the whole tween and snap it flat on the last frame. Easing the
  pose lets the final block carry the beam all the way down.

The tutorial uses the same mapping, where it matters just as much: counting to
three, the moment the balance actually balanced used to be the *least* visible
of the three steps (5.2°, against 5.2° and 9.6° for the two before it). It is
now 14.7°, against 2.7° each.

**6. The press highlight is decided in one place, and tested by pressing.** The
block's tap flash was the `ColorTint` press tint arriving on a `Button` nothing
listens to — the same root cause as **1**, and it goes away with it. Two things
were tightened on top:

- **Scenery never takes the class at all now.** The exclusions used to live only
  in the stylesheet, so a `pressed` could sit on a node that had no business
  reporting a press and wait for some future rule to render it. `wireButton`
  applies the same four tests the hover rule does — passive, backdrop,
  pointer-owned, non-interactable — before the class is added. Audited across
  both scenes: **33 nodes can take a press highlight and all 33 are real
  controls**; nothing else can, in any state.
- **A cancelled touch no longer sticks.** `pressed` was removed on `pointerup`
  and `pointerleave` but not on `pointercancel`, which is what a system gesture
  or a stylus switching devices fires *instead* of either. A button caught by
  one kept the class for good and sat there dimmed and shrunk. Latent rather
  than reported, and in exactly this family, so it is fixed here.

God Mode gains a **Press** check (also in *Run all*) that drives the report's own
repro: it finds the sample block, asserts it takes no pointer events, asserts a
tap at its centre lands on the counter behind it, then dispatches a real
`pointerdown` there and asserts the block's computed `filter`, `scale` and
`opacity` are byte-identical before, during and after — and that no node
anywhere is left holding a press state.

**7. A + or − now looks usable exactly when it is.** A level opens on *"Place
the orange on the balance"*, and until that is done neither button can do
anything — but both sat there in full blue. The cause was a method whose whole
job was to decouple the two: `setPlusMinusInteractableOnly` switched the buttons
off while explicitly forcing their alpha back to 1. It is gone, and its two call
sites ask for a genuinely disabled button instead. Level start dims them too;
before, `start()` set `interactable = false` and never touched the alpha at all.

The same defect was hiding in **Try Again after too few blocks**: that path
called `enablePlusMinus()`, which lights *both*, having just emptied the pan —
so `−` came back in full blue with nothing to remove and `removeCube()`
returning on the spot. It now goes through `updatePlusMinusState()`, which
judges each button on its own merits.

| | + | − |
|---|---|---|
| level opens, *"Place the orange…"* | dim | dim |
| item dropped, instruction 3 reading | dim | dim |
| instruction 3 finishes | **blue** | dim |
| first block added | **blue** | **blue** |
| block limit reached | dim | **blue** |
| Check pressed | dim | dim |
| Try Again, too few | **blue** | dim *(was blue)* |

A switched-off control **fades**: it keeps its own colour and simply recedes.
Draining the colour to grey was tried first and rejected on review — it read as
a different, broken-looking button rather than as the same one waiting its turn.

The fade depth is now one number for the whole game, `DISABLED_ALPHA = 0.4`,
because it is the *only* signal that a button is unavailable and so has to be
unmistakable and identical everywhere. The scenes disagreed: Level 1 authored
`0.6`, levels 2–6 `0.4`, the tutorial `0.5`, so a disabled button was visibly
more present in Level 1 than in the level after it, and changed again between
the tutorial and Level 1. `0.4` is the majority value and the clearest of the
three. Switching on eases rather than cutting, so the moment the child earns the
button reads as it coming back to life.

## Fixed in the third review

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

Level 6's instruction 7 also reads "Tap the **+** to reduce the marbles!" where
the other levels say "−"; the audio clip is the minus one. The **+**/**−** slip
is used exactly as authored.

The authored text spelled it "marbels" throughout the two marble levels —
Level 2 (the orange) and Level 6 (the cup) — that is corrected to "marbles" in
`js/data.js`, in both the node graph and the `WeightGameTutorialController`
block, which each carry their own copy of the strings. The two audio files are
still named
`tap_the_plus_button_to_add_marbels_.ogg` and
`tap_the_minus_button_to_reduce_the_marbels.ogg` on disk, so those paths keep
the old spelling. Re-extracting `data.js` from Unity will bring the typo back
unless it is fixed upstream too.
