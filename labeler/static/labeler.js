/*
 * Keyboard shortcuts for the labelling tool.
 *
 * WHY: labelling a couple of hundred postings is the slow, boring part of
 * this project, and anything that makes it slower makes it likelier the
 * dataset never gets finished. Paste, two keystrokes, save, repeat.
 *
 * Alt is used as the modifier rather than a bare letter because the cursor
 * normally sits in the textarea, where a bare "g" would just type a g.
 */

(function () {
  const form = document.getElementById("label-form");
  if (!form) return;

  /** Tick a radio button by its name and value. */
  function pick(name, value) {
    const input = form.querySelector(`input[name="${name}"][value="${value}"]`);
    if (input) input.checked = true;
  }

  /** Flip a checkbox on or off. */
  function toggleCheckbox(input) {
    if (input) input.checked = !input.checked;
  }

  /**
   * The wording of a checkbox's label, without its "Alt+N" hint.
   * Reading the label's textContent directly would include the hint, so the
   * toast would read "+ Alt+6 I judged it from the wording alone".
   */
  function describeCheckbox(box) {
    const label = box.closest("label");
    if (!label) return "";
    const copy = label.cloneNode(true);
    copy.querySelectorAll(".key").forEach((hint) => hint.remove());
    return copy.textContent.trim();
  }

  /** Briefly highlight the page so a keystroke visibly did something. */
  function flashFeedback(message) {
    let badge = document.getElementById("key-feedback");
    if (!badge) {
      badge = document.createElement("div");
      badge.id = "key-feedback";
      badge.className = "key-feedback";
      document.body.appendChild(badge);
    }
    badge.textContent = message;
    badge.classList.add("visible");
    clearTimeout(badge._timer);
    badge._timer = setTimeout(() => badge.classList.remove("visible"), 900);
  }

  document.addEventListener("keydown", function (event) {
    // Ctrl+Enter (or Cmd+Enter) saves from anywhere, including mid-textarea.
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      // requestSubmit runs the browser's own validation, so a missing
      // label still shows the normal "please choose one" prompt rather
      // than silently posting an incomplete form.
      form.requestSubmit();
      return;
    }

    if (!event.altKey || event.ctrlKey || event.metaKey) return;

    const key = event.key.toLowerCase();

    if (key === "g") {
      event.preventDefault();
      pick("label", "ghost");
      flashFeedback("Ghost");
    } else if (key === "l") {
      event.preventDefault();
      pick("label", "legit");
      flashFeedback("Legit");
    } else if (key === "u") {
      event.preventDefault();
      const unsure = form.querySelector('input[name="confidence"][value="unsure"]');
      if (unsure && unsure.checked) {
        pick("confidence", "sure");
        flashFeedback("Sure");
      } else {
        pick("confidence", "unsure");
        flashFeedback("Unsure");
      }
    } else if (key >= "1" && key <= "9") {
      // Alt+1..9 tick the evidence boxes in the order they appear.
      const boxes = form.querySelectorAll('input[name="evidence"]');
      const box = boxes[Number(key) - 1];
      if (box) {
        event.preventDefault();
        toggleCheckbox(box);
        flashFeedback((box.checked ? "+ " : "- ") + describeCheckbox(box));
      }
    }
  });
})();
