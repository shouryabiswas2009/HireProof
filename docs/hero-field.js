/*
 * The particle field behind the hero.
 *
 * WHAT IT IS, AND WHY IT IS NOT WALLPAPER. The reference for this kind of
 * motion is a cloud of light that gathers into a slowly turning sphere:
 * lovely, and completely unrelated to whatever page it is sitting on. A
 * sphere would have been borrowed. Two things here are not.
 *
 * THE SHAPE IS THE BRAND MARK. The cloud gathers into HireProof's own
 * ghost, sampled from the exact path the wordmark and the hero drawing
 * use - GHOST_PATH below is that path, rasterised offscreen and sampled
 * for points. Change the logo and this changes with it, because there is
 * only one copy of the outline.
 *
 * THE PARTICLES ARE THE DATASET. Thirty of them are the thirty labelled
 * postings, read from model.json. The sequence is the model's own story,
 * in order:
 *
 *   1. SCATTER   Before model.json arrives, thirty postings and no
 *                structure - which is precisely what they are.
 *   2. GATHER    They pull into the ghost. Still no opinion about any
 *                one of them, just the shape of the problem.
 *   3. SETTLE    The model lands. Each posting flies to its own score on
 *                the arc: genuine to the left, ghost to the right, the
 *                two classes on opposite sides of the line.
 *
 * So it ends by drawing the same data as the chart on the model tab, and
 * the overlap in the middle is real. If the thirty separated cleanly the
 * arc would finish with a gap in it. It does not, because they do not.
 *
 * All of it is disposable. With JavaScript off, with motion turned off,
 * or if the model fails to load, the page keeps its CSS arc and loses
 * nothing it needs.
 */

// The brand ghost, in a 24x24 box - the same outline as the wordmark and
// the hero drawing.
const GHOST_PATH =
  "M12 1.8A8.2 8.2 0 0 0 3.8 10v10.3c0 1 1.1 1.5 1.9 1l1.9-1.4c.35-.26.83-.26 " +
  "1.18 0l1.55 1.15c.35.26.83.26 1.18 0l1.55-1.15c.35-.26.83-.26 1.18 0l1.9 " +
  "1.4c.8.58 1.86.03 1.86-1V10A8.2 8.2 0 0 0 12 1.8Z";
const GHOST_EYES = [[9.1, 9.9, 1.35], [14.9, 9.9, 1.35]];

// Thirty are the data. The rest are dimmer and fade out once the real
// ones have settled: they exist to make the ghost legible, and a shape
// drawn from thirty dots is not.
const FILLER = 150;

/**
 * Sample points from inside the ghost outline.
 *
 * Rasterise the path once, read the pixels, and keep the ones that landed
 * inside it. Doing it this way rather than hand-placing coordinates means
 * the silhouette cannot drift away from the logo, and an edit to the path
 * needs no second set of numbers here.
 */
function ghostPoints(count) {
  const SIZE = 160;
  const off = document.createElement("canvas");
  off.width = SIZE;
  off.height = SIZE;
  const octx = off.getContext("2d", { willReadFrequently: true });
  if (!octx) return [];

  const scale = SIZE / 24;
  octx.setTransform(scale, 0, 0, scale, 0, 0);
  octx.fillStyle = "#fff";
  octx.fill(new Path2D(GHOST_PATH));
  // Punch the eyes out, so the silhouette reads as the mark rather than
  // as a blob with roughly the right outline.
  octx.globalCompositeOperation = "destination-out";
  for (const [cx, cy, r] of GHOST_EYES) {
    octx.beginPath();
    octx.arc(cx, cy, r * 1.25, 0, Math.PI * 2);
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

  // Evenly spaced picks rather than random ones: random sampling clumps,
  // and a clumped silhouette reads as noise.
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
  if (!ctx) return { setData() {}, refreshMotion() {} };

  let width = 0;
  let height = 0;
  let particles = [];
  let shape = [];
  let settled = false;
  let settledAt = 0;
  let running = false;
  let inView = true;

  /* The arc the postings land on: the same circle the stylesheet draws,
     so the field sits exactly on the rim rather than somewhere near it. */
  function arcAt(t) {
    /* The SAME circle the stylesheet draws - radius 560 centred 750px
       down - rather than a curve of similar shape. Both boxes are centred
       on the hero, so sharing the numbers puts the particles exactly on
       the painted rim instead of near it.

       The spread is clamped so the ends of the arc cannot fall out of the
       bottom of the canvas. They did: at full width the curve sagged to
       y=323 in a box 300 tall, so the outer third of the postings were
       being drawn off the edge and the field looked half as wide as it
       should. */
    const cx = width / 2;
    const radius = 560;
    const cy = 750;
    const floor = cy - (height - 10);
    const maxDx = Math.sqrt(Math.max(0, radius * radius - floor * floor));
    const spread = Math.min(width * 0.44, maxDx);
    const dx = t * spread;
    return { x: cx + dx, y: cy - Math.sqrt(Math.max(0, radius * radius - dx * dx)) };
  }

  function layout() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = rect.width;
    height = rect.height;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const ghostSize = Math.min(height * 0.82, width * 0.42);
    particles.forEach((p, i) => {
      const s = shape[i] || { x: 0, y: 0 };
      p.shapeX = width / 2 + s.x * ghostSize;
      p.shapeY = height * 0.40 + s.y * ghostSize;
      if (p.data) {
        const home = arcAt((p.score - 0.5) * 2);
        p.homeX = home.x;
        // Ghost postings just outside the arc, genuine just inside, so
        // the classes are separated by position and not only by colour.
        p.homeY = home.y + (p.ghost ? -9 : 9);
      }
    });
  }

  function seed(points) {
    const total = points.length + FILLER;
    shape = ghostPoints(total);
    particles = [];
    for (let i = 0; i < total; i += 1) {
      const d = points[i];
      particles.push({
        data: Boolean(d),
        score: d ? d.p : 0,
        ghost: d ? d.ghost === 1 : Math.random() < 0.5,
        x: Math.random() * Math.max(width, 1),
        y: Math.random() * Math.max(height, 1),
        shapeX: 0, shapeY: 0, homeX: 0, homeY: 0,
        drift: Math.random() * Math.PI * 2,
        bob: Math.random() * Math.PI * 2,
      });
    }
    layout();
  }

  function paint(now, animate) {
    ctx.clearRect(0, 0, width, height);
    const done = settled && (!animate || now - settledAt > 1400);
    // The filler dots are scaffolding for the silhouette, so they leave
    // once the shape has done its job.
    const fillerFade = done
      ? Math.max(0, 1 - (now - settledAt - 1400) / 2200)
      : 1;
    // A slow vertical bob, because it is a ghost.
    const float = animate ? Math.sin(now * 0.0009) * 5 : 0;

    for (const p of particles) {
      let tx;
      let ty;
      if (done && p.data) {
        p.drift += 0.006;
        tx = p.homeX + Math.sin(p.drift) * 1.6;
        ty = p.homeY + Math.cos(p.drift * 0.8) * 1.6;
      } else {
        p.bob += 0.01;
        tx = p.shapeX + Math.sin(p.bob) * 1.2;
        ty = p.shapeY + float;
      }

      if (animate) {
        // Ease toward the target: a fraction of the distance left each
        // frame, so it arrives and stops rather than snapping.
        p.x += (tx - p.x) * 0.055;
        p.y += (ty - p.y) * 0.055;
      } else {
        p.x = tx;
        p.y = ty;
      }

      let alpha;
      let size;
      if (p.data) {
        alpha = done ? 0.95 : 0.85;
        size = done ? 2.6 : 1.9;
      } else {
        alpha = 0.3 * fillerFade;
        size = 1.3;
      }
      if (alpha < 0.01) continue;

      const colour = p.data
        ? (p.ghost ? colours.ghost : colours.legit)
        : colours.mote;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = colour;
      ctx.shadowColor = colour;
      ctx.shadowBlur = p.data ? 10 : 4;
      ctx.beginPath();
      ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
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
     everything that can change the answer.

     This replaced separate start()/stop() calls from the intersection
     observer, the visibility listener and setData, where the result
     depended on which fired last. An early resize could leave the field
     stopped for good: the observer's first callback arrived before layout
     with isIntersecting false, and nothing afterwards called start()
     again. The particles froze part-way through, which reads as a
     rendering bug rather than a stopped loop. */
  function maybeRun() {
    const should =
      inView && !document.hidden && motionOn() && particles.length > 0;
    if (should !== running) {
      running = should;
      if (should) requestAnimationFrame(loop);
    }
    if (!should) paint(performance.now(), false);
  }

  // Nobody looking, nothing running: a scrolled-past hero or a background
  // tab should not be paying for an animation frame.
  new IntersectionObserver((entries) => {
    inView = entries[0].isIntersecting;
    maybeRun();
  }, { threshold: 0.01 }).observe(canvas);

  document.addEventListener("visibilitychange", maybeRun);

  /* A ResizeObserver on the canvas rather than a window resize listener.
     Measuring once at startup reads a box the browser has not finished
     laying out, so every position comes out wrong; this fires on the
     first real layout as well as on every later change. */
  new ResizeObserver(() => {
    layout();
    maybeRun();
  }).observe(canvas);

  return {
    /** Called twice: once with a placeholder, once with the real model. */
    setData(points, isFinal) {
      if (particles.length === 0) seed(points);
      else {
        points.forEach((d, i) => {
          if (!particles[i]) return;
          particles[i].score = d.p;
          particles[i].ghost = d.ghost === 1;
          particles[i].data = true;
        });
        layout();
      }
      if (isFinal && !settled) {
        settled = true;
        settledAt = performance.now();
      }
      maybeRun();
    },
    /** Light/dark swaps the palette, and the canvas holds resolved
        colours rather than variables, so it has to be handed new ones. */
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
