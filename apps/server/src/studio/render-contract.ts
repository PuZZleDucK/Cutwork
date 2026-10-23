/** Changing encoding/compilation behavior invalidates cached snapshots. */
export const RENDER_PROFILE = { version: 1, width: 640, height: 480, fps: '24/1', sampleRate: 48000, channels: 2,
 videoCodec: 'libx264', pixelFormat: 'yuv420p', crf: 18, preset: 'veryfast', audioCodec: 'aac', audioBitrate: '192k', movieTimescale: 48000 } as const;
/** Server-only immutable media references, never a client-authored filesystem plan. */
export interface RenderFrame { path: string; sha256: string }
export interface RenderPlacement {
 id: string; clipId: string; startFrame: number; endFrame: number;
 /** Zero-based first retained source frame. */
 sourceStartFrame: number; priority: number; frames: RenderFrame[];
}
export interface RenderPlan {
 schemaVersion: 1; projectId: string; songId: string; revision: number;
 song: { path: string; sha256: string; sampleCount: string; sampleRate: 48000; channels: 2 };
 placements: RenderPlacement[];
}
export interface RenderSpan { startFrame: number; endFrame: number; placementId: string | null; sourceStartFrame: number | null }
export interface CompiledRender { frameCount: number; sampleCount: string; spans: RenderSpan[] }
export interface RenderResult {
 outputPath: string; sha256: string; bytes: number; frameCount: number;
 sampleCount: string; receiptPath: string; planHash: string;
}
export interface RenderOptions {
 runtime: string; renderId: string; plan: RenderPlan; signal?: AbortSignal;
 onProgress?: (frame: number, totalFrames: number) => void;
 /** Defaults are host-native executables verified by setup. Overrides are for local CPU diagnostics. */
 ffmpeg?: string; ffprobe?: string; timeoutMs?: number;
}
