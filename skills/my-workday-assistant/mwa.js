#!/usr/bin/env node
// CLI for My workday assistant (https://github.com/udham-mander/my-workday-assistant):
// starts it if needed and talks to its local API.
//
//   node mwa.js ensure                 start the app (no browser window) if it isn't running
//   node mwa.js summary                compact text view of Jira, my PRs, reviews, notes
//   node mwa.js refresh                force fresh GitHub + Jira data (waits for Jira), then summary
//   node mwa.js score                  weekly score table + everything finished in the period
//   node mwa.js json                   the raw /api/data JSON
//   node mwa.js add <text...>          add a timestamped entry to today's notes log
//   node mwa.js note <key> <text...>   add/replace a note on an item for today ("" deletes)
//   node mwa.js history [days]         saved notes from recent days (default 7)
//   node mwa.js auto [date]            rebuild the automatic points (GitHub/Jira activity summarized by Claude) now
//   node mwa.js agent [on|off]         show or switch the Activity agent (the automatic side of the app)
//   node mwa.js blacklist [add <text>|remove <id|item>]   what the user crossed off the agent's take; add/put back
//   node mwa.js launch [dir]           open a new Claude Code session in a terminal (the default folder, or dir)
//   node mwa.js open                   open the page in the browser
//   node mwa.js quit                   stop the app
//
// Note keys: summary | jira:<KEY> | pr:<owner/repo>#<n> | review:<owner/repo>#<n>
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const APP_DIR = path.join(os.homedir(), ".my-workday-assistant");
const PORT = Number(process.env.MY_WORKDAY_ASSISTANT_PORT) || (() => {
  try { return JSON.parse(fs.readFileSync(path.join(APP_DIR, "config.json"), "utf8")).port || 4317; } catch { return 4317; }
})();
const ORIGIN = `http://127.0.0.1:${PORT}`;

function request(method, pathname, body) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : JSON.stringify(body);
    // Writes need the app's own Origin plus x-mwa (its cross-site request protection).
    const headers = data ? { "content-type": "application/json", "x-mwa": "1", origin: ORIGIN, "content-length": Buffer.byteLength(data) } : {};
    const req = http.request({ host: "127.0.0.1", port: PORT, method, path: pathname, headers, timeout: 90000 }, (res) => {
      let b = ""; res.on("data", (c) => (b += c));
      res.on("end", () => {
        let json; try { json = JSON.parse(b); } catch { return reject(new Error(`bad response (${res.statusCode})`)); }
        res.statusCode >= 400 ? reject(new Error(json.error || `HTTP ${res.statusCode}`)) : resolve(json);
      });
    });
    req.on("timeout", () => req.destroy(new Error("request timed out")));
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}
const get = (p) => request("GET", p);
const post = (p, b) => request("POST", p, b);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function running() {
  try { return (await get("/api/ping")).app === "my-workday-assistant"; } catch { return false; }
}

async function ensure() {
  if (await running()) return "already running";
  const launcher = path.join(APP_DIR, "launch.vbs");
  if (process.platform !== "win32" || !fs.existsSync(launcher))
    throw new Error(`My workday assistant isn't running and no launcher was found at ${launcher}. ` +
      "Install it (npm run install-shortcut in the my-workday-assistant repo) or start it with `node app.js`.");
  // Start the app with a clean environment: this CLI usually runs inside a Claude Code session,
  // and the app must not inherit that session's markers (they would make every `claude` it
  // launches later think it is a child session and stop saving transcripts).
  const env = { ...process.env };
  for (const k of Object.keys(env))
    if (/^(CLAUDECODE|CLAUDE_CODE_(CHILD_SESSION|ENTRYPOINT|SESSION_ID|SESSION_ATTENDED|MESSAGING_SOCKET|MESSAGING_TOKEN|EXECPATH)|CLAUDE_PID|CLAUDE_EFFORT|UDHAM_FLASH_DISABLE)$/i.test(k)) delete env[k];
  spawn("wscript.exe", [launcher, "--no-open"], { detached: true, stdio: "ignore", windowsHide: true, env }).unref();
  for (let i = 0; i < 40; i++) { await sleep(500); if (await running()) return "started"; }
  throw new Error(`started the launcher but the app did not answer on ${ORIGIN}; see ${path.join(APP_DIR, "app.log")}`);
}

const days = (iso) => iso ? Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 86400000)) : null;
const mins = (iso) => { if (!iso) return "never"; const m = Math.round((Date.now() - Date.parse(iso)) / 60000); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`; };
const KEY_RE = /\b[A-Z][A-Z0-9]+-\d+\b/g;

// "Our score": the weekly table, then what was finished in the current week.
function scoreLines(d, { allWeeks = false } = {}) {
  const sc = d.score;
  if (!sc?.weeks?.length) return [];
  // Local calendar day, like the app (an ISO date's UTC slice can be a day off in the evening).
  const day = (iso) => { if (!iso) return "?"; const d = new Date(iso); return [d.getFullYear(), d.getMonth() + 1, d.getDate()].map((n) => String(n).padStart(2, "0")).join("-"); };
  const L = [`DONE & SCORE (${sc.weeks.length} weeks, since ${sc.since})`];
  const pad = (s, n) => String(s).padStart(n);
  L.push(`  ${"week".padEnd(23)}${pad("jira", 6)}${pad("merged", 8)}${pad("reviewed", 10)}${pad("total", 7)}`);
  sc.weeks.forEach((w, i) => L.push(`  ${`${i === 0 ? "this week " : i === 1 ? "last week " : ""}${w.start}`.padEnd(23)}${pad(w.jiraDone, 6)}${pad(w.prsMerged, 8)}${pad(w.prsReviewed, 10)}${pad(w.total, 7)}`));
  L.push(`  ${"total".padEnd(23)}${pad(sc.totals.jiraDone, 6)}${pad(sc.totals.prsMerged, 8)}${pad(sc.totals.prsReviewed, 10)}${pad(sc.totals.total, 7)}`);
  const from = allWeeks ? sc.since : sc.weeks[0].start;
  const inRange = (iso) => day(iso) >= from;
  const jira = (d.jiraDone || []).filter((j) => inRange(j.doneAt));   // doneAt: set by the app (one rule, lib/score.js)
  const prs = (d.github.closed || []).filter((pr) => inRange(pr.closedAt));
  const rv = (d.github.reviewed || []).filter((pr) => inRange(pr.lastReviewAt));
  L.push(`  ${allWeeks ? "In this period" : "This week"}: ${jira.length} Jira done, ${prs.length} PRs closed, ${rv.length} reviewed`);
  for (const j of jira) L.push(`    ${j.key} done ${day(j.doneAt)} — ${j.summary}`);
  for (const pr of prs) L.push(`    ${pr.repo}#${pr.number} ${pr.merged ? "merged" : "closed"} ${day(pr.closedAt)} — ${pr.title}`);
  for (const pr of rv) L.push(`    reviewed ${pr.repo}#${pr.number} (${(pr.lastReviewState || "").toLowerCase()} ${day(pr.lastReviewAt)}) by ${pr.author} — ${pr.title}`);
  return L;
}

function summary(d) {
  const L = [];
  const js = d.jiraStatus, notes = d.todayNotes || {}, prev = d.previous;
  const note = (k) => (notes[k] ? `\n      note: ${notes[k].replace(/\n/g, " / ")}` : "") +
    (prev?.notes?.[k] ? `\n      prev (${prev.date}): ${prev.notes[k].replace(/\n/g, " / ")}` : "");
  L.push(`My workday assistant — ${d.today}${d.github.login ? ` (@${d.github.login})` : ""} · ${ORIGIN}`);
  L.push(`GitHub ${mins(d.githubFetchedAt)}${d.githubError ? ` — ERROR: ${d.githubError}` : ""} · ` +
    `Jira ${js.running ? "refreshing…" : mins(js.fetchedAt)} via ${js.source}${js.error ? ` — last refresh failed: ${js.error}` : ""}`);
  L.push(`Progress folder: ${d.progressDir} · Activity agent: ${d.autoStatus?.enabled ? "on" : "off"}`, "");

  const prsByKey = {};
  for (const pr of d.github.mine) for (const k of new Set(`${pr.title} ${pr.branch}`.match(KEY_RE) || [])) (prsByKey[k] ||= []).push(`${pr.repo}#${pr.number}`);
  const order = { "In Progress": 0, "To Do": 1 };
  const jira = [...d.jira].sort((a, b) => (order[a.statusCategory] ?? 2) - (order[b.statusCategory] ?? 2) || (a.key > b.key ? 1 : -1));
  L.push(`MY JIRA (${jira.length})`);
  for (const j of jira) {
    const dur = j.statusCategory === "In Progress" ? `in progress ${days(j.statusCategoryChangedAt)}d` : `not started (created ${days(j.created)}d ago)`;
    L.push(`  ${j.key} [${j.status}] ${dur} · ${j.type} · ${j.priority} — ${j.summary}` +
      (prsByKey[j.key] ? ` · PRs: ${prsByKey[j.key].join(", ")}` : "") + `\n      ${j.url}` + note(`jira:${j.key}`));
  }
  L.push("", `MY PULL REQUESTS (${d.github.mine.length})`);
  for (const pr of d.github.mine)
    L.push(`  ${pr.repo}#${pr.number} open ${days(pr.createdAt)}d — ${pr.title}\n      pending: ${pr.pending.map((n) => n.text).join("; ")}\n      ${pr.url}` + note(`pr:${pr.repo}#${pr.number}`));
  const rv = [...d.github.toReview].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  L.push("", `NEEDS MY REVIEW (${rv.length}, oldest first)`);
  for (const pr of rv)
    L.push(`  ${pr.repo}#${pr.number} open ${days(pr.createdAt)}d by ${pr.author}${pr.draft ? " (draft)" : ""} — ${pr.title}\n      ${pr.url}` + note(`review:${pr.repo}#${pr.number}`));
  L.push("", ...scoreLines(d));
  const time = (iso) => new Date(iso).toTimeString().slice(0, 5);
  const log = (entries, summaryText) => [
    ...(summaryText ? [`  Summary: ${summaryText.replace(/\n/g, " / ")}`] : []),
    ...(entries ?? []).map((e) => `  ${time(e.at)}  ${e.text.replace(/\n/g, " / ")}`),
  ];
  const today = log(d.todayEntries, notes.summary);
  L.push("", `TODAY'S NOTES (${today.length})`, ...(today.length ? today : ["  (none yet)"]));
  L.push(...autoLines(d.todayAuto, d.autoStatus));
  if (prev) {
    const p = log(prev.entries, prev.notes?.summary);
    if (p.length) L.push(`PREVIOUS DAY'S NOTES (${prev.date})`, ...p);
    if (prev.auto?.points?.length) L.push(`PREVIOUS DAY'S AUTOMATIC POINTS (${prev.date})`, ...prev.auto.points.map((p) => `  - ${p}`));
  }
  return L.join("\n");
}

// Same shape as the app's labelOf(): the items an entry names, or its wording in quotes (clipped here).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const blackLabel = (e) => (e.refs?.length ? e.refs.join(", ") : `"${e.text.length > 80 ? `${e.text.slice(0, 80)}…` : e.text}"`);

// Automatic points: built by the app from GitHub events + Jira changes (summarized by Claude).
function autoLines(auto, status) {
  if (status && status.enabled === false) return [];
  if (!auto) return ["AUTOMATIC POINTS: not built yet today (node mwa.js auto)"];
  const time = (iso) => new Date(iso).toTimeString().slice(0, 5);
  return [`AUTOMATIC POINTS (updated ${time(auto.updatedAt)} via ${auto.source}${auto.eodSavedAt ? `; day saved automatically at ${time(auto.eodSavedAt)}` : ""})`,
    ...(auto.points.length ? auto.points.map((p) => `  - ${p}`) : ["  (nothing recorded yet)"]),
    ...(auto.errors?.length ? [`  note: ${auto.errors.join("; ")}`] : []),
    ...(auto.nudges?.length ? [`AGENT'S TAKE (what deserves attention today, the app's own judgement; "blacklist add <item>" drops one for good)`, ...auto.nudges.map((n, i) => `  ${i + 1}. ${n}`)] : [])];
}

async function main() {
  const [cmd = "summary", ...rest] = process.argv.slice(2);
  if (cmd === "ensure") return console.log(`My workday assistant ${await ensure()} at ${ORIGIN}`);
  if (cmd === "quit") {
    if (!(await running())) return console.log("My workday assistant is not running.");
    await post("/api/quit", {});
    for (let i = 0; i < 20 && (await running()); i++) await sleep(250);   // the app exits ~200 ms after replying
    return console.log("My workday assistant stopped.");
  }
  await ensure();
  switch (cmd) {
    case "summary": return console.log(summary(await get("/api/data")));
    case "score": return console.log(scoreLines(await get("/api/data"), { allWeeks: true }).join("\n") || "No score data yet.");
    case "json": return console.log(JSON.stringify(await get("/api/data"), null, 2));
    case "refresh": {
      await post("/api/refresh", {});
      for (let i = 0; i < 60; i++) { if (!(await get("/api/status")).jiraStatus.running) break; await sleep(3000); }
      return console.log(summary(await get("/api/data")));
    }
    case "add": {
      const text = rest.join(" ").trim();
      if (!text) throw new Error("usage: add <text>");
      const r = await post("/api/entries", { text });
      return console.log(`Added to today's notes at ${new Date(r.entry.at).toTimeString().slice(0, 5)} (${r.entries.length} today)`);
    }
    case "note": {
      const [key, ...words] = rest;
      if (!key || !/^(summary$|jira:|pr:|review:)/.test(key)) throw new Error("usage: note <summary|jira:KEY|pr:owner/repo#N|review:owner/repo#N> <text>");
      const r = await post("/api/save", { notes: { [key]: words.join(" ") } });
      return console.log(`${words.join(" ").trim() ? "Saved" : "Deleted"} note "${key}" in ${r.files[0]}`);
    }
    case "history": {
      const h = await get(`/api/history?days=${Number(rest[0]) || 7}`);
      if (!h.days.length) return console.log(`No saved days in ${h.progressDir} yet.`);
      for (const day of h.days) {
        console.log(`${day.date}  (${day.counts?.jira ?? "?"} Jira, ${day.counts?.myPRs ?? "?"} PRs, ${day.counts?.toReview ?? "?"} to review)`);
        for (const e of day.entries || []) console.log(`  ${new Date(e.at).toTimeString().slice(0, 5)}  ${e.text.replace(/\n/g, " / ")}`);
        for (const p of day.auto?.points || []) console.log(`  auto   ${p.replace(/\n/g, " / ")}`);
        for (const [k, v] of Object.entries(day.notes || {})) console.log(`  ${k}: ${v.replace(/\n/g, " / ")}`);
      }
      return;
    }
    case "agent": {
      const arg = (rest[0] || "").toLowerCase();
      if (!arg) {
        const st = (await get("/api/status")).autoStatus || {};
        return console.log(`Activity agent: ${st.enabled ? "on" : "off"} · blacklist: ${st.blacklist?.length ? `${st.blacklist.length} entr${st.blacklist.length === 1 ? "y" : "ies"} (node mwa.js blacklist)` : "empty"}`);
      }
      if (arg !== "on" && arg !== "off") throw new Error("usage: agent [on|off]");
      const r = await post("/api/agent", { enabled: arg === "on" });
      return console.log(`Activity agent: ${r.autoStatus.enabled ? "on" : "off"} (remembered in the config)`);
    }
    // The agent's blacklist: what the user crossed off the take (an item like dbms#11 / ABC-123, or a wording).
    case "blacklist": {
      const sub = (rest[0] || "").toLowerCase();
      if (!sub) {
        const b = (await get("/api/status")).autoStatus?.blacklist || [];
        if (!b.length) return console.log("Blacklist: empty — the agent may bring anything up.");
        return console.log([`BLACKLIST (${b.length}; the agent leaves these out of its take)`, ...b.map((e) => `  ${blackLabel(e)}  · id ${e.id}${e.date ? ` · ${e.date}` : ""}`)].join("\n"));
      }
      if (sub === "add") {
        const text = rest.slice(1).join(" ").trim();
        if (!text) throw new Error("usage: blacklist add <item or text>   e.g. blacklist add dbms#11");
        const r = await post("/api/blacklist/add", { text });
        const take = r.auto ? `today's take now has ${r.auto.nudges?.length ?? 0} point(s)` : "no take built yet today";
        return console.log(r.added ? `Blacklisted ${blackLabel(r.entry)} (id ${r.entry.id}); ${take}` : `Already on the blacklist as ${blackLabel(r.entry)} (id ${r.entry.id}); ${take}`);
      }
      if (sub === "remove") {
        const what = rest.slice(1).join(" ").trim();
        if (!what) throw new Error("usage: blacklist remove <id or item>");
        // An id removes that entry; anything else removes every entry covering that item or wording (the app does the matching).
        const r = await post("/api/blacklist/remove", UUID_RE.test(what) ? { id: what } : { text: what });
        return console.log(`Took ${blackLabel(r.entry)} off the blacklist${r.removed > 1 ? ` (${r.removed} entries)` : ""}`);
      }
      throw new Error("usage: blacklist [add <text>|remove <id|item>]");
    }
    case "auto": {
      const r = await post("/api/auto", rest[0] ? { date: rest[0] } : {});
      return console.log(autoLines(r.auto, r.autoStatus).join("\n") || `Nothing recorded for ${r.date}.`);
    }
    case "launch": {
      const dir = rest.join(" ").trim();
      const r = await post("/api/launch", dir ? { dir } : {});
      return console.log(`Launched a new Claude session in ${r.dir}\nRecent folders: ${r.recent.join(" | ") || "(none)"}`);
    }
    case "open": {
      const [c, a] = process.platform === "win32" ? ["cmd", ["/c", "start", "", `${ORIGIN}/`]] : process.platform === "darwin" ? ["open", [`${ORIGIN}/`]] : ["xdg-open", [`${ORIGIN}/`]];
      spawn(c, a, { detached: true, stdio: "ignore", windowsHide: true }).unref();
      return console.log(`Opened ${ORIGIN}/`);
    }
    default: throw new Error(`unknown command "${cmd}" (ensure|summary|score|refresh|json|add|note|history|auto|agent|blacklist|launch|open|quit)`);
  }
}

main().catch((e) => { console.error(`mwa: ${e.message}`); process.exit(1); });
