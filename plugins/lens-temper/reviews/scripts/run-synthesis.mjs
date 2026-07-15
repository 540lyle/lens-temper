#!/usr/bin/env node
import { join } from "node:path";
import {
  CONTRACT_VERSION,
  EXIT_CODES,
  encodePromptData,
  encodePromptJson,
  ensureNode18,
  loadValidatedRunContext,
  parseCommonArgs,
  readTextFile,
  renderTemplate,
  repoRootFrom,
  resolveRepoPath,
  usage
} from "./validation-helpers.mjs";

ensureNode18();

const scriptName = "run-synthesis.mjs";

async function main() {
  const opts = parseCommonArgs(process.argv.slice(2));
  if (opts.help) {
    process.stdout.write(`${usage(scriptName, "--ledger <ledger-json>")}\n`);
    return;
  }
  if (opts.version) {
    process.stdout.write(`${CONTRACT_VERSION}\n`);
    return;
  }
  if (!opts.ledger || opts.positional.length > 0 || opts.target || opts.reviewInput) {
    throw Object.assign(new Error("full synthesis accepts only --ledger; raw review Markdown, --target, and --review-input are not trusted inputs"), { exitCode: EXIT_CODES.usage });
  }

  const root = repoRootFrom(import.meta.url);
  const context = await loadValidatedRunContext(root, opts.ledger);
  if (context.ledger.run_mode !== "full") {
    throw Object.assign(new Error("canonical synthesis runner requires a full review ledger"), { exitCode: EXIT_CODES.usage });
  }
  const template = readTextFile(join(root, "reviews", "synthesize-review-feedback.md"));
  const targetText = readTextFile(resolveRepoPath(root, context.ledger.target_path));
  const reducedReviews = context.reviews.map(({ record, markdown }) => ({
    record_id: record.record_id,
    lens: record.lens,
    verdict: record.verdict,
    material_blockers: record.material_blockers,
    cross_cutting_status: record.cross_cutting_status,
    scorecard: record.scorecard,
    markdown
  }));
  const prompt = renderTemplate(template, {
    review_input_revision: context.reviewInput.revision,
    feature_request: encodePromptData(context.reviewInput.record.feature_request),
    proposed_plan: encodePromptData(targetText),
    relevant_context: encodePromptData(context.reviewInput.record.relevant_context),
    constraints: encodePromptData(context.reviewInput.record.constraints),
    previous_adjudications: encodePromptData(context.reviewInput.record.previous_adjudications),
    review_outputs: encodePromptJson(reducedReviews)
  });
  process.stdout.write(prompt);
}

main().catch((error) => {
  process.stderr.write(`${usage(scriptName, "--ledger <ledger-json>")}\n`);
  process.stderr.write(`validation error: ${error.message}\n`);
  process.exit(error.exitCode || EXIT_CODES.internal);
});
