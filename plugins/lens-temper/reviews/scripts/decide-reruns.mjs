#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import {
  CONTRACT_VERSION,
  EXIT_CODES,
  ensureNode18,
  parseCommonArgs,
  readJsonFile,
  repoRootFrom,
  resolveRepoPath,
  usage
} from "./validation-helpers.mjs";

ensureNode18();

const scriptName = "decide-reruns.mjs";

try {
  const opts = parseCommonArgs(process.argv.slice(2));
  if (opts.help) {
    process.stdout.write(`${usage(scriptName, "--ledger <ledger-json> [--synthesis <synthesis-json>] [--changed-domains a,b] [--write] [--json]")}\n`);
    process.exit(EXIT_CODES.ok);
  }
  if (opts.version) {
    process.stdout.write(`${CONTRACT_VERSION}\n`);
    process.exit(EXIT_CODES.ok);
  }
  if (!opts.ledger) {
    process.stderr.write(`${usage(scriptName, "--ledger <ledger-json> [--synthesis <synthesis-json>]")}\n`);
    process.stderr.write(`validation error: missing --ledger\n`);
    process.exit(EXIT_CODES.usage);
  }
  const root = repoRootFrom(import.meta.url);
  const ledger = readJsonFile(opts.ledger);
  const changed = new Set((opts.changedDomains || "").split(",").map((item) => item.trim()).filter(Boolean));
  const synthesis = opts.synthesis ? readJsonFile(opts.synthesis) : null;
  const locks = new Map((synthesis?.lens_lock_decisions || []).map((entry) => [entry.lens, entry]));
  const decisions = (ledger.selected_lenses || []).map((lens) => {
    const lock = locks.get(lens);
    if (changed.has(lens)) {
      return { lens, decision: "rerun", reason: "target changed in lens domain", rerun_needed: true };
    }
    if (lock && ["passing_locked", "converged_locked"].includes(lock.lock_state)) {
      return { lens, decision: lock.lock_state, reason: lock.reason, rerun_needed: false };
    }
    if (lock && lock.rerun_needed) {
      return { lens, decision: "rerun", reason: lock.reason, rerun_needed: true };
    }
    return { lens, decision: "not_affected", reason: "no accepted material change in lens domain", rerun_needed: false };
  });
  const output = { pass_id: ledger.pass_id, target_revision: ledger.target_revision, decisions };
  if (opts.write) {
    ledger.rerun_decisions = decisions;
    writeFileSync(resolveRepoPath(root, opts.ledger), `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
    if (!opts.quiet) process.stdout.write(`updated ${opts.ledger}\n`);
  } else if (opts.json) {
    process.stdout.write(`${JSON.stringify({ event: "rerun_decisions", ...output })}\n`);
  } else {
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  }
} catch (error) {
  process.stderr.write(`${usage(scriptName, "--ledger <ledger-json> [--synthesis <synthesis-json>]")}\n`);
  process.stderr.write(`validation error: ${error.message}\n`);
  process.exit(error.exitCode || EXIT_CODES.internal);
}
