# User Visible State Matrix Missing

The plan adds a new background sync state and says the UI should show appropriate
feedback. It does not define the visible state matrix for loading, empty, partial,
failed, retrying, or complete states.

Expected review finding: the user-visible state matrix is missing, so copy and status
labels must be invented during implementation.
