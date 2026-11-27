# Minutes

Decisions and actions, separated as you type — **so the follow-up list exists before the meeting ends.**

- **Demo (the app itself):** https://drsamonline.github.io/app-minutes/play/index.html
- **Landing page:** https://drsamonline.github.io/app-minutes/
- **Release:** https://github.com/drsamonline/app-minutes/releases/tag/app-latest
- **Plan row:** #12 of 37 in `drsamonline/forge` → `QUEUE/PLAN.json`
- **Specs absorbed:** `app-minutes` (lead), `app-meeting-autopsy`
- **Licence:** PolyForm Noncommercial 1.0.0
- **Sponsor:** [github.com/sponsors/drsamonline](https://github.com/sponsors/drsamonline) — free, offline, no account

## Status

| | |
|---|---|
| **Built** | Shorthand with one list per line; owners only when typed; UNOWNED marked; decisions with movers, flagged when missing; topic clock from the "Mark topic" presses; autopsy naming the topics that produced nothing; Markdown export whose action count equals the screen. |
| **Release** | Windows EXE, Android APK and Linux binary, built from this source by `app-builder` in CI. |
| **Not built** | **Audio recording and transcription** — both specs forbid it, and there is no microphone code in this app at all. The clock comes from the moments the person pressed "Mark a new topic now". |
| **Untested** | A real meeting. The parser is tested against a realistic set of lines; a room where people speak in half-sentences and decisions arrive sideways will produce more notes and fewer decisions, which the app will show honestly rather than fix by guessing. |

## The Minutes spec's "done means", counted

> "A note containing 2 decisions and 3 actions produces 2 items in the decisions list and 3 in the
> actions list, with no item in both. An action with no owner is refused or listed as unowned — never
> silently assigned one. The export lists every action with its owner, and the exported count equals
> the count on screen."

| The spec says | The test |
|---|---|
| 2 decisions, 3 actions, no item in both | asserted on the same fixture, plus a construction guard (`inBoth`) |
| an unowned action is never assigned | the owner field is asserted empty, the follow-up row reads `UNOWNED`, and the text says "rather than assigned to anyone" |
| the export lists every action with its owner | every owner appears; the unowned one reads UNOWNED |
| the exported count equals the count on screen | the numbered rows in the Markdown are counted and compared to `followUps().count` |

## Two specs, one job

Minutes *separates decisions from actions*; Meeting Autopsy *measures what the meeting cost*. Both are
the same job — **turn a meeting into the two lists that outlive it** — so one engine: the parser
produces the lists, and the autopsy reads them. Both specs' "no audio, no transcription" is asserted.

## What it will not do

- **Record audio or transcribe.** There is no microphone code at all.
- **Guess an owner.** Unowned stays unowned.
- **Guess the attendees.** "Attendees not identified" rather than promoting names from the lines.
- **Invent minutes from silence.** No decisions and no actions means exactly that.
- **Use a key or a network.** No `fetch`, no endpoint; CSP `connect-src 'none'`.

## When things go wrong

| Case | Behaviour |
|---|---|
| **Bad input** | No attendees → reported, unnamed. No mover → flagged. No marker → a note. |
| **No network** | Nothing changes. |
| **Storage full or unavailable** | **NOT SAVED** at once, and the minutes cover only what is on screen. |
| **Corrupt saved state** | Reported, offered for export, never replaced with a blank meeting. |

## The shorthand

```
topic: Q3 hiring
d: We will hire two engineers this quarter @Priya
a: Publish the job description by Friday @Ravi
a: Get three quotes for the movers
n: Priya said the budget is tight
```

- `d:` / `decision:` / `resolved:` — a decision, with `@Name` for the mover
- `a:` / `action:` / `todo:` — an action, with `@Name` for the owner
- `topic:` / `agenda:` — starts a topic, and starts its clock
- `n:` / `note:` — anything else
- A line with no marker becomes a **note**, never a decision

## Tests

```bash
npm test                      # all three suites
node tests/self-tests.js      # engine — 79 assertions, including the done-means
node tests/ui-tests.js        # the page in jsdom — 27 assertions (needs the dev-only jsdom)
node tests/page-smoke.js      # every local src/href resolves, nothing off-origin
```

Mutation-tested six ways on 25/11/2026, each red: an unowned action handed to "Priya" (9 failures
after the fixture was guarded), a line landing in both lists (5), attendees guessed from owners (4),
the export dropping the UNOWNED marker (3), silence producing invented minutes (1), a corrupt file
becoming a blank meeting (2). Restored, 79/79.

## Layout

```
docs/index.html            landing page
docs/play/index.html       the app — the meeting, the shorthand, the two lists, the autopsy
docs/play/app.js           DOM wiring: parse on input, lists, topic stamps, export, save guard
docs/play/minutes-core.js  the engine — shorthand, owners, autopsy, minutes, export, storage
docs/play/web-kit.js       vendored kit (unmodified)
docs/play/export-kit.js    vendored kit (unmodified)
tests/self-tests.js        engine suite (79)
tests/ui-tests.js          page suite (27, jsdom)
tests/page-smoke.js        shape on disk
PAGES.json                 landing = docs/index.html, app = docs/play/index.html
```

## Where the spec was silent, and what was chosen

- **The two lists are disjoint by construction**, not by a filter: the classifier returns exactly one kind per line, so an item cannot be both. The `inBoth` check is a guard, not a fix.
- **An owner is a name at the end of the line, capped at four words.** Without the cap, "Email @Ravi about the deck tomorrow" would have handed the action to Ravi, who was only mentioned.
- **Topic time comes from a button press**, because the app does not record. Pasted minutes carry no clock and the app says so rather than inventing a duration.
- **Silence produces nothing.** The autopsy says "Nothing was extracted" and does not write a summary over the gap.
- **The export states its own action count**, so the reader can check it against the screen without trusting either.

## What is not built, and why

**Audio and transcription.** Both specs forbid them in the same sentence, and it is the right call:
a transcription engine in a meeting room is a privacy problem dressed as a convenience, and every
mistake it makes would end up in the minutes as if someone had said it.

**Speaker identification.** Even with audio, attributing words to people by voice is exactly the guess
this app refuses to make. Owners come from what a person types.
