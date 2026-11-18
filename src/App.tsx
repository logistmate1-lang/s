import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, RotateCcw } from 'lucide-react';
import { SpaceParticleCanvas, type ExperienceStage } from './components/SpaceParticleCanvas';
import { MusicPlayer } from './components/MusicPlayer';
import { MultilingualLoveCaption } from './components/MultilingualLoveCaption';
import { NoteFormSection } from './components/NoteFormSection';

const OPENING_DURATION_MS = 2500;
const CIRCULATE_DURATION_MS = 1850;
const NAME_HOLD_DURATION_MS = 3200;
const BACKGROUND_TRACK_SRC = '/assets/aistudio/__________________________________dbdd1dd6.mp3';

export default function App() {
  const [stage, setStage] = useState<ExperienceStage>('envelope');
  const [replayNonce, setReplayNonce] = useState(0);
  const [musicAutoPlaySignal, setMusicAutoPlaySignal] = useState(0);
  const [envelopeReady, setEnvelopeReady] = useState(false);
  const [showFlowerCaption, setShowFlowerCaption] = useState(false);

  const timersRef = useRef<number[]>([]);

  const clearScheduled = useCallback(() => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
  }, []);

  useEffect(() => {
    return () => clearScheduled();
  }, [clearScheduled]);

  // Keep viewport at top during pre-flower stages
  useEffect(() => {
    if (stage !== 'flower' && typeof window !== 'undefined' && window.scrollY > 0) {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, [stage]);

  // Fade in "For you" and "Open the envelope" right as the space dots finish forming the envelope
  useEffect(() => {
    if (stage !== 'envelope') return;
    setEnvelopeReady(false);
    const readyTimer = window.setTimeout(() => {
      setEnvelopeReady(true);
    }, 1550);
    return () => window.clearTimeout(readyTimer);
  }, [stage, replayNonce]);

  const handleOpenEnvelope = useCallback(() => {
    if (stage !== 'envelope') return;
    clearScheduled();
    setShowFlowerCaption(false);
    setMusicAutoPlaySignal((n) => n + 1);
    setStage('opening');

    const circulateTimer = window.setTimeout(() => {
      setStage('circulating');
    }, OPENING_DURATION_MS);

    const nameTimer = window.setTimeout(() => {
      setStage('name');
    }, OPENING_DURATION_MS + CIRCULATE_DURATION_MS);

    const flowerTimer = window.setTimeout(() => {
      setStage('flower');
    }, OPENING_DURATION_MS + CIRCULATE_DURATION_MS + NAME_HOLD_DURATION_MS);

    const captionTimer = window.setTimeout(() => {
      setShowFlowerCaption(true);
    }, OPENING_DURATION_MS + CIRCULATE_DURATION_MS + NAME_HOLD_DURATION_MS + 2750);

    timersRef.current = [circulateTimer, nameTimer, flowerTimer, captionTimer];
  }, [clearScheduled, stage]);

  const handleReplay = useCallback(() => {
    clearScheduled();
    setShowFlowerCaption(false);
    setEnvelopeReady(false);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    setReplayNonce((n) => n + 1);
    setStage('envelope');
  }, [clearScheduled]);

  const handleScrollToNote = useCallback(() => {
    const el = document.getElementById('secret-message');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, []);

  return (
    <main
      className={`relative w-full bg-[#05060c] select-none ${
        stage === 'flower' ? 'min-h-[100svh] overflow-x-hidden' : 'h-[100svh] overflow-hidden'
      }`}
    >
      {/* Full-screen celestial particle field */}
      <SpaceParticleCanvas
        stage={stage}
        replayNonce={replayNonce}
        onOpenEnvelope={handleOpenEnvelope}
      />

      {/* Left-aligned background music player */}
      <MusicPlayer
        src={BACKGROUND_TRACK_SRC}
        title="Golden Brown"
        autoPlaySignal={musicAutoPlaySignal}
      />

      {/* Hero Viewport (100svh) holding envelope and chamomile finale captions */}
      <section className="relative h-[100svh] w-full pointer-events-none">
        {/* Stage 1: "For you" text & Open trigger below the envelope */}
        <div
          className={`pointer-events-none absolute inset-x-0 z-20 flex flex-col items-center px-6 transition-all duration-700 ${
            stage === 'envelope' && envelopeReady
              ? 'opacity-100 translate-y-0'
              : 'opacity-0 translate-y-3'
          }`}
          style={{ top: 'calc(40vh + min(36vw, 170px) * 0.64 + 28px)' }}
        >
          <p className="font-editorial text-3xl sm:text-4xl font-normal tracking-wide text-slate-100 drop-shadow-[0_2px_18px_rgba(255,255,255,0.22)]">
            For you
          </p>

          <button
            type="button"
            onClick={handleOpenEnvelope}
            disabled={stage !== 'envelope' || !envelopeReady}
            tabIndex={stage === 'envelope' && envelopeReady ? 0 : -1}
            className="pointer-events-auto mt-5 min-h-[44px] whitespace-nowrap rounded-full border border-rose-400/35 bg-rose-500/15 px-7 py-2.5 text-sm font-medium tracking-wide text-rose-100 backdrop-blur-sm transition-all duration-200 hover:border-rose-300/60 hover:bg-rose-500/25 hover:text-white active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 disabled:pointer-events-none"
          >
            Open the envelope
          </button>
        </div>

        {/* Stage 4: "I love you" cycling through world languages below the chamomile flower */}
        <div
          className={`pointer-events-none absolute inset-x-0 z-20 flex flex-col items-center px-6 transition-all duration-1000 ${
            stage === 'flower' && showFlowerCaption
              ? 'opacity-100 translate-y-0'
              : 'opacity-0 translate-y-4'
          }`}
          style={{ top: '65%' }}
        >
          <MultilingualLoveCaption active={stage === 'flower' && showFlowerCaption} />

          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={handleReplay}
              disabled={stage !== 'flower' || !showFlowerCaption}
              tabIndex={stage === 'flower' && showFlowerCaption ? 0 : -1}
              className="pointer-events-auto inline-flex min-h-[44px] items-center gap-2 whitespace-nowrap rounded-full border border-white/15 bg-white/5 px-5 py-2 text-xs font-medium tracking-wide text-slate-300 backdrop-blur-sm transition-all duration-200 hover:border-white/30 hover:bg-white/10 hover:text-white active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 disabled:pointer-events-none"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Replay</span>
            </button>

            <button
              type="button"
              onClick={handleScrollToNote}
              disabled={stage !== 'flower' || !showFlowerCaption}
              tabIndex={stage === 'flower' && showFlowerCaption ? 0 : -1}
              className="pointer-events-auto inline-flex min-h-[44px] items-center gap-1.5 whitespace-nowrap rounded-full border border-rose-400/30 bg-rose-500/12 px-5 py-2 text-xs font-medium tracking-wide text-rose-100 backdrop-blur-sm transition-all duration-200 hover:border-rose-300/55 hover:bg-rose-500/22 hover:text-white active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 disabled:pointer-events-none"
            >
              <span>Secret message</span>
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </section>

      {/* Scroll-down secret message input */}
      {stage === 'flower' && <NoteFormSection />}
    </main>
  );
}
