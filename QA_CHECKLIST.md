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
| `consistency` | the same value compared across all six levels + tutorial | **44** checks, 0 fail |
| | | **458 checks, 0 failures** |

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
* [x] **Tutorial:** both `Group_485` counters stay up until **Next**. — *two separate things were taking them away early, and only fixing both was enough*
  * `onCheckButtonClicked` hid them on Check, while instructions 7 and 8 were still explaining what had been on the table.
  * The **right** counter went earlier still, and not from controller code at all: `BallAnimation` carries `m_IsActive 0` on `items /Item 1` at t 3.5, and the clip starts the moment the third block lands. The counter, the sample cube and the `+` / `−` parented to it all vanished while the bar still read *"Tap the + button to add blocks!"* — with no `+` on screen to tap. Played through `playExcept` now, so the clip keeps its item work and the counters are the controller's.
* [x] Nothing else in the scene can hide them. — *the tutorial runs `TutorialManager` alone; no `WeightGameTutorialController`, and `samplePose` is path-filtered to the balance*
* [x] **Tutorial:** `+` and `−` grey out once the last block is placed. — *both were still bright and tappable-looking with the count complete. `+` already ignored the tap and `−` never had a listener, so this only makes the real state visible*
* [x] They are also greyed before instruction 6, when neither can be used yet.
* [ ] The six levels still drop their counters on **Check** (`setCountersVisible(false)`), so tutorial and levels now differ on this beat. Left as-is — only the tutorial was asked for.

## 9 · Idle guidance

* [x] **Nothing is offered until 8 s of stillness.** — *measured: nothing at 5 s, guidance present at 10 s*
* [x] After the tutorial, hints are idle-driven **only**. — *every self-timed hint is gone: the drag arrow, `+`, Check, Next and Try Again all come from one watcher*
* [x] Withdrawn the moment the child acts. — *measured 0 guides after a tap*
* [x] It offers exactly what the current step needs. — *Try Again / Next → Check → drag → `+`*
* [x] It never talks over a voice-over. — *returns false while typing or a clip is playing*
* [x] It backs off. — *8 s, then 12 s, up to 22 s if nothing is appropriate*
* [x] Resets between levels and scenes.

## 10 · Alignment and cross-level consistency

Run: `consistency` — **45 checks, 0 failures.** Every check compares a value
across all six levels and fails on *deviation*, not on an absolute threshold, so
it catches a level that is subtly different from its siblings.

### Identical in all six levels (measured, stage space)

* [x] The `+` button. — *was x 715–726, y −63 to −69; now ±0*
* [x] The `−` button. — *was x 495–501, y −67 to −72.5; now ±0*
* [x] Check, Next, Try Again — position and size. — *±0, and all three the same size*
* [x] The instruction bar. — *±0, and identical to the tutorial's*
* [x] The balance beam. — *±0*
* [x] The needle. — *was ±4.9 because Level 1 alone used `[0, 26]` while the other five and the tutorial used `[-4.9, 24.7]`; now ±0*
* [x] The needle pivot. — *`0.5,0.5`, origin `43.5px 48.5px`, identical everywhere*
* [x] Both pans, horizontally and vertically. — *±0*
* [x] The sample block beside the buttons. — *±1.2px*
* [x] The balance's pose for a given tilt. — *identical numbers at −1, −0.5, 0, +0.5, +1 in all six*
* [x] Tilt 0 is exactly level, needle upright. — *18/18, 0°, all six*
* [x] The guidance arrow: 35 dots, 35 glow twins, one guide element, 26 hand keyframes. — *identical in all six*
* [x] The arrow's ends. — *tail within 2.4px of the item, head within 8.3px of the pan, all six*
* [x] The placed item's offset from its pan centre. — *max |dx| 0.01px*
* [x] Block size vs the sample. — *matches in all six; all blocks in a pan equal*
* [x] Pan rows evenly spaced **and centred**. — *every row, every level*
* [x] The correct count is reachable and reads Correct. — *4, 4, 7, 6, 6, 7*
* [x] Weights match and the balance settles level on success. — *all six*
* [x] One celebration, one confetti layer. — *all six*
* [x] Too few blocks reads `Less`, offers Try Again, never celebrates. — *all six*
* [x] Try Again clears blocks and state together, with no stuck lock. — *0/0 in all six*
* [x] Every instruction line still has a voice-over. — *55 lines*
* [x] No console errors and no failed requests across the whole pass.

### The item on its plinth — measured from the rendered frame

Each level was screenshotted twice, once with the item shown and once with it
hidden; the pixels that changed between the two **are** the item and nothing
else. Measured at 1920×1080 so one screen pixel is one stage unit
(`diffmeasure.js`).

This replaced an earlier arithmetic approach on the sprites' alpha, which was
**wrong**: it reported all six on one line while the rendered frame still showed
an 8px spread, because the artwork has soft edges the alpha threshold missed.

| | before | after |
|---|---|---|
| bottom edge | 861, 867, 863, 859, 865, 861 | **861** in all six |
| | 8px spread | **0px** |
| visual centre | 336.7, 336.2, 330.4, 334.4, 346.2, 331.6 | 325.6 – 326.4 |
| | 15.8px spread | **0.8px** |

* [x] All six items rest on one line. — *stage y **861**, ±0px*
* [x] All six are centred on their plinth. — *plinth centre is 326; every item's visual centre now lands 325.6–326.4*
* [x] Centring uses the intensity-weighted centre, not the bounding box. — *for a boat with sails on one side and a hull on the other those differ by 17px, and the weighted one is what reads as the middle*
* [x] The `Start Items` decorative copies share the same line. — *they had drifted 24.5px, so the item hopped the moment the real row took over*
* [ ] Level 5 and 6 keep the values supplied from God Mode. — **superseded, flagged.** The supplied `14.98, 71` put the shoe 20px right of its plinth and 16.5px below the group; `6, 100.5` put the cup 6px above it. The measurement won. Each is one number in `js/layout-overrides.js` if either look was deliberate.

### Nothing on the counters moves between screens

The measurement above was being thrown away at run time. The swap from the
`Start Items` display to the playable row snapped the **playable** item onto the
**decorative** copy, so what reached the screen was never the measured position
but whatever the intro copy happened to be authored at — 4 to 11px off, the
Level 1 boat worst at 10.7px, and no two levels agreeing. That is the item that
looked like it was moving from level to level.

The alignment now runs the other way and before either row is shown
(`alignIntroRowToPlay`), so the measured playable row is the one that holds
still and the copies are landed on it. Matching is by sprite, which covers the
item, the sample block and both buttons in one pass; a sprite used twice in a
row — the two `Group_485` counters — is skipped and corrected in the overrides
instead. Verified by walking the full ancestor chain for all 13 rows across the
seven screens:

| | before | after |
|---|---|---|
| item at the swap | 4 – 11.2px | **0** in all six |
| left counter `Group_485` | L4 alone at `[-633, -5]` | **one point**, 13/13 rows |
| right counter `Group_485` | L4 `[594, -7.5]`, tutorial `[598, -15]` | **one point**, 13/13 rows |
| sample block | y 83 – 86, and 0.4 – 2px again at the swap | **one point**, 7 screens |
| tutorial sample cube | 9px right, 22px low vs the levels' — *same 218×218 artwork as Level 5's* | **on the levels' point** |
| `+` and `−` | 1.18px at the swap | **one point**, 7 screens |

* [x] Both counters are in the same place on every screen, tutorial included.
* [x] Nothing on either counter moves when the row swaps. — *24/24 pairs at 0*
* [x] The sample block is in one place across all seven screens.
* [x] The measured item positions are what actually reach the screen. — *the run-time alignment can no longer discard them; it only ever moves the decorative copy*
* [x] Item box centres still differ per level. — *expected: the artwork differs, and the measurement puts each item's **visible** centre on 326, not its box centre*
* [ ] The tutorial's own item is a different asset (`image_44_1`, 685×430) and has never been frame-measured, so its box centre sits ~7px right of the levels'. Flagged, not guessed at — it needs the screenshot pass, not arithmetic.
* [ ] The intro row carries a `Rectangle_64_1_` card behind the sample block that the playable row has no copy of, so it disappears at the swap. Authored that way in all six; left alone.

### Ids are scene-local, and twenty of them collide

Level 1 was built from the tutorial, so `Canvas`, `controller`, `needle`, both
arms, both drop zones, the `items ` row and **both counters** carry the same id
in each scene. An override for one lands on the other unless it names a scene.

* [x] The eight existing Level 1 entries that hit a shared id were checked one
  by one against the tutorial's authored values. — *all eight are no-ops there; the values were chosen to match the tutorial in the first place*
* [x] Entries that are not also correct for the twin carry `scene:`. — *the five tutorial counter entries; without it the first two would drag Level 1's counters 0.82px off the line*

### Where corrections live

* [x] `js/layout-overrides.js`, not in generated data. — *`js/data.js` stays machine-written; deleting the one file drops every override*
* [x] Every value carries the measurement it came from in a comment beside it.

### Level 1 was the odd one out three more times

Found by matching **every** node across the six levels by its path, not by
picking nodes to check.

* [x] The balance is the same size in every level. — *`controller`, `Support base` and both pan arms are authored 251×291 / 131×158 in Level 1 where levels 2–6 **and the tutorial** use 259×300 / 135×163. None of these images preserve aspect, so Level 1 drew the whole balance ~3% smaller*
* [x] Both drop zones match. — *L1's left zone was `[4.601, 128]` at 282.8×95 against `[8.25, 98]` at 250×95 everywhere else, and its right zone y 124 against 98, so a dropped item sat ~30 units higher in the bowl than in any other level*
* [x] The arrow's target marker is the same everywhere. — *it was y 30 in L1, 80 in L2/L5/L6 and 100 in L3/L4, so the arrowhead pointed at a different part of the bowl per level. All six now use 80*
* [x] What still differs between levels is only what should. — *the alpha-0 block-slot markers (each level's own pile for its own block count and artwork) and the item boxes' sizes (different sprites). Their x is superseded by `pileSlot` anyway*

### Pile centring

* [x] A partly-filled top row is centred on **its own occupancy**, not the row's capacity. — *with 4 blocks in a 3+2 pile the single top block used to hang half a step off-centre; the pile now re-centres, easing over 0.18s, whenever a block is added or removed*

### Tutorial vs levels

* [x] Instruction bar and Check are in the same place. — *d = 0*
* [x] The balance is within 8.5px. — *the tutorial scene authors `controller` at a slightly different size; noted, not corrected, because it is the authored scene*

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
