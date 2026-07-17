import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const NODES_PATH = path.join(root, 'src/data/nodes.json')
const EDGES_PATH = path.join(root, 'src/data/edges.json')

async function readJson(filePath, fallback) {
  try {
    const raw = await readFile(filePath, 'utf8')
    return JSON.parse(raw)
  } catch (err) {
    if (err.code === 'ENOENT') return fallback
    throw err
  }
}

export async function loadNodes() {
  return readJson(NODES_PATH, [])
}

export async function loadEdges() {
  return readJson(EDGES_PATH, [])
}

export async function saveNodes(nodes) {
  await writeFile(NODES_PATH, `${JSON.stringify(nodes, null, 2)}\n`, 'utf8')
}

export async function saveEdges(edges) {
  await writeFile(EDGES_PATH, `${JSON.stringify(edges, null, 2)}\n`, 'utf8')
}

export async function appendNodesAndEdges(newNodes, newEdges) {
  const [nodes, edges] = await Promise.all([loadNodes(), loadEdges()])
  const existingIds = new Set(nodes.map((n) => n.id))
  const toAdd = newNodes.filter((n) => !existingIds.has(n.id))
  const merged = [...nodes, ...toAdd]
  const mergedEdges = [...edges, ...newEdges]
  await Promise.all([saveNodes(merged), saveEdges(mergedEdges)])
  return { nodes: merged, edges: mergedEdges, added: toAdd }
}
