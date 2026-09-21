/*
 * Deciding whether a pasted blob is worth scoring.
 *
 * Kept as a pure function, separate from the DOM, for two reasons: the
 * rules are easy to get subtly wrong (what counts as "a URL"?), and a
 * function taking a string and returning a verdict can be tested directly
 * rather than by driving a browser.
 *
 * The messages are part of the contract, not decoration. A disabled
 * button with no explanation is a dead end, so every refusal says what is
 * wrong and what to do instead.
 */

// Below this the signals have nothing to work with: a 10-word blurb has
// no salary, no duties and no team either way, so the score would just be
// the training average wearing a confident percentage.
const MIN_WORDS = 30;

// A generous ceiling. The longest real postings run to a few thousand
// words; past this it is almost certainly a whole careers page, an entire
// PDF, or a paste accident. Scoring it would be slow and meaningless.
const MAX_CHARS = 15000;

/**
 * Does this look like someone pasted a link instead of the posting?
 *
 * Deliberately not "contains a URL" — plenty of genuine postings include
 * an application link or a company address. The test is whether the text
 * is MOSTLY a URL: strip the links out, and if almost no words remain,
 * a link is all they gave us.
 */
function looksLikeLink(text) {
  const withoutLinks = text.replace(/https?:\/\/\S+|www\.\S+/gi, " ").trim();
  const wordsLeft = withoutLinks ? withoutLinks.split(/\s+/).length : 0;
  const hasLink = /https?:\/\/\S+|www\.\S+/i.test(text);
  return hasLink && wordsLeft < 10;
}

/**
 * Check pasted text before scoring it.
 *
 * Returns { ok, code, words, message }. `code` is for the UI to key off;
 * `message` is what the reader sees.
 */
function checkInput(text) {
  const trimmed = (text || "").trim();
  const words = trimmed ? trimmed.split(/\s+/).length : 0;

  if (!trimmed) {
    return {
      ok: false,
      code: "empty",
      words,
      message: `Paste at least ${MIN_WORDS} words of a job posting.`,
    };
  }

  // Length is checked before the link test so a giant paste is reported
  // as too long rather than misdiagnosed.
  if (trimmed.length > MAX_CHARS) {
    return {
      ok: false,
      code: "too-long",
      words,
      message:
        `That is ${trimmed.length.toLocaleString()} characters, and the ` +
        `limit is ${MAX_CHARS.toLocaleString()}. Paste just the job ` +
        `description rather than the whole page.`,
    };
  }

  if (looksLikeLink(trimmed)) {
    return {
      ok: false,
      code: "link",
      words,
      message:
        "That looks like a link. This tool never fetches anything — it only " +
        "reads text you paste — so open the posting and copy the description " +
        "itself.",
    };
  }

  if (words < MIN_WORDS) {
    return {
      ok: false,
      code: "too-short",
      words,
      message:
        `Only ${words} word${words === 1 ? "" : "s"} so far. Paste at least ` +
        `${MIN_WORDS} — below that there is too little text for the signals ` +
        `to mean anything.`,
    };
  }

  return { ok: true, code: "ok", words, message: "" };
}

export { checkInput, looksLikeLink, MIN_WORDS, MAX_CHARS };
