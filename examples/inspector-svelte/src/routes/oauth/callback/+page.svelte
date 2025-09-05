<script lang="ts">
  import { onMount } from 'svelte'
  import { onMcpAuthorization } from '@gary149/use-mcp'
  onMount(() => onMcpAuthorization())
</script>

<h1>Authenticating…</h1>
<p>This window should close automatically.</p>

