<script lang="ts">
  import { onMount } from "svelte";
  import { parseWebStream } from "music-metadata";
  import { extractColors } from "extract-colors";
  import anime from "animejs";

  interface Song {
    title: string;
    artist: string;
    cover: string;
    src: string;
  }

  const validFileTypes = ["audio/mpeg", "audio/ogg", "audio/wav"];
  let isPaused = true;
  let queue: Song[] = [];
  let currIndex = 0;

  let discElement: HTMLDivElement;
  let audioElement: HTMLAudioElement;
  let queueElement: HTMLDivElement;

  const discAcceleration = 0.01;
  const discMaxSpeed = 1;
  let discVelocity = 0;
  let discRotation = 0;

  function tick() {
    if (!discElement) return;

    if (isPaused) {
      discVelocity -= discAcceleration;
      discVelocity = Math.max(discVelocity, 0);
    } else {
      discVelocity += discAcceleration;
      discVelocity = Math.min(discVelocity, discMaxSpeed);
    }

    discRotation += discVelocity;
    discElement.style.transform = `rotate(${discRotation}deg)`;

    requestAnimationFrame(tick);
  }

  async function onDrop(e: DragEvent) {
    let files: (File | null)[] = [];

    if (e.dataTransfer?.items) {
      for (let i = 0; i < e.dataTransfer.items.length; i++) {
        const item = e.dataTransfer.items[i];
        if (item.kind === "file") {
          files.push(item.getAsFile());
        }
      }
    } else if (e.dataTransfer?.files) {
      for (let i = 0; i < e.dataTransfer.files.length; i++) {
        files.push(e.dataTransfer.files[i]);
      }
    }

    files = files.filter((file) =>
      file !== null &&
      validFileTypes.includes(file.type)
    );

    if (files.length > 0) {
      let prevQueue = queue;

      queue = [...queue, ...(await Promise.all(files.map(async file => {
        if (!file) return;

        const parsed = await parseWebStream(file.stream());
        const cover = new Blob([parsed.common.picture?.[0].data.buffer] as BlobPart[], { type: parsed.common.picture?.[0].format });
        const coverUrl = URL.createObjectURL(cover);

        return {
          title: file.name.replace(/\.[^/.]+$/, ""),
          artist: parsed.common.artist ?? "Unknown",
          cover: coverUrl ?? "/rainmaker.jpg",
          src: URL.createObjectURL(file),
        } as Song;
      }))) as Song[]];

      if (prevQueue.length == 0) {
        setSong(0);
      }
    }
  }

  async function setSong(index: number) {
    if (queue.length == 0) return;

    currIndex = index % queue.length;
    audioElement.src = queue[currIndex].src;
    audioElement.play();

    const color = await extractColors(queue[currIndex].cover);
    const c = color.sort((a, b) => b.saturation - a.saturation)[0];
    const h = c.hue * 360;
    const s = c.saturation * 100;
    const l = c.lightness * 100;
    document.documentElement.style.setProperty("--color-accent", `hsl(${h},${s}%,${l}%)`);

    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: queue[currIndex].title,
        artist: queue[currIndex].artist,
        artwork: [{
          src: queue[currIndex].cover,
          sizes: "512x512",
          type: "image/jpeg"
        }]
      });
    }
  }

  onMount(() => {
    document.addEventListener("keydown", (event) => {
      if (event.key === " ") {
        isPaused = !isPaused;
      }

      if (event.key === "ArrowRight") {
        setSong(currIndex + 1);
      }

      if (event.key === "ArrowLeft") {
        setSong(currIndex - 1);
      }
    });

    audioElement.addEventListener("ended", () => {
      setSong(currIndex + 1);
    });

    window.addEventListener("dragover", (e) => {
      e.preventDefault();
    });

    window.addEventListener("drop", (e) => {
      e.preventDefault();
      onDrop(e);
    });

    if ("mediaSession" in navigator) {
      // Handle media control actions
      navigator.mediaSession.setActionHandler("play", () => {
        isPaused = false;
      });

      navigator.mediaSession.setActionHandler("pause", () => {
        isPaused = true;
      });

      navigator.mediaSession.setActionHandler("previoustrack", () => {
        setSong(currIndex - 1);
      });

      navigator.mediaSession.setActionHandler("nexttrack", () => {
        setSong(currIndex + 1);
      });
    }

    setSong(0);

    requestAnimationFrame(tick);
  });
</script>

<main class="flex justify-center items-center h-screen">
  <div class="flex justify-center items-center w-full h-[30rem] gap-16">
    <div
      class="rounded-full uppercase text-lg bg-cover bg-center border-6 border-accent bg-stone-800 aspect-square h-full flex justify-center items-center"
      bind:this={discElement}
      style:background-image={`url('${queue[currIndex] ? queue[currIndex].cover : ""}')`}
    >
      <span class="bg-stone-800 aspect-square w-34 rounded-full flex justify-center items-center">
        <span class="border-6 border-stone-600 bg-stone-900 rounded-full w-20 aspect-square"></span>
      </span>
    </div>

    {#if queue.length > 0}
      <hr class="border3 border-stone-700 rounded-full h-full">

      <div
        class="flex flex-col gap-1 h-full w-[30rem] overflow-auto"
        bind:this={queueElement}
      >
        {#each queue as song, i}
          <button
            class="flex text-left gap-3 h-16 items-center w-full rounded-md hover:bg-stone-800 hover:cursor-pointer p-3 duration-200 outline-none"
            on:click={() => setSong(i)}
          >
            <div
              style:background-image={`url('${song.cover}')`}
              class="bg-cover bg-center h-full aspect-square rounded-md"
            ></div>

            <div class="flex flex-col gap-0">
              <h2 class="font-bold">{song.title}</h2>
              <p class="text-stone-500">by <span>{song.artist}</span></p>
            </div>
          </button>
        {/each}
      </div>
    {/if}
  </div>
</main>

<audio
  bind:paused={isPaused}
  class="hidden"
  bind:this={audioElement}
  volume={0.5}
></audio>
