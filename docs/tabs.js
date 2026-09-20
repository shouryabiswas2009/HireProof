/*
 * The tab bar.
 *
 * Built on the real ARIA tab pattern rather than styled links, because the
 * difference is not cosmetic: a screen reader needs to announce "tab 2 of
 * 4" and know which panel each tab controls, and keyboard users expect
 * arrow keys to move between tabs.
 *
 * Two details that are easy to get wrong:
 *
 * 1. ROVING TABINDEX. Only the selected tab is reachable with Tab; the
 *    others are tabindex="-1". Without this, pressing Tab walks through
 *    every tab button before reaching the page content, which is tedious
 *    on a four-tab bar and worse on a bigger one. Arrow keys move between
 *    tabs instead, which is what the pattern specifies.
 *
 * 2. THE URL. Each tab sets a hash (#model, #about...). That makes tabs
 *    linkable and the browser's Back button work, which people expect from
 *    something that looks like separate pages. Without it, switching tab
 *    and pressing Back would leave the site entirely.
 */

const TAB_IDS = ["check", "model", "how", "about"];

/**
 * Slide the pill behind the active tab.
 *
 * The pill is one element that MOVES, rather than a background switched on
 * and off per button. That difference is the whole effect: a background
 * that just appears reads as a state change, while one that travels reads
 * as the same object moving, which is what makes it feel deliberate.
 *
 * It is measured from the live layout rather than calculated from tab
 * widths, because the labels are different lengths and the font may not
 * have settled when this first runs.
 */
function moveIndicator() {
  const tablist = document.querySelector('[role="tablist"]');
  const indicator = tablist?.querySelector(".tab-indicator");
  const active = tablist?.querySelector('[role="tab"][aria-selected="true"]');
  if (!tablist || !indicator || !active) return;

  /*
   * Measured with rectangles rather than offsetLeft.
   *
   * offsetLeft counts from the offset parent's BORDER edge, while an
   * absolutely positioned child's `left: 0` starts at its PADDING edge.
   * On a tab strip with a border and padding those differ, and the pill
   * ends up a few pixels off — visible as a sliver of colour poking out
   * of one side. Subtracting the two rectangles avoids having to reason
   * about which box model each property uses.
   *
   * scrollLeft is added back because the pill is positioned inside the
   * strip's scrollable content, but the rectangles are viewport-relative
   * and already have the scroll applied.
   */
  const tabBox = active.getBoundingClientRect();
  const listBox = tablist.getBoundingClientRect();
  const borderLeft = parseFloat(getComputedStyle(tablist).borderLeftWidth) || 0;
  const x = tabBox.left - listBox.left - borderLeft + tablist.scrollLeft;

  indicator.style.width = `${tabBox.width}px`;
  indicator.style.transform = `translateX(${x}px)`;
  // Only fade it in once it has a real position, so it never flashes at
  // the far left on first paint.
  indicator.style.opacity = "1";
}

/** The tab name from the URL hash, or the first tab if it isn't one. */
function tabFromHash() {
  const name = window.location.hash.replace("#", "");
  return TAB_IDS.includes(name) ? name : TAB_IDS[0];
}

/**
 * Show one tab.
 *
 * `moveFocus` is false on first load and on Back/Forward: stealing focus
 * when someone has not pressed anything is disorienting, and it would also
 * scroll the page unexpectedly.
 */
let currentIndex = 0;

function selectTab(name, { moveFocus = false, updateHash = true } = {}) {
  // Which way we moved, so the new panel can enter from that side. Coming
  // in from a direct link counts as no direction at all.
  const nextIndex = TAB_IDS.indexOf(name);
  const direction = nextIndex > currentIndex ? "next" : nextIndex < currentIndex ? "prev" : "none";
  currentIndex = nextIndex;

  for (const id of TAB_IDS) {
    const tab = document.getElementById(`tab-${id}`);
    const panel = document.getElementById(`panel-${id}`);
    if (!tab || !panel) continue;

    const isActive = id === name;
    tab.setAttribute("aria-selected", String(isActive));
    tab.tabIndex = isActive ? 0 : -1;   // the roving part
    if (isActive) panel.dataset.dir = direction;
    panel.hidden = !isActive;
  }

  if (updateHash && window.location.hash !== `#${name}`) {
    // replaceState, not pushState: the hashchange listener below already
    // handles real navigation, and pushing here as well would add two
    // history entries per click and break the Back button.
    window.history.replaceState(null, "", `#${name}`);
  }

  moveIndicator();

  if (moveFocus) {
    const tab = document.getElementById(`tab-${name}`);
    if (tab) tab.focus();
  }
}

/*
 * Header behaviour.
 *
 * A pinned bar always covers whatever scrolls beneath it, and with a
 * backdrop dark enough to stay legible that reads as a slab sitting on
 * the text. So the bar retracts while you read downward and returns as
 * soon as you scroll up, which is when you are looking for navigation
 * anyway. At the very top it has nothing to sit over, so it drops the
 * backdrop entirely and lets the background through.
 */

const BAR_AT_TOP = 8;    // px of scroll before the backdrop appears
const BAR_DEADZONE = 5;  // ignore jitter and trackpad bounce

/**
 * Decide what the header should look like. Pure: takes numbers, returns a
 * decision, touches nothing.
 *
 * Split out from the DOM on purpose. The event handler defers its work
 * into requestAnimationFrame, which does not run in a background tab, so
 * driving this through a real browser is awkward to test. As a plain
 * function the rules can be checked directly.
 */
function nextBarState({ y, lastY, wasHidden }) {
  const position = Math.max(y, 0);          // iOS overscrolls negative
  const atTop = position <= BAR_AT_TOP;
  const movedDown = position > lastY + BAR_DEADZONE;
  const movedUp = position < lastY - BAR_DEADZONE;

  let hidden = wasHidden;
  if (atTop) hidden = false;                // always visible at the top
  else if (movedDown) hidden = true;        // reading downward
  else if (movedUp) hidden = false;         // looking back up

  return {
    stuck: !atTop,
    hidden,
    // Only move the reference point once we act on it, so a slow scroll
    // accumulates toward the deadzone instead of never reaching it.
    lastY: movedDown || movedUp ? position : lastY,
  };
}

function setUpStickyBar() {
  const bar = document.querySelector(".topbar");
  if (!bar) return;

  let lastY = window.scrollY;
  let queued = false;

  function apply() {
    queued = false;
    const state = nextBarState({
      y: window.scrollY,
      lastY,
      wasHidden: bar.classList.contains("is-hidden"),
    });
    lastY = state.lastY;
    bar.classList.toggle("is-stuck", state.stuck);
    bar.classList.toggle("is-hidden", state.hidden);
  }

  window.addEventListener(
    "scroll",
    () => {
      // Scroll can fire many times per frame; touching the DOM in each one
      // is the classic way to make a page feel sticky while scrolling.
      if (queued) return;
      queued = true;
      requestAnimationFrame(apply);
    },
    { passive: true }   // we will not preventDefault, so the browser need not wait
  );

  apply();
}

function setUpTabs() {
  const tablist = document.querySelector('[role="tablist"]');
  if (!tablist) return;

  tablist.addEventListener("click", (event) => {
    const tab = event.target.closest('[role="tab"]');
    if (!tab) return;
    selectTab(tab.id.replace("tab-", ""), { moveFocus: true });
  });

  tablist.addEventListener("keydown", (event) => {
    const current = TAB_IDS.indexOf(tabFromHash());
    let next = null;

    if (event.key === "ArrowRight") next = (current + 1) % TAB_IDS.length;
    else if (event.key === "ArrowLeft") next = (current - 1 + TAB_IDS.length) % TAB_IDS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = TAB_IDS.length - 1;
    else return;

    event.preventDefault();   // stop Home/End scrolling the page as well
    selectTab(TAB_IDS[next], { moveFocus: true });
  });

  // Back and Forward, and anyone opening a #model link directly.
  window.addEventListener("hashchange", () => {
    selectTab(tabFromHash(), { updateHash: false });
  });

  // In-page links that jump to another tab (e.g. "read the limits").
  document.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-goto]");
    if (!trigger) return;
    event.preventDefault();
    selectTab(trigger.dataset.goto, { moveFocus: true });
  });

  // Keep the pill aligned when the strip reflows: a window resize, the
  // tab bar wrapping on a narrow screen, or a font finishing loading all
  // change where the active tab sits.
  if ("ResizeObserver" in window) {
    new ResizeObserver(moveIndicator).observe(tablist);
  }
  window.addEventListener("resize", moveIndicator);

  setUpStickyBar();

  selectTab(tabFromHash(), { updateHash: false });
  // One more pass after layout settles, in case the first measurement ran
  // before the font swapped in and the labels changed width.
  requestAnimationFrame(moveIndicator);
}

export { setUpTabs, selectTab, moveIndicator, nextBarState, TAB_IDS };
