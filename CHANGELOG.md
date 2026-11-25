# Changelog

All notable changes to Minutes are recorded here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Dates: dd/mm/yyyy.

## [Unreleased]

## [1.0.0] — 25/11/2026

### Added
- A shorthand that puts each line in exactly one list: `d:` decision, `a:` action, `topic:`, `n:` note.
  A line with no marker becomes a note, never a decision.
- Owners only when typed (`@Name`, `-> Name`, `owner: Name`), capped to a short name at the end of the
  line so a stray mention mid-sentence does not hand an action to someone who was only named.
- An unowned action stays unowned and is shown as **UNOWNED**, never attributed to the last speaker.
- Decisions record who moved them; a decision with no mover is flagged and marked in the export.
- The meeting autopsy: minutes per topic from the "Mark a new topic now" presses, and the topics that
  produced no decision and no action, named.
- Attendees are only the ones typed. With none, the minutes say "Attendees not identified" rather than
  promoting the names in the lines.
- A Markdown export listing every action with its owner and stating the count, so it can be checked
  against the screen.
- Refusals: no attendees (reported, not guessed), no mover (flagged), silence (nothing extracted, no
  invented minutes), an unreadable file (reported, offered for export, never replaced by a blank meeting).
- A failed save says **NOT SAVED** at once and tells the person the minutes cover only what is on screen.
- PWA shell, CI (79 engine assertions + 27 in jsdom + page smoke), and the app-builder pipeline
  pinned to the canonical SHA for the EXE/APK/Linux release.

### Not built
- Audio recording and transcription: both specs forbid it.
