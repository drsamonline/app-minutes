#!/usr/bin/env node
/* ui-tests — the Minutes page in a real DOM (jsdom).
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 * (c) 2026 Dr Sohil Momin
 *
 * The engine has its own suite, including the countable done-means. This one proves the page is
 * wired to it: typing fills the two lists, an unowned action is shown as unowned, the export
 * count equals the on-screen count, the autopsy table appears when topics are marked, a corrupt
 * file is reported, and a failed save says so.
 *
 *   npm install --no-save jsdom && node tests/ui-tests.js
 */
"use strict";

var fs = require("fs");
var path = require("path");
var { JSDOM } = require("jsdom");

var ROOT = path.join(__dirname, "..");
var PLAY = path.join(ROOT, "docs", "play");
var PAGE = path.join(PLAY, "index.html");

var passed = 0;
var failed = [];
function ok(name, cond, detail) { if (cond) { passed++; return; } failed.push(name + (detail ? " — " + detail : "")); }
function eq(name, a, b) { ok(name, a === b, "expected " + JSON.stringify(b) + ", got " + JSON.stringify(a)); }

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

function build(seed) {
  var html = fs.readFileSync(PAGE, "utf8");
  var dom = new JSDOM(html, { url: "https://example.test/play/index.html", runScripts: "outside-only", pretendToBeVisual: true });
  var w = dom.window;
  if (seed) Object.keys(seed).forEach(function (k) { w.localStorage.setItem(k, seed[k]); });
  w.URL.createObjectURL = function () { return "blob:x"; };
  w.URL.revokeObjectURL = function () {};
  w.HTMLAnchorElement.prototype.click = function () {};
  w.prompt = function () { return "Budget review"; };
  ["web-kit.js", "export-kit.js", "minutes-core.js", "app.js"].forEach(function (f) {
    w.eval(fs.readFileSync(path.join(PLAY, f), "utf8"));
  });
  return dom;
}

var dom = build(null);
var w = dom.window;
var d = w.document;
var $ = function (id) { return d.getElementById(id); };

ok("the engine loaded into the page", !!w.MinutesCore);
eq("both lists start empty", d.querySelectorAll("#decList li").length + d.querySelectorAll("#actList li").length, 0);
ok("attendees are reported as not identified", /Attendees not identified/.test($("attendeeNote").textContent), $("attendeeNote").textContent);

/* ------------------------------------------------------------ typing it in */

$("notes").value = NOTES;
$("notes").dispatchEvent(new w.Event("input"));
eq("two decisions on screen", d.querySelectorAll("#decList li").length, 2);
eq("three actions on screen", d.querySelectorAll("#actList li").length, 3);
ok("the decision shows its mover", /moved by Priya/.test($("decList").textContent), $("decList").textContent);
ok("the unowned action is marked UNOWNED", /UNOWNED/.test($("actList").textContent), $("actList").textContent);
ok("it says nobody was assigned", /not assigned to anyone/.test($("actList").textContent));
ok("the owner is shown for the others", /owner: Ravi/.test($("actList").textContent));
ok("no item is in both lists", (function () {
  var decs = Array.prototype.map.call(d.querySelectorAll("#decList li"), function (li) { return li.firstChild.textContent; });
  var acts = Array.prototype.map.call(d.querySelectorAll("#actList li"), function (li) { return li.firstChild.textContent; });
  return decs.filter(function (t) { return acts.indexOf(t) >= 0; }).length === 0;
})());

/* ------------------------------------------------------------- the export */

$("exportBtn").click();
ok("the export is written", /Wrote minutes-\d{4}-\d\d-\d\d\.md/.test($("exportNote").textContent), $("exportNote").textContent);
ok("the export note says the count matches the screen", /3 action\(s\) with their owners, the same count as on screen/.test($("exportNote").textContent),
  $("exportNote").textContent);

/* -------------------------------------------------------------- the clock */

$("markTopic").click();
ok("a topic is marked", /Topic marked: Budget review/.test($("status").textContent), $("status").textContent);
eq("a third topic line was added", d.querySelectorAll("#topicTable tbody tr").length, 3);
ok("the table shows minutes for the marked topic", /\d+|—/.test($("topicTable").textContent));
ok("the page says where the clock comes from", /carry no clock, and the app does not invent one/.test($("topicNote").textContent),
  $("topicNote").textContent);

/* --------------------------------------------------------------- the rest */

$("attendees").value = "Priya, Ravi, Sohil";
$("attendees").dispatchEvent(new w.Event("input"));
eq("the not-identified note goes away", $("attendeeNote").textContent, "");

var saved = w.localStorage.getItem("minutes:state");
ok("the minutes were written to the device", !!saved);

var dom2 = build({ "minutes:state": saved });
var d2 = dom2.window.document;
eq("the reload keeps the decisions", d2.querySelectorAll("#decList li").length, 2);
eq("the reload keeps the actions", d2.querySelectorAll("#actList li").length, 3);
ok("the reload keeps the attendees", d2.getElementById("attendees").value === "Priya, Ravi, Sohil");

/* ------------------------------------------- a corrupt file on reload */

var dom3 = build({ "minutes:state": "{ broken minutes" });
var d3 = dom3.window.document;
ok("a corrupt file is reported", /cannot be read/.test(d3.getElementById("status").textContent),
  d3.getElementById("status").textContent);
ok("it was not replaced with a blank meeting", /not replaced with a blank meeting/.test(d3.getElementById("status").textContent));
ok("it offers an export of the unreadable minutes",
  Array.prototype.some.call(d3.querySelectorAll("button"), function (b) { return /Export the unreadable minutes/.test(b.textContent); }));
ok("the corrupt file is not overwritten", /broken minutes/.test(dom3.window.localStorage.getItem("minutes:state")));

/* --------------------------------------------- a failed save says so */

var dom4 = build(null);
var w4 = dom4.window;
var d4 = dom4.window.document;
Object.defineProperty(w4, "localStorage", {
  configurable: true,
  get: function () {
    return {
      getItem: function () { return null; },
      setItem: function () { var e = new Error("quota"); e.name = "QuotaExceededError"; throw e; },
      removeItem: function () {}, clear: function () {}
    };
  }
});
d4.getElementById("notes").value = "d: a decision";
d4.getElementById("notes").dispatchEvent(new w4.Event("input"));
ok("a failed save says NOT SAVED", /NOT SAVED:/.test(d4.getElementById("saveNote").textContent),
  d4.getElementById("saveNote").textContent);
ok("it says the minutes cover only what is on screen", /cover only what is on screen/.test(d4.getElementById("saveNote").textContent));

var total = passed + failed.length;
if (!total) { console.error("ui-tests: 0 assertions ran. That is a failure, not a pass."); process.exit(1); }
if (failed.length) {
  console.error("ui-tests: " + passed + "/" + total + " passed, " + failed.length + " FAILED");
  failed.forEach(function (f) { console.error("  FAIL " + f); });
  process.exit(1);
}
console.log("ui-tests: " + passed + "/" + total + " assertions passed");
dom.window.close(); dom2.window.close(); dom3.window.close(); dom4.window.close();
