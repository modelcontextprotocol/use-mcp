import { spawn, ChildProcess } from 'child_process'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { writeFileSync, mkdirSync, readFileSync } from 'fs'
import { createServer, Server } from 'http'
import { parse } from 'url'
import { extname } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '../..')
const testDir = join(__dirname, '..')
const cacheDir = join(testDir, 'node_modules/.cache/use-mcp-tests')
const testStateFile = join(cacheDir, 'test-state.json')

interface GlobalState {
  honoServer?: ChildProcess
  cfAgentsServer?: ChildProcess
  staticServer?: Server
  staticPort?: number
  honoPort?: number
  cfAgentsPort?: number
  processGroupId?: number
  allChildProcesses?: Set<number>
}

declare global {
  var __INTEGRATION_TEST_STATE__: GlobalState
}

function waitForOutput(process: ChildProcess, targetOutput: string, timeout = 30000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout waiting for: ${targetOutput}`))
    }, timeout)

    const onData = (data: Buffer) => {
      const output = data.toString()
      console.log(`[server output] ${output}`)
      if (output.includes(targetOutput)) {
        clearTimeout(timer)
        process.stdout?.off('data', onData)
        process.stderr?.off('data', onData)
        resolve()
      }
    }

    process.stdout?.on('data', onData)
    process.stderr?.on('data', onData)
  })
}

async function checkPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = require('net').createServer()

    server.listen(port, () => {
      server.close(() => {
        // Wait a bit for the port to fully close
        setTimeout(() => resolve(true), 100)
      })
    })

    server.on('error', (err: any) => {
      console.log(`Port ${port} check failed: ${err.message}`)
      resolve(false)
    })
  })
}

async function checkPortNotUsedByWrangler(port: number): Promise<boolean> {
  // First check if port is available at network level
  const networkAvailable = await checkPortAvailable(port)
  if (!networkAvailable) {
    return false
  }

  // Then check if there are wrangler processes using this port
  return new Promise((resolve) => {
    const { spawn } = require('child_process')
    const lsof = spawn('lsof', ['-ti', `:${port}`])

    let output = ''
    lsof.stdout?.on('data', (data: Buffer) => {
      output += data.toString()
    })

    lsof.on('close', () => {
      if (output.trim()) {
        // Port is in use
        resolve(false)
      } else {
        // Port is free
        resolve(true)
      }
    })

    lsof.on('error', () => {
      // lsof failed, assume port is available
      resolve(true)
    })
  })
}

function findAvailablePortFromBase(basePort: number): Promise<number> {
  return new Promise(async (resolve, reject) => {
    for (let port = basePort; port < basePort + 20; port++) {
      if (await checkPortNotUsedByWrangler(port)) {
        resolve(port)
        return
      }
    }
    reject(new Error(`No available ports found starting from ${basePort}. Please stop any existing wrangler/workerd processes.`))
  })
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

    // Step 3: Find available port and start hono-mcp server
    console.log('🔍 Finding available port starting from 9901...')
    const honoPort = await findAvailablePortFromBase(9901)
    console.log(`📍 Using port ${honoPort} for hono-mcp server`)

    console.log('🚀 Starting hono-mcp server...')
    const honoDir = join(rootDir, 'examples/servers/hono-mcp')
    const honoServer = spawn('pnpm', ['dev', `--port=${honoPort}`], {
      cwd: honoDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
      detached: false, // Keep in same process group initially
    })

    // Track all child processes
    if (honoServer.pid) {
      state.allChildProcesses!.add(honoServer.pid)
    }

    // Store the process group ID and port
    state.processGroupId = honoServer.pid
    state.honoPort = honoPort
    state.honoServer = honoServer

    honoServer.stdout?.on('data', (data) => {
      console.log(`[hono-mcp] ${data.toString()}`)
    })

    honoServer.stderr?.on('data', (data) => {
      console.log(`[hono-mcp] ${data.toString()}`)
    })

    // Track when the process exits to remove it from our tracking
    honoServer.on('exit', () => {
      if (honoServer.pid) {
        state.allChildProcesses!.delete(honoServer.pid)
      }
    })

    // Wait for hono server to be ready
    await waitForOutput(honoServer, 'Ready on')
    state.honoServer = honoServer

    // Step 4: Find available port and start cf-agents server
    console.log('🔍 Finding available port starting from 9902...')
    const cfAgentsPort = await findAvailablePortFromBase(9902)
    console.log(`📍 Using port ${cfAgentsPort} for cf-agents server`)

    console.log('🚀 Starting cf-agents server...')
    const cfAgentsDir = join(rootDir, 'examples/servers/cf-agents')
    const cfAgentsServer = spawn('pnpm', ['dev', `--port=${cfAgentsPort}`], {
      cwd: cfAgentsDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
      detached: false,
    })

    // Track all child processes
    if (cfAgentsServer.pid) {
      state.allChildProcesses!.add(cfAgentsServer.pid)
    }

    state.cfAgentsPort = cfAgentsPort
    state.cfAgentsServer = cfAgentsServer

    cfAgentsServer.stdout?.on('data', (data) => {
      console.log(`[cf-agents] ${data.toString()}`)
    })

    cfAgentsServer.stderr?.on('data', (data) => {
      console.log(`[cf-agents] ${data.toString()}`)
    })

    // Track when the process exits to remove it from our tracking
    cfAgentsServer.on('exit', () => {
      if (cfAgentsServer.pid) {
        state.allChildProcesses!.delete(cfAgentsServer.pid)
      }
    })

    // Wait for cf-agents server to be ready
    await waitForOutput(cfAgentsServer, 'Ready on')
    state.cfAgentsServer = cfAgentsServer

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
    writeFileSync(
      testStateFile,
      JSON.stringify(
        {
          honoPort: state.honoPort,
          cfAgentsPort: state.cfAgentsPort,
          staticPort: state.staticPort,
        },
        null,
        2,
      ),
    )

    console.log('✅ Integration test environment ready!')
  } catch (error) {
    console.error('❌ Failed to set up integration test environment:', error)

    // Cleanup on failure
    if (state.honoServer) {
      state.honoServer.kill()
    }
    if (state.cfAgentsServer) {
      state.cfAgentsServer.kill()
    }
    if (state.staticServer) {
      state.staticServer.close()
    }

    throw error
  }
}
