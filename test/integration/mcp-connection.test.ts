import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { chromium, type Browser, type Page } from 'playwright'
import { SERVER_CONFIGS } from './server-configs.js'
import { getTestState, connectToMCPServer, cleanupProcess } from './test-utils.js'

describe('MCP Connection Integration Tests', () => {
  let browser: Browser
  let page: Page

  beforeAll(async () => {
    const headless = process.env.HEADLESS === 'true'
    console.log(`🌐 Launching browser in ${headless ? 'headless' : 'headed'} mode`)
    browser = await chromium.launch({ headless })
  }, 30000)

  afterAll(async () => {
    if (browser) {
      await browser.close()
    }

    // Force cleanup before Vitest exits
    const state = globalThis.__INTEGRATION_TEST_STATE__
    if (state?.honoServer) {
      cleanupProcess(state.honoServer, 'hono-mcp')
    }
    if (state?.cfAgentsServer) {
      cleanupProcess(state.cfAgentsServer, 'cf-agents')
    }
    if (state?.staticServer) {
      try {
        state.staticServer.close()
        state.staticServer.closeAllConnections?.()
      } catch (e) {
        // Ignore errors
      }
    }
  })

  beforeEach(async () => {
    const context = await browser.newContext()
    page = await context.newPage()

    // Enable console logging for debugging
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        console.error(`Browser error: ${msg.text()}`)
      }
    })
  })

  afterEach(async () => {
    if (page) {
      await page.close()
      await page.context().close()
    }
  })

  // Test each server configuration
  for (const serverConfig of SERVER_CONFIGS) {
    describe(`${serverConfig.name} server`, () => {
      // Test each endpoint for this server
      for (const endpoint of serverConfig.endpoints) {
        // Test each transport type for this endpoint
        for (const transportType of endpoint.transportTypes) {
          test(`should connect to ${endpoint.path} with ${transportType} transport`, async () => {
            const testState = getTestState()
            const port = testState[serverConfig.portKey]

            if (!port) {
              throw new Error(`Port not found for ${serverConfig.name} (${serverConfig.portKey})`)
            }

            const serverUrl = `http://localhost:${port}${endpoint.path}`
            console.log(`\n🔗 Testing connection to ${serverConfig.name} at ${serverUrl} with ${transportType} transport`)

            const result = await connectToMCPServer(page, serverUrl, transportType)

            if (result.success) {
              console.log(`✅ Successfully connected to ${serverConfig.name}`)
              console.log(`📋 Available tools (${result.tools.length}):`)
              result.tools.forEach((tool, index) => {
                console.log(`   ${index + 1}. ${tool}`)
              })

              if (result.resources.length > 0) {
                console.log(`📂 Available resources (${result.resources.length}):`)
                result.resources.forEach((resource, index) => {
                  console.log(`   ${index + 1}. ${resource}`)
                })
              }

              if (result.prompts.length > 0) {
                console.log(`💬 Available prompts (${result.prompts.length}):`)
                result.prompts.forEach((prompt, index) => {
                  console.log(`   ${index + 1}. ${prompt}`)
                })
              }

              // Verify connection success
              expect(result.success).toBe(true)
              expect(result.tools.length).toBeGreaterThanOrEqual(serverConfig.expectedTools)

              // Verify resources if expected
              if (serverConfig.expectedResources !== undefined) {
                expect(result.resources.length).toBeGreaterThanOrEqual(serverConfig.expectedResources)
              }

              // Verify prompts if expected
              if (serverConfig.expectedPrompts !== undefined) {
                expect(result.prompts.length).toBeGreaterThanOrEqual(serverConfig.expectedPrompts)
              }
            } else {
              console.log(`❌ Failed to connect to ${serverConfig.name}`)
              if (result.debugLog) {
                console.log(`🐛 Debug log:`)
                console.log(result.debugLog)
              }

              // Check if this is an expected failure case
              const isExpectedFailure = endpoint.path.endsWith('/sse') && transportType === 'auto'

              if (isExpectedFailure) {
                console.log(`ℹ️  Expected failure: SSE endpoint with auto transport`)
                expect(result.success).toBe(false)
              } else {
                // Fail the test with detailed information
                throw new Error(
                  `Expected to connect to ${serverConfig.name} with ${transportType} transport but failed. Debug log: ${result.debugLog}`,
                )
              }
            }
          }, 45000)
        }
      }
    })
  }
})
