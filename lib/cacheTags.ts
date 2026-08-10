/**
 * Cache tag for everything derived from the cases table — the board and the
 * dashboard both read through it.
 *
 * The reads are cached for five minutes, which is fine for a value that
 * changed under you but wrong when a whole row appears or disappears: an
 * imported case that isn't on the board yet reads as "the import didn't
 * work". So the routes that add or remove rows clear this tag.
 */
export const CASES_TAG = "cases";
