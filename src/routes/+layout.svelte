<script lang="ts">
  import "../app.css";
	import Footer from "$lib/components/Footer.svelte";
  import TopBar from "$lib/components/TopBar.svelte";

	let { children } = $props();
</script>

<svelte:head>
  <title>みそ miso</title>
</svelte:head>

<main class="flex flex-col justify-center items-center h-screen">
  <TopBar />

  {@render children()}

  <Footer />
</main>
