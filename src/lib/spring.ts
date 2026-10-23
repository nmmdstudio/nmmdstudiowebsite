/*
 * The site's bounce easings, evaluated as springs rather than drawn as beziers.
 *
 * A bezier back-ease gets its overshoot by pulling a control point past 1, and
 * everything that follows — the launch, the peak, the return — is the bezier's
 * own algebra: the reversal at the peak is as sharp as the control points say,
 * and the settle snaps back onto its target. A spring gets the same overshoot
 * the way a real object does: it arrives carrying the launch velocity it was
 * given, carries past its target on that momentum, and the return is an
 * exponential ring-down.
 *
 * springEase() fits a spring to the bezier it replaces: the same launch slope,
 * the same peak height, the peak landing at the same moment. Every measured
 * bound the bezier was tuned to therefore still holds exactly — a strip's
 * overshoot still bottoms out at the same height it always did — and only the
 * character of the motion changes: the reversal at the peak is round, and the
 * settle decays instead of snapping.
 *
 * The curve is emitted as CSS `linear()`, which interpolates straight chords
 * between listed points; sampled every eightieth of the duration the chords
 * lie on the curve to well under a pixel. Engines without `linear()` (it
 * shipped in Chrome 113, Safari 17.2 and Firefox 112) keep the fallback bezier,
 * which is the same motion in the bezier's character.
 */

/** Whether this engine understands `linear()` easing. */
const supportsLinear = CSS.supports('transition-timing-function', 'linear(0, 1)');

/*
 * One spring, shot at its target: launched from rest at zero with initial
 * velocity `launch`, ringing down around 1.
 *
 *   p(t) = 1 − e^(−λt)·(cos ωt + k·sin ωt),   k = (λ − launch)/ω
 *
 * λ is the damping and ω the clock. Neither is ever written down by a caller —
 * both are solved from the shape of the motion (see solveDecay and
 * solveClock), so a caller describes the bounce it wants — how hard it
 * launches, how far past its target it carries, when the peak lands — and
 * never the physics underneath.
 */
const response = (t: number, omega: number, lambda: number, launch: number) => {
  const k = (lambda - launch) / omega;
  return 1 - Math.exp(-lambda * t) * (Math.cos(omega * t) + k * Math.sin(omega * t));
};

/** The curve's first (and highest) overshoot, and the moment it lands. */
const peakOf = (omega: number, lambda: number, launch: number) => {
  let peak = -1;
  let peakT = 0;

  for (let i = 1; i <= 4000; i++) {
    const t = i / 4000;
    const y = response(t, omega, lambda, launch);
    if (y > peak) {
      peak = y;
      peakT = t;
    }
  }

  return { overshoot: peak - 1, at: peakT };
};

/*
 * The damping that makes the overshoot equal its target.
 *
 * Monotone: more damping, less overshoot, so a bisection finds it. The bounds
 * hold any curve this module is asked for — a launch of ~8 with an overshoot
 * of ~16% needs λ ≈ 5, and a nearly-critically-damped shot still wants λ > 0.
 */
const solveDecay = (omega: number, launch: number, overshoot: number) => {
  let lo = 0.001;
  let hi = 30;

  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (peakOf(omega, mid, launch).overshoot > overshoot) lo = mid;
    else hi = mid;
  }

  return (lo + hi) / 2;
};

/*
 * The clock that lands the peak at its target moment.
 *
 * Also monotone: a faster clock, an earlier peak. Bounded from both sides for
 * the same reason — no curve here peaks in the first 2% or the last 30%.
 */
const solveClock = (launch: number, overshoot: number, peakAt: number) => {
  let lo = 0.5;
  let hi = 40;

  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    const lambda = solveDecay(mid, launch, overshoot);
    if (peakOf(mid, lambda, launch).at > peakAt) lo = mid;
    else hi = mid;
  }

  const omega = (lo + hi) / 2;
  return { omega, lambda: solveDecay(omega, launch, overshoot) };
};

/*
 * The tail. A spring never exactly rests, but a transition must end exactly on
 * its target or the last frame jumps the remaining distance — a hitch at the
 * exact moment the eye is on the landing.
 *
 * So the remaining deviation is eased to zero through a window that leaves
 * the curve untouched through the peak and reaches zero — in value and in
 * slope — at t = 1: (1 − u²)², u the progress through the final third. Before
 * the window opens, the curve is the pure spring; after, it is still
 * decaying, just steered the last stretch onto its rest.
 */
const TAIL_FROM = 0.7;
const windowAt = (t: number) => {
  if (t <= TAIL_FROM) return 1;

  const u = (t - TAIL_FROM) / (1 - TAIL_FROM);
  return (1 - u * u) ** 2;
};

/*
 * The bezier a spring replaces, read for the shape it was tuned to.
 *
 * The metrics come off the parametric curve directly: a cubic bezier's initial
 * slope is y1/x1, and its overshoot and peak moment are the maximum of y(u)
 * and the x(u) there. Measured rather than hard-coded, so the fallback string
 * stays the one source of truth for the motion's shape — retune the bezier and
 * the spring follows it.
 */
type Bezier = { x1: number; y1: number; x2: number; y2: number };

const parseBezier = (ease: string): Bezier | undefined => {
  const match = ease.match(
    /cubic-bezier\(\s*([\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*([\d.]+)\s*,\s*(-?[\d.]+)\s*\)/,
  );

  if (!match) return undefined;

  return {
    x1: Number(match[1]),
    y1: Number(match[2]),
    x2: Number(match[3]),
    y2: Number(match[4]),
  };
};

const bezierAt = (b: Bezier, t: number) => {
  /* Solve x(u) = t for the parameter, then read y there. */
  let lo = 0;
  let hi = 1;

  for (let i = 0; i < 50; i++) {
    const u = (lo + hi) / 2;
    const x = 3 * (1 - u) ** 2 * u * b.x1 + 3 * (1 - u) * u ** 2 * b.x2 + u ** 3;
    if (x < t) lo = u;
    else hi = u;
  }

  const u = (lo + hi) / 2;
  return 3 * (1 - u) ** 2 * u * b.y1 + 3 * (1 - u) * u ** 2 * b.y2 + u ** 3;
};

const bezierMetrics = (b: Bezier) => {
  let peak = 0;
  let peakAt = 0;

  for (let i = 0; i <= 2000; i++) {
    const t = i / 2000;
    const y = bezierAt(b, t);
    if (y > peak) {
      peak = y;
      peakAt = t;
    }
  }

  return { launch: b.y1 / b.x1, overshoot: peak - 1, peakAt };
};

/*
 * The same bounce as `bezier`, as a spring.
 *
 * The bezier is the shape of record: its launch, its overshoot and (unless
 * `peakAt` overrides — for curves allowed a livelier tail, landing the peak a
 * little earlier leaves the settle room for a small visible ring-down) the
 * moment its peak lands are all read off it, and the spring is solved to
 * match. Unsupported engines get the bezier itself, motion unchanged.
 *
 * Easing strings only; the two gesture bounces in Blocks.svelte evaluate their
 * own springs frame by frame, because their amplitudes are measured at runtime
 * and cannot be baked into an easing.
 */
export const springEase = (bezier: string, peakAt?: number): string => {
  if (!supportsLinear) return bezier;

  const b = parseBezier(bezier);
  if (!b) return bezier;

  const metrics = bezierMetrics(b);
  if (metrics.overshoot <= 0.001) return bezier;

  const { omega, lambda } = solveClock(metrics.launch, metrics.overshoot, peakAt ?? metrics.peakAt);

  /*
   * Sampled every eightieth of the duration, the last point exactly 1 so the
   * transition lands dead on its target. Values carry four decimals: a fifth
   * would be under a thousandth of a percent of travel, which no morph on this
   * site could paint.
   */
  const points: string[] = ['0 0%'];
  for (let i = 1; i < 80; i++) {
    const t = i / 80;
    const y = 1 + (response(t, omega, lambda, metrics.launch) - 1) * windowAt(t);
    points.push(`${y.toFixed(4)} ${(t * 100).toFixed(2)}%`);
  }
  points.push('1 100%');

  return `linear(${points.join(', ')})`;
};
