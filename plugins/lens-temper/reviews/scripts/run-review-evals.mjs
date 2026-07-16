#!/usr/bin/env node
import { existsSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import {
  CONTRACT_VERSION,
  EXIT_CODES,
  ensureNode18,
  parseCommonArgs,
  readJsonFile,
  readTextFile,
  repoRootFrom,
  usage
} from "./validation-helpers.mjs";

ensureNode18();

const scriptName = "run-review-evals.mjs";

try {
  const opts = parseCommonArgs(process.argv.slice(2));
  if (opts.help) {
    process.stdout.write(`${usage(scriptName, "[--json]")}\n`);
    process.exit(EXIT_CODES.ok);
  }
  if (opts.version) {
    process.stdout.write(`${CONTRACT_VERSION}\n`);
    process.exit(EXIT_CODES.ok);
  }
  const root = repoRootFrom(import.meta.url);
  const expected = readJsonFile(join(root, "reviews", "evals", "expected-findings.json"));
  const failures = [];
  const results = [];
  const promptResults = [];
  for (const fixture of expected.fixtures || []) {
    const path = join(root, fixture.path);
    if (!existsSync(path)) {
      process.stderr.write(`${fixture.path} field=fixture_path expected=existing file actual=missing\n`);
      failures.push(fixture.path);
      continue;
    }
    const text = readTextFile(path).toLowerCase();
    const missingTerms = (fixture.must_contain || []).filter((term) => !text.includes(String(term).toLowerCase()));
    if (missingTerms.length > 0) {
      process.stderr.write(`${fixture.path} field=must_contain expected=${missingTerms.join("|")} actual=missing\n`);
      failures.push(fixture.path);
    }
    const critical = fixture.severity === "critical";
    const blocker = critical && missingTerms.length === 0;
    results.push({ fixture, blocker, valid: missingTerms.length === 0 });
  }
  for (const assertion of expected.prompt_assertions || []) {
    let prompt = "";
    try {
      prompt = execFileSync(process.execPath, [
        "reviews/scripts/assemble-review-prompt.mjs",
        "--target",
        assertion.target,
        "--lens",
        assertion.lens,
        "--pass-id",
        assertion.pass_id || "eval-prompt",
        "--review-input",
        "reviews/examples/review-input.valid.json"
      ], {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"]
      }).toLowerCase();
    } catch (error) {
      process.stderr.write(`${assertion.id} field=prompt_assembly expected=success actual=${error.message}\n`);
      failures.push(assertion.id);
      promptResults.push({ assertion, valid: false });
      continue;
    }
    const missingTerms = (assertion.must_contain || []).filter((term) => !prompt.includes(String(term).toLowerCase()));
    if (missingTerms.length > 0) {
      process.stderr.write(`${assertion.id} field=assembled_prompt expected=${missingTerms.join("|")} actual=missing\n`);
      failures.push(assertion.id);
    }
    promptResults.push({ assertion, valid: missingTerms.length === 0 });
  }
  const criticalTotal = results.filter((result) => result.fixture.severity === "critical").length;
  const criticalFound = results.filter((result) => result.fixture.severity === "critical" && result.blocker).length;
  const falsePositiveBlockers = results.filter((result) => result.fixture.severity !== "critical" && result.blocker).length;
  const schemaValid = results.filter((result) => result.valid).length;
  const computed = {
    fixtures: results.length,
    eval_method: "fixture_keyword_smoke",
    critical_recall: "not_measured",
    critical_fixture_keyword_coverage: `${criticalFound}/${criticalTotal}`,
    false_positive_blockers: "not_measured",
    noncritical_fixture_keyword_matches: falsePositiveBlockers,
    keyword_missing_rate: failures.length === 0 ? "0.00" : (failures.length / Math.max(results.length, 1)).toFixed(2),
    schema_validity: `${schemaValid}/${results.length}`,
    rerun_decision_accuracy: "not_measured",
    prompt_assertions: `${promptResults.filter((result) => result.valid).length}/${promptResults.length}`,
    recommendation: failures.length === 0 && criticalFound === criticalTotal && falsePositiveBlockers === 0 ? "keep" : "revise"
  };
  const expectedReport = expected.expected_report || {};
  for (const [field, actual] of Object.entries(computed)) {
    if (expectedReport[field] !== actual) {
      process.stderr.write(`reviews/evals/expected-findings.json field=expected_report.${field} expected=${expectedReport[field]} actual=${actual}\n`);
      failures.push(field);
    }
  }
  if (failures.length > 0) {
    process.exit(EXIT_CODES.validation);
  }
  const report = computed;
  if (opts.json) {
    process.stdout.write(`${JSON.stringify({ event: "eval_report", ...report })}\n`);
  } else {
    process.stdout.write(`fixtures: ${report.fixtures}\n`);
    process.stdout.write(`eval_method: ${report.eval_method}\n`);
    process.stdout.write(`critical_recall: ${report.critical_recall}\n`);
    process.stdout.write(`critical_fixture_keyword_coverage: ${report.critical_fixture_keyword_coverage}\n`);
    process.stdout.write(`false_positive_blockers: ${report.false_positive_blockers}\n`);
    process.stdout.write(`noncritical_fixture_keyword_matches: ${report.noncritical_fixture_keyword_matches}\n`);
    process.stdout.write(`keyword_missing_rate: ${report.keyword_missing_rate}\n`);
    process.stdout.write(`schema_validity: ${report.schema_validity}\n`);
    process.stdout.write(`rerun_decision_accuracy: ${report.rerun_decision_accuracy}\n`);
    process.stdout.write(`prompt_assertions: ${report.prompt_assertions}\n`);
    process.stdout.write(`recommendation: ${report.recommendation}\n`);
  }
} catch (error) {
  process.stderr.write(`${usage(scriptName, "[--json]")}\n`);
  process.stderr.write(`validation error: ${error.message}\n`);
  process.exit(error.exitCode || EXIT_CODES.internal);
}
