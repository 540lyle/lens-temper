#!/usr/bin/env node
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import {
  CONTRACT_VERSION,
  EXIT_CODES,
  archiveRunPath,
  ensureNode18,
  isRepoRelativePath,
  loadValidatedRunContext,
  parseCommonArgs,
  readJsonFile,
  repoRootFrom,
  resolveRepoPath,
  usage,
  validateLedgerRecord,
  validateSynthesisRecord,
  validationError,
  writeJsonLinesEvent
} from "./validation-helpers.mjs";

ensureNode18();
const scriptName = "archive-review-run.mjs";

async function copyRepoArtifact(root, sourceRepoPath, targetRepoPath) {
  const source = resolveRepoPath(root, sourceRepoPath);
  const target = resolveRepoPath(root, targetRepoPath);
  if (!source || !target) throw Object.assign(new Error(`invalid archive copy ${sourceRepoPath} -> ${targetRepoPath}`), { exitCode: EXIT_CODES.usage });
  await mkdir(dirname(target), { recursive: true });
  if (resolve(source) !== resolve(target)) await copyFile(source, target);
}

async function main() {
  const opts = parseCommonArgs(process.argv.slice(2));
  if (opts.help) {
    process.stdout.write(`${usage(scriptName, "--ledger <ledger-json> [--input-packet <path>] [--final <path>] [--archive-root <path>] [--json]")}\n`);
    return;
  }
  if (opts.version) {
    process.stdout.write(`${CONTRACT_VERSION}\n`);
    return;
  }
  if (!opts.ledger) throw Object.assign(new Error("missing --ledger"), { exitCode: EXIT_CODES.usage });

  const root = repoRootFrom(import.meta.url);
  const context = await loadValidatedRunContext(root, opts.ledger);
  const sourceLedger = context.ledger;
  const archiveRoot = opts.archiveRoot || "reviews/archive";
  if (!isRepoRelativePath(archiveRoot)) throw Object.assign(new Error("--archive-root must be repository-relative"), { exitCode: EXIT_CODES.usage });
  const planned = archiveRunPath(sourceLedger.target_path, sourceLedger.pass_id);
  const archiveRepoPath = archiveRoot === "reviews/archive" ? planned : `${archiveRoot}/${basename(planned)}`;
  const ledgerPath = `${archiveRepoPath}/ledger.json`;
  await mkdir(resolveRepoPath(root, archiveRepoPath), { recursive: true });

  const pathMap = new Map();
  pathMap.set(context.ledgerPath, ledgerPath);
  const copies = [];
  const mapCopy = (source, target) => {
    if (!source) return;
    pathMap.set(source, target);
    copies.push(copyRepoArtifact(root, source, target));
  };
  mapCopy(sourceLedger.review_input_path, `${archiveRepoPath}/review-input.json`);
  if (opts.inputPacket) mapCopy(opts.inputPacket, `${archiveRepoPath}/input.packet.md`);
  if (opts.final) mapCopy(opts.final, `${archiveRepoPath}/final.md`);

  const archivedReviews = await Promise.all((sourceLedger.review_record_artifacts || []).map(async (entry) => {
    const record = readJsonFile(resolveRepoPath(root, entry.artifact_path));
    const artifactPath = `${archiveRepoPath}/reviews/${entry.record_id}.json`;
    const markdownPath = `${archiveRepoPath}/reviews/${entry.record_id}.md`;
    pathMap.set(entry.artifact_path, artifactPath);
    mapCopy(record.markdown_artifact_path, markdownPath);
    return { ...record, artifact_path: artifactPath, markdown_artifact_path: markdownPath };
  }));

  const archivedSynthesis = await Promise.all((sourceLedger.synthesis_record_artifacts || []).map(async (entry) => {
    const record = readJsonFile(resolveRepoPath(root, entry.artifact_path));
    const artifactPath = `${archiveRepoPath}/synthesis/${entry.record_id}.json`;
    const markdownPath = `${archiveRepoPath}/synthesis/${entry.record_id}.md`;
    pathMap.set(entry.artifact_path, artifactPath);
    mapCopy(record.markdown_artifact_path, markdownPath);
    const { fixture_ledger_path: _fixtureLedgerPath, ...portableRecord } = record;
    return { ...portableRecord, artifact_path: artifactPath, markdown_artifact_path: markdownPath };
  }));
  await Promise.all(copies);

  const recordWrites = [
    ...archivedReviews.map((record) => writeFile(resolveRepoPath(root, record.artifact_path), `${JSON.stringify(record, null, 2)}\n`, "utf8")),
    ...archivedSynthesis.map((record) => writeFile(resolveRepoPath(root, record.artifact_path), `${JSON.stringify(record, null, 2)}\n`, "utf8"))
  ];
  await Promise.all(recordWrites);

  let eventsPath = sourceLedger.events_path;
  if (eventsPath) {
    const archivedEventsPath = `${archiveRepoPath}/events.jsonl`;
    pathMap.set(eventsPath, archivedEventsPath);
    const eventText = await readFile(resolveRepoPath(root, eventsPath), "utf8");
    const archivedEventText = eventText.split(/\r?\n/).filter(Boolean).map((line) => {
      const event = JSON.parse(line);
      if (pathMap.has(event.artifact_path)) event.artifact_path = pathMap.get(event.artifact_path);
      return JSON.stringify(event);
    }).join("\n");
    await writeFile(resolveRepoPath(root, archivedEventsPath), `${archivedEventText}${archivedEventText ? "\n" : ""}`, "utf8");
    eventsPath = archivedEventsPath;
  }

  const archivedLedger = {
    ...sourceLedger,
    review_input_path: `${archiveRepoPath}/review-input.json`,
    ...(eventsPath ? { events_path: eventsPath } : {}),
    review_record_artifacts: archivedReviews.map((record) => ({ record_id: record.record_id, artifact_path: record.artifact_path })),
    synthesis_record_artifacts: archivedSynthesis.map((record) => ({ record_id: record.record_id, artifact_path: record.artifact_path })),
    archive_paths: Array.from(new Set([...(sourceLedger.archive_paths || []), archiveRepoPath]))
  };
  await writeFile(resolveRepoPath(root, ledgerPath), `${JSON.stringify(archivedLedger, null, 2)}\n`, "utf8");
  const failures = validateLedgerRecord(archivedLedger, {
    artifactRoot: root,
    targetRevision: context.targetRevision,
    artifactPath: ledgerPath
  });
  for (const record of archivedSynthesis) {
    failures.push(...validateSynthesisRecord(record, {
      artifactRoot: root,
      targetRevision: context.targetRevision,
      reviewInputRevision: archivedLedger.review_input_revision,
      ledger: archivedLedger,
      artifactPath: record.artifact_path
    }));
  }
  if (failures.length > 0) throw validationError(failures, "archived ledger validation failed");

  const finalAssessment = archivedSynthesis.at(-1)?.final_assessment || "not recorded";
  if (opts.json) writeJsonLinesEvent("archived", { archive_path: archiveRepoPath, final_assessment: finalAssessment });
  else if (!opts.quiet) process.stdout.write(`archived ${archiveRepoPath} final_assessment=${finalAssessment}\n`);
}

main().catch((error) => {
  process.stderr.write(`${usage(scriptName, "--ledger <ledger-json> [--archive-root <path>]")}\n`);
  process.stderr.write(`validation error: ${error.message}\n`);
  process.exit(error.exitCode || EXIT_CODES.internal);
});
