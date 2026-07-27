# QA_CHECKLIST — The Fancy Dress Competition (weighing-scale build)

Every ticked box was **executed in a real browser** (headless Chromium 149) against
this build, not reasoned about. Each line names the measurement that proves it.
Unticked boxes say why.

## Suites

| Suite | What it drives | Result |
|---|---|---|
| `e2e` | all 6 levels: mouse drag → drop → wrong answer → try again → correct → confetti → next | **154** checks, 0 fail |
| `matrix` | touch drag, rapid input, reduced motion, 6 viewports, tutorial | **70** checks, 0 fail |
| `devices` | 13 device profiles, 653×280 → 2560×1080 | **65** checks, 0 fail |
| `fixes` | block sizing per level, confetti, cursor affordances | **41** checks, 0 fail |
| `god` | God Mode: pick, x/y edit, drag, resize, snap, nudge, export, reset, teardown | **32** checks, 0 fail |
| `leaks` | 6 scene reloads + 18 level switches, confetti lifecycle | **18** checks, 0 fail |
| `round4` | hand-on-arrow geometry, glow cue, spoken-word timing | **11** checks, 0 fail |
| `round5` | idle-only hints, tutorial drag integrity | **9** checks, 0 fail |
| `tuttilt` | tutorial balance, per block | **8** checks, 0 fail |
| `fix3` | sample-block affordance, God Mode reversibility | **6** checks, 0 fail |
| | | **414 checks, 0 failures** |

Viewports: 1280×720 · 1366×768 · 1920×1080 · 1024×768 · 1440×900 · 1600×900 ·
2560×1080 · 1180×820 · 820×1180 · 844×390 · 915×412 · 667×375 · 653×280.

---

## 1 · Removed on request

* [x] The `vMT_02_04` build stamp is gone from the intro. — *`hideBuildTags()` blanks the text **and** deactivates any node matching a build-stamp pattern; the string is absent from the DOM, not merely hidden*
* [x] No dotted arrow on a button hint. — *the tap hand on the button is the whole cue; measured `.dot-guide.on === 0` while a button hint is up*
* [x] The arrow is reserved for the one gesture it describes — dragging an item onto a pan.

## 2 · Dotted guidance (`Vector_10`)

* [x] Appears **one dot at a time**. — *35 elements, one per real dot, found by flood-filling the sprite's own alpha; 35 distinct animation delays spanning 1.77 s, tail → arrowhead*
* [x] Each dot pops as it lands. — *scale .3 → 1.5 → 1 on arrival*
* [x] Every dot has a glow. — *a blurred twin layer per dot (35), plus a container pulse 0.5 → 0.9*
* [x] Glow is soft, not flashing. — *1.5–3 s periods throughout; no step changes*
* [x] The arrow physically connects item to pan. — *tail and head land on the measured anchors to 0.01 px, at every viewport*
* [x] Follows the layout. — *re-anchored on resize and every 250 ms*
* [x] Present in the **tutorial** as well as all six levels. — *70 dot elements in the Tutorial scene; anchored plinth → pan*
* [x] Never two guides at once. — *module singleton; verified after 18 level switches and 6 scene reloads*
* [x] Hidden the instant the child touches the item.

## 3 · Hand hint

* [x] The hand rides the drawn arrow. — ***0 px** deviation: every one of the 26 keyframes sits exactly on a drawn dot, because the keyframes are generated from the dot positions through the same transform the CSS applies*
* [x] Starts on the item. — *0 px from the arrow tail*
* [x] Finishes on the pan. — *0 px from the arrowhead*
* [x] Fingertip, not corner, follows the path. — *hotspot (59, 33) measured from `drag-hand.webp`'s alpha*
* [x] One preloaded still frame, never a flipbook. — *`tap_anim`'s 69-image sequence is not played; 1 `frame_*` sprite is referenced at runtime, was 69*
* [x] Does a clear press. — *dip + ripple share one timeline, so they cannot drift*
* [x] Blocks no input. — *`pointer-events: none`*
* [x] Only ever one. — *singleton; `raiseHint` refuses a duplicate*
* [x] **Tutorial drag is correct.** — *the clip's own hand carries the ball and is kept (measured **1 px** from the ball); only the static `Vector_10` copy is replaced, and no second travelling hand contradicts it*
* [x] The tutorial arrow does not chase the flying ball. — *anchored to the stationary plinth with `follow: false`; it used to re-anchor to the moving ball and swing away mid-flight*

## 4 · Blue glow on the block / ball / marble

* [x] **Not on all the time.** — *not glowing at level start; measured off until it is asked for*
* [x] Lit when the child is asked to add blocks. — *on as instruction 3 finishes, and when the idle hint points at `+`*
* [x] Pulses for as long as it is on. — *`item-glow`, infinite, on the halo*
* [x] Goes out the moment they add one. — *`animationName: none` after `setGlow(false)`*
* [x] Follows the artwork's shape. — *a static sprite-shaped `drop-shadow` rim plus a soft halo*
* [x] Cheap. — *the halo animates **opacity only** behind a static blur. Animating `filter` measured 61 → 34 fps with one glowing item; scaling a blurred layer costs the same, so neither is used*
* [x] Repeated highlighting never stacks. — *`setGlow` returns early if already glowing*

## 5 · Pop synced to the voice-over

* [x] Pops land **when the name is spoken**, not before. — *word position × clip length, the same mapping the typewriter uses*
* [x] Parsed from all six lines. — *item at 9.5–10.8 % of the line, block word at 78–86 %, so the order is always item-then-blocks*
* [x] The item pops as the item is named, the blocks as the blocks are.
* [x] Blocks pop in turn, not together. — *gap scaled to the clip's remaining time*
* [x] Works in the tutorial too. — *the label clip has no text line, so the wording is supplied to give the same two cues*
* [x] Nothing pops at the start of the sentence any more.

## 6 · Balance movement

* [x] **The tutorial moves per block, smoothly.** — *tilt 1 → 0.667 → 0.333 → 0; item pan −34 → −20.5 → 4.5 → 18; block pan 79 → 63.2 → 33.8 → 18; needle 20° → 14.8° → 5.2° → 0°*
* [x] It never jumps. — *0.5 s eased tween per block; the pan rises monotonically*
* [x] It finishes exactly level. — *both pans 18/18, needle 0°*
* [x] Same renderer as the six levels. — *one sampled authored curve; the tutorial no longer waits for the last block to swing everything at once*
* [x] The clip keeps its other work. — *`playExcept` runs `BallAnimation` for its visibility curves while the pans are driven per block*
* [x] Beam, pans and needle cannot disagree. — *all three come out of one sampled pose*
* [x] Needle pivot fixed. — *identical at every tilt in all six levels*
* [x] Placed things ride their pan. — *they are children of the pan's drop zone*

## 7 · Blocks in the pan

* [x] Rows are **evenly spaced**. — *level 3: gaps 69.33 / 69.34 / 69.33 and 72.5 / 72.5 — was hand-nudged with up to 20 px of drift*
* [x] Rows are **centred on the pan**. — *row centre 0.00 px*
* [x] Row structure is the level's own. — *row membership and height are read from the slots the level ships; nothing is hard-coded per level*
* [x] No block floats free. — *every block overlaps the bowl or a block beneath it, all six levels*
* [x] Every block is the same size. — *at each level's full count*
* [x] Blocks match the sample beside the +/− buttons. — *equal to 0.1 px in all six levels*
* [x] Aspect ratio preserved. — *sprite ratio vs box ratio agree to 0.001*
* [x] Levels 3 and 4 fixed. — *they reuse the 218×218 `Ball` prefab with a 634×423 sprite; the block was squashed into a square and 66 % too small. The box now comes from the target slot*

## 8 · Item placement

* [x] Visible while dragged over the pan, and after the drop. — *effective opacity 1.0 in all six levels; was 0.0*
* [x] Centred in the pan; does not shrink, jump, flicker or duplicate.
* [x] Screen position preserved across the re-parent, then eased 0.26 s to rest.
* [x] Invalid drops glide home over 0.28 s, falling back to the canvas root if the origin was hidden.
* [x] One `placeItemInPan` serves the tutorial and every level.

## 9 · Idle guidance

* [x] **Nothing is offered until 8 s of stillness.** — *measured: nothing at 5 s, guidance present at 10 s*
* [x] After the tutorial, hints are idle-driven **only**. — *every self-timed hint is gone: the drag arrow, `+`, Check, Next and Try Again all come from one watcher*
* [x] Withdrawn the moment the child acts. — *measured 0 guides after a tap*
* [x] It offers exactly what the current step needs. — *Try Again / Next → Check → drag → `+`*
* [x] It never talks over a voice-over. — *returns false while typing or a clip is playing*
* [x] It backs off. — *8 s, then 12 s, up to 22 s if nothing is appropriate*
* [x] Resets between levels and scenes.

## 10 · Alignment

* [x] Level 5 item corrected to the supplied value. — *`anchoredPos 14.98, 71`, `sizeDelta 634×423`, verified live. The node is named "Watermelon" in the scene but carries the shoe artwork — a stale name from a duplicated object in the original project*
* [x] Corrections live in `js/layout-overrides.js`, not in generated data. — *`js/data.js` stays machine-written; deleting the one file drops every override*
* [x] Values are the ones God Mode reports, so they can be copied straight in.

## 11 · Celebration

* [x] The old radial burst is gone. — *`confetti-fly` no longer exists*
* [x] A falling shower, 15 staggered emitters, opening wave → shower → taper, ~2.0–3.8 s.
* [x] 150 particles (26 under reduced motion). — *raised from 68 on request*
* [x] No static row at the top. — *150/150 start above the stage and the layer clips*
* [x] Centre stays readable. — *18–21 of 150 in the centre 24 % column*
* [x] Fires once. — *`celebrated` flag plus a layer guard; a wrong answer produces none*
* [x] Every particle removed. — *0 particles, 0 layers afterwards*
* [x] Main thread stays responsive during the shower. — *timer slip < 90 ms*

## 12 · Voice-over

* [x] Every instruction line has a clip. — **55 lines, 0 without audio**
* [x] Every clip exists on disk. — *0 missing*
* [x] No clip without a line, no unused audio file. — *49 referenced, 49 on disk*
* [x] Typing tracks clip length.
* [x] No overlap, and the old clip stops on a level or scene change.
* [x] Pops, glow and hints are all timed against the clip, not against wall-clock guesses.

## 13 · Assets and dead code

* [x] Sprites are WebP. — *9.45 MB → **0.89 MB**, −90.5 %*
* [x] Audio is one Vorbis `.ogg` profile, mono 24 kHz q3. — *2.17 MB → **1.21 MB**, −44 %; the two stray `.mp3` files are gone*
* [x] Whole payload **2.1 MB**, from 13.3 MB. — *−84 %*
* [x] The 68 hand frames only the never-played `tap_anim` referenced are deleted, and the clip's frame list trimmed to the one frame used — no dangling reference.
* [x] No unused image or audio file remains. — *0 of each*
* [x] Dead exports removed. — *`Engine.setImageAlpha`, `Engine.pointerToStage`, `Engine.localPointInRect`, `Engine.setImageColor`, `Controllers.isStarted` — all definition-plus-export with no call site*
* [x] Nothing working was deleted. — *414 checks pass after the removals*

## 14 · Responsiveness and stability

* [x] Mouse and touch drag both place the item.
* [x] Rapid tapping and rapid dragging cannot desync state or duplicate anything. — *25 immediate `+` taps; 8 aborted drags*
* [x] Cursor says what each thing does. — *`grab` → `grabbing` → `default` once placed; the display-only sample no longer promises a tap*
* [x] 16:9 held, no scrollbars, nothing off-stage. — *all 13 profiles*
* [x] Portrait phones get a rotate prompt; portrait tablets get the game.
* [x] Mobile URL bar cannot make the board jump. — *sized from `visualViewport`*
* [x] Notches never cover the board. — *`env(safe-area-inset-*)`*
* [x] No leaks. — *after 6 scene reloads: tickers 2 → 2, nodes 393 → 393, DOM 912 → 912; after 18 level switches: tickers → 0*
* [x] Reduced motion gives a lighter, shorter effect and never removes guidance.
* [x] 0 console errors and 0 failed requests in a normal session.

## 15 · Build and deploy

* [x] Boot screen holds until every sprite is decoded, then removes itself. — *ready in ~0.4 s; scene and level changes are instant afterwards*
* [x] `npm run build` produces `dist/` — 107 files, 2.59 MB, 98 asset references all present.
* [x] God Mode is excluded from the learner build, tags and all. — *no `god-mode` string survives; the build fails if one does*
* [x] The built bundle boots clean. — *no God Mode globals, no build stamp, 0 errors, 0 failed requests*
* [x] Vercel configured. — *`vercel.json`: build command, output directory, immutable asset caching, `no-cache` on `index.html`*

---

## Known limitations

1. **The wrong-answer block reads bigger than the right-answer one.** This is in
   the artwork: inside the same 634×423 frame `ball_01` draws its ball 128×136
   while `ball_02` draws it 165×170. The box is unchanged and this matches the
   original Unity build, so it is left as authored — correcting it means
   re-cropping sprites.
2. **The pans drift up to ~10 px against the beam line across a full swing**
   (177.5 px level, 187.7 px at the extreme). The authored clips move the pans on
   `anchoredPosition.y` while the beam rotates, so they do not track the beam
   ends exactly. Original behaviour; the pivots were verified fixed.
3. **Frame-rate numbers from the harness are not absolute.** Headless Chromium
   throttles a page's `requestAnimationFrame` to ~30 Hz whenever any animation
   runs — an idle page reads 61 and a single composited animation reads 31. The
   glow was still rewritten to animate opacity only, because animating `filter`
   is measurably more expensive by any method.
4. **The hand hint is a still frame plus a transform loop, by design.** Only
   `frame_00` ships. Re-encoding the sequence into one animated GIF or a sprite
   sheet would mean adding a new asset.
5. **Re-entering a level through God Mode does not replay its voice-over.**
   Instruction coroutines are cancelled on the way out. Normal play only moves
   forward, so this affects the tool, not the game.
6. **Audio autoplay** still needs a first user gesture.
