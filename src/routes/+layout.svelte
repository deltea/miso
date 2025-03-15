<script lang="ts">
	import "../app.css";
	let { children } = $props();
</script>

<svelte:head>
  <title>miso</title>
</svelte:head>

{@render children()}
