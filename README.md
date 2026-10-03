# Sift

<img src="assets/sift-logo.png" alt="Sift logo: three paths converge into one beside the Sift wordmark" width="640">

**Small rules. Visible decisions. Room to abstain.**

Sift is a dependency-free portfolio demo for routing supplied text evidence with an explicit, caller-owned policy. A single literal rule match suggests a review queue and a next step. Unknown, conflicting or nearby-negated cues abstain. Every result is advisory and binds both the input and policy with SHA-256 hashes.

This portfolio demo is licensed under [MIT](LICENSE), with the notice "Copyright (c) 2026 Sift contributors". The package remains marked private to prevent accidental npm publication; see [provenance and release status](PROVENANCE.md).

## Try it

Requires Node.js 24 or newer. Validation used Node.js 24; earlier majors are not qualified. No install, account, service or network call is needed.

```sh
node demo/run.mjs
node --test --test-isolation=none --test-concurrency=1 test/*.test.mjs
```

The four fictional examples show a reference-list match, unrelated content, conflicting topics and a negated cue. All example text and policies are synthetic; they describe no real person, project or source.

```text
synthetic reference match: suggest (research-queue)
synthetic unrelated content: abstain (no_rule_match)
synthetic conflicting topics: abstain (ambiguous_rules)
synthetic negated cue: abstain (negated_cue)
```

## Reuse the core

```js
import { routeEvidence } from './src/core.mjs';
const request = {
  schemaVersion: 'sift.request.v1',
  evidence: {
    text: 'A fictional reference list needs review.',
    coverage: { text: 'partial', audio: 'not_attempted', visual: 'not_attempted' }
  }
};
const policy = {
  schemaVersion: 'sift.policy.v1', id: 'example-policy',
  rules: [{ id: 'references', terms: ['reference list'], route: 'research-queue',
    nextStep: 'Review the supplied source before drafting a proposal.' }]
};
console.log(routeEvidence(request, policy));
```

For local JSON files, use `node bin/sift.mjs request.json policy.json`. Exit codes: **0** for a suggestion, **2** for abstention, **1** for invalid/unreadable input. The CLI prints a result without echoing the source text; errors contain generic codes rather than file paths or input values. It writes no report files and performs no actions.

## Contract and boundaries

- Coverage must declare `text`, `audio` and `visual` as `complete`, `partial`, `failed` or `not_attempted`. Only usable text is evaluated. Declared coverage is not independently verified; audio/visual declarations never imply audiovisual review.
- Policies contain 1–16 rules, each with 1–8 literal terms, a route and a next step. IDs use lowercase letters, digits and hyphens, beginning with a letter. Rule IDs are unique. Two matching rules abstain even if they name the same route.
- Matching is case-insensitive with Unicode letter/number boundaries. Terms are escaped as literals. Nearby negation within 24 characters is a conservative heuristic; it can miss or overflag ordinary language. The first occurrence of each term supplies the match. Spans use JavaScript UTF-16 indices.
- Evidence text is capped at 32 KiB UTF-8; CLI documents and canonical hash inputs at 64 KiB. Object-key order does not change a hash. Arrays retain order. Extra fields and unsupported types fail closed.
- A proposed route is a policy label, not permission to run a tool, write knowledge, publish, spend money or change progress. Next steps are policy-authored templates, not generated plans.

Sift is **not** a trained classifier, an LLM replacement, a semantic-understanding benchmark or a video/audio reviewer. It cannot infer paraphrased topics absent from its configured cues. Hashes are fingerprints, not anonymization: treat outputs for sensitive inputs as sensitive. No calibrated confidence or general accuracy claim is supplied.

The tests demonstrate deterministic behavior and interface boundaries using synthetic cases. RAM, latency and task quality have not been benchmarked for this candidate. Measurements from other implementations do not qualify this code.

## Files

`src/core.mjs` contains the pure routing function; `bin/sift.mjs` is the bounded local CLI. `demo/` holds fictional fixtures and a runnable example. `test/` covers rules, abstention, schemas, hashing, input bounds and CLI privacy behavior. There are no external package dependencies, copied private modules, telemetry, model downloads or embedded source catalogs.
