<script lang="ts">
  import { LETTERS, measureTracks } from '../lib/wordmark';

  import { springEase } from '../lib/spring';

  /*
   * The logo is hidden until the landing page has left.
   *
   * It used to be mounted from the first paint, which put a wordmark in the
   * middle of the loading screen's own animation. Holding it back until the hero
   * has gone means the logo is the first thing seen of the homepage rather than
   * something that was already there behind everything.
   */
  let {
    revealed = false,
    last = false,
    onlogo,
  }: { revealed?: boolean; last?: boolean; onlogo?: () => void } = $props();

  /*
   * The landing screen's sequence, on a curve that bounces.
   *
   * Same shape as the hero: the three letters NMMD does not already hold are
   * closed at rest, and hovering opens them one after another in reading order,
   * each pushing the letters after it across. The word resolves and then folds
   * back up when the cursor leaves.
   *
   * Only the curve changes. The landing's settles; this one is a spring (see
   * lib/spring.ts) carrying the same 14% overshoot the back-ease had, with the
   * peak brought forward a touch so each letter settles with a small
   * ring-down. The word inflates past its full width and rings back onto it,
   * which is what turns the resolve into a bounce rather than an unfold.
   */
  const LETTER_DURATION = 0.55;
  const LETTER_STAGGER = 0.06;
  const LETTER_EASE = springEase('cubic-bezier(0.22, 1.7, 0.36, 1)', 0.34);

  /** Track widths read from the off-screen copy, once the font has loaded. */
  let track = $state<Record<number, number>>({});

  let measureHost: HTMLElement | undefined = $state();

  /*
   * The tracks are read once, from fonts.ready, and never again: the letter
   * widths only depend on the font, and the logo's own size is fixed in rem.
   * Until they are read every track is zero, so the added letters stay closed
   * and a hover that arrives early simply does nothing.
   */
  $effect(() => {
    const host = measureHost;
    if (!host) return;

    let cancelled = false;

    document.fonts.ready.then(() => {
      if (cancelled) return;
      track = measureTracks(host);
    });

    return () => {
      cancelled = true;
    };
  });
</script>

<header class="nav" class:nav--in={revealed} class:nav--last={last}>
  <nav class="nav__bar">
    <a
      class="nav__logo"
      href="#top"
      aria-label="NMMD home"
      tabindex={revealed ? 0 : -1}
      style="
        --letter-duration: {LETTER_DURATION}s;
        --letter-stagger: {LETTER_STAGGER}s;
        --letter-ease: {LETTER_EASE};
        --count: {LETTERS.length};
      "
      onclick={(event) => {
        /* The click glides the runway's scroll back to stage 1. */
        event.preventDefault();
        onlogo?.();
      }}
    >
      {#each LETTERS as letter, i (i)}
        <span
          class="letter"
          class:letter--added={letter.added}
          style="--i: {i}; --track: {track[i] ?? 0}px"
          aria-hidden="true"
          >{letter.char}</span
        >
      {/each}
    </a>

    <!--
      Off-screen copy of the word at the logo's own size, read only for the letter
      tracks. It shares the logo's typography (see the rule below) because a width
      measured from any other size is not the width the real letter will occupy.
    -->
    <span class="measure" aria-hidden="true" bind:this={measureHost}>
      <span class="measure__word">
        {#each LETTERS as letter, i (i)}
          <span class="measure__letter" data-measure={i}>{letter.char}</span>
        {/each}
      </span>
    </span>
  </nav>
</header>

<style>
  /*
   * The first of the three constant sections: in flow at the top of the page
   * column, above the body, at the spec's 10vh. dvh tracks the space the
   * mobile browser's collapsed address bar leaves, where vh would run
   * underneath it. No background, border or blur: the bar is the logo and
   * nothing else, so the page's black reads through it uninterrupted and the
   * backdrop is not broken up by a floating panel.
   *
   * The section itself centres the bar, so the logo lands mid-section rather
   * than pinned under the top edge.
   *
   * At the last stage the bar dims rather than vanishing: the logo stays where
   * it is and stays clickable, because it is still the way back up, but it stops
   * competing with the wordmark the page closes on. The dim is on the header and
   * not the logo, so the logo's own reveal transition is untouched.
   */
  .nav {
    height: 10vh;
    height: 10dvh;
    display: grid;
    place-items: center;

    transition: opacity 0.7s ease-out;
  }

  .nav--last {
    opacity: 0.22;
  }

  .nav__bar {
    display: grid;
    place-items: center;

    /* The off-screen measure copy is anchored to the bar. */
    position: relative;

    padding: 1.5rem;
  }

  /*
   * The logo and the hidden copy that measures it read their typography from one
   * rule. A width measured at a different size, weight or spacing is not the
   * width the real letter takes, and every track would open wrong.
   */
  .nav__logo,
  .measure__word {
    font-family: var(--font-stacked);
    font-size: 3.125rem;
    font-weight: 200;
    line-height: 1;
    letter-spacing: -0.05em;
  }

  /*
   * The entrance drops the logo in from above the bar rather than fading it, so
   * it arrives with the blocks instead of sitting already-resolved while the
   * page assembles around it.
   */
  .nav__logo {
    color: var(--color-neutral-100);
    text-decoration: none;

    /* The word grows by three letters on hover and must not reflow mid-resolve. */
    white-space: nowrap;

    opacity: 0;
    transform: translateY(-0.75rem);

    transition:
      opacity 0.5s ease-out,
      transform 0.5s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .nav--in .nav__logo {
    opacity: 1;
    transform: none;
  }

  .nav__logo:focus-visible {
    outline: 0.125rem solid var(--color-neutral-100);
    outline-offset: 0.25rem;
  }

  /*
   * Each letter is its own inline-block, because a width can only be animated on
   * a box. `pre` keeps the letters from being re-spaced by whitespace collapsing
   * between them in the template.
   */
  .nav__logo .letter {
    display: inline-block;
    white-space: pre;
  }

  /*
   * The letters the resolve inserts are closed at rest: zero width and
   * transparent, so the logo reads NMMD. Hovering opens them to the width
   * measured from the off-screen copy, which pushes the letters after them
   * across — that displacement is what makes the word resolve rather than the
   * letters simply appearing.
   *
   * The transition lives on the letter and not on the hover rule so both
   * directions animate: leaving plays the same sequence backwards.
   */
  .nav__logo .letter--added {
    width: 0;
    opacity: 0;
    visibility: hidden;

    transition:
      opacity var(--letter-duration) var(--letter-ease),
      width var(--letter-duration) var(--letter-ease),
      /*
       * Visibility is interpolable and is listed so the closing fade is not cut
       * short: it holds `visible` until the transition ends, where an untransitioned
       * flip would drop the letters out from under their own fade-out.
       */
      visibility var(--letter-duration) var(--letter-ease);

    /*
     * Closing runs from the last letter back, the reverse of the reveal, so the
     * word folds up the way it opened instead of all seven going at once.
     */
    transition-delay: calc((var(--count) - 1 - var(--i)) * var(--letter-stagger));
  }

  /*
   * The reveal. Every added letter opens in reading order, staggered by one step
   * each, the same sequence and the same timings the landing screen uses — only
   * the easing differs, and it overshoots.
   */
  .nav__logo:hover .letter--added,
  .nav__logo:focus-visible .letter--added {
    width: var(--track);
    opacity: 1;
    visibility: visible;
    transition-delay: calc(var(--i) * var(--letter-stagger));
  }

  /*
   * Off-screen copy of the word at the logo's own size, read only for the letter
   * tracks. `visibility: hidden` keeps it out of the paint and out of the
   * accessibility tree, but it still lays out, which is what the measurement
   * needs.
   */
  .measure {
    position: absolute;
    top: 0;
    left: 0;
    visibility: hidden;
    pointer-events: none;
  }

  .measure__word {
    display: block;
    white-space: nowrap;
  }

  .measure__letter {
    display: inline-block;
  }

  @media (prefers-reduced-motion: reduce) {
    .nav__logo {
      opacity: 1;
      transform: none;
      transition: none;
    }

    /*
     * The wordmark still resolves, because it carries information rather than
     * being decoration; it just does so without the bounce. The letters keep
     * their own transition, so the blanket `transition: none` above does not
     * reach them.
     */
    .nav__logo .letter--added {
      transition: none;
    }
  }
</style>
