class CelestialSoundEngine {
  private ctx: AudioContext | null = null;
  private enabled = true;

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setEnabled(next: boolean): void {
    this.enabled = next;
  }

  private ensureContext(): AudioContext | null {
    if (!this.enabled || typeof window === 'undefined') return null;
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!this.ctx) {
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  private playTone(freq: number, delaySec: number, durationSec: number, peakGain: number, type: OscillatorType = 'sine'): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime + delaySec;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peakGain, now + 0.045);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + durationSec + 0.05);
  }

  public playEnvelopeOpen(): void {
    // Gentle two-note wax seal release chime
    this.playTone(523.25, 0, 0.9, 0.026, 'sine');
    this.playTone(659.25, 0.14, 1.1, 0.028, 'sine');
  }

  public playOpenSwirl(): void {
    // Soft ascending celestial harp shimmer
    const notes = [392.0, 493.88, 587.33, 739.99, 880.0];
    notes.forEach((f, idx) => {
      this.playTone(f, idx * 0.09, 1.5, 0.032, 'sine');
    });
  }

  public playNameReveal(): void {
    // Warm radiant major-9 chord
    const notes = [293.66, 440.0, 554.37, 659.25];
    notes.forEach((f, idx) => {
      this.playTone(f, idx * 0.07, 2.1, 0.03, 'triangle');
    });
  }

  public playFlowerBloom(): void {
    // Gentle blooming chime chord
    const notes = [329.63, 493.88, 659.25, 783.99, 987.77];
    notes.forEach((f, idx) => {
      this.playTone(f, idx * 0.08, 2.6, 0.028, 'sine');
    });
  }
}

export const soundEngine = new CelestialSoundEngine();
