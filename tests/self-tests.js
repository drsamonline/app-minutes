#!/usr/bin/env node
/* self-tests — Minutes. No framework, no dependencies.
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 * (c) 2026 Dr Sohil Momin
 *
 * The Minutes spec's "done means" is countable, so it is counted:
 *
 *   "A note containing 2 decisions and 3 actions produces 2 items in the decisions list and 3 in
 *    the actions list, with no item in both. An action with no owner is refused or listed as
 *    unowned — never silently assigned one. The export lists every action with its owner, and the
 *    exported count equals the count on screen."
 *
 * Meeting Autopsy's rules are here too: nothing is extracted from silence, an unowned action is
 * never attributed to the last speaker, and the meeting's cost is measured from the topic markers
 * rather than invented.
 *
 *   node tests/self-tests.js
 */
"use strict";

var fs = require("fs");
var path = require("path");

var ROOT = path.join(__dirname, "..");
var M = require(path.join(ROOT, "docs", "play", "minutes-core.js"));

var passed = 0;
var failed = [];
var group = "";

function section(n) { group = n; }
function ok(name, cond, detail) { if (cond) { passed++; return; } failed.push(group + " :: " + name + (detail ? " — " + detail : "")); }
function eq(name, a, b) { ok(name, a === b, "expected " + JSON.stringify(b) + ", got " + JSON.stringify(a)); }
function read(f) { return fs.readFileSync(path.join(ROOT, f), "utf8"); }

var NOTES = [
  "topic: Q3 hiring",
  "d: We will hire two engineers this quarter @Priya",
  "n: Priya said the budget is tight",
  "a: Publish the job description by Friday @Ravi",
  "topic: Office move",
  "a: Get three quotes for the movers",
  "d: The move is deferred to January @Sohil",
  "a: Tell the landlord we are staying @Priya"
].join("\n");

/* ================================================ the spec's own "done means" */

section("done means — 2 decisions and 3 actions, in their own lists");
var p = M.parse(NOTES);
eq("two decisions", p.decisions.length, 2, p.decisions.map(function (d) { return d.text; }).join(" | "));
eq("three actions", p.actions.length, 3, p.actions.map(function (a) { return a.text; }).join(" | "));
eq("no item appears in both lists", p.inBoth.length, 0);
ok("the decisions are the decisions", /hire two engineers/.test(p.decisions[0].text));
ok("the actions are the actions", /Publish the job description/.test(p.actions[0].text));
ok("the note is neither", p.notes.length === 1 && /budget is tight/.test(p.notes[0].text));
ok("every item carries the line it came from", p.actions.every(function (a) { return a.line > 0; }));

section("done means — an action with no owner is listed as unowned, never assigned");
var unownedActions = p.actions.filter(function (a) { return a.unowned; });
eq("one action has no owner", unownedActions.length, 1);
var unownedAction = unownedActions[0];
ok("an unowned action exists", !!unownedAction);
eq("and it is the mover one", unownedAction && unownedAction.text, "Get three quotes for the movers");
eq("its owner field is empty, not guessed", unownedAction && unownedAction.owner, "");
var f = M.followUps(p);
eq("the follow-up list counts three", f.count, 3);
var unownedRow = f.rows.filter(function (r) { return r.unowned; })[0];
ok("an unowned row exists to be marked", !!unownedRow);
eq("the unowned one is marked UNOWNED", unownedRow && unownedRow.owner, "UNOWNED");
ok("the app says it was not assigned to anyone", /rather than assigned to anyone/.test(f.says), f.says);
eq("nobody was invented as an owner", f.rows.filter(function (r) { return r.owner !== "UNOWNED"; }).length, 2);

section("done means — the export lists every action with its owner, same count");
var m = M.buildMinutes(p, { title: "Weekly sync", date: "25/11/2026", attendees: "Priya, Ravi, Sohil" });
var md = M.markdown(m, p, { endedAt: 0 });
var exported = (md.match(/^\d+\. .+ \u2014 \*\*/gm) || []).length;
eq("the exported action count equals the count on screen", exported, f.count);
ok("every owner appears in the export", /Priya/.test(md) && /Ravi/.test(md));
ok("the unowned action says UNOWNED in the export", /UNOWNED/.test(md));
ok("the export says no audio was recorded", /no audio was recorded and nothing was transcribed/.test(md));
ok("the export carries the attendees", /Priya, Ravi, Sohil/.test(md));
ok("the export carries the decisions with their movers", /moved by Priya/.test(md));

/* ============================================================ must-nots */

section("must-not — it must not record audio or transcribe");
var core = read("docs/play/minutes-core.js");
var appSrc = read("docs/play/app.js");
ok("no audio API anywhere", !/MediaRecorder|getUserMedia|AudioContext|SpeechRecognition|webkitSpeechRecognition/.test(core + appSrc));
ok("no transcription API or call anywhere",
  !/SpeechRecognition|webkitSpeechRecognition|transcribe\s*\(|transcriptionService/i.test(core + appSrc));
ok("the page says it does not record or transcribe", /No audio is\s+recorded and nothing is transcribed/.test(read("docs/play/index.html").replace(/\s+/g, " ")));
ok("no network call", !/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/.test(core + appSrc));
ok("the page forbids connections", /connect-src 'none'/.test(read("docs/play/index.html")));

section("must-not — nothing is extracted from silence");
var silent = M.parse("");
eq("no decisions from nothing", silent.decisions.length, 0);
eq("no actions from nothing", silent.actions.length, 0);
var silentAutopsy = M.autopsy(silent, { endedAt: 0 });
ok("the autopsy says nothing was extracted", /Nothing was extracted/.test(silentAutopsy.says), silentAutopsy.says);
ok("and says no minutes were invented", /no minutes were invented/.test(silentAutopsy.says));
ok("the export of an empty meeting does not invent actions", /None recorded/.test(M.markdown(M.buildMinutes(silent, {}), silent, {})));

section("must-not — attendees are not guessed from the lines");
var noAttendees = M.buildMinutes(p, { title: "x" });
eq("attendees are not identified", noAttendees.attendeesIdentified, false);
eq("and the minutes say so", noAttendees.attendeeNote, "Attendees not identified");
ok("the export keeps them unnamed", /Attendees:\*\* Attendees not identified/.test(M.markdown(noAttendees, p, {})));
ok("the names in the lines were not promoted to attendees", noAttendees.attendees.length === 0);

section("must-not — a decision with no mover is flagged");
var noMover = M.parse("d: We will ship on Monday\na: Tell the team @Ravi");
eq("the decision has no mover", noMover.decisions[0].mover, "");
eq("it is flagged", noMover.decisions[0].unmoved, true);
eq("a warning is raised", noMover.warnings.length, 1);
ok("the warning names the decision", /has no mover recorded/.test(noMover.warnings[0]), noMover.warnings[0]);
ok("the export marks it", /no mover recorded/.test(M.markdown(M.buildMinutes(noMover, {}), noMover, {})));

section("must-not — an unreadable set is reported, never replaced by a blank meeting");
var bad = M.parseState("{ broken minutes");
eq("a corrupt file is reported", bad.ok, false);
ok("it was not replaced with a blank meeting", /not replaced with a blank meeting/.test(bad.reason), bad.reason);
eq("the raw text is kept for export", bad.raw, "{ broken minutes");
eq("no minutes saved yet is distinguished from a broken file", M.parseState("").empty, true);
eq("and a broken one is not marked empty", !!bad.empty, false);

section("must-not — it must not grow a second job");
ok("no second store, no tags, no sync", !/\b(tags|labels|folders)\s*[:=]/i.test(core) && !/\bsync\s*[:(]/i.test(core));
ok("no model, key or endpoint", !/\b(apiKey|endpoint|openai|gpt)\s*[:=]/i.test(core) && !/https?:\/\//.test(core));

/* ================================================== the autopsy mechanics */

section("autopsy — the meeting is measured from the topic markers");
var stamped = M.parse("topic: Hiring\na: post the JD @Ravi\ntopic: Move", { stamps: { Hiring: 1000, Move: 1000 + 25 * 60000 } });
var au = M.autopsy(stamped, { endedAt: 1000 + 40 * 60000 });
eq("two topics are measured", au.topics.length, 2);
eq("the first took 25 minutes", au.topics[0].minutes, 25);
eq("the last runs to the end", au.topics[1].minutes, 15);
eq("the total is the sum", au.totalMinutes, 40);
eq("the topic that produced nothing is named", au.producedNothing.length, 1);
eq("and it is the right one", au.producedNothing[0].name, "Move");
ok("the summary says what produced nothing", /produced nothing: Move/.test(au.says), au.says);
var noClock = M.parse("topic: Pasted\na: something @Ravi");
eq("pasted minutes carry no invented time", M.autopsy(noClock, { endedAt: 0 }).topics[0].minutes, 0);
ok("and the page says the clock comes from the markers", /carry no clock, and the app does not invent one/.test(read("docs/play/app.js")));

section("parsing — the markers, and the line that has none");
eq("D: works", M.parse("D: a decision").decisions.length, 1);
eq("decision: works", M.parse("decision: a decision").decisions.length, 1);
eq("A: works", M.parse("A: an action").actions.length, 1);
eq("todo: works", M.parse("todo: an action").actions.length, 1);
eq("topic: works", M.parse("topic: a topic").topics.length, 1);
eq("a line with no marker becomes a note, not a decision", M.parse("we talked about the roof").notes.length, 1);
eq("and it is marked as unmarked", M.parse("we talked about the roof").notes[0].unmarked, true);
eq("blank lines are skipped", M.parse("\n\n  \n").decisions.length + M.parse("\n\n").actions.length, 0);
eq("an owner with a full name is read", M.parse("a: Send the deck @Priya Sharma").actions[0].owner, "Priya Sharma");
eq("an owner after an arrow is read", M.parse("a: Send the deck -> Ravi").actions[0].owner, "Ravi");
eq("an @ inside the text is not an owner if it is not at the end", M.parse("a: Email @Ravi about the deck tomorrow").actions[0].unowned, true);

section("failure case — storage full or unavailable");
var thrown = M.exportFile("minutes", { minutes: m, parsed: p }, { when: "25/11/2026" }, function () {
  var e = new Error("quota"); e.name = "QuotaExceededError"; throw e;
});
eq("a failed write is reported as failed", thrown.ok, false);
ok("a failed write says the file was not written", /not written/.test(thrown.reason), thrown.reason);
ok("a failed write names the cause", /storage is full/.test(thrown.reason));
eq("no writer means no file", M.exportFile("minutes", { minutes: m, parsed: p }, {}, null).ok, false);
ok("the page says the minutes cover only what is on screen when the save fails", /cover only what is on screen/.test(appSrc));

section("shape — every script the page loads exists beside it");
var page = read("docs/play/index.html");
var srcs = (page.match(/<script[^>]+src="([^"]+)"/g) || []).map(function (t) { return t.replace(/.*src="([^"]+)"/, "$1"); });
srcs.forEach(function (s) {
  ok("script src resolves: " + s, fs.existsSync(path.join(ROOT, "docs", "play", s.replace(/^\.\//, ""))));
});
ok("the landing page exists", fs.existsSync(path.join(ROOT, "docs", "index.html")));
ok("the page manifest exists", fs.existsSync(path.join(ROOT, "PAGES.json")));

/* ============================================================== summary */

var total = passed + failed.length;
if (!total) { console.error("self-tests: 0 assertions ran. That is a failure, not a pass."); process.exit(1); }
if (failed.length) {
  console.error("self-tests: " + passed + "/" + total + " passed, " + failed.length + " FAILED");
  failed.slice(0, 12).forEach(function (f) { console.error("  FAIL " + f); });
  process.exit(1);
}
console.log("self-tests: " + passed + "/" + total + " assertions passed");
