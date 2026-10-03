import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { routeEvidence, InputError } from '../src/core.mjs';
const policy = JSON.parse(readFileSync(new URL('../demo/policy.json', import.meta.url)));
const examples = JSON.parse(readFileSync(new URL('../demo/requests.json', import.meta.url)));
const request = text => ({ schemaVersion: 'sift.request.v1', evidence: { text,
  coverage: { text: 'partial', audio: 'not_attempted', visual: 'not_attempted' } } });

test('synthetic examples route or abstain as declared', () => {
  for (const example of examples) assert.equal(routeEvidence(example.request, policy).decision, example.expected);
});
test('a single literal match yields only a declared advisory route', () => {
  const result = routeEvidence(request('A REFERENCE LIST is proposed.'), policy);
  assert.equal(result.route, 'research-queue'); assert.equal(result.ruleId, 'organize-references');
  assert.deepEqual(result.matchedSpans, [{ start: 2, end: 16 }]);
  assert.equal(result.authority, 'advisory_only'); assert.equal(result.executionAuthorized, false);
  assert.equal(result.audiovisualReviewed, false); assert.equal(result.confidence, undefined);
});
test('unknown, conflicting and nearby negated terms abstain', () => {
  for (const [text, reason] of [['Clouds drift.', 'no_rule_match'],
    ['Reference list and package setup.', 'ambiguous_rules'], ['Never discuss package setup.', 'negated_cue']]) {
    const result = routeEvidence(request(text), policy);
    assert.equal(result.reason, reason); assert.equal(result.route, undefined);
  }
});
test('word boundaries and literal metacharacters do not broaden rules', () => {
  assert.equal(routeEvidence(request('prepackage setup'), policy).reason, 'no_rule_match');
  assert.equal(routeEvidence(request('package setups'), policy).reason, 'no_rule_match');
  const custom = structuredClone(policy); custom.rules = [{ id: 'literal', terms: ['tool.v2'], route: 'review', nextStep: 'Review evidence.' }];
  assert.equal(routeEvidence(request('toolXv2'), custom).reason, 'no_rule_match');
  assert.equal(routeEvidence(request('tool.v2'), custom).decision, 'suggest');
});
test('usable text is required even when another modality is declared complete', () => {
  for (const text of ['', '   ']) assert.equal(routeEvidence(request(text), policy).reason, 'no_usable_text');
  const input = request('package setup'); input.evidence.coverage.text = 'not_attempted';
  input.evidence.coverage.audio = 'complete'; input.evidence.coverage.visual = 'complete';
  assert.equal(routeEvidence(input, policy).reason, 'no_usable_text');
  assert.equal(routeEvidence(input, policy).audiovisualReviewed, false);
});
test('input and policy hashes ignore object key order and bind every declared field', () => {
  const input = request('package setup'), result = routeEvidence(input, policy);
  const reordered = { evidence: { coverage: { visual: 'not_attempted', text: 'partial', audio: 'not_attempted' }, text: input.evidence.text }, schemaVersion: input.schemaVersion };
  assert.equal(routeEvidence(reordered, policy).inputHash, result.inputHash);
  assert.deepEqual(routeEvidence(input, policy), result);
  input.evidence.coverage.text = 'complete'; assert.notEqual(routeEvidence(input, policy).inputHash, result.inputHash);
  const custom = structuredClone(policy); custom.rules[0].nextStep = 'Review the fictional source.';
  assert.notEqual(routeEvidence(request('package setup'), custom).policyHash, result.policyHash);
});
test('strict request schemas reject extra fields, coercions and invalid coverage', () => {
  for (const mutate of [x => x.owner = 'fictional', x => x.schemaVersion = 'other',
    x => x.evidence.text = false, x => x.evidence.coverage.audio = 'verified',
    x => delete x.evidence.coverage.visual, x => x.evidence.path = 'not-accepted']) {
    const input = request('package setup'); mutate(input);
    assert.throws(() => routeEvidence(input, policy), InputError);
  }
  const input = request('package setup');
  input.evidence.coverage = { 'audio|text|visual': 'partial' };
  assert.throws(() => routeEvidence(input, policy), /invalid_coverage/);
});
test('policy cardinality bounds and overlapping rules are explicit', () => {
  const custom = structuredClone(policy);
  custom.rules = Array.from({ length: 16 }, (_, n) => ({ id: `rule-${n}`, terms: [`cue-${n}`], route: 'review', nextStep: 'Review evidence.' }));
  assert.equal(routeEvidence(request('cue-15'), custom).decision, 'suggest');
  assert.equal(routeEvidence(request('cue-0 and cue-1'), custom).reason, 'ambiguous_rules');
  custom.rules.push({ id: 'one-more', terms: ['extra'], route: 'review', nextStep: 'Review evidence.' });
  assert.throws(() => routeEvidence(request('extra'), custom), /invalid_policy/);
  custom.rules = [{ id: 'terms', terms: Array.from({ length: 9 }, (_, n) => `term-${n}`), route: 'review', nextStep: 'Review evidence.' }];
  assert.throws(() => routeEvidence(request('term-0'), custom), /invalid_terms/);
});
test('policy limits and token types fail closed before hashing', () => {
  for (const mutate of [p => p.id = false, p => p.rules[0].id = ['literal'], p => p.rules[0].route = true,
    p => p.rules = [], p => p.rules[0].terms = [], p => p.rules[0].terms = ['x', 'X'],
    p => p.rules[0].nextStep = '', p => p.rules[0].extra = 'rejected',
    p => p.rules.push(structuredClone(p.rules[0]))]) {
    const custom = structuredClone(policy); mutate(custom);
    assert.throws(() => routeEvidence(request('package setup'), custom), InputError);
  }
});
test('UTF-8 text limits are bounded and results do not echo source text', () => {
  assert.equal(routeEvidence(request('x'.repeat(32 * 1024)), policy).reason, 'no_rule_match');
  assert.throws(() => routeEvidence(request('x'.repeat(32 * 1024 + 1)), policy), /text_too_large/);
  assert.throws(() => routeEvidence(request('🙂'.repeat(8193)), policy), /text_too_large/);
  const text = 'Synthetic unique sentence about a reference list.';
  assert(!JSON.stringify(routeEvidence(request(text), policy)).includes(text));
});
test('caller objects are not mutated and coverage cannot alter policy behavior', () => {
  const input = request('package setup'), before = structuredClone(input), saved = structuredClone(policy);
  routeEvidence(input, policy); assert.deepEqual(input, before); assert.deepEqual(policy, saved);
});
