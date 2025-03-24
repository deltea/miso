<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { parseWebStream } from "music-metadata";
  import { extractColors } from "extract-colors";
  import { browser } from "$app/environment";
    import { lerp, lerpAngle, radToDeg } from "$lib/utils";

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

  let audioCtx: AudioContext;
  let source: AudioBufferSourceNode;
  let gainNode: GainNode;
  let filter: BiquadFilterNode;

  let isDiskSpinning = true;
  let isDiskDragging = false;
  let mousePos = [0, 0];

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

    if (source) {
      source.playbackRate.setValueAtTime(discVelocity / discMaxSpeed, audioCtx.currentTime);
    }

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

  async function playAudio(url: string) {
    stopAudio();
    source = audioCtx.createBufferSource();
    source.buffer = audioBuffers[currIndex];
    source.loop = false;

    gainNode = audioCtx.createGain();
    filter = audioCtx.createBiquadFilter();

    source.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    gainNode.gain.value = 0.5;

    filter.frequency.setValueAtTime(22050, audioCtx.currentTime);
    source.start();
  }

  function stopAudio() {
    if (source) source.stop();
  }

  async function setSong(index: number) {
    if (queue.length == 0) return;

    currIndex = index % queue.length;
    playAudio(queue[currIndex].src);
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

  onMount(() => {
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

    audioCtx = new AudioContext();

    setSong(0);
  });

  onDestroy(() => {
    stopAudio();

    if (audioCtx) audioCtx.close();

    if (browser) {
      document.documentElement.style.setProperty("--color-accent", "#fff");
    }
  });
</script>

<div class="grow flex items-center">
  <div class="flex justify-center items-center w-full h-[30rem] gap-16">
    <button
      class="rounded-full uppercase text-lg bg-cover bg-center border-6 border-accent bg-stone-800 aspect-square h-full flex justify-center items-center hover:cursor-grab active:cursor-grabbing"
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
