<script lang="ts">
  import { mcp } from '$lib/mcp'

  // Store per-tool argument objects
  let argsByTool: Record<string, any> = {}

  // Per-tool call state and results
  let loadingByTool: Record<string, boolean> = {}
  let resultsByTool: Record<string, string> = {}
  let errorByTool: Record<string, string> = {}

  function ensureArgs(name: string, schema: any) {
    if (argsByTool[name]) return
    const result: Record<string, any> = {}
    const properties = schema?.properties || {}
    for (const key of Object.keys(properties)) {
      const p = properties[key] || {}
      if (p?.default !== undefined) {
        result[key] = p.default
      } else if (p?.type === 'boolean') {
        result[key] = false
      } else if (p?.type === 'number' || p?.type === 'integer') {
        result[key] = 0
      } else if (p?.type === 'array') {
        result[key] = []
      } else if (p?.type === 'object') {
        result[key] = {}
      } else {
        result[key] = ''
      }
    }
    argsByTool = { ...argsByTool, [name]: result }
  }

  function setArg(toolName: string, key: string, value: any) {
    argsByTool = { ...argsByTool, [toolName]: { ...(argsByTool[toolName] || {}), [key]: value } }
  }

  async function callTool(name: string, args: Record<string, unknown> = {}) {
    if (!mcp) return
    loadingByTool = { ...loadingByTool, [name]: true }
    errorByTool = { ...errorByTool, [name]: '' }
    try {
      const res = await mcp.callTool(name, args)
      resultsByTool = { ...resultsByTool, [name]: JSON.stringify(res, null, 2) }
    } catch (e) {
      const msg = 'Tool call failed: ' + (e instanceof Error ? e.message : String(e))
      errorByTool = { ...errorByTool, [name]: msg }
      resultsByTool = { ...resultsByTool, [name]: '' }
    } finally {
      loadingByTool = { ...loadingByTool, [name]: false }
    }
  }

  // Ensure args are available for all tools as soon as they load
  $: if (mcp && $mcp?.tools) {
    for (const t of $mcp.tools) {
      // Support either inputSchema or input_schema
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const schema: any = (t as any).inputSchema || (t as any).input_schema || { properties: {} }
      ensureArgs(t.name, schema)
    }
  }

  // Helper to normalize tool input schema
  function getSchema(tool: any) {
    return (tool?.inputSchema || tool?.input_schema || { type: 'object', properties: {} }) as any
  }
</script>

{#if !mcp}
  <div class="text-sm text-slate-600">Loading client…</div>
{:else}
  {#if $mcp.state === 'failed'}
    <div class="rounded-lg border border-rose-200 bg-rose-50 p-4 text-rose-700">
      <div class="font-medium">Connection failed</div>
      <div class="text-sm mt-1">{$mcp.error}</div>
      <div class="mt-3 flex gap-2">
        <button class="px-3 py-1.5 rounded-md bg-slate-900 text-white text-sm" on:click={() => mcp.retry()}>Retry</button>
        <button class="px-3 py-1.5 rounded-md border text-sm" on:click={() => mcp.authenticate()}>Authenticate</button>
      </div>
    </div>
  {:else if $mcp.state !== 'ready'}
    <div class="rounded-lg border bg-white p-4">
      <div class="text-sm text-slate-600">Connecting to AI service…</div>
      <div class="text-xs text-slate-500 mt-1">State: {$mcp.state}</div>
    </div>
  {:else}
    <div class="mb-3 flex items-end justify-between">
      <div>
        <h2 class="text-lg font-semibold tracking-tight">Available Tools</h2>
        <p class="text-xs text-slate-500 mt-0.5">{$mcp.tools.length} tool{ $mcp.tools.length === 1 ? '' : 's' } available</p>
      </div>
      <div class="flex gap-2">
        <button class="px-2.5 py-1 rounded-md border text-xs" on:click={() => mcp.authenticate()}>Authenticate</button>
        <button class="px-2.5 py-1 rounded-md bg-slate-900 text-white text-xs" on:click={() => mcp.retry()}>Reconnect</button>
      </div>
    </div>

    {#if $mcp.tools.length > 0}
      <ul class="grid grid-cols-1 lg:grid-cols-2 gap-2">
        {#each $mcp.tools as tool}
          {#key tool.name}
            <li class="rounded-lg border bg-white p-3">
              <div class="flex items-start justify-between gap-4">
                <div>
                  <div class="font-medium text-sm">{tool.name}</div>
                  {#if tool.description}
                    <div class="text-xs text-slate-500 mt-0.5">{tool.description}</div>
                  {/if}
                </div>
              </div>

              <div class="mt-2">
                {#if getSchema(tool)?.properties && Object.keys(getSchema(tool).properties).length > 0}
                  <div class="grid gap-2 sm:grid-cols-2">
                    {#each Object.entries(getSchema(tool).properties) as [key, prop]}
                      {#if (prop as any).enum}
                        <label class="block text-sm">
                          <span class="block text-xs text-slate-600 mb-0.5">{key}{getSchema(tool)?.required?.includes(key) ? ' *' : ''}</span>
                          <select class="w-full rounded-md border border-slate-300 text-sm px-2 py-1 focus:outline-none focus:ring-2 focus:ring-slate-400/50 focus:border-slate-400" value={argsByTool[tool.name]?.[key]} on:change={(e) => setArg(tool.name, key, (e.target as HTMLSelectElement).value)}>
                            {#each (prop as any).enum as opt}
                              <option value={String(opt)}>{String(opt)}</option>
                            {/each}
                          </select>
                        </label>
                      {:else if (prop as any).type === 'boolean'}
                        <label class="flex gap-2 items-center text-sm">
                          <input class="size-4 border border-slate-300 rounded-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400/50 focus:border-slate-400 accent-slate-700" type="checkbox" checked={Boolean(argsByTool[tool.name]?.[key])} on:change={(e) => setArg(tool.name, key, (e.target as HTMLInputElement).checked)} />
                          <span>{key}{getSchema(tool)?.required?.includes(key) ? ' *' : ''}</span>
                        </label>
                      {:else if (prop as any).type === 'number' || (prop as any).type === 'integer'}
                        <label class="block text-sm">
                          <span class="block text-xs text-slate-600 mb-0.5">{key}{getSchema(tool)?.required?.includes(key) ? ' *' : ''}</span>
                          <input class="w-full rounded-md border border-slate-300 text-sm px-2 py-1 focus:outline-none focus:ring-2 focus:ring-slate-400/50 focus:border-slate-400" type="number" value={argsByTool[tool.name]?.[key]} on:input={(e) => setArg(tool.name, key, Number((e.target as HTMLInputElement).value))} />
                        </label>
                      {:else if (prop as any).type === 'string'}
                        <label class="block text-sm">
                          <span class="block text-xs text-slate-600 mb-0.5">{key}{getSchema(tool)?.required?.includes(key) ? ' *' : ''}</span>
                          <input class="w-full rounded-md border border-slate-300 text-sm px-2 py-1 focus:outline-none focus:ring-2 focus:ring-slate-400/50 focus:border-slate-400" type="text" value={argsByTool[tool.name]?.[key]} on:input={(e) => setArg(tool.name, key, (e.target as HTMLInputElement).value)} />
                        </label>
                      {:else}
                        <label class="block text-sm sm:col-span-2">
                          <span class="block text-xs text-slate-600 mb-0.5">{key} <span class="text-slate-400">(JSON){getSchema(tool)?.required?.includes(key) ? ' *' : ''}</span></span>
                          <textarea class="w-full rounded-md border border-slate-300 text-sm px-2 py-1 font-mono focus:outline-none focus:ring-2 focus:ring-slate-400/50 focus:border-slate-400" rows="3" on:input={(e) => {
                            try { setArg(tool.name, key, JSON.parse((e.target as HTMLTextAreaElement).value || 'null')) } catch { /* ignore */ }
                          }}>{JSON.stringify(argsByTool[tool.name]?.[key] ?? null)}</textarea>
                        </label>
                      {/if}
                    {/each}
                  </div>
                {:else}
                  <div class="text-xs text-slate-500">No input parameters.</div>
                {/if}
              </div>

              <div class="mt-2 flex items-center gap-2">
                <button class="px-2.5 py-1 rounded-md bg-slate-900 text-white text-xs disabled:opacity-50"
                  disabled={Boolean(loadingByTool[tool.name])}
                  on:click={() => callTool(tool.name, argsByTool[tool.name] || {})}>
                  {#if loadingByTool[tool.name]}Calling…{:else}Call Tool{/if}
                </button>
                <button class="px-2.5 py-1 rounded-md border text-xs"
                  on:click={() => { resultsByTool = { ...resultsByTool, [tool.name]: '' }; errorByTool = { ...errorByTool, [tool.name]: '' } }}>
                  Clear
                </button>
              </div>

              {#if errorByTool[tool.name]}
                <div class="mt-2 rounded-md border border-rose-200 bg-rose-50 p-2 text-rose-700 text-xs">
                  {errorByTool[tool.name]}
                </div>
              {/if}

              {#if resultsByTool[tool.name]}
                <div class="mt-2">
                  <div class="text-xs text-slate-500 mb-0.5">Result</div>
                  <pre class="rounded-md border bg-slate-50 p-2 text-xs overflow-auto whitespace-break-spaces"><code>{resultsByTool[tool.name]}</code></pre>
                </div>
              {/if}
            </li>
          {/key}
        {/each}
      </ul>
    {:else}
      <div class="rounded-lg border bg-white p-4 text-sm text-slate-600">No tools available.</div>
    {/if}
  {/if}
{/if}
