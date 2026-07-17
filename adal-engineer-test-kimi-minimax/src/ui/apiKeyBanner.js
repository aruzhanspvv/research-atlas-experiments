// Inline banner shown at the top of the screen when the LLM key is missing.
// Single instance, controlled by llmStatus() in src/lib/llm.js. Disappears as
// soon as a key is configured + the page reloads.

import { llmStatus } from '../lib/llm.js'
import { t } from '../i18n.js'

export function createApiKeyBanner() {
  const root = document.createElement('div')
  root.id = 'apiKeyBanner'
  root.style.display = 'none'
  document.body.appendChild(root)

  function refresh() {
    const status = llmStatus()
    if (status.ready) {
      root.style.display = 'none'
      root.textContent = ''
      return
    }
    if (status.reason === 'mock') {
      root.style.display = 'none'
      root.textContent = ''
      return
    }
    root.style.display = 'block'
    // Show the ACTUAL missing env var from llmStatus().reason instead of a
    // hard-coded string. `status.reason` looks like `missing VITE_LLM_BASE_URL`
    // / `missing VITE_LLM_API_KEY` / `missing VITE_LLM_MODEL`. Strip the
    // `missing ` prefix for a tidier inline display, but keep it in the title
    // tooltip for debugging.
    const raw = status.reason || ''
    const friendly = raw.replace(/^missing\s+/i, '')
    root.innerHTML = `
      <strong>${t('banner.apiKeyTitle')}.</strong>
      <span title="${raw}">${t('banner.apiKeyBody', { var: friendly })}</span>
    `
  }
  refresh()
  return { root, refresh }
}
