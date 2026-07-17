// X/Twitter — stretch source, stubbed. X's API is paywalled/rate-limited
// and scraping violates ToS, so per the contract this is explicitly
// out-of-scope beyond a stub that returns [] gracefully. If a bearer token
// is ever configured, this is the extension point — left unimplemented on
// purpose (documented in README as a known limitation, not half-built).

export async function fetchXPapers() {
  if (!process.env.X_BEARER_TOKEN) return []
  // Intentionally unimplemented: no bearer-token-backed call is made.
  // This keeps the source enumerated in the pipeline (so refresh.mjs
  // can report "3/4 sources attempted") without pretending to have a
  // working integration.
  console.warn('[x] X_BEARER_TOKEN present but X source is not implemented (stretch goal, skipped)')
  return []
}
