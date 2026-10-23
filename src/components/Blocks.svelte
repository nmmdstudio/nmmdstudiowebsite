<script lang="ts">
  import { untrack } from 'svelte';

  import { springEase } from '../lib/spring';

  /*
   * The homepage is a fixed column of frosted blocks that change size as the page
   * is scrolled.
   *
   * Sizes are described in one table. Every block reads its height for the
   * current step out of it, so a step is only ever written down once and the
   * three blocks cannot drift out of agreement with each other.
   */
  let {
    revealed = false,
    reset = 0,
    onstep,
  }: { revealed?: boolean; reset?: number; onstep?: (step: number) => void } = $props();

  /*
   * Two emission units, one decision each.
   *
   * Structure is authored against a design viewport and emitted in svh, so
   * the blocks keep their proportions on every desktop — and stay stable on
   * a phone. Viewport-unit changes do not run transitions: emitted in dvh,
   * every collapse or expansion of the mobile address bar resized all the
   * blocks in one jump mid-scroll. The small viewport is the toolbar-expanded
   * size, constant at all times, so nothing resizes under a gesture; the
   * slack against the 85dvh body when the toolbar is collapsed centres out.
   * Plain vh has the same jump problem in the other direction and would also
   * overflow the body — see the body rule for that history.
   *
   * Text is emitted in rem, so type stays legible instead of scaling with
   * the screen — the greeting, the titles and the strip labels all hold
   * their size while the glass around them grows.
   */
  const svh = (n: number) => `${n}svh`;

  const PX_PER_REM = 16;
  const rem = (px: number) => `${px / PX_PER_REM}rem`;

  const MAX_WIDTH = 1400;

  /*
   * ── the device classes ────────────────────────────────────────────────
   *
   * Five, not two. The previous tables were authored against a 1080px desktop
   * and a ~660px phone, with a single breakpoint between them: every tablet and
   * every laptop took the desktop numbers, so an iPad's 768px column carried the
   * same 250px small blocks and 100px greeting as a 1920px display — measured,
   * five 220px tiles in a 720px column with 90px of dead space on either side.
   *
   * Each class is authored against its own reference viewport, and the breakpoints
   * are the hardware bands those references stand for:
   *
   *   phone     ≤ 40rem (640px)   iPhone SE..Pro Max, small Androids
   *   tablet    ≤ 64rem (1024px)  iPad portrait/landscape, Android tablets
   *   laptop    ≤ 90rem (1440px)  13"–16" laptops, the design's home
   *   desktop   ≤ 120rem (1920px) 24–27" displays
   *   ultra     > 120rem         5K/iMac, wide monitors
   *
   * The class drives every stepped number below — heights, radii, the small row,
   * the greeting — so each band reads as a layout drawn for it rather than a
   * desktop layout with the corners trimmed.
   */
  type Device = 'phone' | 'tablet' | 'laptop' | 'desktop' | 'ultra';

  /*
   * The class is read off the viewport width and kept current by a resize
   * listener rather than a media query, so the JS heights and the CSS that
   * keys off `--device` are driven by one source: a viewport cannot land in
   * the tablet's height table while its inline `--device` still reads
   * `laptop`, which is what a CSS-only breakpoint would allow during the
   * frames between a resize and the next style recalculation.
   */
  let viewportW = $state(0);

  const classify = (w: number): Device => {
    if (w <= 640) return 'phone';
    if (w <= 1024) return 'tablet';
    if (w <= 1440) return 'laptop';
    if (w <= 1920) return 'desktop';
    return 'ultra';
  };

  $effect(() => {
    viewportW = window.innerWidth;

    const onResize = () => (viewportW = window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  });

  const device: Device = $derived(classify(viewportW));

  /*
   * One table per class, all four steps, in svh of that class's reference
   * viewport. Row order is work / studio / contact, as before.
   *
   * Tuning rule: the stack plus two gaps plus the column gap plus the small row
   * must land at or under 85svh with real slack, so nothing clips its own
   * content at any step — the previous laptop table bottomed out at 84.7 only
   * against the design's exact 1080px, and overflowed at every other height.
   *
   *   phone    reference 660px tall; strips at 7.6svh, tiles 21–53svh
   *   tablet   reference 830px tall; strips at 5svh, tiles 25–60svh
   *   laptop   reference 900px tall;  strips at 4.6svh, tiles 18.5–64svh
   *   desktop  reference 1080px tall; the original design numbers
   *   ultra    reference 1440px tall; taller tiles, calmer strips
   */
  const HEIGHT_TABLES: Record<Device, readonly (readonly [number, number, number])[]> = {
    phone: [
      [53, 7.6, 7.6],
      [21.2, 40, 7.6],
      [21.2, 21.2, 40],
      [34, 7.6, 7.6],
    ],
    tablet: [
      [60, 5, 5],
      [20, 55, 5],
      [20, 20, 55],
      [44, 5, 5],
    ],
    laptop: [
      [64, 4.6, 4.6],
      [18.5, 50, 4.6],
      [18.5, 18.5, 36.5],
      [33.8, 4.6, 4.6],
    ],
    desktop: [
      [64, 4.6, 4.6],
      [18.5, 50, 4.6],
      [18.5, 18.5, 36.5],
      [33.8, 4.6, 4.6],
    ],
    ultra: [
      [64, 4.6, 4.6],
      [18.5, 50, 4.6],
      [18.5, 18.5, 36.5],
      [33.8, 4.6, 4.6],
    ],
  } as const;

  const HEIGHTS = $derived(HEIGHT_TABLES[device]);

  /*
   * The design's tile corner (40px at the 1080px design viewport is 3.7vh):
   * every block's radius when it is not a pill. Viewport-scaled with the
   * heights, so a big desktop's tiles carry proportionally larger corners.
   */
  const TILE_RADIUS = 3.7;

  /*
   * The strip pill: exactly half the 4.6vh strip height, which is the full
   * pill.
   *
   * Written as the honest rendered value rather than a huge number the browser
   * would clamp into the same pill. Either renders identically at rest, but
   * only this one interpolates: transitioning a huge number down to the tile
   * leaves the rendered radius riding the clamp at half the box, then snapping
   * in the final frames of the morph.
   */
  const PILL_RADIUS = 2.3;

  /*
   * Corner radius per step for the stack blocks, aligned row-for-row with
   * HEIGHTS.
   *
   * Row 1 (work) is a tile at every step. Rows 2 and 3 are pills while they
   * are strips and tiles whenever they are tall, so their radius travels with
   * their height at each step change.
   */
  const RADII = [
    [TILE_RADIUS, PILL_RADIUS, PILL_RADIUS],
    [TILE_RADIUS, TILE_RADIUS, PILL_RADIUS],
    [TILE_RADIUS, TILE_RADIUS, TILE_RADIUS],
    [TILE_RADIUS, PILL_RADIUS, PILL_RADIUS],
  ] as const;

  /*
   * The greeting's compact state: below this height on block 1 the greeting
   * shrinks and parks left. Block 1 stands at 18.5–21.2vh in stages 2 and 3
   * and at 46–65vh in stages 1 and 4, so this sits between them at both
   * breakpoints.
   */
  const WORK_COMPACT_HEIGHT = 30;

  /*
   * The body is four rows: the three stack blocks and the small row. The
   * vertical gap between them is 1.5vh (16px at the design viewport), emitted
   * with the heights so the rhythm scales with the column; the small row's
   * horizontal gap stays a fixed rem.
   */
  const BLOCK_GAP = 1.5;

  /*
   * ── the small row ─────────────────────────────────────────────────────
   *
   * The five tabs are the one element whose WIDTH was fixed (250px) while the
   * column around it was fluid — so the row's proportions drifted the whole way
   * across the range. Measured: 1330px of 1352px at 1440px (tiles touching the
   * edges), but 1100px of 1318px at 1366px, and the tablet band (641–1024px)
   * carried the same 250px boxes in a column that shrank to 720px — five tiles
   * stacked with 90px of dead space on each side.
   *
   * The fix is a per-class width and count, each authored for the band it
   * serves, and a `1fr` grid so the row fills its column exactly at every
   * width in the band:
   *
   *   phone   5 × equal share, pills at every step — the strip IS the layout
   *   tablet  4 × 1fr, tiles at the last step: four wide cards suit the
   *            portrait column better than five squeezed ones
   *   laptop  5 × 1fr — the design's own rhythm, now fluid instead of fixed
   *   desktop 5 × 1fr — the original 250px boxes, kept at full width
   *   ultra   5 × 1fr, slightly wider gap
   *
   * The height table rides the class too: the row is a 7svh strip of tabs
   * through stages 1–3 and squares off into tiles at the last, at the class's
   * own proportions rather than the desktop's.
   */
  const SMALL_COUNTS: Record<Device, number> = {
    phone: 5,
    tablet: 4,
    laptop: 5,
    desktop: 5,
    ultra: 5,
  };

  const SMALL_GAPS: Record<Device, number> = {
    phone: 10,
    tablet: 20,
    laptop: 20,
    desktop: 20,
    ultra: 24,
  };

  /*
   * Small-row heights per step, in svh, one entry per class.
   *
   * Strips through stages 1–3, squaring off at the last so the row reads as
   * tiles rather than tabs. The last step's square is what its width becomes:
   * a 1fr share of the column — on the tablet band that is roughly a square at
   * 23svh of its shorter reference, which is why the tablet table can stop at
   * the strip's 5svh and let the tiles take the class's own square instead.
   */
  const SMALL_HEIGHT_TABLES: Record<Device, readonly [number, number, number, number]> = {
    phone: [7.6, 7.6, 7.6, 7.6],
    tablet: [5, 5, 5, 23],
    laptop: [7, 7, 7, 23],
    desktop: [7, 7, 7, 23],
    ultra: [7, 7, 7, 23],
  };

  const SMALL_COUNT = $derived(SMALL_COUNTS[device]);
  const SMALL_GAP_N = $derived(SMALL_GAPS[device]);
  const SMALL_HEIGHTS = $derived(SMALL_HEIGHT_TABLES[device]);

  /*
   * The small row's targets: five links, in the order they sit left to right.
   *
   * The row is the only part of the homepage that leaves the site, so its
   * destinations are written down once, here, as data — every tile is an anchor
   * that reads its href from this table.
   *
   * The hrefs are the services' own front doors rather than the studio's pages
   * on them, because the accounts are not settled yet. Swapping in the real
   * handles is a table edit and nothing else: no markup, no CSS and no logic
   * changes shape.
   *
   * `mailto:` for the email tile: there is no page to open, so it hands the
   * address to the mail client instead of a new tab. The address itself is a
   * placeholder until the studio's inbox is decided.
   */
  const LINKS = [
    { id: 'instagram', label: 'instagram', href: 'https://www.instagram.com/' },
    { id: 'dribbble', label: 'dribbble', href: 'https://dribbble.com/' },
    { id: 'email', label: 'email', href: 'mailto:hello@nmmd.studio' },
    { id: 'behance', label: 'behance', href: 'https://www.behance.net/' },
    { id: 'x', label: 'x', href: 'https://x.com/' },
  ] as const;

  /*
   * The row shows as many tiles as its band fits: five everywhere but the
   * tablet's portrait column, which carries four (see SMALL_COUNTS).
   *
   * Taken from the head of the table rather than sampled across it, so the
   * tablet's four are the first four above and nothing silently rearranges
   * itself between bands.
   */
  const SMALL = $derived(LINKS.slice(0, SMALL_COUNT));

  /**
   * Height of a step's stack: its blocks plus the gaps between them. All the
   * terms are vh numbers, so the sum emits directly as vh.
   */
  const stackHeightFor = (i: number) =>
    HEIGHTS[i].reduce((a, b) => a + b, 0) + BLOCK_GAP * (HEIGHTS[i].length - 1);


  /*
   * Easing for the bubble-up entrance.
   *
   * A spring (see lib/spring.ts) carrying the same launch and the same 5%
   * overshoot as the back-ease it replaces, with the peak brought forward a
   * touch so the settle has room for a small ring-down: each block decelerates
   * into its seat, carries on past, and settles with a faint second touch
   * rather than snapping back. That overshoot is what separates a bubble from
   * a slide; the ring is what separates a bubble from a bezier.
   */
  const RISE_EASE = springEase('cubic-bezier(0.34, 1.4, 0.64, 1)', 0.52);

  /*
   * How long a block takes to move between two heights, and the curve it follows.
   *
   * Both blocks in a step change at once and by different amounts: one may gain
   * 300px while its neighbour loses it. A single easing has to serve both without
   * either looking like it stopped and started.
   *
   * The curve is a spring (see lib/spring.ts), solved to carry the same launch
   * and the same 5.3% overshoot as the back-ease that was here before, and to
   * land its peak at the same moment. That overshoot is the bounce: a block
   * inflates past the height it is settling at, then rings down onto it, the
   * way a balloon does when you stop blowing into it. Only the character
   * differs from the old bezier: the reversal at the peak is round and the
   * settle decays exponentially instead of snapping back, which is what reads
   * as fluid.
   *
   * Everything in a step shares this one curve — the block's height, the radius
   * that rides with it, the stack around it and the row underneath — which is
   * what makes the bounce read as inflation rather than as each panel wobbling on
   * its own. Sharing it also keeps them in agreement frame by frame: a block
   * growing while its neighbour shrinks leaves the pair summing to the stack's own
   * animated height at every instant, so nothing overlaps and the column never
   * spills past the body.
   *
   * The overshoot is bounded by the shortest thing it has to fit around. A strip
   * collapsing from 36.5svh to a 4.6svh tab travels 31.9svh, and the overshoot is
   * a fraction of that travel, so too lively a curve carries the tab below its
   * resting height and down to a sliver, clipping its title on the way back. The
   * fitted 5.3% leaves a collapsing tab at 2.9svh — over the 2.6svh its 24px
   * title needs, but only just. A touch more overshoot bottoms the same tab out
   * at 2.5svh and clips, and the classic back-ease (~10%) drops it to 16px.
   *
   * The whole morph is deliberately brisk: the launch is the same long settle's
   * front-loaded start, so the travel leaves as it always did. Shortening the
   * duration from 1.2s to 0.6s is what turns the tail from a float into a
   * bounce — the amplitude is the same and the reversal is twice as quick.
   */
  const MORPH_DURATION = 0.6;
  const MORPH_EASE = springEase('cubic-bezier(0.22, 1.40, 0.36, 1)');

  /*
   * The small row gets its own curve, and its overshoot is allowed to be larger.
   *
   * The row's overshoot has slack the stack does not. On the step where the row
   * expands, the stack is shedding height faster than the row takes it, so the
   * column's own height FALLS as the overshoot rises: it measures 85.0 − 2.3·v.
   * The stack's curve is bounded by the strip that collapses beside it, but the
   * row carries no strip and can overshoot freely — as long as its overshoot
   * does not land early, while the stack is still tall. So the spring fitted to
   * the row keeps the pop exactly where the back-ease put it, 61% of the way
   * through the morph — the far end of the curve, where the stack has already
   * settled and the column is 2.3svh short of its ceiling.
   *
   * A livelier curve with the same overshoot peaks a tenth of the way in, while
   * the stack is still near its full height, and the two overshoots add up past
   * the body.
   */
  const ROW_EASE = springEase('cubic-bezier(0.40, 1.60, 0.70, 1)');

  /*
   * The closing wordmark's bubble: the liveliest curve on the page. Its 16%
   * overshoot is kept — the mark still inflates to 8% past its size — but the
   * peak is brought forward from the back-ease's 37% to 32%, leaving the settle
   * room for the small ring-down after the pop.
   */
  const END_EASE = springEase('cubic-bezier(0.2, 1.75, 0.35, 1)', 0.32);


  const BLOCKS = [
    { id: 'work', label: 'Selected work', body: 'Placeholder copy describing a project, its role, and the year it shipped.' },
    { id: 'studio', label: 'work', body: 'Placeholder copy about the practice, how it works, and who it works with.' },
    { id: 'contact', label: 'team', body: 'Placeholder copy for enquiries, with a place for an email or a form.' },
  ];

  /*
   * Which stage the column is currently showing.
   *
   * The stage comes from the scroll position: App.svelte lays the page out as
   * a runway one viewport per stage, so each stage of scroll moves the column
   * on by exactly one step — a block holds its size until the next boundary
   * instead of resizing under the cursor.
   */
  let step = $state(0);

  /** Scrollable distance per stage: a viewport's worth of runway. */
  const stepSpan = () =>
    (document.documentElement.scrollHeight - window.innerHeight) / (HEIGHTS.length - 1);

  let applyRaf: number | undefined;

  /*
   * The stage is read straight off the scroll position.
   *
   * Native scroll snapping owns the landing: `scroll-snap-type` on <html>
   * (index.css) and the stage anchors in App.svelte guarantee that every
   * gesture — wheel, trackpad, touch, keys — ends on a stage boundary, so
   * rounding the position is exact and the browser's own engine handles the
   * reliability. This side only adopts the stage as a boundary is crossed
   * mid-flight, so the morph starts under the gesture rather than after it.
   *
   * The earlier JS stepper — timers, momentum waits, smooth-scroll glides
   * and the flags to keep them from consuming their own motion — was three
   * rounds of bugs: a cascade that cycled the stages on its own, a walk-back
   * that dragged the page opposite the gesture, and a swallow window that
   * ate the second and third flicks. Snapping does all of that in the
   * compositor.
   */
  const apply = () => {
    const next = Math.min(
      Math.max(0, Math.round(scrollY / stepSpan())),
      HEIGHTS.length - 1,
    );

    if (next !== step) {
      step = next;

      /*
       * Report the stage up so the navbar can dim at the last one. App owns no
       * position of its own — it mirrors this back.
       */
      onstep?.(next);
    }
  };

  const onScroll = () => {
    /*
     * The position is read inside a rAF rather than in the handler itself, so
     * a momentum fling cannot queue more step writes than the browser will
     * paint.
     */
    if (applyRaf !== undefined) return;

    applyRaf = requestAnimationFrame(() => {
      applyRaf = undefined;
      apply();
    });
  };

  /* ── the over-scroll bounce ───────────────────────────────────────────── */

  /**
   * The column that squashes, and the bounce currently playing.
   *
   * Over-scroll is dead by design: `overscroll-behavior: contain` on <html>
   * stops the browser's own rubber-band from dragging the whole viewport, so
   * there is nothing to feel when a gesture runs past the end of the runway.
   * This fills that gap — the gesture is real, it just has no scroll left to
   * buy, and the column answers it by pressing against the edge and springing
   * back.
   *
   * It is a transform, not a height change, so it cannot fight the morph: a
   * squash while a block is mid-morph just scales whatever height it happens to
   * be at that instant.
   */
  let columnEl: HTMLElement | undefined = $state();

  let bounce: Animation | undefined;
  let bounceRunning = false;

  /**
   * How long the press into the edge takes, and how long one full cycle of the
   * release takes.
   *
   * Both amplitudes are bounded by the container around the column, and both
   * bounds have to hold. `.blocks` clips at its padding box, so the column may
   * widen no further than the 48px between its 1352px width and that box. More
   * importantly it clips at its own 85dvh body, and the room to grow there is
   * the slack on the side the spring is heading for.
   *
   * That slack is not a constant: at the last stage the column is 893px against
   * a 918px body and has 12.4px to spare either side, but at the first stage it
   * is 915px and has 1.5px. So the spring cannot be written down as a fixed
   * amount — it is measured live against the room actually available, which is
   * what keeps the top of the runway from shaving the glass off its own edges.
   */
  const BOUNCE_PRESS = 0.24;
  const BOUNCE_PERIOD = 0.5;

  /** How far the squash presses in, and how far the spring aims past it. */
  const BOUNCE_SQUASH = 0.93;
  const BOUNCE_SPRING_PX = 18;

  /** How much the width mirrors the height's offset, widening as it shortens. */
  const BOUNCE_WIDEN = 0.45;

  /**
   * The release is cut at the first rest crossing whose remaining swing has
   * fallen to this share of the dip, and never past BOUNCE_RELEASE_MAX — a
   * spring with almost no room to overshoot is a heavily damped one and ends
   * early, while a very short column against the full 18px is lively and wants
   * a ceiling on how long it may ring.
   */
  const BOUNCE_TAIL = 0.0012;
  const BOUNCE_RELEASE_MAX = 1.0;

  /** The damping is held between these, in either direction of the measurement. */
  const BOUNCE_DECAY_MIN = 3;
  const BOUNCE_DECAY_MAX = 30;

  const quietMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  /*
   * One frame of the evaluated bounces below: a transform, where along the
   * animation it sits, and the easing into the next frame. Written structurally
   * rather than as DOM's Keyframe, which exists only as a type.
   */
  type BounceFrame = { transform: string; offset?: number; easing?: string };

  /**
   * Press the column against `edge`, then spring it back.
   *
   * The squash narrows the height and widens the width by a fraction of the
   * same amount, which is what makes it read as a body giving under pressure
   * rather than a box being scaled. The origin is the edge being pressed
   * against, so the column stays put where the finger is and the far side
   * moves.
   *
   * The spring is measured, not assumed: with the origin pinned to one edge the
   * overshoot pushes the far side out, and it may only push it as far as the
   * body has slack on that side. Where there is room for the full 18px it gets
   * it; where the first stage's column nearly fills its body the spring shrinks
   * to almost nothing and the bounce plays as a squash and return instead. The
   * squash itself always shortens the column, so it never needs this budget.
   *
   * `bounceRunning` refuses a second bounce while one is still playing, so
   * holding a scroll wheel against the end does not stack a dozen squashes into
   * each other. It clears on the animation finishing, which also means a bounce
   * that is cancelled counts as finished and the next gesture is free to start
   * a new one.
   */
  const bounceEdge = (edge: 'top' | 'bottom') => {
    const el = columnEl;
    const body = sectionEl;
    if (!el || !body || bounceRunning || quietMotion()) return;

    const rect = el.getBoundingClientRect();
    const bounds = body.getBoundingClientRect();

    /* Slack on the side the overshoot travels toward, measured from the edge in. */
    const room =
      edge === 'bottom'
        ? Math.max(0, rect.top - bounds.top)
        : Math.max(0, bounds.bottom - rect.bottom);

    /*
     * The spring is exactly the room available, less a sliver for sub-pixel
     * rounding, and never more than the 18px it is designed to reach.
     *
     * Because the release below is evaluated rather than eased, the spring is
     * also the literal peak of the curve: the damped swing cannot carry past
     * its own first overshoot, and every swing after it is smaller. That
     * matters more than it sounds — an easing overshooting its endpoint
     * carries the column a few pixels past a budget that was already spent to
     * the pixel.
     */
    const spring = 1 + Math.max(0, Math.min(room - 1, BOUNCE_SPRING_PX)) / rect.height;

    bounceRunning = true;
    bounce?.cancel();

    el.style.transformOrigin = edge === 'bottom' ? 'center bottom' : 'center top';

    /*
     * The release is a damped spring released from rest, evaluated as a curve
     * rather than choreographed as keyframes:
     *
     *   offset(t) = −dip·e^(−λt)·(cos ωt + (λ/ω)·sin ωt)
     *
     * The earlier bounce was five keyframes joined by easings, and every join
     * began its easing from zero velocity — the curve stalled at each seam,
     * which read as the bounce stuttering rather than flowing. A spring
     * released from rest starts at zero velocity too, so the press below can
     * decelerate into the squash and hand over with no seam at all: the
     * squash, the swing past rest and the settle are one continuous motion.
     */
    const dip = 1 - BOUNCE_SQUASH;
    const over = Math.min(spring - 1, dip * 0.9);
    const omega = (2 * Math.PI) / BOUNCE_PERIOD;

    /*
     * The damping is read off the measured overshoot. This spring's extrema sit
     * exactly at ωt = kπ and decay by e^(−λπ/ω) per half-cycle, so the first
     * overshoot is dip·e^(−λπ/ω): holding that against the measured spring
     * gives λ = (ω/π)·ln(dip/over), and the overshoot lands on its budget to
     * the pixel. Clamped from both sides: where the edge has no room the
     * damping runs high and the release is spent before it can overshoot at
     * all — the squash-and-return the first stage plays — and a short column
     * against the full 18px is kept from ringing on for seconds.
     */
    const decay =
      over > 0
        ? Math.min(
            Math.max((omega / Math.PI) * Math.log(dip / over), BOUNCE_DECAY_MIN),
            BOUNCE_DECAY_MAX,
          )
        : BOUNCE_DECAY_MAX;

    /*
     * The release ends at a rest crossing, where the offset is exactly zero —
     * no settle keyframe, no snap. Crossings sit at ωt = π − atan(ω/λ) + kπ,
     * and the release is the first one whose remaining swing — the next
     * extremum, dip·e^(−λ(k+1)π/ω) — has fallen under BOUNCE_TAIL: whatever
     * the spring could still rise from there is under a pixel, so cutting it
     * is invisible. The ceiling ends even the liveliest spring at its last
     * crossing under it.
     */
    let release = 0;
    for (let k = 0; k < 64; k++) {
      const t = (Math.PI - Math.atan(omega / decay) + k * Math.PI) / omega;
      if (t > BOUNCE_RELEASE_MAX) break;
      release = t;
      if (dip * Math.exp((-decay * (k + 1) * Math.PI) / omega) <= BOUNCE_TAIL) break;
    }

    const offset = (t: number) =>
      -dip * Math.exp(-decay * t) * (Math.cos(omega * t) + (decay / omega) * Math.sin(omega * t));

    const total = BOUNCE_PRESS + release;

    const frames: BounceFrame[] = [
      /* The press: out of rest and decelerating into the squash, to hand over at zero velocity. */
      { transform: 'none', easing: 'cubic-bezier(0.3, 0, 0.45, 1)' },
      {
        transform: `scaleY(${BOUNCE_SQUASH}) scaleX(${1 + dip * BOUNCE_WIDEN})`,
        offset: BOUNCE_PRESS / total,
      },
    ];

    /*
     * The release, sampled at frame rate. Straight chords between samples a
     * sixtieth of a second apart sit on the curve to well under a pixel, so no
     * easing is needed between them — the curve itself is the easing, and
     * there is no join left to kink. The width mirrors the height's offset
     * through BOUNCE_WIDEN: the squash widens as it shortens, the overshoot
     * thins as it grows, the volume-preserving give the old wide/thin
     * keyframes choreographed by hand.
     */
    const steps = Math.ceil(release * 60);
    for (let i = 1; i <= steps; i++) {
      const t = (release * i) / steps;
      const off = offset(t);
      frames.push({
        transform: `scaleY(${1 + off}) scaleX(${1 - off * BOUNCE_WIDEN})`,
        offset: (BOUNCE_PRESS + t) / total,
      });
    }

    /* The last sample lands on the rest crossing; make it exact. */
    frames[frames.length - 1] = { transform: 'none' };

    bounce = el.animate(frames, { duration: total * 1000, fill: 'none' });

    const settle = () => {
      bounceRunning = false;
    };

    bounce.finished.then(settle, settle);
  };

  /**
   * Whether the runway is against the top or the bottom.
   *
   * The tolerance covers the rounding a snapped position leaves behind and the
   * fractional pixel a devicePixelRatio of 2 or 3 introduces, so the last stage
   * reads as the bottom even when scrollY stops a hair short of the maximum.
   */
  const EDGE = 4;
  const atTop = () => scrollY <= EDGE;
  const atBottom = () =>
    scrollY >= document.documentElement.scrollHeight - window.innerHeight - EDGE;

  const onWheel = (event: WheelEvent) => {
    if (Math.abs(event.deltaY) < 8) return;

    if (event.deltaY > 0) {
      if (atBottom()) bounceEdge('bottom');
    } else if (atTop()) {
      bounceEdge('top');
    }
  };

  /** Finger position of the last touchmove, so the drag is measured as a delta. */
  let touchY: number | undefined;

  const onTouchStart = (event: TouchEvent) => {
    touchY = event.touches[0]?.clientY;
  };

  const onTouchMove = (event: TouchEvent) => {
    const y = event.touches[0]?.clientY;
    if (y === undefined || touchY === undefined) return;

    /* Finger travelling up is a scroll down, and the reverse. */
    const drag = touchY - y;
    if (Math.abs(drag) < 12) return;

    if (drag > 0) {
      if (atBottom()) {
        touchY = y;
        bounceEdge('bottom');
      }
    } else if (atTop()) {
      touchY = y;
      bounceEdge('top');
    }
  };

  const onKey = (event: KeyboardEvent) => {
    const down = event.key === 'ArrowDown' || event.key === 'PageDown' || event.key === ' ';
    const up = event.key === 'ArrowUp' || event.key === 'PageUp';

    if (down) {
      if (atBottom()) bounceEdge('bottom');
    } else if (up && atTop()) {
      bounceEdge('top');
    }
  };

  /*
   * The bounce listens only once the blocks are on screen. Through the loader
   * and the hero the document is scroll-locked and the runway never moves, so
   * a gesture there is answered by App's own stage change instead.
   */
  $effect(() => {
    if (!revealed) return;

    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('keydown', onKey, { passive: true });

    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('keydown', onKey);

      touchY = undefined;
      bounce?.cancel();
      bounceRunning = false;
    };
  });

  /*
   * Take-to-the-top: glide back to stage 1.
   *
   * Just the scroll — the position is the stage, so as the glide runs this
   * engine walks the column down through the stages and the morphs play on
   * the way up, and the native snap holds the landing at the runway's start.
   *
   * The press happens first and the scroll is not held back for it: the button
   * answers the finger immediately, and the two overlap rather than queue. The
   * glide only crosses the first stage boundary a third of the way down the
   * runway, so the button is still on screen for most of the bounce.
   */
  const toTop = () => {
    if (step === 0) return;

    bounceToTop();

    scrollTo({ top: 0, behavior: 'smooth' });
  };

  /* ── the take-to-the-top press ────────────────────────────────────────── */

  let toTopEl: HTMLElement | undefined = $state();
  let toTopBounce: Animation | undefined;
  let toTopBouncing = false;

  /**
   * Seconds the press takes, and one full cycle of the release.
   *
   * Shorter than the column's over-scroll bounce, and deliberately: this one
   * answers a click, so it wants to land while the finger is still down rather
   * than trailing after it. It is also unencumbered by the two containers that
   * cap the column — the button is fixed over the page, nothing clips it, so
   * the amplitudes can be as deep as a press wants to be.
   */
  const BUTTON_PRESS_TIME = 0.1;
  const BUTTON_PERIOD = 0.26;

  /** How deep the press sinks it, and how far past rest the release carries, per axis. */
  const BUTTON_DIP = { x: 0.1, y: 0.16 };
  const BUTTON_OVERSHOOT = { x: 0.004, y: 0.05 };

  /** The release is cut once its remaining swing falls under this share of the dip. */
  const BUTTON_TAIL = 0.006;
  const BUTTON_RELEASE_MAX = 0.4;

  /**
   * Press the button in and let it spring back.
   *
   * The press is asymmetric: it narrows more than it shortens, so the frosted
   * square reads as soft rubber giving under a finger rather than as a box
   * being scaled down uniformly. The release is then the same rest-released
   * damped spring as the column's over-scroll (see bounceEdge), evaluated per
   * axis off one shared clock: the narrow axis is damped hard and settles
   * inside its first swing, while the tall axis rings on through its 5%
   * overshoot and a small tail — the second faint kick that makes a click
   * feel answered rather than merely acknowledged.
   *
   * The button's reveal also animates `transform`, so pressing while it is
   * still arriving would snap it straight out of its own entrance. It holds at
   * `translateY(0.5rem)` until that finishes, and a computed transform that is
   * not `none` means the reveal is still in flight — the press is skipped and
   * the click still scrolls.
   */
  const bounceToTop = () => {
    const el = toTopEl;
    if (!el || toTopBouncing || quietMotion()) return;
    if (getComputedStyle(el).transform !== 'none') return;

    toTopBouncing = true;
    toTopBounce?.cancel();

    /* Per-axis damping, each solved against its own overshoot — see bounceEdge. */
    const omega = (2 * Math.PI) / BUTTON_PERIOD;
    const decayX = (omega / Math.PI) * Math.log(BUTTON_DIP.x / BUTTON_OVERSHOOT.x);
    const decayY = (omega / Math.PI) * Math.log(BUTTON_DIP.y / BUTTON_OVERSHOOT.y);

    const offset = (t: number, decay: number, dip: number) =>
      -dip * Math.exp(-decay * t) * (Math.cos(omega * t) + (decay / omega) * Math.sin(omega * t));

    /* Ends on a rest crossing once both tails are spent; y rings longer. */
    let release = 0;
    for (let k = 0; k < 64; k++) {
      const t = (Math.PI - Math.atan(omega / decayY) + k * Math.PI) / omega;
      if (t > BUTTON_RELEASE_MAX) break;
      release = t;
      const swing = (dip: number, decay: number) =>
        dip * Math.exp((-decay * (k + 1) * Math.PI) / omega);
      if (Math.max(swing(BUTTON_DIP.x, decayX), swing(BUTTON_DIP.y, decayY)) <= BUTTON_TAIL) break;
    }

    const total = BUTTON_PRESS_TIME + release;

    const frames: BounceFrame[] = [
      /* The press: out of rest and decelerating into the sink, to hand over at zero velocity. */
      { transform: 'scale(1)', easing: 'cubic-bezier(0.3, 0, 0.45, 1)' },
      {
        transform: `scale(${1 - BUTTON_DIP.x}, ${1 - BUTTON_DIP.y})`,
        offset: BUTTON_PRESS_TIME / total,
      },
    ];

    /* The release, sampled at frame rate — the curve is the easing. */
    const steps = Math.ceil(release * 60);
    for (let i = 1; i <= steps; i++) {
      const t = (release * i) / steps;
      frames.push({
        transform: `scale(${1 + offset(t, decayX, BUTTON_DIP.x)}, ${1 + offset(t, decayY, BUTTON_DIP.y)})`,
        offset: (BUTTON_PRESS_TIME + t) / total,
      });
    }

    /* The last sample lands on the rest crossing; make it exact. */
    frames[frames.length - 1] = { transform: 'scale(1)' };

    toTopBounce = el.animate(frames, { duration: total * 1000, fill: 'none' });

    const settle = () => {
      toTopBouncing = false;
    };

    toTopBounce.finished.then(settle, settle);
  };

  /*
   * The navbar logo takes the page back to stage 1, like the take-to-the-top
   * button. `reset` is a counter App bumps on each logo click; every change
   * requests the same glide, and it starts at 0 so nothing runs on mount.
   *
   * The reset runs untracked: toTop reads `step` to guard itself, and letting
   * the effect track it would re-fire the reset on every stage change.
   */
  $effect(() => {
    if (!reset) return;

    untrack(() => toTop());
  });

  $effect(() => {
    /*
     * Only once the blocks are on screen. App locks the document's scroll
     * through the loader and the hero, so the runway is at rest at the top —
     * stage 1 — when the homepage takes over, and every scroll from here
     * lands on a stage by the native snap.
     */
    if (!revealed) return;

    apply();

    window.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', onScroll);
      if (applyRaf !== undefined) cancelAnimationFrame(applyRaf);
    };
  });

  /**
   * Below this height a block is a strip: no room for title and copy together,
   * so it carries its title alone, centred, rather than clipping a line in
   * half. Strips sit at 4.6vh on desktop and 7.6vh on mobile; the tallest of
   * the small blocks never comes close from above, so one vh threshold serves
   * both tables.
   */
  const SHORT_HEIGHT = 12;

  /** Short strips drop their copy and keep their centred title. */
  const isShort = (height: number) => height < SHORT_HEIGHT;

  /**
   * Set once all entrance animations have finished.
   *
   * While `false`, each block carries a staggered transition-delay so the
   * stack and row cascade in one at a time. Once the entrance has played out,
   * the delay is cleared so subsequent step morphs fire in unison instead of
   * rippling block by block (which is what made the small row look broken
   * when expanding and contracting).
   */
  let entered = $state(false);

  $effect(() => {
    if (!revealed) return;
    const timer = setTimeout(() => { entered = true; }, 1900);
    return () => clearTimeout(timer);
  });

  /**
   * Border-radius for the small blocks per step, in vh.
   *
   * The strips are pills at exactly half their 7vh height (3.5vh) rather than
   * at a huge value the browser would clamp into a pill. Either renders the
   * same at rest, but only the honest value interpolates: transitioning a huge
   * number down to the tile left the rendered radius riding the clamp at half
   * the growing box, then snapping in the final frames of the expansion — the
   * visible jerk in the last step. A value that matches what is actually
   * painted lets the radius travel with the height for the whole morph.
   */
  const SMALL_RADII = [3.5, 3.5, 3.5, 3.7] as const;

  /* ── cursor-tracking glow ─────────────────────────────────────────────── */

  let sectionEl: HTMLElement | undefined = $state();
  let glowRafId: number | undefined;

  /**
   * On every mouse frame, compute the cursor's position relative to each
   * block and write it as `--mouse-x` / `--mouse-y` so the `::after` radial
   * gradient tracks the cursor. Throttled to one write per paint via rAF.
   */
  /** Take the glow off every block. */
  const hideGlow = () => {
    if (glowRafId !== undefined) {
      cancelAnimationFrame(glowRafId);
      glowRafId = undefined;
    }
    if (!sectionEl) return;
    for (const block of sectionEl.querySelectorAll<HTMLElement>('.block')) {
      block.style.setProperty('--glow-opacity', '0');
    }
  };

  const onGlowMove = (event: MouseEvent) => {
    if (glowRafId !== undefined) return;
    glowRafId = requestAnimationFrame(() => {
      glowRafId = undefined;
      if (!sectionEl) return;
      for (const block of sectionEl.querySelectorAll<HTMLElement>('.block')) {
        const rect = block.getBoundingClientRect();
        block.style.setProperty('--mouse-x', `${event.clientX - rect.left}px`);
        block.style.setProperty('--mouse-y', `${event.clientY - rect.top}px`);
        block.style.setProperty('--glow-opacity', '1');
      }
    });
  };

  /** Fade the glow out when the cursor leaves the blocks section. */
  const onGlowLeave = () => hideGlow();

  /*
   * Leaving the section is not the only way the cursor stops being on the page.
   *
   * Alt-tabbing to another app, dragging the cursor onto a second monitor, or
   * switching tabs all take the pointer off the page without the pointer ever
   * crossing an element boundary, so no `mouseleave` is dispatched and the ring
   * stays lit at the last position it was given — sitting there behind whatever
   * the visitor switched to. A window that loses focus and a tab that is hidden
   * are both announced on their own events, and both mean the same thing here:
   * nobody is looking at the blocks, so drop the glow.
   *
   * Re-entering does not need a counterpart: the next `mousemove` over the
   * section writes a fresh position and turns the glow back on by itself.
   */
  $effect(() => {
    const onHidden = () => {
      if (document.visibilityState === 'hidden') hideGlow();
    };

    /*
     * The cursor can also leave the page by sliding straight off the viewport —
     * out the side, or up past the top edge — without ever crossing an element
     * boundary the section's own `mouseleave` would catch, and without the window
     * losing focus. `mouseleave` on the document root is the one event that fires
     * whenever the pointer exits the page by any route, so it is the reliable
     * signal that the glow should go off. It bubbles nothing and fires once per
     * exit, so it cannot fight the section's own handler.
     */
    const onDocumentLeave = () => hideGlow();

    window.addEventListener('blur', hideGlow);
    document.addEventListener('visibilitychange', onHidden);
    document.addEventListener('mouseleave', onDocumentLeave);

    return () => {
      window.removeEventListener('blur', hideGlow);
      document.removeEventListener('visibilitychange', onHidden);
      document.removeEventListener('mouseleave', onDocumentLeave);
    };
  });
</script>

<section
  class="blocks"
  class:blocks--in={revealed}
  class:blocks--entered={entered}
  class:blocks--end={step === HEIGHTS.length - 1}
  style="
    --max-width: {rem(MAX_WIDTH)};
    --block-gap: {svh(BLOCK_GAP)};
    --small-gap: {rem(SMALL_GAP_N)};
    --small-count: {SMALL_COUNT};
    --small-height: {svh(SMALL_HEIGHTS[step])};
    --small-radius: {svh(SMALL_RADII[step])};
    --rise-ease: {RISE_EASE};
    --morph-duration: {MORPH_DURATION}s;
    --morph-ease: {MORPH_EASE};
    --row-ease: {ROW_EASE};
    --end-mark-ease: {END_EASE};
    --stack-height: {svh(stackHeightFor(step))};
    --device: {device};
  "
  bind:this={sectionEl}
  onmousemove={onGlowMove}
  onmouseleave={onGlowLeave}
  aria-label="Selected work and contact"
>
  <div class="column" bind:this={columnEl}>
    <div class="stack">
    {#each BLOCKS as block, i (block.id)}
      {@const height = HEIGHTS[step][i]}
      <article
        class="block block--{block.id}"
        class:block--short={isShort(height)}
        class:block--tiled={RADII[step][i] === TILE_RADIUS}
        class:block--compact={block.id === 'work' && height <= WORK_COMPACT_HEIGHT}
        style="--height: {svh(height)}; --radius: {svh(RADII[step][i])}; --index: {i}"
      >
        {#if isShort(height)}
          <h2 class="block__title">{block.label}</h2>
        {:else if block.id === 'work'}
          <span class="block__hey">hey !!</span>
          <p class="block__tagline">we are an indie design and dev studio</p>
        {:else}
          <h2 class="block__title">{block.label}</h2>
          <p class="block__body">{block.body}</p>
        {/if}
      </article>
      {/each}
    </div>

    <!--
      The small row: one anchor per link, in LINKS. The band decides how many
      fit, and SMALL is already sliced to it.
    -->
    <div class="row" class:row--expanded={step === HEIGHTS.length - 1}>
      {#each SMALL as block, i (block.id)}
        <a
          class="block block--small block--{block.id}"
          style="--index: {i}"
          href={block.href}
          target="_blank"
          rel="noopener noreferrer"
        >
          <h3 class="block__title">{block.label}</h3>
        </a>
      {/each}
    </div>
  </div>

  <button
    class="to-top"
    class:to-top--in={step === HEIGHTS.length - 1}
    bind:this={toTopEl}
    onclick={toTop}
    aria-label="Take back to the top"
    aria-hidden={step !== HEIGHTS.length - 1}
    tabindex={step === HEIGHTS.length - 1 ? 0 : -1}
  >
    <svg
      viewBox="0 0 24 24"
      width="2rem"
      height="2rem"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  </button>

  <!--
    The closing wordmark.

    It belongs to the last stage and nowhere else, so it lives here rather than in
    the footer: this is the only place that knows which stage the runway is on,
    exactly as with the take-to-the-top button. The footer's own line — "building
    with ❤️ from BLR and GNB" — stays on screen through every stage.

    It is placed inside the body rather than in the footer band because the band
    is 5dvh and holds one line of text. The last stage's column is deliberately
    short (block 1 is capped at 365px) and leaves 78px of slack below it, and that
    slack is what the wordmark sits in.
  -->
  <div
    class="end-mark"
    class:end-mark--in={step === HEIGHTS.length - 1}
    aria-hidden="true"
  >
    <span class="end-mark__name">NAMMADE</span>
    <span class="end-mark__studio">STUDIO</span>
  </div>
</section>

<style>
  /*
   * Capped rather than a fixed 1400px so the column survives narrower
   * viewports. The blocks stay fluid and only their heights are stepped.
   */
  .blocks {
    width: 100%;
    max-width: var(--max-width);
    margin: 0 auto;
    padding: 0 1.5rem;

    /* Anchors the closing wordmark, which is placed against the body's bottom. */
    position: relative;

    /*
     * The body of the three constant sections: 85vh of the spec's 10/85/5
     * split, in flow between the navbar and the footer. dvh tracks the space
     * the mobile browser's collapsed address bar leaves.
     *
     * The height is explicit rather than flexed, and overflow is clipped so a
     * column taller than the section can never spill into the footer's region
     * below — on a short viewport the morph content is cut at the section
     * boundary instead of overlapping the next section.
     *
     * The centring below is then a single flex box of exactly the body's
     * height, with no offsetting constant to keep in agreement with the
     * navbar.
     */
    display: flex;
    flex-direction: column;
    justify-content: center;

    flex: none;
    height: 85vh;
    height: 85dvh;
    overflow: hidden;
  }

  /*
   * The column itself carries no positioning.
   *
   * Centring is the parent's job: the section is a flex box exactly the height of
   * the space below the navbar, so centring is one `justify-content` rather than a
   * sticky offset that had to know where it started.
   *
   * `flex-shrink: 0` stops it being squeezed when the viewport is too short for
   * the current step. The column is a fixed set of specified sizes, so shrinking
   * it would break the dimensions; the overflow is reached by the page not
   * scrolling rather than by scaling anything down.
   */
  .column {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;

    /*
     * The four rows share the block gap's rhythm at every step, so there is
     * nothing left to transition between steps.
     */
    gap: var(--block-gap);

    /*
     * The over-scroll bounce scales this element, and without a layer of its
     * own every frame of that scale re-composites the whole frosted stack on
     * the main thread — eight backdrop-filtered panes re-solved against a
     * moving backdrop is what read as the bounce lagging. will-change promotes
     * the column to a compositor layer, so the squash and the spring run as a
     * GPU transform over an already-rastered stack and the main thread stays
     * free for the whole gesture. The blur is baked into the layer at rest, so
     * the frozen raster is what scales — the right trade for a gesture that
     * is over in under a second.
     */
    will-change: transform;
  }

  .stack {
    display: flex;
    flex-direction: column;
    gap: var(--block-gap);

    /*
     * Sized to the current step, not to the tallest one.
     *
     * Reserving the tallest step's height here left the stack reserving 300px of
     * empty space at the final step, since only 530px of it was filled. That
     * pushed the small row below the fold and made the column 1130px tall when
     * its contents came to 830px.
     */
    height: var(--stack-height);
    transition: height var(--morph-duration) var(--morph-ease);
  }

  /*
   * Frosted glass.
   *
   * The blur samples whatever is behind the block, so the copy has to be a child
   * of the block rather than a layer above it, or the blur would wash the text
   * out along with the backdrop.
   */
  .block {
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    gap: 0.5rem;

    /* Positioning context for the cursor-tracking glow on ::after. */
    position: relative;

    height: var(--height, auto);
    padding: 1.5rem;
    overflow: hidden;
    border: 0.0625rem solid rgb(255 255 255 / 0.1);
    /*
     * No white tint here on purpose. A translucent white fill lifted every
     * block toward grey and washed out the colour wash showing through the
     * frosted blur. With it gone the backdrop reads the ambient colour instead.
     */
    background: transparent;
    backdrop-filter: blur(1.5rem);
    -webkit-backdrop-filter: blur(1.5rem);

    /*
     * The bubble-up entrance.
     *
     * Blocks start well below their resting place and slightly small, then rise
     * and grow into position. The overshoot in the easing is what makes it read
     * as bubbling up rather than sliding: the block decelerates into its seat and
     * briefly carries past before settling back.
     *
     * will-change promotes transform and opacity to their own compositor layer
     * so the entrance animation runs off the main thread and stays jank-free.
     */
    opacity: 0;
    transform: translateY(5rem) scale(0.94);
    will-change: transform, opacity;
    transition:
      opacity 0.7s ease-out,
      transform 1s var(--rise-ease),
      height var(--morph-duration) var(--morph-ease),
      padding var(--morph-duration) var(--morph-ease),
      border-radius var(--morph-duration) var(--morph-ease),
      corner-shape var(--morph-duration) var(--morph-ease);
  }

  /*
   * Frosted grain on the glass itself.
   *
   * The page-wide grain is deliberately faint — it is there as an emulsion over
   * the render, not as a texture — so the blocks would read as flat panes next
   * to it. Real frosted glass scatters light, and a scatter surface is not
   * smooth: this paints the same noise pattern inside each block at a much
   * higher opacity, which is what gives the panes their grain.
   *
   * It sits on ::before because ::after is already the cursor-tracking glow
   * ring. The grain is a separate compositing layer from the backdrop-filter,
   * so it does not get blurred by it; `inset: 0` seats it over the whole pane
   * and the block's own overflow and corner-shape clip it to the glass.
   *
   * overlay, not soft-light: inside the block the noise should read as scatter
   * against the darker glass, and overlay gives that bite where soft-light —
   * the right call for the faint page grain — would go nearly invisible.
   */
  .block::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: 0;
    pointer-events: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='1' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3CfeComponentTransfer%3E%3CfeFuncR type='discrete' tableValues='0 1'/%3E%3CfeFuncG type='discrete' tableValues='0 1'/%3E%3CfeFuncB type='discrete' tableValues='0 1'/%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g)'/%3E%3C/svg%3E");
    opacity: 0.07;
    mix-blend-mode: overlay;
  }

  .blocks--in .block {
    opacity: 1;
    transform: none;
  }

  /*
   * Cursor-tracking glow, confined to the border.
   *
   * A radial gradient centred on `--mouse-x` / `--mouse-y`, which are written
   * per block on every animation frame, masked down to a thin ring at the edge of
   * the block. The mask is the two-layer `exclude` trick: the first layer is the
   * content box and the second the padding box, so subtracting leaves only the
   * difference between them. Without it the gradient floods the whole surface,
   * which reads as a lit panel rather than a lit edge.
   *
   * The ring is inset by nothing, so it spans the block's padding box and the
   * mask subtracts the content box from it, leaving a band sitting immediately
   * inside the border. Pulling the pseudo-element out with a negative inset to
   * centre the band on the border pushed it a pixel past the border box, and the
   * glow read as a halo bleeding into the page behind rather than light on the
   * edge.
   *
   * `--mouse-x` defaults far off to the left, so with no cursor present the
   * gradient's transparent centre covers the block and nothing shows.
   */
  .block::after {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;

    border-radius: inherit;

    /* The width of the band the mask leaves, so the ring has something to leave. */
    padding: 0.0625rem;

    background: radial-gradient(
      22.5rem circle at var(--mouse-x, -9999px) var(--mouse-y, -9999px),
      rgb(255 255 255 / 0.55),
      rgb(255 255 255 / 0.12) 55%,
      transparent 75%
    );

    -webkit-mask:
      linear-gradient(#000 0 0) content-box,
      linear-gradient(#000 0 0);
    mask:
      linear-gradient(#000 0 0) content-box,
      linear-gradient(#000 0 0);

    -webkit-mask-composite: xor;
    mask-composite: exclude;

    opacity: var(--glow-opacity, 0);

    /*
     * Fades in and out on its own so pulling the cursor away dims the glow rather
     * than snapping it off. It deliberately does not transition its gradient
     * position: that is driven per frame by script and is already smooth.
     */
    transition: opacity 0.35s ease-out;
  }

  /*
   * Where the border area can paint a background, the ring is not a mask.
   *
   * Masks are not among the properties that follow corner-shape (backgrounds,
   * borders, outlines, shadows, overflow and backdrop-filter are). On the
   * squircle corners the mask above is cut along plain circular arcs that no
   * longer match the border being drawn underneath, so the shimmer visibly
   * detaches at every corner.
   *
   * Instead the ::after carries a transparent 0.0625rem border of its own and its
   * gradient is clipped to that border area -- `border-area` ignores the
   * border-color's transparency, so the full gradient paints in the band and
   * nowhere else. Backgrounds do follow corner-shape, and index.css sets
   * `corner-shape: inherit` on the ::after, so the ring tracks the exact shape
   * the border draws, including through the expansion's shape interpolation.
   *
   * The band lands in the same place the mask left it: inset: 0 already seats
   * the ::after just inside the block's own border, and its border area is the
   * 0.0625rem immediately inside that. The mask rule above stays as the fallback
   * for engines without `border-area` -- which are the same engines without
   * corner-shape, where the ring still matches the corners.
   */
  @supports (background-clip: border-area) {
    .block::after {
      border: 0.0625rem solid transparent;
      background-origin: border-box;
      background-clip: border-area;
      -webkit-background-clip: border-area;
      -webkit-mask: none;
      mask: none;
    }
  }

  .block h2,
  .block h3 {
    margin: 0;
    font-family: var(--font-display);
    font-weight: 500;
    line-height: 1.15;

    /* Above the frosted grain on ::before, which is a positioned layer. */
    position: relative;
    z-index: 1;
  }

  .block h2 {
    font-size: 1.5rem;

    /*
     * Work Sans is a variable font, so the weight interpolates: the title
     * lightens as the block collapses into a strip and returns to medium as
     * it expands, on the same curve as the block's own morph.
     */
    transition: font-weight var(--morph-duration) var(--morph-ease);
  }

  .block h3 {
    font-size: 0.9375rem;
  }

  .block p {
    max-width: 44ch;
    margin: 0;
    font-size: 0.9375rem;
    line-height: 1.6;
    color: var(--color-neutral-400);

    /* Above the frosted grain on ::before, which is a positioned layer. */
    position: relative;
    z-index: 1;
  }

  /*
   * Block 1 carries the studio greeting.
   *
   * Full state (stages 1 and 4): the greeting is Borel at the spec's 100px,
   * centred both ways in the block, with the Work Sans tagline at 20px and
   * light weight under it in the body text's softer tone.
   *
   * Both lines are absolute and anchored to the block's vertical midpoint —
   * the greeting dead on it, the subtitle below it, offset by half the
   * greeting's height plus the gap: 3rem at full size, 0.5rem compact. Their
   * `50%` terms track the animating block height, and every offset travels on
   * the block's own morph curve, so the pair glides together through each
   * stage change — the greeting's move to the left animates exactly like the
   * subtitle's, with nothing left to flip discretely but the subtitle's own
   * text wrap.
   *
   * Compact state (stages 2 and 3): the greeting shrinks to the spec's 48px
   * and the pair parks at the left, 100px in from the block's edge, keeping
   * the vertical centring.
   */
  .block--work {
    text-align: center;
  }

  .block__hey {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);

    /* Above the frosted grain on ::before. */
    z-index: 1;

    font-family: var(--font-borel);
    font-size: 6.25rem;
    font-weight: 400;
    line-height: 1;
    color: var(--color-neutral-100);
    white-space: nowrap;

    transition:
      font-size var(--morph-duration) var(--morph-ease),
      left var(--morph-duration) var(--morph-ease),
      transform var(--morph-duration) var(--morph-ease);
  }

  .block--work .block__tagline {
    position: absolute;
    top: calc(50% + 6.125rem); /* half the 6.25rem greeting + the 3rem gap */
    left: 50%;
    transform: translateX(-50%);

    /* Above the frosted grain on ::before. */
    z-index: 1;

    max-width: none;
    margin: 0;
    font-family: var(--font-display);
    font-size: 1.25rem;
    font-weight: 300;
    line-height: 1.5;
    color: var(--color-neutral-400);

    transition:
      top var(--morph-duration) var(--morph-ease),
      left var(--morph-duration) var(--morph-ease),
      transform var(--morph-duration) var(--morph-ease);
  }

  .block--work.block--compact {
    text-align: left;
  }

  .block--work.block--compact .block__hey {
    font-size: 3rem;
    left: 6.25rem;
    transform: translate(0, -50%);
  }

  .block--work.block--compact .block__tagline {
    top: calc(50% + 2rem); /* half the 3rem greeting + the 0.5rem gap */
    left: 6.25rem;
    transform: none;
  }

  /*
   * Height is transitioned separately from the entrance so the two do not fight:
   * a block resizing between steps should not replay its own entrance delay.
   *
   * transform is declared last so it wins over the shared rule above it. Without
   * this the entrance ran on the fast settle curve instead of the bubble easing.
   */
  .stack .block {
    transition:
      opacity 0.7s ease-out,
      transform 1s var(--rise-ease),
      height var(--morph-duration) var(--morph-ease),
      padding var(--morph-duration) var(--morph-ease),
      border-radius var(--morph-duration) var(--morph-ease),
      corner-shape var(--morph-duration) var(--morph-ease);
  }

  /*
   /*
   * A strip carries its title alone, vertically centred, 4rem in from the left
   * edge. Padding comes off the other sides so the pill still reads as a solid
   * band at its tabled height; the left padding seats the label inside the
   * pill's curve.
   *
   * The radius is not overridden here: the strip is a pill, and the pill value
   * reaches it through `--radius` like every other stack block.
   */
  .block--short {
    justify-content: center;
    padding: 0 0 0 4rem;
    transition:
      height var(--morph-duration) var(--morph-ease),
      padding var(--morph-duration) var(--morph-ease),
      border-radius var(--morph-duration) var(--morph-ease),
      corner-shape var(--morph-duration) var(--morph-ease);
  }

  /*
   * Not expanded, the strip's title sits light; it takes the shared rule's
   * medium weight once the block expands into a tile.
   */
  .block--short .block__title {
    font-weight: 300;
  }

  .row {
    /*
     * A grid, not flex, and `repeat(var(--small-count), 1fr)`: the row fills
     * its column exactly, every tile the same share, at every width in the
     * band. The old `flex: 0 0 250px` pinned each box's width while the column
     * shrank around it, which is what made the tablet band carry 250px tiles in
     * a 720px column with the slack all on one side.
     */
    display: grid;
    grid-template-columns: repeat(var(--small-count), 1fr);
    justify-content: stretch;

    gap: var(--small-gap);
    height: var(--small-height);

    /*
     * The row's own curve, not the stack's — see ROW_EASE. Its overshoot lands
     * late in the morph, on the step where the row expands into its tiles, so
     * the column is already two viewport-ish units taller by the time the pop
     * arrives and has the room for it.
     */
    transition: height var(--morph-duration) var(--row-ease);
  }

  .block--small {
    width: auto;
    justify-content: center;
    height: var(--small-height);
    padding: 0 1.25rem;

    /*
     * Centred, not the stack blocks' left-aligned label.
     *
     * `justify-content` above already seats the title on the tile's vertical
     * middle for both the strip and the square states; this takes the horizontal
     * axis too, so a name reads from the middle of its own box rather than
     * hanging off the left edge. The h3 stretches to the tile's full width as a
     * flex item, so the centring is `text-align` on the box rather than on the
     * title.
     *
     * The anchor reset rides with it: an <a> would otherwise arrive in the
     * browser's own link colour with an underline, and the row's titles are
     * meant to read exactly as the stack's do.
     */
    text-align: center;
    text-decoration: none;
    color: inherit;

    /*
     * Pill-shaped while the row is a strip of tabs, squarer once it expands into
     * tiles. `--small-radius` carries the per-step value, written as the exact
     * rendered radius per step (see SMALL_RADII) so it interpolates smoothly.
     *
     * Scoped through `.row` to outrank the plain `.block` radius below. Both are
     * single-class selectors, so without the extra class the later rule won and
     * every box sat at 40px -- which happened to look right for a 75px strip and
     * only for that. The pill value has to actually reach the element.
     */
    border-radius: var(--small-radius);
  }

  /* The row is keyboard-reachable now, so it needs the same focus ring the
     take-to-the-top button carries. */
  .row .block--small:focus-visible {
    outline: 0.125rem solid var(--color-neutral-100);
    outline-offset: 0.25rem;
  }

  .row .block--small {
    border-radius: var(--small-radius);
  }

  /*
   * The row of small blocks comes in after the stack has settled and then steps
   * through itself, so the page arrives in two readable stages.
   */
  /*
   * The stack blocks read their radius from the RADII table, so a block is a
   * pill while it is a strip and a 40px tile whenever it is tall — the radius
   * travels with the height at each step. Scoped through `.stack` to outrank
   * the plain `.block` and `.block--short` selectors; the small row keeps its
   * own `--small-radius`.
   *
   * The matching 100% smoothing is applied in index.css on `.block--tiled`,
   * which the markup sets exactly when the radius is the tile value.
   * corner-shape is newer than the property list svelte-check validates
   * component CSS against, so declaring it here would raise a spurious
   * unknown-property warning that cannot be suppressed from inside a
   * component.
   */
  .stack .block {
    border-radius: var(--radius, 2.5rem);
  }

  .stack .block {
    transition-delay: calc(var(--index, 0) * 0.1s);
  }

  .blocks--in .row .block {
    transition-delay: calc(0.5s + var(--index, 0) * 0.08s);
  }

  /*
   * Staggering is for the entrance only.
   *
   * `transition-delay` applies to every transitioned property, not just the ones
   * the entrance uses. Left in place after the entrance, each small block kept
   * delaying its own height change by up to 0.82s, so the row expanded one box at
   * a time against a section gap that was already at full size. That is what made
   * the row look broken when it expanded and collapsed again.
   *
   * Zeroing the delay once the entrance has played out makes every step morph fire
   * in unison. Declared after the rules above at equal specificity so it wins.
   */
  .blocks--entered .stack .block,
  .blocks--entered .row .block {
    transition-delay: 0s;
  }

  /*
   * The small row bubbles up from a little lower and later than the stack, so the
   * page assembles in two readable stages rather than all at once.
   */
  .block--small {
    transform: translateY(6rem) scale(0.88);
    will-change: transform, opacity;
  }

  /*
   * Same bubble easing for the row.
   *
   * It has to be repeated here rather than inherited: `.block--small` is a
   * sibling of `.stack .block`, so the stack's transition does not reach it and it
   * would otherwise animate on the shared fast curve from `.block`.
   *
   * `corner-shape` is listed even though it is declared from index.css (the
   * property is too new for svelte-check's component CSS parser, so the
   * declaration lives in the global sheet). The small blocks carry the squircle
   * smoothing only once expanded, per the user's request; without a transition
   * entry the shape would flip discretely at the step boundary while the height
   * and radius morph smoothly around it. corner-shape interpolates through its
   * superellipse() values, so the smoothing eases in with the expansion.
   */
  .row .block--small {
    transition:
      opacity 0.7s ease-out,
      transform 1s var(--rise-ease),
      height var(--morph-duration) var(--row-ease),
      border-radius var(--morph-duration) var(--row-ease),
      corner-shape var(--morph-duration) var(--row-ease);
  }

  /*
   * ── per-class rhythm ──────────────────────────────────────────────────
   *
   * Everything below is keyed off `--device`, set inline on the section from
   * the same breakpoint table the JS heights use, rather than off media
   * queries. The widths and the heights therefore always agree: a viewport
   * cannot sit in the laptop's media query while taking the tablet's height
   * table, which was possible before — one breakpoint in CSS, another in JS.
   *
   * Each band's numbers are authored against its own reference viewport, in
   * the same svh units the heights are emitted in, so a strip's title has the
   * same share of its strip at every size.
   */

  /* Phone: pills at every step, tight gaps, smaller type. */
  .blocks[style*='--device: phone'] .row {
    gap: var(--small-gap);
  }

  .blocks[style*='--device: phone'] .block--small {
    padding: 0 0.25rem;
    border-radius: 1.75rem;

    /* The tile is its title's container, so the phone label can size itself
       against the pill's own width — see the h3 rule below. */
    container-type: inline-size;
  }

  .blocks[style*='--device: phone'] .block--small h3 {
    /*
     * Sized against the tile's own width rather than a fixed rem.
     *
     * Five names across a phone band leaves 46px of pill to hold "instagram"
     * in at 320px, and 68px at 430px. Measured, that label wants 7.25px to fit
     * the narrow pill and 11.75px to fill the wide one, so no single fixed size
     * is right: 0.75rem (the size the wider bands use) needs 59px and clips the
     * word at every phone width, and a fixed 9px still clips below 360px.
     *
     * The tile is made its title's container and the title is set as a share of
     * the tile's content box, so it always fits — 19cqw is measured to sit just
     * under the label's own limit at every width in the band — and reads
     * larger where there is room. The design's 0.75rem stays the ceiling, which
     * is also the point past which the label fits without any scaling.
     */
    font-size: min(0.75rem, 19cqw);
    white-space: nowrap;
  }

  .blocks[style*='--device: phone'] .block--short {
    padding: 0 0 0 2rem;
  }

  .blocks[style*='--device: phone'] .block__hey {
    font-size: 3.5rem;
  }

  .blocks[style*='--device: phone'] .block--work .block__tagline {
    font-size: 1rem;
    top: calc(50% + 2.75rem);
  }

  .blocks[style*='--device: phone'] .block--work.block--compact .block__hey {
    font-size: 2rem;
    left: 2rem;
  }

  .blocks[style*='--device: phone'] .block--work.block--compact .block__tagline {
    font-size: 1rem;
    top: calc(50% + 1.5rem);
    left: 2rem;
  }

  .blocks[style*='--device: phone'] .to-top {
    width: 4rem;
    height: 4rem;
    border-radius: 1rem;
    right: 1.25rem;
    bottom: 1.25rem;
  }

  /* Tablet: between the phone's tight rhythm and the laptop's airy one. */
  .blocks[style*='--device: tablet'] .block--short {
    padding: 0 0 0 3rem;
  }

  .blocks[style*='--device: tablet'] .block__hey {
    font-size: 5rem;
  }

  .blocks[style*='--device: tablet'] .block--work .block__tagline {
    font-size: 1.125rem;
    top: calc(50% + 4rem);
  }

  .blocks[style*='--device: tablet'] .block--work.block--compact .block__hey {
    font-size: 3.5rem;
    left: 5rem;
  }

  .blocks[style*='--device: tablet'] .block--work.block--compact .block__tagline {
    font-size: 1rem;
    top: calc(50% + 3rem);
    left: 5rem;
  }

  .blocks[style*='--device: tablet'] .to-top {
    width: 5rem;
    height: 5rem;
    border-radius: 1.25rem;
    right: 1.5rem;
    bottom: 1.5rem;
  }

  /* Laptop: the design's home — full greeting, generous strips. */
  .blocks[style*='--device: laptop'] .block--short {
    padding: 0 0 0 4rem;
  }

  /* Desktop and ultra: the original proportions, kept. */
  .blocks[style*='--device: desktop'] .to-top,
  .blocks[style*='--device: ultra'] .to-top {
    width: 6.25rem;
    height: 6.25rem;
    border-radius: 1.5625rem;
    right: 1.875rem;
    bottom: 1.875rem;
  }

  /*
   * The strip's vertical room.
   *
   * The strips are 4.6–7.6svh tall and carry a 24px title — measured, 25px of
   * strip at 1080p against a 24px title with no vertical padding: the glyphs
   * sit edge to edge and a strip at any slightly shorter viewport (24px at
   * 900px, 23px at 860px) clips the title outright. The blocks' shared 1.5rem
   * padding cannot do this work, because it is keyed to the tall tiles where
   * it belongs.
   *
   * The padding is therefore set here, per class, to a fraction of the strip's
   * own height rather than a fixed value: 0.5svh of vertical room at every
   * class's proportions. Padding transitions with the morph, so a strip
   * growing into a tile takes its padding up with it.
   */
  .block--short {
    padding-top: 0.5svh;
    padding-bottom: 0.5svh;
  }

  .blocks[style*='--device: phone'] .block--short {
    padding-top: 1svh;
    padding-bottom: 1svh;
  }

  @media (prefers-reduced-motion: reduce) {
    .block,
    .blocks--in .block {
      opacity: 1;
      transform: none;
      transition: none;
      transition-delay: 0s;
    }

    /* No cursor tracking: the glow is the only thing that moves here. */
    .block::after {
      display: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .end-mark {
      transition: none;
    }

    .to-top {
      transition: none;
    }

    .to-top--in {
      transform: none;
    }
  }
  /*
   * Take-to-the-top, in the viewport's bottom-right corner.
   *
   * Fixed rather than absolute, so the offsets are measured from the
   * viewport edges, not the body section — the button sits in the viewport's
   * scope regardless of where the section's content ends. No ancestor carries
   * a transform, filter or backdrop-filter, so the fixed position is measured
   * from the true viewport and the section's overflow clip cannot reach it.
   *
   * Always mounted and revealed by class rather than added by {#if}, so both
   * directions of the reveal can transition: it rises in with a delay so it
   * arrives after stage 4 has settled, and drops out instantly when the
   * stage is left. The same frosted treatment as the blocks, so it reads as
   * part of the same family. The 100% corner smoothing is applied from
   * index.css (corner-shape is too new for svelte-check's component CSS
   * parser).
   */
  .to-top {
    position: fixed;
    right: 1.875rem;
    bottom: 1.875rem;

    display: grid;
    place-items: center;
    width: 6.25rem;
    height: 6.25rem;
    padding: 0;

    border: 0.0625rem solid rgb(255 255 255 / 0.1);
    border-radius: 1.5625rem;
    /* Matches the blocks: no white tint, so the frosted blur shows the colour wash. */
    background: transparent;
    backdrop-filter: blur(1.5rem);
    color: var(--color-neutral-100);
    cursor: pointer;

    opacity: 0;
    transform: translateY(0.5rem);
    pointer-events: none;

    /*
     * The press bounce scales the button itself, and the button carries the
     * same backdrop-filter as the blocks — without a layer of its own, every
     * frame of the press re-solved the blur at a new size on the main thread.
     * Promoted, the reveal and the press both composite, and the rasterised
     * frosted square scales on the GPU.
     */
    will-change: transform, opacity;

    transition:
      opacity 0.5s ease-out,
      transform 0.5s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .to-top--in {
    opacity: 1;
    transform: none;
    pointer-events: auto;

    /* Lets stage 4's expansion settle before the button arrives. */
    transition-delay: 0.6s;
  }

  .to-top:focus-visible {
    outline: 0.125rem solid var(--color-neutral-100);
    outline-offset: 0.25rem;
  }

  /*
   * The closing wordmark, in the landing hero's own sizes.
   *
   * Both lines use the same clamps, line-heights, weights and tracking as the
   * hero, and the second line carries the same -20px margin, so the mark here
   * measures the same as the one the page opened on rather than being a smaller
   * echo of it. See LandingPage.svelte for why the gap is a margin.
   *
   * Out of flow, anchored to the bottom of the body. Left in flow it would
   * consume height at every stage and push the column up, and it is only ever
   * wanted at the last one.
   *
   * The bubble is a spring-eased transform (see END_EASE) rather than a keyframe
   * animation, so it plays in reverse on the way out — leaving the last stage
   * folds the wordmark back down instead of dropping it.
   *
   * The start is deliberately far from rest. A bezier's overshoot is a fraction
   * of the distance travelled, not of the resting value, so a scale that only
   * has to move from 0.86 to 1 overshoots by 2% and reads as a fade that happens
   * to scale. Travelling from 0.5 instead gives it 0.5 to overshoot against and
   * the mark inflates to 8% past its size before settling.
   */
  .end-mark {
    position: absolute;
    left: 50%;

    /*
     * The mark's stack is a line taller than it used to be — the two lines now
     * take their natural leading (see the type rules below) — and the floor
     * offset gives the last of that height back. Left at the old 1rem the
     * taller stack rises 12px further into the small row on the tight bands,
     * whose reservations were tuned to the mark as it measured with the
     * tightening; at 0.25rem every band measures at or better than it did.
     * The phone is the exception, restored below.
     */
    bottom: 0.25rem;

    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0;

    /* Decorative: the name is already in the navbar's accessible label. */
    pointer-events: none;

    opacity: 0;
    transform: translate(-50%, 1rem) scale(0.5);

    /* Composited like the blocks' own bubble, so the overshoot rides the GPU. */
    will-change: transform, opacity;

    transition:
      opacity 0.35s ease-out,
      transform 0.7s var(--end-mark-ease);
  }

  .end-mark--in {
    opacity: 1;
    transform: translate(-50%, 0) scale(1);
  }

  /*
   * The phone takes the original floor back: the mark is a fraction of the
   * band there — both its faces sit at their clamp floors and clear the row by
   * a wide margin — so the extra 12px of height costs nothing there and the
   * old offset keeps the mark's distance from the footer line.
   */
  .blocks[style*='--device: phone'] .end-mark {
    bottom: 1rem;
  }

  /*
   * The hero's own type, unmodified — the same clamps, line-heights, tracking
   * and natural stack, with no margin between the lines — so the mark here
   * measures the same as the one the page opened on, ink gap included. See
   * LandingPage.svelte for how the gap is the leading itself.
   *
   * The clamp matches the hero's own (11vw, 5.5rem ceiling) for the same
   * reason it was narrowed there: at 13vw the mark measured 119px tall on a
   * 2560px display, which is larger than the hero that closed the intro.
   */
  .end-mark__name {
    font-family: var(--font-stacked);
    font-size: clamp(3.5rem, 11vw, 5.5rem);
    font-weight: 200;
    line-height: 0.9;
    letter-spacing: -0.07em;
    color: var(--color-neutral-100);
  }

  .end-mark__studio {
    font-family: var(--font-studio);
    font-size: clamp(1.25rem, 3.2vw, 2.8125rem);
    font-weight: 700;
    line-height: 1;
    letter-spacing: -0.05em;
    color: var(--color-neutral-100);
  }

  /*
   * The space the mark takes has to come out of the body, or the column and the
   * mark would sit on top of each other. The column is centred, so shrinking the
   * area it is centred within lifts it by half as much — which is the shift
   * needed to clear the mark at the bottom without shortening block 1 again.
   *
   * The reservation is bounded from both sides and is expressed in the same dvh
   * the body is, so the relationship holds at any height: it has to be at least
   * the mark plus its offset, and at most the slack the last stage's column
   * leaves — which is 14.5% of the body against a 70.5% column.
   *
   * The reservation is transitioned so the lift arrives with the stage change
   * rather than jumping ahead of the morph playing underneath it.
   *
   * Per class, because the mark's own size is per class (the clamp resolves to
   * 56px on a phone and 88px on a desktop) while the column's slack is not —
   * measured at 390×844 the mark measured 30px and still overlapped the 64px
   * small row by 10px, because the phone's reservation was a share of a body
   * that is 717px tall against the desktop's tuned ratio. The tablet band needs
   * its own value for the same reason: its row squares off into tiles at the
   * last step and sits 51px tall against a mark that is 45px.
   */
  .blocks--end {
    padding-bottom: 12.5dvh;
    transition: padding-bottom var(--morph-duration) var(--morph-ease);
  }

  .blocks[style*='--device: tablet'].blocks--end {
    padding-bottom: 13dvh;
  }

  /*
   * Below the phone band the clamps resolve to their smallest ends and the
   * mark is a fraction of the desktop height, so the reservation comes down
   * with them — keyed off the device class, like every other per-band number.
   *
   * The phone's mark measures 70px (56px name + 20px studio, the lines now at
   * their natural leading) and sits 16px up from the body's floor, so it needs
   * 86px of room below the
   * small row. Measured at 390×844 the row's bottom left only 54px of body
   * beneath it, so the mark and the row overlapped by 23px no matter what the
   * column's own slack was. 12dvh of that body is 101px, and the column's own
   * slack tops it up on shorter phones — measured at 375×667 the name ink
   * still sits 35px clear of the row.
   */
  .blocks[style*='--device: phone'].blocks--end {
    padding-bottom: 12dvh;
  }
</style>
