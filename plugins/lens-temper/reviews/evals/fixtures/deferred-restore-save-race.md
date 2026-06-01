# Deferred Restore Save Race

The plan defers restore application until the next render but allows Save to run
immediately, with no revision token or cancellation semantics.
