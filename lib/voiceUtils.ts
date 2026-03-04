/**
 * voiceUtils.ts — Browser-only Web Speech API helpers.
 * All functions must be called client-side only (never during SSR).
 *
 * Note: The Web Speech API is not fully typed in lib.dom.d.ts.
 * We use `any` casts only at the browser API boundary.
 */

/** Speaks text aloud via the browser's speech synthesis engine.
 *  Returns a Promise that resolves when speaking is complete. */
export function speak(text: string): Promise<void> {
  return new Promise((resolve) => {
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(
      (v) =>
        v.lang.startsWith("en") &&
        (v.name.includes("Google") || v.name.includes("Natural") || v.name.includes("Samantha"))
    );
    if (preferred) utterance.voice = preferred;

    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();

    window.speechSynthesis.speak(utterance);
  });
}

/** Stops any ongoing speech synthesis immediately. */
export function stopSpeaking(): void {
  window.speechSynthesis.cancel();
}

// Minimal type shim for the non-standard webkitSpeechRecognition API
interface SpeechRecognitionEvent {
  results: { [index: number]: { [index: number]: { transcript: string } } };
}

interface SpeechRecognitionErrorEvent {
  error: string;
}

interface WebSpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  start(): void;
  stop(): void;
}

/** Starts listening via webkitSpeechRecognition (Chrome/Edge only).
 *  @param onResult  Called with the final transcript when speech ends.
 *  @returns The recognition instance — caller must call .stop() on button release. */
export function startListening(
  onResult: (transcript: string) => void,
  onError?: (err: string) => void
): WebSpeechRecognition {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const SpeechRecognitionCtor = (window as any).webkitSpeechRecognition ?? (window as any).SpeechRecognition;
  const recognition: WebSpeechRecognition = new SpeechRecognitionCtor();

  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = "en-US";

  recognition.onresult = (event: SpeechRecognitionEvent) => {
    const transcript = event.results[0]?.[0]?.transcript ?? "";
    if (transcript) onResult(transcript);
  };

  recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
    onError?.(event.error);
  };

  recognition.start();
  return recognition;
}
