<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { parseWebStream } from "music-metadata";
  import { extractColors } from "extract-colors";
  import { browser } from "$app/environment";
  import { lerpAngle } from "$lib/utils";
  import { audioCtx, cleanupPlayer, initPlayer, play, setPlaybackRate } from "$lib/player";

  interface Song {
    title: string;
    artist: string;
    cover: string;
    src: string;
  }

  const validFileTypes = ["audio/mpeg", "audio/ogg", "audio/wav"];
  let isPaused = true;
  let isLoading = false;
  let queue: Song[] = [];
  let audioBuffers: AudioBuffer[] = [];
  let currIndex = 0;
  let delta = 0;
  let lastTime = 0;

  let discElement: HTMLButtonElement;
  let queueElement: HTMLDivElement;

  const discAcceleration = 0.03;
  const discMaxSpeed = 1.5;
  let discVelocity = 0;
  let discRotation = 0;
  let dragStartRotation = 0;

  let isDiskSpinning = true;
  let isDiskDragging = false;
  let mousePos = [0, 0];

  onMount(() => {
    initPlayer();

    requestAnimationFrame(tick);

    document.addEventListener("keydown", (event) => {
      if (event.key === " ") {
        isPaused = !isPaused;
      } else if (event.key === "ArrowRight") {
        setSong(currIndex + 1);
      } else if (event.key === "ArrowLeft") {
        setSong(currIndex - 1);
      }
    });

    window.addEventListener("dragover", e => e.preventDefault());
    window.addEventListener("drop", (e) => {
      e.preventDefault();
      onDrop(e);
    });

    if ("mediaSession" in navigator) {
      navigator.mediaSession.setActionHandler("play", () => isPaused = false );
      navigator.mediaSession.setActionHandler("pause", () => isPaused = true );
      navigator.mediaSession.setActionHandler("previoustrack", () => setSong(currIndex - 1));
      navigator.mediaSession.setActionHandler("nexttrack", () => setSong(currIndex + 1));
    }

    setSong(0);
  });

  onDestroy(() => {
    cleanupPlayer();

    if (browser) {
      document.documentElement.style.setProperty("--color-accent", "#fff");
    }
  });

  function tick() {
    if (!discElement) return;

    delta = (performance.now() - lastTime) / 1000;
    lastTime = performance.now();

    if (isDiskSpinning) {
      if (isPaused) {
        discVelocity -= discAcceleration;
        discVelocity = Math.max(discVelocity, 0);
      } else {
        discVelocity += discAcceleration;
        discVelocity = Math.min(discVelocity, discMaxSpeed);
      }
    }

    if (isDiskDragging) {
      const boundingRect = discElement.getBoundingClientRect();
      const targetRotation = Math.atan2(
        mousePos[1] - boundingRect.y - boundingRect.height / 2,
        mousePos[0] - boundingRect.x - boundingRect.width / 2
      );
      discRotation = lerpAngle(discRotation, targetRotation + dragStartRotation, 0.05);
    }

    discRotation += discVelocity * delta;
    discElement.style.transform = `rotate(${discRotation}rad)`;

    setPlaybackRate(discVelocity / discMaxSpeed);

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
      isLoading = true;

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

      // preload all audio buffers
      audioBuffers = await Promise.all(queue.map(async song => {
        const response = await fetch(song.src);
        const arrayBuffer = await response.arrayBuffer();
        return await audioCtx.decodeAudioData(arrayBuffer);
      }));

      if (prevQueue.length == 0) {
        setSong(0);
      }

      isLoading = false;
    }
  }

  async function setSong(index: number) {
    if (queue.length == 0) return;

    currIndex = Math.max(0, index % queue.length);
    play(audioBuffers[currIndex]);
    isPaused = false;

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

  function onMouseDown(e: MouseEvent) {
    isDiskSpinning = false;
    isDiskDragging = true;
    dragStartRotation = discRotation;
  }

  function onMouseUp(e: MouseEvent) {
    isDiskSpinning = true;
    isDiskDragging = false;
  }
</script>

<div class="grow flex items-center">
  <div class="flex justify-center items-center w-full h-[30rem] gap-16">
    <button
      class="rounded-full uppercase text-lg bg-cover bg-center border-6 border-accent bg-stone-800 aspect-square h-full flex justify-center items-center hover:cursor-grab active:cursor-grabbing relative"
      bind:this={discElement}
      style:background-image={`url('${queue[currIndex] && !isLoading ? queue[currIndex].cover : ""}')`}
      aria-label="disc"
      on:mousedown|preventDefault={onMouseDown}
      on:mouseup|preventDefault={onMouseUp}
      on:mousemove={e => mousePos = [e.clientX, e.clientY]}
    >
      <span class="bg-stone-800 aspect-square w-34 rounded-full flex justify-center items-center">
        <span class="border-6 border-stone-600 bg-stone-900 rounded-full w-20 aspect-square"></span>
      </span>

      {#if isLoading}
        <svg viewBox="0 0 480 480" class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 scale-[190%]">
          <path id="curve" d="M73.2,148.6c4-6.1,65.5-96.8,178.6-95.6c111.3,1.2,170.8,90.3,175.1,97" fill="transparent" />
          <text width="500">
            <textPath xlink:href="#curve" fill="white" font-size="60" class="lowercase">
              loading songs...
            </textPath>
          </text>
        </svg>
      {/if}
    </button>

    {#if queue.length > 0 && !isLoading}
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
</div>
