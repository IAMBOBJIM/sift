import { readFileSync } from 'node:fs';
import { routeEvidence } from '../src/core.mjs';
const policy = JSON.parse(readFileSync(new URL('./policy.json', import.meta.url)));
const examples = JSON.parse(readFileSync(new URL('./requests.json', import.meta.url)));
for (const { label, request, expected } of examples) {
  const result = routeEvidence(request, policy);
  if (result.decision !== expected) throw new Error('demo_expectation_failed');
  console.log(`${label}: ${result.decision} (${result.route ?? result.reason})`);
}
