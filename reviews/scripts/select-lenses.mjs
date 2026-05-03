#!/usr/bin/env node
import { join } from "node:path";
import {
  CONTRACT_VERSION,
  EXIT_CODES,
  ensureNode18,
  parseCommonArgs,
  readJsonFile,
  repoRootFrom,
  usage
} from "./validation-helpers.mjs";

ensureNode18();

const scriptName = "select-lenses.mjs";

function selectLenses(text, registry) {
  const lower = text.toLowerCase();
  const selected = new Set();
  const statefulWorkflow = /(save|load|restore|delete|reset|update|defer|deferred|planner|apply)/.test(lower);
  if (/(ui|user|workflow|screen|interaction|save|load|restore|delete|reset)/.test(lower)) {
    selected.add("product-ux");
    selected.add("test-strategy");
  }
  if (statefulWorkflow) {
    selected.add("architecture");
    selected.add("implementation");
  }
  if (/(persist|schema|migration|saved|record|storage|history|library)/.test(lower)) {
    selected.add("data-model");
  }
  if (/(engine|service|contract|module|planner|apply|state ownership|abstraction)/.test(lower)) {
    selected.add("architecture");
    selected.add("implementation");
  }
  if (/(rollback|risk|migration|irreversible|production|privacy|security|race|stale)/.test(lower)) {
    selected.add("risk");
  }
  if (selected.size === 0) selected.add("implementation");
  return registry.lenses.map((entry) => entry.id).filter((id) => selected.has(id));
}

try {
  const opts = parseCommonArgs(process.argv.slice(2));
  if (opts.help) {
    process.stdout.write(`${usage(scriptName, "[--feature-request <text>] [--constraints <text>] [--json]")}\n`);
    process.exit(EXIT_CODES.ok);
  }
  if (opts.version) {
    process.stdout.write(`${CONTRACT_VERSION}\n`);
    process.exit(EXIT_CODES.ok);
  }
  const root = repoRootFrom(import.meta.url);
  const registry = readJsonFile(join(root, "reviews", "registry.json"));
  const lenses = selectLenses(`${opts.featureRequest || ""}\n${opts.constraints || ""}`, registry);
  if (opts.json) {
    process.stdout.write(`${JSON.stringify({ event: "selected_lenses", lenses })}\n`);
  } else {
    for (const lens of lenses) process.stdout.write(`${lens}\n`);
  }
} catch (error) {
  process.stderr.write(`${usage(scriptName, "[--feature-request <text>] [--constraints <text>] [--json]")}\n`);
  process.stderr.write(`validation error: ${error.message}\n`);
  process.exit(error.exitCode || EXIT_CODES.internal);
}
