/*
 * The ghost, made of light.
 *
 * WHAT THIS IS. The hero's ghost is not drawn and then decorated with
 * particles - it IS the particles. A few hundred points of light holding
 * the shape of HireProof's own mark, breathing, with embers lifting off
 * it and settling back.
 *
 * THE SHAPE COMES FROM THE LOGO ITSELF. GHOST_PATH below is the exact
 * path string the wordmark uses. It is rasterised once offscreen, the
 * eyes are punched out of it, and the points are sampled from what is
 * left. There is one copy of that outline in the project, so editing the
 * logo edits this too, with no second set of coordinates to keep in step.
 *
 * WHAT CHANGED, AND WHY. The first version was an intro: the cloud
 * gathered into the ghost, then the ghost dissolved and its particles
 * flew out to sit on the arc at the score of each labelled posting. It
 * was honest - it drew real data - but it had two problems. It played
 * once, so the hero sat still for the rest of the visit and the page
 * looked dead unless you reloaded it. And it spent the ghost: three
 * seconds in, the brand mark was gone.
 *
 * So the data story lives entirely in the three charts now, where a
 * reader can actually study it, and the hero does the job a hero should:
 * it is the mark, alive. Nothing here waits on model.json any more,
 * which also means it starts on the first frame rather than after a
 * network round trip.
 *
 * It is disposable by design. With JavaScript off, with motion turned
 * off, or if the canvas context cannot be created, the page keeps the
 * drawn SVG ghost and loses nothing.
 */

// The brand ghost, in a 24x24 box - the same outline as the wordmark.
const GHOST_PATH =
  "M12 1.8A8.2 8.2 0 0 0 3.8 10v10.3c0 1 1.1 1.5 1.9 1l1.9-1.4c.35-.26.83-.26 " +
  "1.18 0l1.55 1.15c.35.26.83.26 1.18 0l1.55-1.15c.35-.26.83-.26 1.18 0l1.9 " +
  "1.4c.8.58 1.86.03 1.86-1V10A8.2 8.2 0 0 0 12 1.8Z";
const GHOST_EYES = [[9.1, 9.9, 1.35], [14.9, 9.9, 1.35]];

// Enough that the silhouette reads as a solid shape at a glance and as
// separate points of light close up.
const COUNT = 340;

/**
 * Sample points from inside the ghost outline.
 *
 * Rasterise the path, read the pixels, keep the ones that landed inside.
 * Doing it this way rather than hand-placing coordinates means the
 * silhouette cannot drift away from the logo.
 */
function ghostPoints(count) {
  const SIZE = 200;
  const off = document.createElement("canvas");
  off.width = SIZE;
  off.height = SIZE;
  const octx = off.getContext("2d", { willReadFrequently: true });
  if (!octx) return [];

  const scale = SIZE / 24;
  octx.setTransform(scale, 0, 0, scale, 0, 0);
  octx.fillStyle = "#fff";
  octx.fill(new Path2D(GHOST_PATH));
  // Punch the eyes out, so it reads as the mark rather than as a blob
  // with roughly the right outline.
  octx.globalCompositeOperation = "destination-out";
  for (const [cx, cy, r] of GHOST_EYES) {
    octx.beginPath();
    octx.arc(cx, cy, r * 1.3, 0, Math.PI * 2);
    octx.fill();
  }

  const data = octx.getImageData(0, 0, SIZE, SIZE).data;
  const inside = [];
  for (let y = 0; y < SIZE; y += 2) {
    for (let x = 0; x < SIZE; x += 2) {
      if (data[(y * SIZE + x) * 4 + 3] > 128) {
        inside.push({ x: x / SIZE - 0.5, y: y / SIZE - 0.5 });
      }
    }
  }
  if (inside.length === 0) return [];

  // Evenly spaced picks rather than random ones: random sampling clumps,
  // and a clumped silhouette reads as noise rather than as a shape.
  const points = [];
  const step = inside.length / count;
  for (let i = 0; i < count; i += 1) {
    points.push(inside[Math.floor(i * step) % inside.length]);
  }
  return points;
}

function createHeroField(canvas, options) {
  const motionOn = options.motionOn;
  let colours = options.colours;
  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return null;

  const shape = ghostPoints(COUNT);
  if (shape.length === 0) return null;

  let width = 0;
  let height = 0;
  let running = false;
  let inView = true;
  let lastFrame = 0;
  const bornAt = performance.now();

  const particles = shape.map((s) => ({
    sx: s.x,
    sy: s.y,
    x: 0, y: 0, homeX: 0, homeY: 0,
    // Each point keeps its own phase and rate, so the shimmer never
    // pulses in unison - which is what makes it read as a cloud of
    // separate things rather than one object being scaled.
    phase: Math.random() * Math.PI * 2,
    rate: 0.4 + Math.random() * 0.9,
    amp: 0.6 + Math.random() * 1.4,
    bright: Math.random() < 0.18,
    liftAt: performance.now() + 1500 + Math.random() * 14000,
    liftFrom: 0,
    placed: false,
  }));

  function layout() {
    const rect = canvas.getBoundingClientRect();
    /* A hidden tab panel reports a zero-size box. Recomputing against
       that would put every particle at the same point and blank the
       canvas, and nothing but a reload would bring it back - which is
       exactly what "it only works when I refresh" looks like. */
    if (rect.width < 2 || rect.height < 2) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = rect.width;
    height = rect.height;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    /* Centred and large enough to be the hero image in its own right.
       The first attempt kept it at the size and offset of the small
       drawn ghost, tucked beside the two sheets - at that scale 260
       overlapping points with a glow on each read as a bright smudge
       rather than a silhouette. Big enough to see the outline, and it
       stands on the horizon arc, whose apex is at y=190. */
    const tall = Math.min(height * 0.95, 180);
    const cx = width / 2;
    const cy = height * 0.5;
    for (const p of particles) {
      p.homeX = cx + p.sx * tall;
      p.homeY = cy + p.sy * tall;
      if (!p.placed) {
        /* Start ON the shape, not scattered around it.
           The gathering intro was pretty on a fast machine and a liability
           everywhere else: it depended on enough frames arriving to ease
           the points home, so on a throttled or busy page the ghost spent
           its first seconds as a shapeless cloud - and that is the state
           anyone taking a screenshot would catch. The silhouette is the
           point, so it is correct from the first frame and the life comes
           from the shimmer instead. */
        p.x = p.homeX;
        p.y = p.homeY;
        p.placed = true;
      }
    }
  }

  function paint(now, animate) {
    if (width < 2) return;
    ctx.clearRect(0, 0, width, height);

    /* Frame-rate independent easing. "Move 8% of the way there each
       frame" quietly means "move faster on a 144Hz screen and slower on
       a throttled one" - the same code settled in under a second at 60fps
       and took most of a minute where frames were scarce, which read as
       the shape never forming at all. Converting the per-frame factor to
       a per-millisecond one makes the motion take the same real time
       everywhere. The clamp stops a long pause (a background tab, a
       stalled main thread) teleporting everything on the first frame
       back. */
    const dt = lastFrame ? Math.min(now - lastFrame, 120) : 16.7;
    lastFrame = now;
    const ease = 1 - Math.pow(1 - 0.08, dt / 16.7);

    // The whole mark drifts up and down slowly, because it is a ghost.
    const bob = animate ? Math.sin(now * 0.0008) * 4 : 0;

    for (const p of particles) {
      let targetX = p.homeX;
      let targetY = p.homeY + bob;
      let alpha = 0.85;
      let size = 1.25;

      if (animate) {
        // A small private orbit, so the surface of the shape shimmers.
        targetX += Math.sin(now * 0.0006 * p.rate + p.phase) * p.amp;
        targetY += Math.cos(now * 0.0005 * p.rate + p.phase) * p.amp;

        /* Embers. Every so often a point lets go, rises, fades out and
           comes back - a handful at a time out of 260, enough to keep the
           shape alive without it ever looking like it is coming apart. */
        if (p.liftFrom === 0 && now > p.liftAt) p.liftFrom = now;
        if (p.liftFrom > 0) {
          const t = (now - p.liftFrom) / 2400;
          if (t >= 1) {
            p.liftFrom = 0;
            p.liftAt = now + 4000 + Math.random() * 16000;
            p.x = p.homeX;
            p.y = p.homeY;
          } else {
            targetY -= t * 46;
            targetX += Math.sin(t * 4 + p.phase) * 7;
            alpha = 0.85 * (1 - t);
            size = 1.25 - t * 0.5;
          }
        }

        alpha *= 0.72 + Math.sin(now * 0.0012 * p.rate + p.phase) * 0.28;
        p.x += (targetX - p.x) * ease;
        p.y += (targetY - p.y) * ease;
      } else {
        p.x = targetX;
        p.y = targetY;
      }

      // One short fade-up for the whole mark, which cannot deform it.
      alpha *= Math.min(1, (now - bornAt) / 900);
      if (alpha < 0.02) continue;
      const colour = p.bright ? colours.core : colours.body;
      ctx.globalAlpha = Math.min(alpha, 1);
      ctx.fillStyle = colour;
      ctx.shadowColor = colour;
      ctx.shadowBlur = p.bright ? 5 : 2.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.bright ? size + 0.5 : size, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;
  }

  function loop(now) {
    if (!running) return;
    paint(now, true);
    requestAnimationFrame(loop);
  }

  /* One place that decides whether the loop should be running, called by
     everything that can change the answer. Separate start/stop calls from
     three different observers made the result depend on which fired last,
     and an early resize could leave the field stopped for good. */
  function maybeRun() {
    /* Deliberately NOT checking document.hidden.
       The browser already suspends requestAnimationFrame in a background
       tab, so pausing by hand adds nothing - and it actively breaks in
       any context that reports hidden while still painting, such as an
       embedded or occluded view. One of those flipped hidden true and
       false every few hundred milliseconds, and each flip killed the
       loop: the ghost sat frozen and only a reload appeared to fix it.
       Whether to run is about whether the canvas is on screen, which the
       intersection observer already answers. */
    const should = inView && motionOn() && width >= 2;
    if (should !== running) {
      running = should;
      if (should) requestAnimationFrame(loop);
    }
    if (!should) paint(performance.now(), false);
  }

  // Scrolled past, not running: no reason to pay for an animation frame
  // on a hero nobody can see. A background tab is the browser's own job.
  new IntersectionObserver((entries) => {
    inView = entries[0].isIntersecting;
    maybeRun();
  }, { threshold: 0.01 }).observe(canvas);

  // A ResizeObserver on the canvas rather than a window resize listener:
  // it fires on the first real layout as well as on every later change,
  // so the positions are never computed from a box the browser has not
  // finished working out.
  new ResizeObserver(() => {
    layout();
    maybeRun();
    /* Assigning canvas.width wipes the bitmap, so without this the hero
       is blank from the resize until the next animation frame. At 60fps
       that is invisible; on a throttled or busy page it is a gap long
       enough to notice, and coming back to the tab showed an empty box
       for a moment. */
    if (running) paint(performance.now(), true);
  }).observe(canvas);

  layout();
  maybeRun();


  return {
    /** Light and dark have different palettes, and the canvas holds
        resolved colours rather than variables, so it must be told. */
    setColours(next) {
      colours = next;
      if (!running) paint(performance.now(), false);
    },
    /** The footer toggle calls this so the choice applies immediately. */
    refreshMotion() {
      maybeRun();
    },
  };
}

export { createHeroField };
