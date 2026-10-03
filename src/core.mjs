import { createHash } from 'node:crypto';

export const MAX_DOCUMENT_BYTES = 64 * 1024;
const MAX_TEXT_BYTES = 32 * 1024;
const states = new Set(['complete', 'partial', 'failed', 'not_attempted']);
const identifier = /^[a-z][a-z0-9-]{0,39}$/;
const token = value => typeof value === 'string' && identifier.test(value);

export class InputError extends Error {
  constructor(code) { super(code); this.name = 'InputError'; this.code = code; }
}
const fail = code => { throw new InputError(code); };
function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
function fields(value, expected, code) {
  if (!object(value)) fail(code);
  const keys = Object.keys(value);
  if (keys.length !== expected.length || keys.some(key => !expected.includes(key))) fail(code);
}
function canonical(value) {
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (object(value)) return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  fail('invalid_document');
}
function hash(value) {
  const encoded = canonical(value);
  if (Buffer.byteLength(encoded) > MAX_DOCUMENT_BYTES) fail('document_too_large');
  return createHash('sha256').update(encoded).digest('hex');
}
function checkRequest(request) {
  fields(request, ['schemaVersion', 'evidence'], 'invalid_request');
  if (request.schemaVersion !== 'sift.request.v1') fail('invalid_request');
  fields(request.evidence, ['text', 'coverage'], 'invalid_evidence');
  if (typeof request.evidence.text !== 'string') fail('invalid_evidence');
  if (Buffer.byteLength(request.evidence.text) > MAX_TEXT_BYTES) fail('text_too_large');
  fields(request.evidence.coverage, ['text', 'audio', 'visual'], 'invalid_coverage');
  if (Object.values(request.evidence.coverage).some(value => !states.has(value))) fail('invalid_coverage');
}
function checkPolicy(policy) {
  fields(policy, ['schemaVersion', 'id', 'rules'], 'invalid_policy');
  if (policy.schemaVersion !== 'sift.policy.v1' || !token(policy.id) || !Array.isArray(policy.rules) ||
      policy.rules.length < 1 || policy.rules.length > 16) fail('invalid_policy');
  const ids = new Set();
  for (const rule of policy.rules) {
    fields(rule, ['id', 'terms', 'route', 'nextStep'], 'invalid_rule');
    if (!token(rule.id) || !token(rule.route) || ids.has(rule.id)) fail('invalid_rule');
    ids.add(rule.id);
    if (!Array.isArray(rule.terms) || rule.terms.length < 1 || rule.terms.length > 8 ||
        rule.terms.some(term => typeof term !== 'string' || !term.trim() || term !== term.trim() || term.length > 80) ||
        new Set(rule.terms.map(term => term.toLowerCase())).size !== rule.terms.length) fail('invalid_terms');
    if (typeof rule.nextStep !== 'string' || !rule.nextStep.trim() || rule.nextStep.length > 160) fail('invalid_next_step');
  }
}
function cue(text, term) {
  const literal = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`(?<![\\p{L}\\p{N}_])${literal}(?![\\p{L}\\p{N}_])`, 'iu').exec(text);
  if (!match) return null;
  const prefix = text.slice(Math.max(0, match.index - 24), match.index);
  return { start: match.index, end: match.index + match[0].length,
    negated: /\b(?:no|not|never|without)\b/iu.test(prefix) };
}

export function routeEvidence(request, policy) {
  checkRequest(request);
  checkPolicy(policy);
  const base = {
    schemaVersion: 'sift.result.v1', provider: 'sift-literal-rules', policyId: policy.id,
    inputHash: hash(request), policyHash: hash(policy), authority: 'advisory_only',
    executionAuthorized: false, audiovisualReviewed: false,
    declaredCoverage: { ...request.evidence.coverage },
  };
  const abstain = reason => ({ ...base, decision: 'abstain', reason });
  const text = request.evidence.text;
  if (!text.trim() || !['partial', 'complete'].includes(request.evidence.coverage.text)) return abstain('no_usable_text');
  const matches = policy.rules.map(rule => ({ rule, spans: rule.terms.map(term => cue(text, term)).filter(Boolean) }))
    .filter(match => match.spans.length);
  if (!matches.length) return abstain('no_rule_match');
  if (matches.length > 1) return abstain('ambiguous_rules');
  const [{ rule, spans }] = matches;
  if (spans.some(span => span.negated)) return abstain('negated_cue');
  return { ...base, decision: 'suggest', reason: 'one_literal_rule', ruleId: rule.id,
    route: rule.route, nextStep: rule.nextStep,
    matchedSpans: spans.map(({ start, end }) => ({ start, end })) };
}
