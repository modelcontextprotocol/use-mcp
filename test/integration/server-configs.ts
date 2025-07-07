import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ServerConfig } from './test-utils.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '../..')

/**
 * Configuration for all MCP servers to test
 */
export const SERVER_CONFIGS: ServerConfig[] = [
  {
    name: 'hono-mcp',
    directory: join(rootDir, 'examples/servers/hono-mcp'),
    portKey: 'honoPort',
    endpoints: [
      {
        path: '/mcp',
        transportTypes: ['auto', 'http'],
      },
    ],
    expectedTools: 2,
    expectedResources: 2, // 2 direct resources (templates are counted separately)
    expectedPrompts: 2,
  },
  {
    name: 'cf-agents',
    directory: join(rootDir, 'examples/servers/cf-agents'),
    portKey: 'cfAgentsPort',
    endpoints: [
      {
        path: '/mcp',
        transportTypes: ['auto', 'http'],
      },
      {
        path: '/sse',
        transportTypes: ['auto', 'sse'],
      },
      {
        path: '/public/mcp',
        transportTypes: ['auto', 'http'],
      },
      {
        path: '/public/sse',
        transportTypes: ['auto', 'sse'],
      },
    ],
    expectedTools: 2,
    expectedResources: 3, // 3 direct resources (no templates in cf-agents)
    expectedPrompts: 2,
  },
]
