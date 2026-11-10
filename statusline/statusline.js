// Claude Code status line. Reads the status JSON on stdin and prints one line:
//
//   github (main) │ Opus 5.5 · xhigh │ ctx 26% 257k/1M │ 5h 7% ↻2h14m
//
// Segments with no data are left out. Colors warn as limits approach.
// Part of the udham-swe plugin; see docs/statusline.md.
const fs = require("fs");
const path = require("path");

const C = {
  reset: "\x1b[0m", dim: "\x1b[2m", bold: "\x1b[1m",
  red: "\x1b[31m", green: "\x1b[32m", yellow: "\x1b[33m", blue: "\x1b[34m",
  magenta: "\x1b[35m", cyan: "\x1b[36m",
};
const paint = (color, text) => `${color}${text}${C.reset}`;
const SEP = paint(C.dim, " │ ");

// Green → yellow → red as a usage percentage climbs.
const usageColor = (pct, warn, crit) => (pct >= crit ? C.red : pct >= warn ? C.yellow : C.green);

const kfmt = (n) =>
  n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : `${n}`;

const duration = (ms) => {
  const m = Math.floor(ms / 60000);
  return m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}m` : `${m}m`;
};

// Branch name read straight from .git/HEAD (no git process: ~1 ms vs ~120 ms).
// Walks up to the repo root; handles worktrees/submodules where .git is a file.
function gitBranch(dir) {
  let d = path.resolve(dir);
  for (let i = 0; i < 40; i++) {
    const dotGit = path.join(d, ".git");
    try {
      let gitDir = dotGit;
      if (fs.statSync(dotGit).isFile()) {
        const m = fs.readFileSync(dotGit, "utf8").match(/^gitdir:\s*(.+)$/m);
        if (!m) return "";
        gitDir = path.resolve(d, m[1].trim());
      }
      const head = fs.readFileSync(path.join(gitDir, "HEAD"), "utf8").trim();
      const ref = head.match(/^ref:\s*refs\/heads\/(.+)$/);
      return ref ? ref[1] : head.slice(0, 7); // detached HEAD: short commit id
    } catch { /* no .git here: keep walking up */ }
    const parent = path.dirname(d);
    if (parent === d) return "";
    d = parent;
  }
  return "";
}

function render(s) {
  const parts = [];

  // 1. Folder + git branch
  const cwd = s.workspace?.current_dir ?? s.cwd ?? "";
  if (cwd) {
    const branch = gitBranch(cwd);
    parts.push(paint(C.bold + C.blue, path.basename(cwd) || cwd) +
      (branch ? " " + paint(C.magenta, `(${branch})`) : ""));
  }

  // 2. Model · effort (+ fast mode)
  const model = s.model?.display_name;
  if (model) {
    let seg = paint(C.cyan, model);
    const effort = s.effort?.level;
    if (effort) {
      const ec = { low: C.dim, medium: C.reset, high: C.yellow, xhigh: C.magenta, max: C.red }[effort] ?? C.reset;
      seg += paint(C.dim, " · ") + paint(ec, effort);
    }
    if (s.fast_mode) seg += " " + paint(C.yellow, "⚡fast");
    parts.push(seg);
  }

  // 3. Context window: % used and tokens used / window size
  const ctx = s.context_window;
  if (ctx && ctx.used_percentage != null) {
    const used = ctx.used_percentage;
    let seg = paint(usageColor(used, 60, 80), `ctx ${Math.round(used)}%`);
    if (ctx.total_input_tokens != null && ctx.context_window_size)
      seg += paint(C.dim, ` ${kfmt(ctx.total_input_tokens)}/${kfmt(ctx.context_window_size)}`);
    parts.push(seg);
  }

  // 4. Plan usage limits (5-hour and 7-day windows)
  const rl = s.rate_limits;
  if (rl) {
    const lim = [];
    if (rl.five_hour?.used_percentage != null) {
      let seg = paint(usageColor(rl.five_hour.used_percentage, 70, 90), `5h ${Math.round(rl.five_hour.used_percentage)}%`);
      // Time until the 5-hour window resets (resets_at is unix seconds).
      const left = (rl.five_hour.resets_at ?? 0) * 1000 - Date.now();
      if (left > 0) seg += paint(C.dim, ` ↻${duration(left)}`);
      lim.push(seg);
    }
    if (lim.length) parts.push(lim.join(paint(C.dim, " · ")));
  }

  // 5. Cold-cache warning (only shown when the prompt cache has expired)
  if (s.prompt_cache && s.prompt_cache.caching_observed && s.prompt_cache.warm === false)
    parts.push(paint(C.yellow, "cache cold"));

  return parts.join(SEP);
}

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let s = {};
  try { s = JSON.parse(raw.replace(/^﻿/, "")); } catch { /* render whatever is available */ }
  process.stdout.write(render(s));
});
