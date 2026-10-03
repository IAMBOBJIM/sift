import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const cli = fileURLToPath(new URL('../bin/sift.mjs', import.meta.url));
const policy = fileURLToPath(new URL('../demo/policy.json', import.meta.url));
const call = args => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', windowsHide: true });
test('CLI exit codes, bounded reads and generic diagnostics preserve local input privacy', () => {
  const root = mkdtempSync(join(tmpdir(), 'sift-synthetic-test-'));
  const file = join(root, 'request.json');
  try {
    const input = { schemaVersion: 'sift.request.v1', evidence: { text: 'A fictional reference list.',
      coverage: { text: 'partial', audio: 'not_attempted', visual: 'not_attempted' } } };
    writeFileSync(file, JSON.stringify(input));
    let result = call([file, policy]); assert.equal(result.status, 0); assert.equal(JSON.parse(result.stdout).route, 'research-queue');
    input.evidence.text = 'A fictional cloud pattern.'; writeFileSync(file, JSON.stringify(input));
    result = call([file, policy]); assert.equal(result.status, 2); assert.equal(JSON.parse(result.stdout).reason, 'no_rule_match');
    writeFileSync(file, '{broken'); result = call([file, policy]);
    assert.equal(result.status, 1); assert.deepEqual(JSON.parse(result.stderr), { error: 'unreadable_or_invalid_json' });
    assert(!result.stderr.includes(root)); assert(!result.stderr.includes('{broken'));
    writeFileSync(file, 'x'.repeat(64 * 1024 + 1)); result = call([file, policy]);
    assert.equal(result.status, 1); assert.equal(JSON.parse(result.stderr).error, 'document_too_large');
    result = call([]); assert.equal(result.status, 1);
    assert.equal(JSON.parse(result.stderr).error, 'usage_request_and_policy_required');
  } finally {
    assert(resolve(root).startsWith(resolve(tmpdir()) + sep));
    rmSync(root, { recursive: true, force: true });
  }
});
