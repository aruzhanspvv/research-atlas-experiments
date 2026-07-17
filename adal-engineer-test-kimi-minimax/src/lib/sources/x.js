// X / Twitter source — DORMANT STUB.
// X requires a paid API tier and a bearer token, which we deliberately do not
// ship. This file exists so the source-plug architecture is uniform and so a
// future contributor can fill it in without disturbing call sites.
//
// To activate: add VITE_X_BEARER_TOKEN, replace fetchXFeed() with a real call,
// and remove the disabled-export guard.

export function isXDormant() {
  return true
}

export async function fetchXFeed(_query) {
  throw new Error(
    'X ingestion is dormant: requires a paid API tier. ' +
    'Set VITE_X_BEARER_TOKEN and replace src/lib/sources/x.js with a real call to activate.'
  )
}
