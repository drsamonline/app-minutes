/* app — the Minutes page. SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 * (c) 2026 Dr Sohil Momin
 *
 * Wiring only: the shorthand, the two lists, the owner rule and the autopsy live in
 * minutes-core.js, which the tests exercise directly.
 */
(function () {
  "use strict";

  var M = window.MinutesCore;
  var $ = function (id) { return document.getElementById(id); };

  var K_STATE = "minutes:state";

  var els = {
    title: $("title"), date: $("date"), attendees: $("attendees"), attendeeNote: $("attendeeNote"),
    notes: $("notes"), markTopic: $("markTopic"), example: $("example"), saveNote: $("saveNote"),
    status: $("status"),
    decList: $("decList"), decCount: $("decCount"), decEmpty: $("decEmpty"),
    actList: $("actList"), actCount: $("actCount"), actEmpty: $("actEmpty"), actNote: $("actNote"),
    autopsySays: $("autopsySays"), topicTable: $("topicTable"), topicNote: $("topicNote"),
    exportBtn: $("exportBtn"), copyBtn: $("copyBtn"), exportNote: $("exportNote")
  };

  var state = { parsed: M.parse(""), stamps: {}, endedAt: 0, dirty: false, unreadable: null };

  /* ------------------------------------------------------------- helpers */

  function today() {
    var d = new Date();
    var p = function (n) { return (n < 10 ? "0" : "") + n; };
    return p(d.getDate()) + "/" + p(d.getMonth() + 1) + "/" + d.getFullYear();
  }

  function setStatus(kind, msg) {
    els.status.className = "status show " + kind;
    els.status.textContent = msg;
  }
  function clearStatus() { els.status.className = "status"; els.status.textContent = ""; }

  function node(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function snapshot() {
    return {
      savedOn: Date.now(),
      title: els.title.value,
      date: els.date.value,
      attendees: els.attendees.value,
      text: els.notes.value,
      topics: Object.keys(state.stamps).map(function (k) { return { name: k, startedAt: state.stamps[k] }; }),
      endedAt: state.endedAt
    };
  }

  function persist() {
    try {
      window.localStorage.setItem(K_STATE, M.serialize(snapshot()));
      state.dirty = false;
      els.saveNote.textContent = "Saved on this device.";
      return true;
    } catch (e) {
      state.dirty = true;
      els.saveNote.textContent = "NOT SAVED: " + (e && e.name === "QuotaExceededError" ? "storage is full" : "storage is unavailable") +
        ". The minutes cover only what is on screen; export them now.";
      setStatus("bad", els.saveNote.textContent);
      return false;
    }
  }

  /* -------------------------------------------------------------- render */

  function reparse() {
    state.parsed = M.parse(els.notes.value, { stamps: state.stamps });
    renderLists();
    renderAutopsy();
  }

  function renderLists() {
    var p = state.parsed;

    els.decList.textContent = "";
    els.decCount.textContent = p.decisions.length ? "· " + p.decisions.length : "";
    els.decEmpty.hidden = p.decisions.length > 0;
    p.decisions.forEach(function (d) {
      var li = node("li", "dec", d.text);
      var who = d.mover ? "moved by " + d.mover : "no mover recorded";
      var span = node("span", "who", who + (d.topic ? " · " + d.topic : "") + " · line " + d.line);
      if (!d.mover) span.style.color = "var(--warn)";
      li.appendChild(span);
      els.decList.appendChild(li);
    });

    els.actList.textContent = "";
    els.actCount.textContent = p.actions.length ? "· " + p.actions.length : "";
    els.actEmpty.hidden = p.actions.length > 0;
    p.actions.forEach(function (a) {
      var li = node("li", "act", a.text);
      var span = node("span", "who");
      if (a.unowned) {
        span.appendChild(node("span", "unowned", "UNOWNED"));
        span.appendChild(document.createTextNode(" · not assigned to anyone · line " + a.line));
      } else {
        span.appendChild(document.createTextNode("owner: " + a.owner + " · line " + a.line));
      }
      li.appendChild(span);
      els.actList.appendChild(li);
    });

    var f = M.followUps(p);
    els.actNote.textContent = f.says;

    if (p.warnings.length) setStatus("warn", p.warnings.length + " flag(s): " + p.warnings[0]);
    else if (p.actions.length || p.decisions.length) clearStatus();
  }

  function renderAutopsy() {
    var au = M.autopsy(state.parsed, { endedAt: state.endedAt });
    els.autopsySays.textContent = au.says;
    els.topicTable.hidden = au.topics.length === 0;
    var body = els.topicTable.querySelector("tbody");
    body.textContent = "";
    au.topics.forEach(function (t) {
      var tr = node("tr");
      tr.appendChild(node("td", null, t.name));
      tr.appendChild(node("td", t.producedNothing ? "none" : null, t.minutes ? String(t.minutes) : "—"));
      tr.appendChild(node("td", t.producedNothing ? "none" : null, String(t.decisions)));
      tr.appendChild(node("td", t.producedNothing ? "none" : null, String(t.actions)));
      body.appendChild(tr);
    });
    els.topicNote.textContent = au.topics.length
      ? "Minutes are measured from the moments you pressed “Mark a new topic now”. Pasted minutes carry no clock, and the app does not invent one."
      : "No topics marked yet, so no time is measured. Press “Mark a new topic now” as the meeting moves on.";
  }

  /* ------------------------------------------------------------- export */

  function writer(name, text, mime) {
    if (!window.Export || typeof window.Export.save !== "function") throw new Error("the export kit did not load");
    window.Export.save(name, text, mime);
    return true;
  }

  function doExport() {
    var minutes = M.buildMinutes(state.parsed, { title: els.title.value, date: els.date.value, attendees: els.attendees.value });
    var out = M.exportFile("minutes", { minutes: minutes, parsed: state.parsed }, { when: today(), endedAt: state.endedAt }, writer);
    if (out.ok) {
      var f = M.followUps(state.parsed);
      els.exportNote.textContent = "Wrote " + out.filename + " \u2014 " + f.count + " action(s) with their owners, the same count as on screen.";
      setStatus("ok", "Exported. " + f.count + " action(s).");
    } else {
      setStatus("bad", out.reason + ".");
    }
  }

  function copyFollowUps() {
    var f = M.followUps(state.parsed);
    if (!f.count) { setStatus("warn", "There are no actions to copy yet."); return; }
    var text = f.rows.map(function (r, i) { return (i + 1) + ". " + r.text + " \u2014 " + r.owner; }).join("\n");
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        setStatus("ok", "Copied " + f.count + " action(s).");
      }, function () {
        setStatus("warn", "The browser refused the clipboard. Select the list and copy it by hand.");
      });
    } else {
      setStatus("warn", "No clipboard here \u2014 select the list and copy it by hand.");
    }
  }

  /* ---------------------------------------------------------------- wire */

  els.notes.addEventListener("input", function () {
    reparse();
    persist();
  });
  [els.title, els.date, els.attendees].forEach(function (el) {
    el.addEventListener("input", function () {
      els.attendeeNote.textContent = M.attendeesFrom(els.attendees.value).length
        ? ""
        : "Attendees not identified \u2014 the minutes keep them unnamed rather than guessing.";
      persist();
    });
  });

  els.markTopic.addEventListener("click", function () {
    var name = window.prompt("What is the topic now?", "");
    if (!name || !name.trim()) { setStatus("warn", "No topic name given, so nothing was marked."); return; }
    var clean = name.replace(/\s+/g, " ").trim();
    state.stamps[clean] = Date.now();
    els.notes.value = els.notes.value + (els.notes.value.endsWith("\n") || !els.notes.value ? "" : "\n") + "topic: " + clean + "\n";
    reparse();
    persist();
    setStatus("ok", "Topic marked: " + clean + ".");
  });

  els.exportBtn.addEventListener("click", doExport);
  els.copyBtn.addEventListener("click", copyFollowUps);

  els.example.addEventListener("click", function () {
    els.title.value = els.title.value || "Weekly sync";
    els.date.value = els.date.value || today();
    els.attendees.value = els.attendees.value || "Priya, Ravi, Sohil";
    els.notes.value = [
      "topic: Q3 hiring",
      "d: We will hire two engineers this quarter @Priya",
      "n: Priya said the budget is tight",
      "a: Publish the job description by Friday @Ravi",
      "topic: Office move",
      "a: Get three quotes for the movers",
      "d: The move is deferred to January @Sohil",
      "a: Tell the landlord we are staying @Priya"
    ].join("\n");
    reparse();
    persist();
    setStatus("ok", "Example loaded: two decisions, three actions, one of them with no owner.");
  });

  /* ------------------------------------------------------------ start up */

  els.attendeeNote.textContent = "Attendees not identified \u2014 the minutes keep them unnamed rather than guessing.";

  var raw = null;
  try { raw = window.localStorage.getItem(K_STATE); } catch (e) { raw = null; }
  if (raw) {
    var parsed = M.parseState(raw);
    if (parsed.ok) {
      els.title.value = parsed.state.title;
      els.date.value = parsed.state.date;
      els.attendees.value = parsed.state.attendees;
      els.notes.value = parsed.state.text;
      state.endedAt = parsed.state.endedAt;
      (parsed.state.topics || []).forEach(function (t) { if (t && t.name) state.stamps[t.name] = Number(t.startedAt) || 0; });
      els.attendeeNote.textContent = M.attendeesFrom(els.attendees.value).length ? "" : "Attendees not identified \u2014 the minutes keep them unnamed rather than guessing.";
    } else {
      state.unreadable = parsed;
      setStatus("bad", parsed.reason);
      var keep = node("button", "small", "Export the unreadable minutes");
      keep.addEventListener("click", function () {
        var out = M.exportFile("raw", parsed, { when: today() }, writer);
        setStatus(out.ok ? "ok" : "bad", out.ok ? "Wrote " + out.filename + "." : out.reason);
      });
      els.exportNote.parentNode.insertBefore(keep, els.exportNote);
      var fresh = node("button", "small", "Start a new set, deliberately");
      fresh.addEventListener("click", function () {
        try { window.localStorage.removeItem(K_STATE); } catch (e) { /* nothing to remove */ }
        els.notes.value = "";
        state.stamps = {};
        state.unreadable = null;
        reparse();
        setStatus("ok", "Starting new minutes, deliberately. The unreadable file is gone.");
      });
      els.exportNote.parentNode.insertBefore(fresh, els.exportNote);
    }
  }

  reparse();
  if (window.Loom && window.Loom.pwa) window.Loom.pwa.register("sw.js");
})();
