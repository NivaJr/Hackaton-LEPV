let sharedContext: AudioContext | null = null;

type AudioContextConstructor = new () => AudioContext;

function browserAudioContext(): AudioContextConstructor | null {
  if (typeof window === "undefined") return null;
  return window.AudioContext
    ?? (window as typeof window & { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext
    ?? null;
}

/** Called directly from the answer button so browsers can authorize audio for this interaction. */
export function prepareCorrectAnswerSound(enabled: boolean): AudioContext | null {
  if (!enabled) return null;
  const AudioContextClass = browserAudioContext();
  if (!AudioContextClass) return null;
  try {
    if (!sharedContext || sharedContext.state === "closed") sharedContext = new AudioContextClass();
    if (sharedContext.state === "suspended") void sharedContext.resume().catch(() => undefined);
    return sharedContext;
  } catch {
    return null;
  }
}

/** A short, low-volume ascending chime. Visual feedback remains the primary confirmation. */
export function playCorrectAnswerSound(context: AudioContext | null) {
  if (!context || context.state === "closed") return;
  const schedule = () => {
    const startedAt = context.currentTime + 0.02;
    const master = context.createGain();
    master.gain.setValueAtTime(0.07, startedAt);
    master.gain.exponentialRampToValueAtTime(0.0001, startedAt + 0.58);
    master.connect(context.destination);

    [523.25, 659.25, 783.99].forEach((frequency, index) => {
      const noteStartedAt = startedAt + index * 0.11;
      const oscillator = context.createOscillator();
      const noteGain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, noteStartedAt);
      noteGain.gain.setValueAtTime(0.0001, noteStartedAt);
      noteGain.gain.exponentialRampToValueAtTime(0.7, noteStartedAt + 0.018);
      noteGain.gain.exponentialRampToValueAtTime(0.0001, noteStartedAt + 0.24);
      oscillator.connect(noteGain);
      noteGain.connect(master);
      oscillator.start(noteStartedAt);
      oscillator.stop(noteStartedAt + 0.25);
    });
  };

  try {
    if (context.state === "suspended") void context.resume().then(schedule).catch(() => undefined);
    else schedule();
  } catch {
    // Sound is optional feedback: unavailable audio must never invalidate an answer.
  }
}
