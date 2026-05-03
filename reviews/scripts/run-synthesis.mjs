#!/usr/bin/env node
import { readFileSync } from "node:fs";
import {
  CONTRACT_VERSION,
  EXIT_CODES,
  ensureNode18,
  parseCommonArgs,
  usage
} from "./validation-helpers.mjs";

ensureNode18();

const scriptName = "run-synthesis.mjs";

try {
  const opts = parseCommonArgs(process.argv.slice(2));
  if (opts.help) {
    process.stdout.write(`${usage(scriptName, "<review-output-md>... [--json]")}\n`);
    process.exit(EXIT_CODES.ok);
  }
  if (opts.version) {
    process.stdout.write(`${CONTRACT_VERSION}\n`);
    process.exit(EXIT_CODES.ok);
  }
  if (opts.positional.length === 0) {
    process.stderr.write(`${usage(scriptName, "<review-output-md>...")}\n`);
    process.stderr.write(`validation error: missing review outputs\n`);
    process.exit(EXIT_CODES.usage);
  }
  const reviewOutputs = opts.positional.map((path) => readFileSync(path, "utf8")).join("\n\n---\n\n");
  const packet = [
    "# Synthesis Input Packet",
    "",
    "Use `reviews/synthesize-review-feedback.md` with the review outputs below.",
    "",
    "<review_outputs>",
    reviewOutputs,
    "</review_outputs>"
  ].join("\n");
  process.stdout.write(`${packet}\n`);
} catch (error) {
  process.stderr.write(`${usage(scriptName, "<review-output-md>...")}\n`);
  process.stderr.write(`validation error: ${error.message}\n`);
  process.exit(error.exitCode || EXIT_CODES.internal);
}
