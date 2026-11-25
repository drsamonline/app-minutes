/* minutes-core — the engine behind Minutes.
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 * (c) 2026 Dr Sohil Momin
 *
 * ONE JOB: turn what was said in a meeting into the two lists that outlive it — DECISIONS
 * and ACTIONS with owners — and measure the meeting so the next one can be shorter.
 *
 * Both specs forbid the same thing, and it is the thing most meeting apps do: there is no
 * audio here and no transcription. It structures what you type. That is why the app works
 * with the microphone off, in a room with no signal, on a laptop with no battery left.
 *
 * Pure functions: no DOM, no network, no storage. The page does the wiring.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MinutesCore = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var VERSION = "1.0.0";

  /* The shorthand. One line, one item, and the first word decides which list it goes in —
   * which is why no item can land in both. */
  var MARKERS = [
    { kind: "decision", re: /^(?:d|dec|decision|resolved|resolution)\s*[:\-]\s*(.+)$/i },
    { kind: "action", re: /^(?:a|act|action|todo|to-do|ai)\s*[:\-]\s*(.+)$/i },
    { kind: "topic", re: /^(?:t|topic|agenda)\s*[:\-]\s*(.+)$/i },
    { kind: "note", re: /^(?:n|note|notes)\s*[:\-]\s*(.+)$/i }
  ];

  /* An owner is a NAME at the end of the line: up to four words, after @ or -> or an
   * explicit "owner:". A stray @ in the middle of a sentence is not an owner, which is why
   * the tail is capped — otherwise "Email @Ravi about the deck tomorrow" would hand the
   * action to someone who was only mentioned. */
  var NAME = "([A-Za-z][A-Za-z.'-]*(?:\\s+[A-Za-z][A-Za-z.'-]*){0,3})";
  var OWNER_RE = new RegExp("(?:@|->|\u2014\\s*owner:|\\(owner:)\\s*" + NAME + "\\s*$", "i");
  var MOVER_RE = new RegExp("(?:@|->|\u2014\\s*moved by:|\\(moved by:)\\s*" + NAME + "\\s*$", "i");

  function clean(s) { return String(s == null ? "" : s).replace(/\s+/g, " ").trim(); }

  /* An owner is only ever what was typed. If nothing was typed, the action is UNOWNED —
   * it is never given to the last speaker, the chair, or anybody else. */
  function splitOwner(text) {
    var t = clean(text);
    var m = OWNER_RE.exec(t);
    if (!m) return { text: t, owner: "", unowned: true };
    return { text: clean(t.slice(0, m.index)), owner: clean(m[1]), unowned: false };
  }

  function splitMover(text) {
    var t = clean(text);
    var m = MOVER_RE.exec(t);
    if (!m) return { text: t, mover: "", unmoved: true };
    return { text: clean(t.slice(0, m.index)), mover: clean(m[1]), unmoved: false };
  }

  /* ------------------------------------------------------------- parsing */

  function classify(line) {
    var l = clean(line);
    if (!l) return null;
    for (var i = 0; i < MARKERS.length; i++) {
      var m = MARKERS[i].re.exec(l);
      if (m) return { kind: MARKERS[i].kind, body: clean(m[1]) };
    }
    return { kind: "note", body: l, unmarked: true };
  }

  /* Every item carries the line it came from, so a person can find it again. */
  function parse(text, opts) {
    var raw = String(text == null ? "" : text);
    var lines = raw.split(/\r?\n/);
    var out = { decisions: [], actions: [], topics: [], notes: [], warnings: [], skipped: [] };
    var topic = "";

    lines.forEach(function (line, i) {
      var c = classify(line);
      if (!c) return;
      var at = (opts && opts.now) || 0;

      if (c.kind === "topic") {
        topic = c.body;
        /* A topic's start time is only known if the person pressed "Mark topic" at the time
         * (or the text was typed live). Pasted minutes carry no clock, and the app does not
         * invent one. */
        var stamp = (opts && opts.stamps && opts.stamps[c.body]) || at || 0;
        out.topics.push({ id: "t" + (out.topics.length + 1), name: c.body, line: i + 1, startedAt: stamp });
        return;
      }
      if (c.kind === "decision") {
        var d = splitMover(c.body);
        out.decisions.push({
          id: "d" + (out.decisions.length + 1),
          text: d.text, mover: d.mover, unmoved: d.unmoved,
          topic: topic, line: i + 1
        });
        if (d.unmoved) out.warnings.push("Decision " + (out.decisions.length) + " has no mover recorded: \u201c" + d.text + "\u201d");
        return;
      }
      if (c.kind === "action") {
        var a = splitOwner(c.body);
        out.actions.push({
          id: "a" + (out.actions.length + 1),
          text: a.text, owner: a.owner, unowned: a.unowned,
          topic: topic, line: i + 1
        });
        return;
      }
      out.notes.push({ id: "n" + (out.notes.length + 1), text: c.body, topic: topic, line: i + 1, unmarked: !!c.unmarked });
    });

    /* The two lists are disjoint BY CONSTRUCTION: a line is classified once, and the
     * classifier returns exactly one kind. The test below is a guard, not a fix. */
    var inBoth = out.decisions.filter(function (d) {
      return out.actions.some(function (a) { return a.text.toLowerCase() === d.text.toLowerCase(); });
    });
    out.inBoth = inBoth;
    return out;
  }

  /* ---------------------------------------------------------- the autopsy */

  /* What the meeting cost, and what produced nothing. Time comes from the topic markers
   * the person typed — the app does not record anything, so it cannot know the real clock
   * unless it is told. */
  function autopsy(parsed, meta) {
    var p = parsed || { decisions: [], actions: [], topics: [], notes: [] };
    var endedAt = (meta && meta.endedAt) || 0;
    var topics = (p.topics || []).map(function (t, i, arr) {
      var next = arr[i + 1];
      var from = t.startedAt || 0;
      var to = next && next.startedAt ? next.startedAt : endedAt;
      var minutes = from && to && to > from ? Math.round((to - from) / 60000) : 0;
      var actions = (p.actions || []).filter(function (a) { return a.topic === t.name; }).length;
      var decisions = (p.decisions || []).filter(function (d) { return d.topic === t.name; }).length;
      return {
        name: t.name, minutes: minutes, actions: actions, decisions: decisions,
        producedNothing: actions === 0 && decisions === 0
      };
    });
    var totalMinutes = topics.reduce(function (s, t) { return s + t.minutes; }, 0);
    var nothing = topics.filter(function (t) { return t.producedNothing; });
    var unowned = (p.actions || []).filter(function (a) { return a.unowned; });
    var unmoved = (p.decisions || []).filter(function (d) { return d.unmoved; });

    return {
      topics: topics,
      totalMinutes: totalMinutes,
      producedNothing: nothing,
      actions: (p.actions || []).length,
      decisions: (p.decisions || []).length,
      unowned: unowned,
      unmoved: unmoved,
      says: (p.actions.length + p.decisions.length === 0)
        ? "Nothing was extracted: there are no decisions and no actions in this meeting yet, and no minutes were invented from the space between them."
        : (p.decisions.length + " decision(s), " + p.actions.length + " action(s)" +
          (topics.length ? " across " + topics.length + " topic(s), " + totalMinutes + " minute(s) measured" : "") +
          (nothing.length ? "; " + nothing.length + " topic(s) produced nothing: " + nothing.map(function (t) { return t.name; }).join(", ") : "") +
          (unowned.length ? "; " + unowned.length + " action(s) have no owner" : "") +
          (unmoved.length ? "; " + unmoved.length + " decision(s) have no mover" : "") + ".")
    };
  }

  /* -------------------------------------------------------------- minutes */

  function attendeesFrom(text) {
    return String(text || "").split(/[,\n;]/).map(function (s) { return clean(s); }).filter(Boolean);
  }

  /* The minutes, as a document. Attendees who were not named are not guessed at: the
   * minutes say "Attendees not identified" rather than inventing a list from the lines. */
  function buildMinutes(parsed, meta) {
    var p = parsed || parse("");
    var attendees = attendeesFrom((meta && meta.attendees) || "");
    var title = clean((meta && meta.title) || "") || "Meeting";
    var date = clean((meta && meta.date) || "");
    return {
      title: title,
      date: date,
      attendees: attendees,
      attendeesIdentified: attendees.length > 0,
      attendeeNote: attendees.length ? "" : "Attendees not identified",
      decisions: p.decisions || [],
      actions: p.actions || [],
      topics: p.topics || [],
      notes: p.notes || [],
      warnings: p.warnings || [],
      says: (attendees.length ? attendees.length + " attendee(s) named" : "Attendees not identified \u2014 the minutes keep them unnamed rather than guessing from the lines")
    };
  }

  /* The follow-up list: every action with its owner, unowned ones marked, and the count
   * that the export must match. */
  function followUps(parsed) {
    var actions = (parsed && parsed.actions) || [];
    return {
      count: actions.length,
      rows: actions.map(function (a) {
        return { id: a.id, text: a.text, owner: a.owner || "UNOWNED", unowned: !!a.unowned };
      }),
      unowned: actions.filter(function (a) { return a.unowned; }).length,
      says: actions.length
        ? actions.length + " action(s); " + actions.filter(function (a) { return a.unowned; }).length + " with no owner, listed as unowned rather than assigned to anyone."
        : "No actions yet."
    };
  }

  /* ---------------------------------------------------------------- export */

  function markdown(m, parsed, meta) {
    var lines = ["# Minutes \u2014 " + m.title, ""];
    if (m.date) lines.push("**Date:** " + m.date);
    lines.push("**Attendees:** " + (m.attendeesIdentified ? m.attendees.join(", ") : m.attendeeNote));
    lines.push("");
    if ((m.decisions || []).length) {
      lines.push("## Decisions");
      m.decisions.forEach(function (d, i) {
        lines.push((i + 1) + ". " + d.text + (d.mover ? "  _(moved by " + d.mover + ")_" : "  _(no mover recorded)_"));
      });
      lines.push("");
    }
    lines.push("## Actions");
    var f = followUps(parsed);
    if (!f.count) lines.push("", "None recorded.");
    f.rows.forEach(function (r, i) {
      lines.push((i + 1) + ". " + r.text + " \u2014 **" + r.owner + "**");
    });
    lines.push("");
    var au = autopsy(parsed, meta);
    if (au.topics.length) {
      lines.push("## What the meeting cost");
      lines.push("");
      lines.push("| Topic | Minutes | Decisions | Actions |");
      lines.push("|---|---|---|---|");
      au.topics.forEach(function (t) {
        lines.push("| " + t.name.replace(/\|/g, "\\|") + " | " + t.minutes + " | " + t.decisions + " | " + t.actions + " |");
      });
      lines.push("");
      if (au.producedNothing.length) lines.push("Produced nothing: " + au.producedNothing.map(function (t) { return t.name; }).join(", ") + ".");
    }
    if ((m.notes || []).length) {
      lines.push("");
      lines.push("## Notes");
      m.notes.forEach(function (n) { lines.push("- " + n.text); });
    }
    if ((m.warnings || []).length) {
      lines.push("");
      lines.push("## Flags");
      m.warnings.forEach(function (w) { lines.push("- " + w); });
    }
    lines.push("");
    lines.push("Typed minutes: no audio was recorded and nothing was transcribed. " + f.count + " action(s) listed above.");
    return lines.join("\n");
  }

  /* --------------------------------------------------------------- storage */

  function serialize(state) {
    return JSON.stringify({
      version: VERSION,
      savedOn: (state && state.savedOn) || 0,
      title: (state && state.title) || "",
      date: (state && state.date) || "",
      attendees: (state && state.attendees) || "",
      text: (state && state.text) || "",
      topics: ((state && state.topics) || []).slice(),
      endedAt: (state && state.endedAt) || 0
    }, null, 2);
  }

  /* Unreadable minutes are REPORTED and offered for export. They are never replaced with a
   * blank meeting, which would look like a meeting where nothing was decided. */
  function parseState(text) {
    var raw = String(text == null ? "" : text);
    if (!raw.trim()) return { ok: false, empty: true, reason: "there are no saved minutes yet", raw: raw };
    var data;
    try { data = JSON.parse(raw); }
    catch (e) {
      return { ok: false, reason: "The saved minutes cannot be read. They were not replaced with a blank meeting. Export them to keep them.", raw: raw };
    }
    if (!data || typeof data !== "object") {
      return { ok: false, reason: "The saved file is not minutes. It was not replaced with a blank meeting; export it to keep it.", raw: raw };
    }
    return {
      ok: true,
      state: {
        version: data.version || VERSION,
        savedOn: Number(data.savedOn) || 0,
        title: String(data.title || ""),
        date: String(data.date || ""),
        attendees: String(data.attendees || ""),
        text: String(data.text || ""),
        topics: Array.isArray(data.topics) ? data.topics : [],
        endedAt: Number(data.endedAt) || 0
      },
      raw: raw
    };
  }

  function stamp(when) {
    var m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(when || ""));
    return m ? m[3] + "-" + m[2] + "-" + m[1] : "undated";
  }

  function exportFile(what, payload, meta, writer) {
    meta = meta || {};
    if (typeof writer !== "function") return { ok: false, reason: "the file was not written: no writer is available in this browser" };
    var name, body, mime = "text/markdown;charset=utf-8";
    if (what === "minutes") { name = "minutes-" + stamp(meta.when) + ".md"; body = markdown(payload.minutes, payload.parsed, meta); }
    else if (what === "raw") { name = "minutes-unreadable-" + stamp(meta.when) + ".txt"; body = String(payload.raw || ""); mime = "text/plain;charset=utf-8"; }
    else return { ok: false, reason: "nothing was written: unknown export \u201c" + what + "\u201d" };
    try {
      var wrote = writer(name, body, mime);
      if (wrote === false) return { ok: false, filename: name, reason: "the file was not written: the browser refused the save" };
      return { ok: true, filename: name, bytes: body.length };
    } catch (e) {
      var why = e && e.name === "QuotaExceededError" ? "storage is full" : (e && e.message ? e.message : "storage is unavailable");
      return { ok: false, filename: name, reason: "the file was not written: " + why };
    }
  }

  return {
    version: VERSION,
    MARKERS: MARKERS,
    classify: classify,
    splitOwner: splitOwner,
    splitMover: splitMover,
    parse: parse,
    autopsy: autopsy,
    attendeesFrom: attendeesFrom,
    buildMinutes: buildMinutes,
    followUps: followUps,
    markdown: markdown,
    serialize: serialize,
    parseState: parseState,
    exportFile: exportFile
  };
});
