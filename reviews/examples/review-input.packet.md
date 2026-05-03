# Example Review Input Packet

This packet can be regenerated with:

```powershell
node reviews/scripts/assemble-review-prompt.mjs --target FORWARD_PLAN.md --lens implementation --pass-id example-pass --out reviews/examples/review-input.packet.md
```

It exists as a small path-based example. For real runs, use a target plan path,
feature request, relevant context, constraints, and optional previous
adjudications that match the review target.
