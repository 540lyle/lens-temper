#!/usr/bin/env node
import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  CONTRACT_VERSION,
  EXIT_CODES,
  ensureNode18,
  formatFailure,
  parseCommonArgs,
  printFailures,
  readJsonFile,
  repoRootFrom,
  usage,
  validateLedgerRecord,
  validateCompletionSummaryRecord,
  validateReviewRecord,
  validateSynthesisRecord
} from "./validation-helpers.mjs";
import { SCHEMA_CONTRACTS } from "./validation-contracts.mjs";

ensureNode18();

const scriptName = "validate-review-fixtures.mjs";
const TARGET_REVISION = "example-target-revision";

function fixturePath(root, name) {
  return join(root, "reviews", "examples", name);
}

function discover(root, prefix, kind) {
  const dir = join(root, "reviews", "examples");
  return readdirSync(dir)
    .filter((name) => name.startsWith(`${prefix}.${kind}`) && name.endsWith(".json"))
    .sort()
    .map((name) => `reviews/examples/${name}`);
}

function checkSchemaDrift(root) {
  const failures = [];
  const propertyFor = (schema, path) => path.split(".").reduce((current, part) => current?.properties?.[part], schema);
  const itemPropertyFor = (schema, path) => {
    const [arrayName, fieldName] = path.split(".");
    return schema.properties?.[arrayName]?.items?.properties?.[fieldName];
  };
  for (const [schemaName, contract] of Object.entries(SCHEMA_CONTRACTS)) {
    const schemaPath = `reviews/schemas/${schemaName}`;
    const schema = readJsonFile(join(root, schemaPath));
    const required = new Set(schema.required || []);
    for (const field of contract.required) {
      if (!required.has(field)) {
        failures.push({
          artifact_path: schemaPath,
          field: "required",
          expected: field,
          actual: "missing",
          message: "schema missing validator required field"
        });
      }
    }
    for (const field of required) {
      if (!contract.required.includes(field)) {
        failures.push({
          artifact_path: schemaPath,
          field: "required",
          expected: "field checked by validator contract",
          actual: field,
          message: "schema declares unchecked required field"
        });
      }
    }
    for (const [field, expectedValues] of Object.entries(contract.enums || {})) {
      const actualValues = schema.properties?.[field]?.enum || [];
      for (const expected of expectedValues) {
        if (!actualValues.includes(expected)) {
          failures.push({
            artifact_path: schemaPath,
            field: `properties.${field}.enum`,
            expected,
            actual: actualValues.join("|"),
            message: "schema enum missing validator value"
          });
        }
      }
      for (const actual of actualValues) {
        if (!expectedValues.includes(actual)) {
          failures.push({
            artifact_path: schemaPath,
            field: `properties.${field}.enum`,
            expected: "enum value checked by validator contract",
            actual,
            message: "schema declares unchecked enum value"
          });
        }
      }
    }
    for (const [state, requiredFields] of Object.entries(contract.conditionalRequired || {})) {
      const conditional = (schema.allOf || []).find((entry) => entry.if?.properties?.status?.const === state);
      const actualRequired = new Set(conditional?.then?.required || []);
      for (const expected of requiredFields) {
        if (!actualRequired.has(expected)) {
          failures.push({
            artifact_path: schemaPath,
            field: `allOf.status.${state}.required`,
            expected,
            actual: "missing",
            message: "schema missing conditional required field"
          });
        }
      }
    }
    for (const [objectPath, requiredFields] of Object.entries(contract.nestedRequired || {})) {
      const actualRequired = new Set(propertyFor(schema, objectPath)?.required || []);
      for (const expected of requiredFields) {
        if (!actualRequired.has(expected)) {
          failures.push({
            artifact_path: schemaPath,
            field: `properties.${objectPath}.required`,
            expected,
            actual: "missing",
            message: "schema missing nested required field"
          });
        }
      }
    }
    for (const [objectPath, expectedValues] of Object.entries(contract.nestedEnums || {})) {
      const property = propertyFor(schema, objectPath);
      for (const field of Object.keys(property?.properties || {})) {
        const actualValues = property.properties[field].enum || [];
        for (const expected of expectedValues) {
          if (!actualValues.includes(expected)) {
            failures.push({
              artifact_path: schemaPath,
              field: `properties.${objectPath}.${field}.enum`,
              expected,
              actual: actualValues.join("|"),
              message: "schema missing nested enum value"
            });
          }
        }
      }
    }
    for (const [arrayPath, requiredFields] of Object.entries(contract.arrayItemRequired || {})) {
      const actualRequired = new Set(schema.properties?.[arrayPath]?.items?.required || []);
      for (const expected of requiredFields) {
        if (!actualRequired.has(expected)) {
          failures.push({
            artifact_path: schemaPath,
            field: `properties.${arrayPath}.items.required`,
            expected,
            actual: "missing",
            message: "schema missing array item required field"
          });
        }
      }
    }
    for (const [fieldPath, expectedValues] of Object.entries(contract.arrayItemEnums || {})) {
      const actualValues = itemPropertyFor(schema, fieldPath)?.enum || [];
      for (const expected of expectedValues) {
        if (!actualValues.includes(expected)) {
          failures.push({
            artifact_path: schemaPath,
            field: `properties.${fieldPath}.items.enum`,
            expected,
            actual: actualValues.join("|"),
            message: "schema missing array item enum value"
          });
        }
      }
    }
  }
  return failures;
}

function validateFixture(root, type, repoPath, ledger) {
  const fullPath = join(root, repoPath);
  const record = readJsonFile(fullPath);
  if (type === "review-output") {
    return validateReviewRecord(record, {
      artifactRoot: root,
      targetRevision: TARGET_REVISION,
      artifactPath: repoPath
    });
  }
  if (type === "synthesis-output") {
    const fixtureLedger = record.fixture_ledger_path
      ? readJsonFile(join(root, record.fixture_ledger_path))
      : ledger;
    return validateSynthesisRecord(record, {
      artifactRoot: root,
      targetRevision: TARGET_REVISION,
      ledger: fixtureLedger,
      artifactPath: repoPath
    });
  }
  if (type === "ledger") {
    return validateLedgerRecord(record, {
      artifactRoot: root,
      targetRevision: TARGET_REVISION,
      artifactPath: repoPath
    });
  }
  if (type === "completion-summary") {
    return validateCompletionSummaryRecord(record, {
      artifactRoot: root,
      targetRevision: TARGET_REVISION,
      artifactPath: repoPath
    });
  }
  throw new Error(`unknown fixture type ${type}`);
}

function updateCounts(root, counts) {
  const path = join(root, "reviews", "examples", "fixture-counts.json");
  writeFileSync(path, `${JSON.stringify(counts, null, 2)}\n`, "utf8");
}

try {
  const opts = parseCommonArgs(process.argv.slice(2));
  if (opts.help) {
    process.stdout.write(`${usage(scriptName, "[--update-counts] [--json] [--quiet]")}\n`);
    process.exit(EXIT_CODES.ok);
  }
  if (opts.version) {
    process.stdout.write(`${CONTRACT_VERSION}\n`);
    process.exit(EXIT_CODES.ok);
  }
  const root = repoRootFrom(import.meta.url);
  const expectedCountsPath = fixturePath(root, "fixture-counts.json");
  const expectedCounts = readJsonFile(expectedCountsPath);
  const actualCounts = {};
  const failures = checkSchemaDrift(root);
  const validLedger = readJsonFile(fixturePath(root, "review-ledger.valid.json"));

  const groups = [
    ["review-output", discover(root, "review-output", "valid"), discover(root, "review-output", "invalid")],
    ["synthesis-output", discover(root, "synthesis-output", "valid"), discover(root, "synthesis-output", "invalid")],
    ["ledger", discover(root, "review-ledger", "valid"), discover(root, "review-ledger", "invalid")],
    ["completion-summary", discover(root, "completion-summary", "valid"), discover(root, "completion-summary", "invalid")]
  ];

  const summaries = [];
  for (const [type, validFixtures, invalidFixtures] of groups) {
    actualCounts[type] = {
      valid: validFixtures.length,
      invalid: invalidFixtures.length
    };

    for (const path of validFixtures) {
      const result = validateFixture(root, type, path, validLedger);
      if (result.length > 0) {
        failures.push({
          artifact_path: path,
          field: "fixture_validity",
          expected: "valid fixture passes",
          actual: result.map(formatFailure).join("; "),
          message: "expected valid fixture failed"
        });
      }
    }

    for (const path of invalidFixtures) {
      const result = validateFixture(root, type, path, validLedger);
      if (result.length === 0) {
        failures.push({
          artifact_path: path,
          field: "fixture_validity",
          expected: "invalid fixture rejected",
          actual: "passed",
          message: "expected invalid fixture passed"
        });
      }
    }

    const expected = expectedCounts[type];
    if (!expected || expected.valid !== validFixtures.length || expected.invalid !== invalidFixtures.length) {
      failures.push({
        artifact_path: "reviews/examples/fixture-counts.json",
        field: type,
        expected: expected ? `${expected.valid} valid, ${expected.invalid} invalid` : "expected count entry",
        actual: `${validFixtures.length} valid, ${invalidFixtures.length} invalid`,
        message: "fixture inventory changed"
      });
    }

    summaries.push(`${type}: ${validFixtures.length} valid passed, ${invalidFixtures.length} invalid rejected`);
  }

  if (opts.updateCounts) {
    updateCounts(root, actualCounts);
    if (!opts.quiet) process.stdout.write(`updated reviews/examples/fixture-counts.json\n`);
    process.exit(EXIT_CODES.ok);
  }

  if (failures.length > 0) {
    printFailures(failures, opts);
    process.exit(EXIT_CODES.validation);
  }

  if (opts.json) {
    process.stdout.write(`${JSON.stringify({ event: "fixtures_valid", counts: actualCounts })}\n`);
  } else if (!opts.quiet) {
    for (const summary of summaries) process.stdout.write(`${summary}\n`);
    process.stdout.write(`all review validators passed\n`);
  }
  process.exit(EXIT_CODES.ok);
} catch (error) {
  process.stderr.write(`${usage(scriptName, "[--update-counts] [--json] [--quiet]")}\n`);
  process.stderr.write(`validation error: ${error.message}\n`);
  process.exit(error.exitCode || EXIT_CODES.internal);
}
