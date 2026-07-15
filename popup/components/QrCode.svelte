<script lang="ts">
    import { generate } from 'lean-qr';

    const QR_COLOR = Object.freeze([255, 0, 122, 255] as const);

    let {
        data,
        size = 166,
    }: {
        data: string;
        size?: number;
    } = $props();

    let canvasElement = $state<HTMLCanvasElement | null>(null);

    $effect(() => {
        const canvas = canvasElement;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!data) {
            // Never leave a previous secret visible when `data` is empty.
            ctx?.clearRect(0, 0, canvas.width, canvas.height);
            return;
        }

        try {
            const code = generate(data);
            code.toCanvas(canvas, {
                on: [QR_COLOR[0], QR_COLOR[1], QR_COLOR[2], QR_COLOR[3]],
                off: [0, 0, 0, 0],
                pad: 0,
            });
        } catch {
            // Invalid payload — never show a QR that doesn't match `data`.
            ctx?.clearRect(0, 0, canvas.width, canvas.height);
        }
    });
</script>

<div class="canvas-container" style="width: {size}px; height: {size}px;">
    <canvas bind:this={canvasElement}></canvas>
</div>

<style lang="scss">
    .canvas-container {
        canvas {
            width: 100%;
            height: 100%;
            image-rendering: pixelated;
        }
    }
</style>
