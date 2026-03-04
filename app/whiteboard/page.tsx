"use client";

import { useRef, useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import WhiteboardCanvas, {
  type WhiteboardCanvasHandle,
  type TurnState,
} from "@/components/WhiteboardCanvas";
import type { TutorResponse } from "@/lib/tutorTypes";

// ── Sidebar ───────────────────────────────────────────────────────────────────

function CanvasHistorySidebar({
  history,
  currentTopic,
}: {
  history: string[];
  currentTopic: string;
}) {
  const [modalSrc, setModalSrc] = useState<string | null>(null);

  return (
    <aside className="w-52 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col">
      <div className="p-3 border-b border-gray-200">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Subtopic History
        </h2>
        <p className="text-xs text-gray-400 mt-0.5 truncate">{currentTopic}</p>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {history.length === 0 && (
          <p className="text-xs text-gray-400 text-center mt-4">
            Completed subtopics appear here.
          </p>
        )}
        {history.map((src, i) => (
          <button
            key={i}
            onClick={() => setModalSrc(src)}
            className="block w-full rounded border border-gray-200 overflow-hidden hover:border-violet-400 transition-colors"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={`Subtopic ${i + 1}`} className="w-full" />
            <div className="text-xs text-center text-gray-500 py-0.5 bg-gray-50">
              Subtopic {i + 1}
            </div>
          </button>
        ))}
      </div>

      {modalSrc && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
          onClick={() => setModalSrc(null)}
        >
          <div
            className="bg-white rounded-xl p-4 max-w-3xl w-full mx-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={modalSrc} alt="Subtopic snapshot" className="w-full rounded" />
            <button
              onClick={() => setModalSrc(null)}
              className="mt-3 w-full text-sm text-gray-500 hover:text-gray-700"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}

// ── Push-to-Talk ──────────────────────────────────────────────────────────────
// IMPORTANT: webkitSpeechRecognition.start() must be called SYNCHRONOUSLY
// within the user gesture handler. We eagerly import voiceUtils on mount and
// store the function in a ref so the mousedown handler is synchronous.

function PushToTalkButton({
  onInterrupt,
  disabled,
}: {
  onInterrupt: (transcript: string) => void;
  disabled: boolean;
}) {
  const [isListening, setIsListening] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const startListeningRef = useRef<any>(null);

  // Eagerly load the function so it's available synchronously on gesture
  useEffect(() => {
    import("@/lib/voiceUtils").then(({ startListening }) => {
      startListeningRef.current = startListening;
    });
  }, []);

  const startTalk = () => {
    if (disabled || isListening || !startListeningRef.current) return;
    setIsListening(true);
    // Called synchronously — no await — so the browser accepts it as a user gesture
    recognitionRef.current = startListeningRef.current(
      (transcript: string) => {
        setIsListening(false);
        onInterrupt(transcript);
      },
      () => setIsListening(false)
    );
  };

  const stopTalk = () => {
    recognitionRef.current?.stop();
    // Don't set isListening=false here — wait for onresult/onerror callbacks
  };

  return (
    <button
      onMouseDown={startTalk}
      onMouseUp={stopTalk}
      onTouchStart={startTalk}
      onTouchEnd={stopTalk}
      disabled={disabled || !startListeningRef.current}
      title="Hold to ask a question"
      className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium border transition-all select-none
        ${isListening
          ? "bg-red-500 border-red-500 text-white animate-pulse"
          : disabled
            ? "bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed"
            : "bg-white border-gray-300 text-gray-700 hover:border-violet-400 hover:text-violet-700 cursor-pointer"
        }`}
    >
      {isListening ? "🎙️ Listening..." : "🎤 Hold to Ask"}
    </button>
  );
}

// ── Subtitle bar ──────────────────────────────────────────────────────────────

function SubtitleBar({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 flex justify-center pb-4 px-6 pointer-events-none">
      <div className="bg-black/80 backdrop-blur-sm text-white text-center rounded-xl px-8 py-3 max-w-3xl text-base leading-relaxed shadow-2xl">
        {text}
      </div>
    </div>
  );
}

// ── Main whiteboard ───────────────────────────────────────────────────────────

function WhiteboardInner() {
  const params = useSearchParams();
  const router = useRouter();

  const educationLevel = params.get("educationLevel") ?? "";
  const subject = params.get("subject") ?? "";
  const topic = params.get("topic") ?? "";

  const canvasRef = useRef<WhiteboardCanvasHandle>(null);
  const [turnState, setTurnState] = useState<TurnState>("AI_TURN");
  const [canvasHistory, setCanvasHistory] = useState<string[]>([]);
  const [statusMessage, setStatusMessage] = useState("Preparing your lesson...");
  const [isLoading, setIsLoading] = useState(false);
  const [subtitle, setSubtitle] = useState("");

  const subtopicIndexRef = useRef(0);
  const studentHistoryRef = useRef<string[]>([]);
  const isFirstTurnRef = useRef(true);

  // Cancel speech on unmount (e.g. End Lesson while AI is speaking)
  useEffect(() => {
    return () => { window.speechSynthesis?.cancel(); };
  }, []);

  // Redirect if params missing
  useEffect(() => {
    if (!educationLevel || !subject || !topic) router.replace("/");
  }, [educationLevel, subject, topic, router]);

  /** Place a generated image on the canvas (right side) */
  const placeImage = useCallback(async (imagePrompt: string) => {
    const canvas = canvasRef.current?.fabricCanvas;
    if (!canvas) return;

    // Pollinations.ai: free, no auth, CORS-enabled educational image generation
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(
      `educational diagram: ${imagePrompt}, clean white background, labeled, scientific illustration style`
    )}?width=380&height=280&nologo=true&seed=${Date.now()}`;

    try {
      const { FabricImage } = await import("fabric");
      const { addObjectWithId } = await import("@/lib/canvasUtils");
      const img = await FabricImage.fromURL(url, { crossOrigin: "anonymous" });
      const targetW = 360;
      const scale = targetW / (img.width ?? targetW);
      img.set({
        left: 680, // right-center of canvas
        top: 240,
        scaleX: scale,
        scaleY: scale,
        selectable: false,
        evented: false,
        originX: "center",
        originY: "center",
      });
      addObjectWithId(canvas, img);
      canvas.renderAll();
    } catch (err) {
      console.warn("[Image] Failed to load image:", err);
    }
  }, []);

  /** Core AI turn: call API, draw on canvas, speak, hand over to student */
  const runAiTurn = useCallback(
    async (canvasBase64?: string) => {
      setIsLoading(true);
      setTurnState("AI_TURN");
      setStatusMessage("Prof. Alex is thinking...");

      try {
        const res = await fetch("/api/tutor", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            educationLevel,
            subject,
            topic,
            subtopicIndex: subtopicIndexRef.current,
            canvasBase64,
            studentHistory: studentHistoryRef.current,
            isFirstTurn: isFirstTurnRef.current,
          }),
        });

        if (!res.ok) throw new Error(`API error: ${res.status}`);
        const data: TutorResponse = await res.json();
        isFirstTurnRef.current = false;

        // 1. Execute canvas drawing commands
        if (data.canvas_commands?.length && canvasRef.current?.fabricCanvas) {
          const { executeCanvasCommands } = await import("@/lib/commandExecutor");
          await executeCanvasCommands(canvasRef.current.fabricCanvas, data.canvas_commands);
        }

        // 2. Generate and place image if requested (runs in parallel with speaking)
        const imagePromise = data.image_prompt
          ? placeImage(data.image_prompt)
          : Promise.resolve();

        // 3. Speak the response with live subtitles
        if (data.speech) {
          setSubtitle(data.speech);
          setStatusMessage("Prof. Alex is speaking...");
          const { speak } = await import("@/lib/voiceUtils");
          await Promise.all([speak(data.speech), imagePromise]);
          setSubtitle("");
        } else {
          await imagePromise;
        }

        // 4. Handle lesson flow
        if (data.status === "SUBTOPIC_COMPLETE") {
          const snapshot = canvasRef.current?.toBase64() ?? "";
          if (snapshot) setCanvasHistory((prev) => [...prev, snapshot]);
          canvasRef.current?.clear();
          subtopicIndexRef.current += 1;
          studentHistoryRef.current = [];
          setStatusMessage("Moving to next subtopic...");
          await runAiTurn(undefined);
        } else {
          setTurnState("STUDENT_TURN");
          setStatusMessage("Your turn — draw your answer on the board!");
          setIsLoading(false);
        }
      } catch (err) {
        console.error("[WhiteboardPage] AI turn error:", err);
        setSubtitle("");
        setStatusMessage("Connection issue — please try submitting again.");
        setTurnState("STUDENT_TURN");
        setIsLoading(false);
      }
    },
    [educationLevel, subject, topic, placeImage]
  );

  // Fire first AI turn once canvas is mounted
  useEffect(() => {
    if (!educationLevel || !subject || !topic) return;
    const timer = setTimeout(() => runAiTurn(undefined), 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Student submits drawing */
  const handleSubmit = useCallback(async () => {
    const snapshot = canvasRef.current?.toBase64() ?? "";
    studentHistoryRef.current.push(
      `[Student submitted work for subtopic ${subtopicIndexRef.current + 1}]`
    );
    await runAiTurn(snapshot);
  }, [runAiTurn]);

  /** Handle Push-to-Talk interrupt */
  const handleInterrupt = useCallback(
    async (transcript: string) => {
      if (!transcript.trim()) return;

      window.speechSynthesis?.cancel();
      setSubtitle("");

      setStatusMessage(`Processing: "${transcript}"`);

      try {
        const snapshot = canvasRef.current?.toBase64() ?? "";
        const res = await fetch("/api/tutor/interrupt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcribedText: transcript, canvasBase64: snapshot }),
        });

        if (!res.ok) throw new Error("Interrupt API failed");
        const data: TutorResponse = await res.json();

        if (data.canvas_commands?.length && canvasRef.current?.fabricCanvas) {
          const { executeCanvasCommands } = await import("@/lib/commandExecutor");
          await executeCanvasCommands(canvasRef.current.fabricCanvas, data.canvas_commands);
        }

        if (data.speech) {
          setSubtitle(data.speech);
          const { speak } = await import("@/lib/voiceUtils");
          await speak(data.speech);
          setSubtitle("");
        }

        setStatusMessage(
          turnState === "STUDENT_TURN"
            ? "Your turn — draw your answer on the board!"
            : "Prof. Alex is presenting..."
        );
      } catch (err) {
        console.error("[Interrupt] Error:", err);
        setSubtitle("");
      }
    },
    [turnState]
  );

  const handleEndLesson = () => {
    window.speechSynthesis?.cancel();
    setSubtitle("");
    router.push("/");
  };

  if (!educationLevel || !subject || !topic) return null;

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      <CanvasHistorySidebar history={canvasHistory} currentTopic={topic} />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between flex-shrink-0">
          <div>
            <h1 className="text-base font-semibold text-gray-900">
              {subject} — {topic}
            </h1>
            <p className="text-xs text-gray-500">{educationLevel} · Subtopic {subtopicIndexRef.current + 1}</p>
          </div>
          <div className="flex items-center gap-4">
            {isLoading && (
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce"
                      style={{ animationDelay: `${i * 0.15}s` }}
                    />
                  ))}
                </div>
                <span className="text-sm text-gray-500">{statusMessage}</span>
              </div>
            )}
            {!isLoading && (
              <span className="text-sm text-gray-500">{statusMessage}</span>
            )}
            <button
              onClick={handleEndLesson}
              className="text-xs text-gray-400 hover:text-red-500 underline transition-colors"
            >
              End Lesson
            </button>
          </div>
        </header>

        {/* Canvas */}
        <main className="flex-1 flex items-center justify-center p-6 overflow-auto pb-20">
          <div className="flex flex-col gap-4 items-center">
            <WhiteboardCanvas
              ref={canvasRef}
              turnState={turnState}
              width={900}
              height={500}
            />

            {/* Controls row */}
            <div className="flex items-center gap-4">
              {turnState === "STUDENT_TURN" && (
                <>
                  <button
                    onClick={handleSubmit}
                    className="bg-green-600 hover:bg-green-700 text-white font-semibold px-8 py-2.5 rounded-lg transition-colors shadow"
                  >
                    Submit Answer →
                  </button>
                  <span className="text-sm text-gray-400">
                    Draw your answer above, then submit
                  </span>
                </>
              )}

              {turnState === "AI_TURN" && !isLoading && (
                <span className="text-sm text-violet-600 font-medium flex items-center gap-2">
                  <span className="inline-block w-2 h-2 rounded-full bg-violet-500 animate-pulse" />
                  Prof. Alex is presenting...
                </span>
              )}

              <PushToTalkButton
                onInterrupt={handleInterrupt}
                disabled={isLoading}
              />
            </div>
          </div>
        </main>
      </div>

      {/* Live subtitle bar — fixed at the bottom of the screen */}
      <SubtitleBar text={subtitle} />
    </div>
  );
}

// ── Route entry point ─────────────────────────────────────────────────────────

export default function WhiteboardPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <p className="text-gray-500">Loading whiteboard...</p>
        </div>
      }
    >
      <WhiteboardInner />
    </Suspense>
  );
}
