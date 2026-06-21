import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Teams-style chat helpers
 * ------------------------
 * getInitials: "John Doe" -> "JD"
 * getAvatarColor: deterministic background color per name, so the same
 *   person always gets the same avatar color across the whole app.
 * shouldGroupWithPrevious: collapses consecutive messages from the same
 *   sender sent within a few minutes of each other into one visual group
 *   (matching how Microsoft Teams only shows the avatar/name once per burst
 *   of messages instead of repeating it for every single bubble).
 */
export function getInitials(name?: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const AVATAR_COLORS = [
  '#6264A7', // Teams purple
  '#7B83EB',
  '#3B7E80',
  '#C4314B',
  '#8764B8',
  '#0078D4',
  '#107C10',
  '#CA5010',
  '#986F0B',
  '#005E92',
];

export function getAvatarColor(seed?: string | null): string {
  if (!seed) return AVATAR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

const GROUPING_WINDOW_MS = 5 * 60 * 1000; // 5 minutes, same window Teams uses

export function shouldGroupWithPrevious(current: { senderId: string; timestamp: string | number | Date }, previous?: { senderId: string; timestamp: string | number | Date }): boolean {
  if (!previous) return false;
  if (current.senderId !== previous.senderId) return false;
  const tCurrent = new Date(current.timestamp).getTime();
  const tPrevious = new Date(previous.timestamp).getTime();
  if (isNaN(tCurrent) || isNaN(tPrevious)) return false;
  return Math.abs(tCurrent - tPrevious) <= GROUPING_WINDOW_MS;
}

/**
 * Self-contained ring tone generator (Web Audio API).
 * Does not depend on any external mp3 URL, so it can never fail to load
 * due to dead links / CORS / hotlink-blocking — guaranteeing the
 * "ring ring" actually plays for incoming and outgoing calls.
 */
export const createTonePlayer = (pattern: 'incoming' | 'outgoing') => {
  let audioCtx: AudioContext | null = null;
  let intervalId: ReturnType<typeof setInterval> | null = null;

  const playBeep = (ctx: AudioContext, freq: number, start: number, duration: number, gainValue = 0.18) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(gainValue, start + 0.02);
    gain.gain.setValueAtTime(gainValue, Math.max(start + 0.02, start + duration - 0.05));
    gain.gain.linearRampToValueAtTime(0, start + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  };

  const ringOnce = (ctx: AudioContext) => {
    const now = ctx.currentTime + 0.01;
    if (pattern === 'incoming') {
      // classic phone "ring-ring"
      playBeep(ctx, 950, now, 0.4);
      playBeep(ctx, 950, now + 0.5, 0.4);
    } else {
      // outgoing ringback tone (single longer pulse)
      playBeep(ctx, 425, now, 1.0, 0.12);
    }
  };

  return {
    start: () => {
      if (intervalId) return;
      try {
        const Ctx = window.AudioContext || (window as any).webkitAudioContext;
        if (!Ctx) return;
        audioCtx = new Ctx();
        if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
        ringOnce(audioCtx);
        const cycle = pattern === 'incoming' ? 2000 : 3000;
        intervalId = setInterval(() => {
          if (audioCtx) {
            if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
            ringOnce(audioCtx);
          }
        }, cycle);
      } catch (e) {
        console.warn('Ringtone failed to start:', e);
      }
    },
    stop: () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
      if (audioCtx) {
        const ctxToClose = audioCtx;
        audioCtx = null;
        setTimeout(() => ctxToClose.close().catch(() => {}), 50);
      }
    },
  };
};
