"""
Turns a job posting's raw text into a short list of numbers (features).

This is the only thing the model ever sees: not words, just these numbers.
web/features.js does the exact same job in JavaScript for the live site,
and both read shared/phrases.json so the word lists can't drift apart.

WHY HAND-PICKED FEATURES instead of feeding in every word (bag-of-words):
with only a couple hundred labeled postings, one feature per word would mean
thousands of features and a model that memorizes your specific postings
instead of learning a pattern. It would also make the "why" breakdown on the
site useless ("the word 'the' raised your score"). Eleven named features can
each be explained in a sentence.

IMPORTANT: these features are hypotheses about ghost postings, not proven
facts. Training on your labels is what decides which ones actually matter.
Some may end up with a weight near zero, and that is a real result worth
reporting, not a failure.
"""

import json
import math
import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
PHRASES_PATH = REPO_ROOT / "shared" / "phrases.json"

# Load the shared config once, when this module is first imported, rather
# than re-reading the file for every posting we score.
with open(PHRASES_PATH, encoding="utf-8") as f:
    CONFIG = json.load(f)

PHRASES = CONFIG["phrase_lists"]
THRESHOLDS = CONFIG["thresholds"]

# Compile the regexes once, for the same reason. re.IGNORECASE is belt and
# braces: we already lowercase the text, but a pattern edited later might
# contain capitals.
PATTERNS = {
    name: re.compile(spec["regex"], re.IGNORECASE)
    for name, spec in CONFIG["patterns"].items()
    if not name.startswith("_")
}

# The feature order. Everything downstream (training, the saved model, the
# website) refers to features BY NAME rather than by position, so adding one
# here later can't silently shift the weights out of alignment.
FEATURE_NAMES = [
    "has_salary_range",
    "vague_pay_phrase",
    "log_word_count",
    "buzzword_density",
    "concrete_duty_density",
    "names_reporting_line",
    "has_contact_email",
    "evergreen_language",
    "multiple_openings_language",
    "has_deadline_or_start_date",
    "experience_mismatch",
]

# Plain-English names for the full feature table on the website.
FEATURE_LABELS = {
    "has_salary_range": "Pay figure given",
    "vague_pay_phrase": "Vague pay wording ('competitive salary')",
    "log_word_count": "Length of the posting",
    "buzzword_density": "Buzzwords and filler phrases",
    "concrete_duty_density": "Specific, concrete duties",
    "names_reporting_line": "Names a team or manager",
    "has_contact_email": "Contact email included",
    "evergreen_language": "'Talent pool' / future-openings wording",
    "multiple_openings_language": "Vague 'multiple openings' wording",
    "has_deadline_or_start_date": "Deadline or start date given",
    "experience_mismatch": "Junior title, senior experience demanded",
}

# Labels for the score breakdown, which must describe what this posting
# ACTUALLY SAYS, not just name the feature.
#
# WHY BOTH FORMS ARE NEEDED: a feature contributes to the score through its
# absence just as much as through its presence. A posting with no salary
# figure gets pushed toward "ghost" by has_salary_range, and labelling that
# row "Pay figure given" would tell the reader the exact opposite of the
# truth. So each feature carries wording for both states, and the site picks
# whichever matches the posting in front of it.
#
# "on" is used when the posting is above the training average for this
# feature, "off" when it is below.
FEATURE_STATE_LABELS = {
    "has_salary_range": {
        "on": "Pay figure given",
        "off": "No pay figure given",
    },
    "vague_pay_phrase": {
        "on": "Vague pay wording ('competitive salary')",
        "off": "No vague pay wording",
    },
    "log_word_count": {
        "on": "Longer than the average posting",
        "off": "Shorter than the average posting",
    },
    "buzzword_density": {
        "on": "More buzzwords than average",
        "off": "Fewer buzzwords than average",
    },
    "concrete_duty_density": {
        "on": "More concrete, specific duties than average",
        "off": "Fewer concrete, specific duties than average",
    },
    "names_reporting_line": {
        "on": "Names a team or manager",
        "off": "No team or manager named",
    },
    "has_contact_email": {
        "on": "Contact email included",
        "off": "No contact email",
    },
    "evergreen_language": {
        "on": "'Talent pool' or future-openings wording",
        "off": "No 'talent pool' wording",
    },
    "multiple_openings_language": {
        "on": "Vague 'multiple openings' wording",
        "off": "No 'multiple openings' wording",
    },
    "has_deadline_or_start_date": {
        "on": "Deadline or start date given",
        "off": "No deadline or start date",
    },
    "experience_mismatch": {
        "on": "Junior title but senior experience demanded",
        "off": "No junior/senior experience mismatch",
    },
}


def normalize(text):
    """Lowercase and collapse all whitespace into single spaces.

    Everything downstream assumes this has been done. Collapsing whitespace
    matters because a phrase like "wear many hats" can arrive split across a
    line break, and we still want to find it.
    """
    return " ".join(text.lower().split())


def count_phrases(normalized_text, phrase_list):
    """How many phrases from the list appear (each phrase counted once).

    Counting each distinct phrase once, rather than every occurrence, stops
    one repeated phrase from dominating. A posting that says "fast-paced"
    four times is not four times as suspicious as one that says it once.
    """
    return sum(1 for phrase in phrase_list if phrase in normalized_text)


def max_years_required(normalized_text):
    """The largest 'N years experience' figure in the posting, or 0."""
    years = [int(match) for match in PATTERNS["years_required"].findall(normalized_text)]
    return max(years) if years else 0


def extract_features(text):
    """Turn raw posting text into a {feature_name: number} dict."""
    normalized = normalize(text)
    word_count = len(normalized.split())

    # Densities are "per 100 words" rather than raw counts. WHY: a long
    # posting mentions more of everything, so a raw count would partly just
    # measure length, which we already capture separately as log_word_count.
    # We want "how buzzword-y is the writing", independent of length.
    # max(word_count, 1) avoids dividing by zero on empty input.
    per_100_words = 100.0 / max(word_count, 1)

    buzzword_hits = count_phrases(normalized, PHRASES["buzzwords"])
    concrete_hits = count_phrases(normalized, PHRASES["concrete_duty"])

    # A junior posting demanding years of experience is a well-known sign of
    # a posting nobody can actually fill, which is one way ghost postings
    # stay open forever.
    is_entry_level = count_phrases(normalized, PHRASES["entry_level"]) > 0
    demands_experience = max_years_required(normalized) >= THRESHOLDS["experience_mismatch_years"]

    return {
        # --- Pay signals ---
        # A budgeted, approved role usually has a number attached. Several
        # US states now require a pay range by law, which makes a missing
        # range more meaningful than it used to be.
        "has_salary_range": 1.0 if PATTERNS["salary_amount"].search(normalized) else 0.0,
        # "Competitive salary" is what gets written when the pay band hasn't
        # been decided, which can mean the role isn't really approved yet.
        "vague_pay_phrase": 1.0 if count_phrases(normalized, PHRASES["vague_pay"]) else 0.0,

        # --- Shape of the writing ---
        # Log, not the raw count. WHY: the difference between a 50-word and a
        # 200-word posting is meaningful, while 2000 vs 2150 words is noise.
        # Taking the log reflects that and stops one very long posting from
        # dwarfing every other number during training.
        "log_word_count": math.log(1 + word_count),
        "buzzword_density": buzzword_hits * per_100_words,
        # The counterweight to buzzwords: someone who knows what the job
        # actually involves writes specific duties ("you will own the
        # billing service"), because a real team has real work waiting.
        "concrete_duty_density": concrete_hits * per_100_words,

        # --- Signs a specific human is behind the posting ---
        "names_reporting_line": 1.0 if count_phrases(normalized, PHRASES["reporting_line"]) else 0.0,
        "has_contact_email": 1.0 if PATTERNS["contact_email"].search(normalized) else 0.0,

        # --- Signs the posting isn't tied to one real opening ---
        # The clearest case: the posting openly says it is collecting resumes
        # for the future rather than filling a job today.
        "evergreen_language": 1.0 if count_phrases(normalized, PHRASES["evergreen"]) else 0.0,
        # Weaker, and honestly uncertain: big legitimate employers do post
        # "multiple openings" too. Training will tell us if it carries signal.
        "multiple_openings_language": 1.0 if count_phrases(normalized, PHRASES["multiple_openings"]) else 0.0,

        # --- Signs of an active, time-bound process ---
        # A real search has a timeline; a posting left open indefinitely
        # usually doesn't mention one.
        "has_deadline_or_start_date": 1.0 if count_phrases(normalized, PHRASES["deadline_or_start"]) else 0.0,
        "experience_mismatch": 1.0 if (is_entry_level and demands_experience) else 0.0,
    }


def features_as_list(text):
    """The same features as a plain list, in FEATURE_NAMES order.

    The training code wants a list of numbers; the website wants names.
    Keeping both here means the ordering rule lives in one place.
    """
    features = extract_features(text)
    return [features[name] for name in FEATURE_NAMES]


def explain(text):
    """Pretty-print one posting's features. For your own debugging:

        .venv\\Scripts\\python.exe -m ghostjob.features "paste text here"
    """
    features = extract_features(text)
    lines = []
    for name in FEATURE_NAMES:
        lines.append(f"  {name:<28} {features[name]:>8.3f}   {FEATURE_LABELS[name]}")
    return "\n".join(lines)


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1:
        sample = " ".join(sys.argv[1:])
    else:
        print("Paste a posting, then press Ctrl+Z and Enter on Windows:")
        sample = sys.stdin.read()
    print(explain(sample))
