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
function selectTab(name, { moveFocus = false, updateHash = true } = {}) {
  for (const id of TAB_IDS) {
    const tab = document.getElementById(`tab-${id}`);
    const panel = document.getElementById(`panel-${id}`);
    if (!tab || !panel) continue;

    const isActive = id === name;
    tab.setAttribute("aria-selected", String(isActive));
    tab.tabIndex = isActive ? 0 : -1;   // the roving part
    panel.hidden = !isActive;
  }

  if (updateHash && window.location.hash !== `#${name}`) {
    // replaceState, not pushState: the hashchange listener below already
    // handles real navigation, and pushing here as well would add two
    // history entries per click and break the Back button.
    window.history.replaceState(null, "", `#${name}`);
  }

  if (moveFocus) {
    const tab = document.getElementById(`tab-${name}`);
    if (tab) tab.focus();
  }
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

  selectTab(tabFromHash(), { updateHash: false });
}

export { setUpTabs, selectTab, TAB_IDS };
