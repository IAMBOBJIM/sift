#!/usr/bin/env node
import { openSync, readSync, closeSync, fstatSync } from 'node:fs';
import { InputError, MAX_DOCUMENT_BYTES, routeEvidence } from '../src/core.mjs';

function readDocument(path) {
  const handle = openSync(path, 'r');
  try {
    if (!fstatSync(handle).isFile()) throw new InputError('regular_file_required');
    const buffer = Buffer.alloc(MAX_DOCUMENT_BYTES + 1);
    let total = 0;
    while (total < buffer.length) {
      const count = readSync(handle, buffer, total, buffer.length - total, null);
      if (!count) break;
      total += count;
    }
    if (total > MAX_DOCUMENT_BYTES) throw new InputError('document_too_large');
    return JSON.parse(buffer.subarray(0, total).toString('utf8'));
  } finally { closeSync(handle); }
}

try {
  const args = process.argv.slice(2);
  if (args.length !== 2) throw new InputError('usage_request_and_policy_required');
  const result = routeEvidence(readDocument(args[0]), readDocument(args[1]));
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exitCode = result.decision === 'suggest' ? 0 : 2;
} catch (error) {
  // File paths and input contents never appear in diagnostics.
  process.stderr.write(JSON.stringify({ error: error instanceof InputError ? error.code : 'unreadable_or_invalid_json' }) + '\n');
  process.exitCode = 1;
}
