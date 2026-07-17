import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fetchPapersRouter from './routes/fetchPapers.mjs'
import generateIdeasRouter from './routes/generateIdeas.mjs'
import { hasLlmProvider } from './lib/ideation.mjs'
import { hasEmbeddingProvider } from './lib/embeddings.mjs'
import { loadNodes } from './lib/store.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORT = process.env.PORT || 8787

const app = express()
app.use(cors())
app.use(express.json({ limit: '2mb' }))

app.use('/api', fetchPapersRouter)
app.use('/api', generateIdeasRouter)

// GET /api/status — lets the frontend show a clear banner if idea
// generation is unavailable (no LLM key) rather than a silent hang/crash,
// satisfying the "no network / API unreachable" edge case (C1).
app.get('/api/status', async (_req, res) => {
  const nodes = await loadNodes().catch(() => [])
  res.json({
    llmConfigured: hasLlmProvider(),
    embeddingConfigured: hasEmbeddingProvider(),
    nodeCount: nodes.length
  })
})

// In production, the same server serves the built static frontend so a
// single `node server/index.mjs` after `npm run build` is enough to deploy.
// In dev, Vite's own server handles static files and proxies /api here.
if (process.env.NODE_ENV === 'production') {
  const distDir = path.join(root, 'dist')
  app.use(express.static(distDir))
  app.get('*', (_req, res) => res.sendFile(path.join(distDir, 'index.html')))
}

app.use((err, _req, res, _next) => {
  console.error('[server] unhandled error:', err)
  res.status(500).json({ error: 'INTERNAL_ERROR', message: 'An unexpected server error occurred.' })
})

app.listen(PORT, () => {
  console.log(`[server] Research Idea Atlas API listening on http://localhost:${PORT}`)
  console.log(`[server] LLM provider configured: ${hasLlmProvider()}`)
  console.log(`[server] Embedding provider configured: ${hasEmbeddingProvider()}`)
  if (!hasLlmProvider()) {
    console.warn('[server] WARNING: OPENAI_API_KEY not set — idea generation endpoints will return 503. See README.')
  }
})
