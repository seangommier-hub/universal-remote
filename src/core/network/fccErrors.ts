// Typed Family Command Center failures (ADR-HEARTH-142), so callers and the failure classifier
// can tell "couldn't reach it at all" from "reached it and it said no" without string matching.

/** Family Command Center could not be reached at all (timeout, no route, blocked network). */
export class FccUnreachableError extends Error {}

/** Family Command Center was reached but refused the saved token. */
export class FccTokenRejectedError extends Error {}

/** No Family Command Center address and token are saved on this phone yet. */
export class FccNotConfiguredError extends Error {}
