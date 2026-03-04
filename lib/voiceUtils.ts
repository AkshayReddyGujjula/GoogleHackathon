/**
 * voiceUtils.ts — Browser-only Web Speech API helpers.
 * Must only be called client-side.
 */

// ── Voice caching ─────────────────────────────────────────────────────────────
// getVoices() often returns [] on first call because voices load asynchronously.
// We resolve the best voice once and cache it so every speak() uses the same
// voice object → consistent pitch, accent, and quality across the whole lesson.
let _cachedVoice: SpeechSynthesisVoice | null | undefined = undefined;

function selectBestVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  return (
    // Highest quality network voices first
    voices.find((v) => v.name === "Google UK English Female") ??
    voices.find((v) => v.name === "Google US English") ??
    voices.find((v) => v.name.includes("Samantha")) ??
    voices.find((v) => v.name.includes("Alex")) ??
    // Any non-local English voice
    voices.find((v) => v.lang === "en-US" && !v.localService) ??
    voices.find((v) => v.lang.startsWith("en") && !v.localService) ??
    // Fall back to any English voice
    voices.find((v) => v.lang.startsWith("en")) ??
    null
  );
}

async function getVoice(): Promise<SpeechSynthesisVoice | null> {
  if (_cachedVoice !== undefined) return _cachedVoice;

  return new Promise((resolve) => {
    const tryResolve = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        _cachedVoice = selectBestVoice(voices);
        resolve(_cachedVoice);
        return true;
      }
      return false;
    };

    if (tryResolve()) return;

    // Voices not yet loaded — wait for the async event
    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.onvoiceschanged = null;
      _cachedVoice = selectBestVoice(window.speechSynthesis.getVoices());
      resolve(_cachedVoice);
    };

    // Safety timeout — some browsers never fire onvoiceschanged
    setTimeout(() => {
      if (_cachedVoice === undefined) {
        _cachedVoice = selectBestVoice(window.speechSynthesis.getVoices()) ?? null;
        resolve(_cachedVoice);
      }
    }, 3000);
  });
}

// ── speak ─────────────────────────────────────────────────────────────────────

export interface SpeakOptions {
  /**
   * Called at every word boundary with the portion of text spoken so far.
   * Use this to drive rolling subtitles (show progressively more of the text).
   * Supported natively in Chrome/Edge via SpeechSynthesisEvent.onboundary.
   */
  onWord?: (spokenSoFar: string) => void;
}

export async function speak(text: string, opts?: SpeakOptions): Promise<void> {
  const voice = await getVoice();

  return new Promise((resolve) => {
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.93;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    if (voice) utterance.voice = voice;

    // Rolling subtitle: fire callback at each word boundary.
    // Chrome/Edge support onboundary natively. For Firefox/Safari we fall back
    // to a word-timing simulation that kicks in if no boundary events fire.
    if (opts?.onWord) {
      let boundaryFired = false;
      let fallbackTimer: ReturnType<typeof setInterval> | null = null;

      utterance.onboundary = (event: SpeechSynthesisEvent) => {
        if (event.name === "word") {
          boundaryFired = true;
          if (fallbackTimer) { clearInterval(fallbackTimer); fallbackTimer = null; }
          const spokenSoFar = text.substring(0, event.charIndex + event.charLength);
          opts.onWord!(spokenSoFar);
        }
      };

      // If no onboundary fires within 600 ms, start a word-timing fallback
      const fallbackDelay = setTimeout(() => {
        if (!boundaryFired) {
          const words = text.split(/\s+/).filter(Boolean);
          // Estimate ~120 words/min at rate 0.93 → ~500 ms/word
          const msPerWord = Math.round(60000 / (120 * utterance.rate));
          let idx = 0;
          fallbackTimer = setInterval(() => {
            // Respect pause — don't advance words while speech is paused
            if (window.speechSynthesis.paused) return;
            idx++;
            if (idx >= words.length) {
              if (fallbackTimer) { clearInterval(fallbackTimer); fallbackTimer = null; }
              opts.onWord!(text); // show full text at end
              return;
            }
            opts.onWord!(words.slice(0, idx).join(" "));
          }, msPerWord);
        }
      }, 600);

      const cleanup = () => {
        clearTimeout(fallbackDelay);
        if (fallbackTimer) { clearInterval(fallbackTimer); fallbackTimer = null; }
      };

      utterance.onend = () => { cleanup(); resolve(); };
      utterance.onerror = () => { cleanup(); resolve(); };
    } else {
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
    }

    window.speechSynthesis.speak(utterance);
  });
}

/** Cancel any ongoing speech immediately. */
export function stopSpeaking(): void {
  window.speechSynthesis.cancel();
}

/** Pause mid-sentence — browser preserves voice, pitch, and position. */
export function pauseSpeaking(): void {
  window.speechSynthesis.pause();
}

/** Resume from exactly where paused — same voice, same position. */
export function resumeSpeaking(): void {
  window.speechSynthesis.resume();
}

// ── STT (Push-to-Talk) ────────────────────────────────────────────────────────

interface SpeechRecognitionEvent {
  results: { [i: number]: { [j: number]: { transcript: string } } };
}
interface SpeechRecognitionErrorEvent {
  error: string;
}
interface WebSpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null;
  start(): void;
  stop(): void;
}

/**
 * MUST be called synchronously within a user gesture (mousedown/touchstart).
 * Eagerly import this module and store `startListening` in a ref — don't await
 * inside the gesture handler or the browser will reject the microphone request.
 */
export function startListening(
  onResult: (transcript: string) => void,
  onError?: (err: string) => void
): WebSpeechRecognition {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Ctor = (window as any).webkitSpeechRecognition ?? (window as any).SpeechRecognition;
  const rec: WebSpeechRecognition = new Ctor();
  rec.continuous = false;
  rec.interimResults = false;
  rec.lang = "en-US";
  rec.onresult = (e) => {
    const t = e.results[0]?.[0]?.transcript ?? "";
    if (t) onResult(t);
  };
  rec.onerror = (e) => onError?.(e.error);
  rec.start();
  return rec;
}
