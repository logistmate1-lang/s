import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { BEAUTIFUL_TRANSLATIONS } from '../utils/beautifulTranslations';

interface MultilingualLoveCaptionProps {
  active: boolean;
}

const STEP_INTERVAL_MS = 160;
const SMOOTH_EASE: [number, number, number, number] = [0.37, 0, 0.63, 1];

export function MultilingualLoveCaption({ active }: MultilingualLoveCaptionProps) {
  const [translationIndex, setTranslationIndex] = useState(0);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (!active) {
      setTranslationIndex(0);
      return;
    }

    let rafId = 0;
    let lastSwitch = performance.now();

    const tick = (now: number) => {
      if (now - lastSwitch >= STEP_INTERVAL_MS) {
        lastSwitch = now;
        setTranslationIndex((prev) => (prev + 1) % BEAUTIFUL_TRANSLATIONS.length);
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [active]);

  const currentTranslation = BEAUTIFUL_TRANSLATIONS[translationIndex];

  return (
    <div className="relative flex h-20 w-full max-w-2xl items-center justify-center sm:h-24">
      <AnimatePresence initial={false}>
        <motion.p
          key={translationIndex}
          dir={currentTranslation.rtl ? 'rtl' : 'ltr'}
          initial={
            prefersReducedMotion
              ? { opacity: 0 }
              : { opacity: 0, y: 3, scale: 0.985 }
          }
          animate={
            prefersReducedMotion
              ? { opacity: 1, transition: { duration: 0.14 } }
              : {
                  opacity: 1,
                  y: 0,
                  scale: 1,
                  transition: { duration: 0.16, ease: SMOOTH_EASE },
                }
          }
          exit={
            prefersReducedMotion
              ? { opacity: 0, transition: { duration: 0.14 } }
              : {
                  opacity: 0,
                  y: -3,
                  scale: 1.012,
                  transition: { duration: 0.24, ease: SMOOTH_EASE },
                }
          }
          className="font-editorial italic absolute inset-x-0 transform-gpu text-center text-3xl sm:text-5xl font-normal tracking-wide text-amber-50 [text-shadow:0_2px_24px_rgba(250,204,21,0.28)] text-balance will-change-[transform,opacity]"
        >
          {currentTranslation.text}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}
