import { useCallback, useEffect, useRef, useState } from 'react';
import { Music, Volume2, VolumeX } from 'lucide-react';

interface MusicPlayerProps {
  src: string;
  title?: string;
  autoPlaySignal: number;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function MusicPlayer({ src, title = 'Golden Brown', autoPlaySignal }: MusicPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const unlockedRef = useRef(false);
  const fadeFrameRef = useRef<number | null>(null);

  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const cancelFade = useCallback(() => {
    if (fadeFrameRef.current !== null) {
      cancelAnimationFrame(fadeFrameRef.current);
      fadeFrameRef.current = null;
    }
  }, []);

  const fadeVolumeIn = useCallback(
    (audio: HTMLAudioElement, targetVol = 0.65, durationMs = 1400) => {
      cancelFade();
      const clampedTarget = Math.max(0, Math.min(1, targetVol));
      audio.volume = 0;
      const start = performance.now();
      const step = (now: number) => {
        const progress = Math.max(0, Math.min(1, (now - start) / durationMs));
        audio.volume = Math.max(0, Math.min(1, clampedTarget * progress));
        if (progress < 1) {
          fadeFrameRef.current = requestAnimationFrame(step);
        } else {
          fadeFrameRef.current = null;
        }
      };
      fadeFrameRef.current = requestAnimationFrame(step);
    },
    [cancelFade],
  );

  useEffect(() => {
    return () => cancelFade();
  }, [cancelFade]);

  // Play by default on mount, with a first-interaction fallback if browser blocks unmuted autoplay
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const tryStart = () => {
      if (unlockedRef.current || !audio.paused) return;
      void audio
        .play()
        .then(() => {
          unlockedRef.current = true;
          fadeVolumeIn(audio, 0.65, 1100);
          window.removeEventListener('pointerdown', onFirstGesture);
          window.removeEventListener('keydown', onFirstGesture);
        })
        .catch(() => {
          // Will unlock on first user interaction
        });
    };

    const onFirstGesture = () => {
      if (!unlockedRef.current) {
        tryStart();
      }
    };

    tryStart();
    window.addEventListener('pointerdown', onFirstGesture, { passive: true });
    window.addEventListener('keydown', onFirstGesture, { passive: true });

    return () => {
      window.removeEventListener('pointerdown', onFirstGesture);
      window.removeEventListener('keydown', onFirstGesture);
    };
  }, [fadeVolumeIn]);

  // Ensure playback starts on envelope open if still paused
  useEffect(() => {
    if (autoPlaySignal === 0) return;
    const audio = audioRef.current;
    if (!audio || !audio.paused) return;

    void audio
      .play()
      .then(() => {
        unlockedRef.current = true;
        fadeVolumeIn(audio);
      })
      .catch(() => {
        // Ignore if blocked
      });
  }, [autoPlaySignal, fadeVolumeIn]);

  const toggleMute = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const nextMuted = !audio.muted;
    audio.muted = nextMuted;
    setIsMuted(nextMuted);
  }, []);

  const handleSeek = useCallback((nextTime: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(nextTime)) return;
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  }, []);

  const progressPct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <aside
      aria-label="Background music player"
      className="fixed top-5 left-5 z-30 flex items-center gap-3 rounded-2xl border border-white/12 bg-[#0b0e1c]/75 px-3.5 py-2.5 text-slate-100 shadow-lg backdrop-blur-md transition-colors duration-200 hover:border-white/20 max-w-[calc(100vw-2.5rem)] sm:max-w-[290px]"
    >
      <audio
        ref={audioRef}
        src={src}
        autoPlay
        loop
        preload="auto"
        onLoadedMetadata={(e) => {
          setDuration(e.currentTarget.duration || 0);
        }}
        onTimeUpdate={(e) => {
          setCurrentTime(e.currentTarget.currentTime || 0);
        }}
      />

      <div
        aria-hidden="true"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-rose-400/25 bg-rose-500/12 text-rose-200"
      >
        <Music className="h-4 w-4" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <span className="truncate text-xs font-medium tracking-wide text-slate-100">
            {title}
          </span>
          <span className="shrink-0 font-mono text-[11px] tabular-nums text-slate-400">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>

        <div className="relative mt-2 flex items-center">
          <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-rose-400 to-amber-300 transition-[width] duration-150"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.5}
            value={currentTime}
            aria-label="Seek music position"
            onChange={(e) => handleSeek(Number(e.target.value))}
            className="absolute inset-0 h-5 w-full cursor-pointer opacity-0"
          />
        </div>
      </div>

      <button
        type="button"
        onClick={toggleMute}
        aria-label={isMuted ? 'Unmute background music' : 'Mute background music'}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-300 transition-colors duration-200 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
      >
        {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
      </button>
    </aside>
  );
}
