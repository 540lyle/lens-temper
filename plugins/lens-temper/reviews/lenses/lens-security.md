# Review Lens: Security — exploitability and trust boundaries

Evaluate the plan for exploitable security risk. Prioritize by severity and by
confidence of exploitability. Security is a core readiness lens, separate from
operational Risk.

The `>80%` threshold governs claims that a weakness is confirmed exploitable
and any hard-block classification. It does not prevent reporting a missing
security control, undefined trust boundary, or underspecified authorization
rule that the plan must resolve before implementation. Label those findings as
security design gaps and state what evidence is still missing; do not present
them as confirmed exploits or hard blocks unless exploit confidence exceeds
the threshold.

Hard blocks are non-negotiable for confirmed secrets exposure, RCE, injection,
and broken authentication or authorization. OWASP Top 10 is the baseline.

This is not a style review. Review the plan as a specification that will run
against production systems and read untrusted data.

## Review Method

Use a two-pass review:

1. Trace where untrusted input enters and where it crosses a trust boundary
   into a decision, query, write, token use, request, execution path, or LLM
   context.
2. Apply only the probes relevant to those boundaries and dependencies.

A confirmed-exploit finding must identify an exploitable weakness with more
than 80% confidence. A security-design finding may identify a missing control
or undefined boundary when the omission itself makes the plan unsafe to
implement; state the uncertainty and the specification change required.

A strong finding includes:

- the vulnerable or undefined boundary
- the concrete exploit path, or the missing evidence preventing that analysis
- the attacker capability required
- the impact: what is disclosed, forged, escalated, or executed
- a concrete secure remediation for every Critical or Major finding

## Focus Areas

- Secrets, API keys, credentials, and tokens: presence, handling, logging, scope
- Authentication, authorization, confused-deputy, and privilege boundaries
- SQL, command, path, template, and tool-data injection; RCE
- Network surface, TLS and scheme enforcement, redirects, SSRF, token leakage
- Untrusted input crossing into decisions, requests, writes, or LLM context
- Insecure configuration and unsafe defaults
- Dependency and third-party risk
- Data disclosure, retention, and privacy boundaries

## Key Questions

- Are secrets, tokens, or credentials exposed, logged, or over-scoped?
- Can attacker-controlled input reach a query, shell, path, request target, or
  privileged operation?
- Are authn and authz checks explicit at every boundary, without a
  confused-deputy path through an unverified value?
- Is `https:` enforced before any bearer token is sent, and can redirects leak
  credentials across origins?
- Is untrusted tool-returned data validated and bounded before it drives a
  decision or enters LLM context?
- Do security-relevant failures fail closed?
- Does the plan specify enough boundary and control detail to support a safe
  implementation, even where exploitability cannot yet be proven?

## Triggered Probes

Apply only when the plan includes the relevant surface.

### Secrets and Tokens

- Is a secret hard-coded, logged, echoed, or placed in returned or LLM-visible
  text?
- Is token scope least-privilege?
- Can a bearer token travel over HTTP or across a redirect to a non-allowlisted
  host?

### Network and SSRF

- Is the request target allowlisted, or can input steer it?
- Is `https:` enforced before the host check?
- Is redirect posture explicit, with off-allowlist redirects refused?

### Injection and Untrusted Data

- Can a crafted value change which resource is queried, selected, or executed?
- Is a shape-valid but uncorrelated value rejected before use?
- Is untrusted text bounded and attributed before entering model context?

## Red Flags

Apply the materiality gate before lowering a score. Classify findings as
`[critical]`, `[major]`, or `[minor]`:

- Confirmed secrets exposure, RCE, injection, or broken authn/authz (hard block)
- Bearer token sent over HTTP or leaked across an off-origin redirect
- SSRF through an attacker-steerable request target without an allowlist
- Fail-open behavior on a security-relevant path
- Unbounded untrusted data flowing into LLM context
- A missing security control or undefined authority boundary that prevents safe
  implementation, even if a specific exploit is not yet confirmed
- Insecure defaults or known-vulnerable dependencies in the changed surface

## Severity Guidance

`[critical]` — a hard-block class with more than 80% exploit confidence:
secrets exposure, RCE, injection, broken authn/authz, or direct exploitable
disclosure, forgery, or escalation.

`[major]` — a confirmed exploitable validation, transport, SSRF, or fail-open
gap; or a material missing control or undefined trust boundary that must be
specified before safe implementation. State exploit confidence explicitly.

`[minor]` — localized hardening or dependency hygiene that does not materially
change the plan.

## Reviewer Bias

When two approaches are roughly equivalent, prefer:

- Least-privilege token scope over broad access
- Allowlist over denylist for request targets
- Fail-closed over fail-open on security paths
- Explicit scheme and redirect pinning over implicit library behavior
- Bounded, attributed untrusted data over raw pass-through

## Output Expectations

For each finding, include:

- Severity and confidence, distinguishing confirmed exploit from design gap
- Area: Secrets, Auth, Injection, Network/SSRF, Config, Privacy, or Dependency
- Issue: concise statement
- Exploit path or missing boundary evidence
- Impact
- Recommended fix: a concrete code or specification change

Do not produce generic critique or speculative low-probability exploits. If the
plan already handles a boundary securely, reward it and do not restate the
checklist.
