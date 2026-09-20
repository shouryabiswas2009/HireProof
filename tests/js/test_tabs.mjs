/*
 * Tests for the header's show/hide rules.
 *
 * These exist because the behaviour is genuinely hard to check in a
 * browser: the scroll handler defers its work into requestAnimationFrame,
 * which is suspended in a background tab, so an automated page can change
 * scrollY without the handler ever running. Keeping the decision in a pure
 * function means the rules are verifiable regardless.
 *
 * Run from the repo root:  node tests/js/test_tabs.mjs
 */

import { nextBarState } from "../../docs/tabs.js?v=14";

let checks = 0, failures = 0;
function check(condition, message) {
  checks++;
  if (!condition) { failures++; console.error(`  FAIL: ${message}`); }
}

// At the very top: no backdrop, always visible.
{
  const s = nextBarState({ y: 0, lastY: 0, wasHidden: false });
  check(s.stuck === false, "no backdrop at the top of the page");
  check(s.hidden === false, "visible at the top of the page");
}

// Just past the top: the backdrop appears.
{
  const s = nextBarState({ y: 60, lastY: 0, wasHidden: false });
  check(s.stuck === true, "backdrop appears once scrolled");
}

// Reading downward: the bar gets out of the way.
{
  const s = nextBarState({ y: 400, lastY: 200, wasHidden: false });
  check(s.hidden === true, "retracts while scrolling down");
}

// Scrolling back up: it returns, even mid-page.
{
  const s = nextBarState({ y: 300, lastY: 600, wasHidden: true });
  check(s.hidden === false, "returns when scrolling up");
  check(s.stuck === true, "still has its backdrop mid-page");
}

// Returning to the top always reveals it, whatever it was doing.
{
  const s = nextBarState({ y: 2, lastY: 400, wasHidden: true });
  check(s.hidden === false, "always visible back at the top");
  check(s.stuck === false, "backdrop drops again at the top");
}

// Tiny movements must not flicker it. This is the one that matters: a
// trackpad emits a stream of 1-2px deltas, and without a deadzone the bar
// would toggle on nearly every frame.
{
  const s = nextBarState({ y: 302, lastY: 300, wasHidden: false });
  check(s.hidden === false, "a 2px nudge does not hide it");
  check(s.lastY === 300, "the reference point does not move inside the deadzone");
}
{
  const s = nextBarState({ y: 298, lastY: 300, wasHidden: true });
  check(s.hidden === true, "a 2px nudge upward does not reveal it");
}

// A slow scroll must still accumulate past the deadzone rather than being
// ignored forever, which is why lastY only advances when we act.
{
  let lastY = 300, hidden = false;
  for (const y of [302, 304, 306, 308, 310]) {
    const s = nextBarState({ y, lastY, wasHidden: hidden });
    lastY = s.lastY; hidden = s.hidden;
  }
  check(hidden === true, "a slow steady scroll eventually retracts the bar");
}

// iOS rubber-banding reports a negative scroll position.
{
  const s = nextBarState({ y: -40, lastY: 100, wasHidden: true });
  check(s.stuck === false, "negative overscroll counts as the top");
  check(s.hidden === false, "negative overscroll reveals the bar");
}

console.log(`\n  ${checks - failures}/${checks} checks passed.`);
if (failures) { console.error(`  ${failures} FAILED`); process.exit(1); }
console.log("  Header show/hide rules behave.\n");
