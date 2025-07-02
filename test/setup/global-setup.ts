import { spawn, ChildProcess } from 'child_process'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { writeFileSync, mkdirSync, readFileSync } from 'fs'
import { createServer, Server } from 'http'
import { parse } from 'url'
import { extname } from 'path'
import { SERVER_CONFIGS } from '../integration/server-configs.js'
import { findAvailablePortFromBase, spawnDevServer, waitForOutput, TestState, cleanupProcess } from '../integration/test-utils.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '../..')
const testDir = join(__dirname, '..')
const cacheDir = join(testDir, 'node_modules/.cache/use-mcp-tests')
const testStateFile = join(cacheDir, 'test-state.json')

interface GlobalState extends TestState {
  honoServer?: ChildProcess
  cfAgentsServer?: ChildProcess
  staticServer?: Server
  processGroupId?: number
  allChildProcesses?: Set<number>
}

declare global {
  var __INTEGRATION_TEST_STATE__: GlobalState
}

function runCommand(command: string, args: string[], cwd: string, env?: Record<string, string>): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: 'inherit',
      shell: true,
      env: env ? { ...process.env, ...env } : process.env,
    })

    child.on('close', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`Command failed with code ${code}: ${command} ${args.join(' ')}`))
      }
    })

    child.on('error', reject)
  })
}

function findAvailablePort(startPort = 8000): Promise<number> {
  return new Promise((resolve) => {
    const server = createServer()
    server
      .listen(startPort, () => {
        const port = (server.address() as any)?.port
        server.close(() => resolve(port))
      })
      .on('error', () => {
        resolve(findAvailablePort(startPort + 1))
      })
  })
}

export default async function globalSetup() {
  console.log('🔧 Setting up integration test environment...')

  const state: GlobalState = {
    allChildProcesses: new Set<number>(),
  }
  globalThis.__INTEGRATION_TEST_STATE__ = state

  // Set up signal handlers for cleanup
  const cleanup = () => {
    // Kill all tracked child processes
    if (state.allChildProcesses) {
      for (const pid of state.allChildProcesses) {
        try {
          process.kill(pid, 'SIGTERM')
          setTimeout(() => {
            try {
              process.kill(pid, 'SIGKILL')
            } catch (e) {
              // Process already dead, ignore
            }
          }, 1000)
        } catch (e) {
          // Process already dead, ignore
        }
      }
    }

    // Also try process group cleanup as backup
    if (state.processGroupId) {
      try {
        process.kill(-state.processGroupId, 'SIGTERM')
        setTimeout(() => {
          try {
            process.kill(-state.processGroupId!, 'SIGKILL')
          } catch (e) {
            // Ignore errors
          }
        }, 1000)
      } catch (e) {
        // Ignore errors - process group may not exist
      }
    }

    if (state.staticServer) {
      state.staticServer.close()
      state.staticServer.closeAllConnections?.()
    }
  }

  process.on('SIGINT', cleanup)
  process.on('SIGTERM', cleanup)
  process.on('exit', cleanup)

  try {
    // Step 1: Build use-mcp library
    console.log('📦 Building use-mcp library...')
    await runCommand('pnpm', ['build'], rootDir)

    // Step 2: Build inspector example
    console.log('📦 Building inspector example...')
    const inspectorDir = join(rootDir, 'examples/inspector')
    await runCommand('pnpm', ['build'], inspectorDir, { NO_MINIFY: 'true' })

    // Step 3: Start all configured MCP servers
    let basePort = Math.floor(10_000 + Math.random() * 500)

    for (const serverConfig of SERVER_CONFIGS) {
      console.log(`🔍 Finding available port starting from ${basePort} for ${serverConfig.name}...`)
      const port = await findAvailablePortFromBase(basePort)
      console.log(`📍 Using port ${port} for ${serverConfig.name} server`)

      console.log(`🚀 Starting ${serverConfig.name} server...`)
      const server = spawnDevServer(serverConfig.name, serverConfig.directory, port)

      // Track all child processes
      if (server.pid) {
        state.allChildProcesses!.add(server.pid)
      }

      // Store the port and server reference
      state[serverConfig.portKey] = port
      if (serverConfig.name === 'hono-mcp') {
        state.honoServer = server
        state.processGroupId = server.pid
      } else if (serverConfig.name === 'cf-agents') {
        state.cfAgentsServer = server
      }

      // Track when the process exits to remove it from our tracking
      server.on('exit', () => {
        if (server.pid) {
          state.allChildProcesses!.delete(server.pid)
        }
      })

      // Wait for server to be ready
      await waitForOutput(server, 'Ready on')

      basePort += 1 // Increment base port for next server
    }

    // Step 5: Start simple static file server for inspector
    console.log('🌐 Starting static file server for inspector...')
    const inspectorDistDir = join(inspectorDir, 'dist')
    const staticPort = await findAvailablePort(8000)

    const staticServer = createServer((req, res) => {
      const pathname = parse(req.url || '').pathname || '/'
      let filePath = join(inspectorDistDir, pathname === '/' ? 'index.html' : pathname)

      // Always disable keep-alive
      res.setHeader('Connection', 'close')

      try {
        const data = readFileSync(filePath)
        const ext = extname(filePath)
        const contentType =
          {
            '.html': 'text/html',
            '.js': 'application/javascript',
            '.css': 'text/css',
            '.json': 'application/json',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.gif': 'image/gif',
            '.svg': 'image/svg+xml',
          }[ext] || 'text/plain'

        res.writeHead(200, { 'Content-Type': contentType })
        res.end(data)
      } catch (e) {
        // Fallback to index.html for SPA routing
        try {
          const indexData = readFileSync(join(inspectorDistDir, 'index.html'))
          res.writeHead(200, { 'Content-Type': 'text/html' })
          res.end(indexData)
        } catch (e2) {
          res.writeHead(404, { 'Content-Type': 'text/plain' })
          res.end('Not Found')
        }
      }
    })

    // Configure for immediate shutdown
    staticServer.keepAliveTimeout = 0
    staticServer.headersTimeout = 1

    await new Promise<void>((resolve) => {
      staticServer.listen(staticPort, () => {
        console.log(`📁 Static server running on http://localhost:${staticPort}`)
        resolve()
      })
    })

    state.staticServer = staticServer
    state.staticPort = staticPort

    // Write state to file for tests to read
    mkdirSync(cacheDir, { recursive: true })
    const testState: TestState = {
      staticPort: state.staticPort,
    }

    // Add port information for each configured server
    for (const serverConfig of SERVER_CONFIGS) {
      testState[serverConfig.portKey] = state[serverConfig.portKey]
    }

    writeFileSync(testStateFile, JSON.stringify(testState, null, 2))

    console.log('✅ Integration test environment ready!')
  } catch (error) {
    console.error('❌ Failed to set up integration test environment:', error)

    // Cleanup on failure
    if (state.honoServer) {
      cleanupProcess(state.honoServer, 'hono-mcp')
    }
    if (state.cfAgentsServer) {
      cleanupProcess(state.cfAgentsServer, 'cf-agents')
    }
    if (state.staticServer) {
      state.staticServer.close()
    }

    throw error
  }
}
