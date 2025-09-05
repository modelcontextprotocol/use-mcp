<svelte:head>
  <title>MCP Inspector — Svelte</title>
</svelte:head>

<div class="min-h-screen bg-slate-50 text-slate-900">
  <header class="border-b border-slate-200 bg-white/70 backdrop-blur supports-[backdrop-filter]:bg-white/50">
    <div class="mx-auto max-w-5xl px-3 py-2 flex items-center justify-between">
      <h1 class="text-base font-semibold tracking-tight">MCP Inspector</h1>
      <a
        href="https://github.com/gary149/use-mcp"
        target="_blank"
        rel="noopener noreferrer"
        class="text-xs text-slate-500 hover:text-slate-700 underline underline-offset-4 decoration-slate-300 hover:decoration-slate-400"
        >Svelte + use-mcp</a
      >
    </div>
  </header>
  <main class="mx-auto max-w-5xl px-3 pb-12 py-3">
    <slot />
  </main>
</div>
