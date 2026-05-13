# Fallback Precedence Missing

The plan lists a cache fallback, a server fallback, and a manual override fallback. It
does not state fallback precedence when they conflict or which wins if two sources are
available with different values.

Expected review finding: fallback precedence is missing and conflicting sources could
produce divergent behavior.
