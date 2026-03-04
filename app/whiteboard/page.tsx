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
            <button onClick={() => setModalSrc(null)} className="mt-3 w-full text-sm text-gray-500 hover:text-gray-700">
              Close
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}

// ── Ask-a-Question Button ─────────────────────────────────────────────────────
// Click once to START recording (interrupts AI speech immediately).
// Click again (Stop) to END recording and send transcript to AI.
// Works at any time — even while AI is speaking.

function AskQuestionButton({
  onInterrupt,
}: {
  onInterrupt: (transcript: string) => void;
}) {
  const [isListening, setIsListening] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const startListeningRef = useRef<any>(null);

  useEffect(() => {
    import("@/lib/voiceUtils").then(({ startListening }) => {
      startListeningRef.current = startListening;
    });
  }, []);

  const handleClick = () => {
    if (isListening) {
      // Stop recording and let onresult fire with the transcript
      recognitionRef.current?.stop();
      return;
    }
    if (!startListeningRef.current) return;
    // Stop AI speech immediately
    window.speechSynthesis?.cancel();
    setIsListening(true);
    recognitionRef.current = startListeningRef.current(
      (transcript: string) => { setIsListening(false); onInterrupt(transcript); },
      () => setIsListening(false)
    );
  };

  return (
    <button
      onClick={handleClick}
      title={isListening ? "Stop recording and send question" : "Ask Prof. Alex a question (interrupts AI)"}
      className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium border transition-all select-none
        ${isListening
          ? "bg-red-500 border-red-600 text-white animate-pulse shadow-lg"
          : "bg-white border-gray-300 text-gray-700 hover:border-violet-400 hover:text-violet-700 cursor-pointer"
        }`}
    >
      {isListening ? "⏹ Stop & Send" : "🎤 Ask a Question"}
    </button>
  );
}

// ── Rolling subtitle bar ──────────────────────────────────────────────────────
// `spokenSoFar` grows word-by-word via onboundary events.
// We display only the last 12 words so it scrolls like real subtitles.

function SubtitleBar({ spokenSoFar }: { spokenSoFar: string }) {
  if (!spokenSoFar) return null;
  const words = spokenSoFar.trim().split(/\s+/);
  const display = words.length > 12 ? words.slice(-12).join(" ") : spokenSoFar;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 flex justify-center pb-5 px-6 pointer-events-none">
      <div className="bg-black/85 backdrop-blur-sm text-white rounded-xl px-8 py-3 max-w-3xl text-[17px] leading-snug shadow-2xl text-center">
        {display}
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

  // Subtitle state: grows word-by-word via onboundary events
  const [subtitle, setSubtitle] = useState("");

  // Pause state — speechSynthesis.pause() preserves voice + position perfectly
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  // Ref version for use inside async speak callbacks (avoids stale closure)
  const isPausedRef = useRef(false);

  // Current question shown to student while it's their turn
  const [currentQuestion, setCurrentQuestion] = useState("");

  const subtopicIndexRef = useRef(0);
  const studentHistoryRef = useRef<string[]>([]);
  const isFirstTurnRef = useRef(true);

  // Cancel speech on unmount (End Lesson while AI is mid-sentence)
  useEffect(() => {
    return () => { window.speechSynthesis?.cancel(); };
  }, []);

  // Redirect if params missing
  useEffect(() => {
    if (!educationLevel || !subject || !topic) router.replace("/");
  }, [educationLevel, subject, topic, router]);

  const handlePause = useCallback(() => {
    window.speechSynthesis?.pause();
    isPausedRef.current = true;
    setIsPaused(true);
    setSubtitle("");
  }, []);

  const handleResume = useCallback(() => {
    window.speechSynthesis?.resume();
    isPausedRef.current = false;
    setIsPaused(false);
  }, []);

  /** Place a Pollinations.ai generated image on the right side of the canvas */
  const placeImage = useCallback(async (imagePrompt: string) => {
    const canvas = canvasRef.current?.fabricCanvas;
    if (!canvas) return;
    const url =
      `https://image.pollinations.ai/prompt/` +
      encodeURIComponent(
        `educational diagram: ${imagePrompt}, clean white background, labeled, scientific illustration`
      ) +
      `?width=380&height=280&nologo=true&seed=${Date.now()}`;
    try {
      const { FabricImage } = await import("fabric");
      const { addObjectWithId } = await import("@/lib/canvasUtils");
      const img = await FabricImage.fromURL(url, { crossOrigin: "anonymous" });
      const scale = 360 / (img.width ?? 360);
      img.set({ left: 690, top: 230, scaleX: scale, scaleY: scale, selectable: false, evented: false, originX: "center", originY: "center" });
      addObjectWithId(canvas, img);
      canvas.renderAll();
    } catch (err) {
      console.warn("[Image] Failed to load:", err);
    }
  }, []);

  /** Core AI turn loop */
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
            educationLevel, subject, topic,
            subtopicIndex: subtopicIndexRef.current,
            canvasBase64,
            studentHistory: studentHistoryRef.current,
            isFirstTurn: isFirstTurnRef.current,
          }),
        });

        if (!res.ok) throw new Error(`API error: ${res.status}`);
        const data: TutorResponse = await res.json();
        isFirstTurnRef.current = false;

        // 1. Clear canvas + reset undo stack, then draw new commands
        canvasRef.current?.clear();
        canvasRef.current?.clearStudentPaths();
        if (data.canvas_commands?.length && canvasRef.current?.fabricCanvas) {
          const { executeCanvasCommands } = await import("@/lib/commandExecutor");
          await executeCanvasCommands(canvasRef.current.fabricCanvas, data.canvas_commands);
        }

        // 2. Start image generation in parallel with speech
        const imagePromise = data.image_prompt
          ? placeImage(data.image_prompt)
          : Promise.resolve();

        // 3. Speak with rolling subtitle — gate updates through isPausedRef
        //    so subtitles freeze instantly on pause regardless of browser behaviour
        if (data.speech) {
          setSubtitle("");
          setStatusMessage("Prof. Alex is speaking...");
          setIsSpeaking(true);
          const { speak } = await import("@/lib/voiceUtils");
          await Promise.all([
            speak(data.speech, { onWord: (s) => { if (!isPausedRef.current) setSubtitle(s); } }),
            imagePromise,
          ]);
          setIsSpeaking(false);
          setSubtitle("");
        } else {
          await imagePromise;
        }

        // 4. Lesson flow
        if (data.status === "SUBTOPIC_COMPLETE") {
          setCurrentQuestion("");
          // Snapshot AFTER the AI drew its summary — this is what goes in the sidebar
          const snapshot = canvasRef.current?.toBase64() ?? "";
          if (snapshot) setCanvasHistory((prev) => [...prev, snapshot]);
          canvasRef.current?.clear();
          canvasRef.current?.clearStudentPaths();
          subtopicIndexRef.current += 1;
          studentHistoryRef.current = [];
          isFirstTurnRef.current = true; // new subtopic = fresh intro
          setStatusMessage("Moving to next subtopic...");
          await runAiTurn(undefined);
        } else {
          // Extract question text from the question-box text command (y≈450)
          const qCmd = data.canvas_commands?.find(
            (cmd) => cmd.action === "text" && Math.abs(cmd.coords.y - 450) < 40
          );
          setCurrentQuestion(qCmd && qCmd.action === "text" ? qCmd.content : "");
          setTurnState("STUDENT_TURN");
          setStatusMessage("Your turn — draw your answer on the board!");
          setIsLoading(false);
        }
      } catch (err) {
        console.error("[WhiteboardPage] AI turn error:", err);
        setSubtitle("");
        setIsSpeaking(false);
        setStatusMessage("Connection issue — please try submitting again.");
        setTurnState("STUDENT_TURN");
        setIsLoading(false);
      }
    },
    [educationLevel, subject, topic, placeImage]
  );

  // Fire first AI turn once canvas has mounted (800ms lets Fabric finish init)
  useEffect(() => {
    if (!educationLevel || !subject || !topic) return;
    const t = setTimeout(() => runAiTurn(undefined), 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Student submits their drawing */
  const handleSubmit = useCallback(async () => {
    setCurrentQuestion("");
    const snapshot = canvasRef.current?.toBase64() ?? "";
    studentHistoryRef.current.push(`[Student submitted work for subtopic ${subtopicIndexRef.current + 1}]`);
    await runAiTurn(snapshot);
  }, [runAiTurn]);

  /** Push-to-Talk interrupt */
  const handleInterrupt = useCallback(
    async (transcript: string) => {
      if (!transcript.trim()) return;
      window.speechSynthesis?.cancel();
      setSubtitle("");
      setIsSpeaking(false);
      setIsPaused(false);
      setStatusMessage(`Processing: "${transcript}"`);

      try {
        const snapshot = canvasRef.current?.toBase64() ?? "";
        const res = await fetch("/api/tutor/interrupt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcribedText: transcript, canvasBase64: snapshot }),
        });
        if (!res.ok) throw new Error("Interrupt failed");
        const data: TutorResponse = await res.json();

        if (data.canvas_commands?.length && canvasRef.current?.fabricCanvas) {
          const { executeCanvasCommands } = await import("@/lib/commandExecutor");
          await executeCanvasCommands(canvasRef.current.fabricCanvas, data.canvas_commands);
        }

        if (data.speech) {
          setSubtitle("");
          setIsSpeaking(true);
          const { speak } = await import("@/lib/voiceUtils");
          await speak(data.speech, { onWord: (s) => setSubtitle(s) });
          setIsSpeaking(false);
          setSubtitle("");
        }

        setStatusMessage(
          turnState === "STUDENT_TURN"
            ? "Your turn — draw your answer on the board!"
            : "Prof. Alex is presenting..."
        );
      } catch (err) {
        console.error("[Interrupt]", err);
        setSubtitle("");
        setIsSpeaking(false);
      }
    },
    [turnState]
  );

  const handleEndLesson = () => {
    window.speechSynthesis?.cancel();
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
            <p className="text-xs text-gray-500">
              {educationLevel} · Subtopic {subtopicIndexRef.current + 1}
            </p>
          </div>
          <div className="flex items-center gap-4">
            {isLoading && (
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
            )}
            <span className="text-sm text-gray-500 max-w-xs truncate">{statusMessage}</span>
            <button
              onClick={handleEndLesson}
              className="text-xs text-gray-400 hover:text-red-500 underline transition-colors"
            >
              End Lesson
            </button>
          </div>
        </header>

        {/* Canvas */}
        <main className="flex-1 flex items-center justify-center p-6 overflow-auto pb-24">
          <div className="flex flex-col gap-4 items-center">
            {/* Blinking question banner — visible only on student turn */}
            {turnState === "STUDENT_TURN" && currentQuestion && (
              <div className="w-[900px] max-w-full">
                <div className="animate-pulse bg-red-50 border-2 border-red-500 rounded-lg px-5 py-3 text-center">
                  <span className="text-red-600 font-bold text-base">
                    ❓ {currentQuestion}
                  </span>
                </div>
              </div>
            )}

            <WhiteboardCanvas
              ref={canvasRef}
              turnState={turnState}
              width={900}
              height={500}
            />

            {/* Controls */}
            <div className="flex items-center gap-3 flex-wrap justify-center">
              {/* Pause / Resume — only visible while AI is speaking */}
              {isSpeaking && (
                <button
                  onClick={isPaused ? handleResume : handlePause}
                  className={`flex items-center gap-2 px-5 py-2 rounded-full text-sm font-semibold border transition-all
                    ${isPaused
                      ? "bg-green-50 border-green-400 text-green-700 hover:bg-green-100"
                      : "bg-amber-50 border-amber-400 text-amber-700 hover:bg-amber-100"
                    }`}
                >
                  {isPaused ? "▶ Resume" : "⏸ Pause"}
                </button>
              )}

              {turnState === "STUDENT_TURN" && (
                <>
                  <button
                    onClick={() => canvasRef.current?.undoStudentPath()}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 bg-white text-gray-600 hover:border-gray-400 hover:text-gray-800 transition-colors"
                    title="Undo last stroke (Ctrl+Z)"
                  >
                    ↩ Undo
                  </button>
                  <button
                    onClick={handleSubmit}
                    className="bg-green-600 hover:bg-green-700 text-white font-semibold px-8 py-2.5 rounded-lg transition-colors shadow"
                  >
                    Submit Answer →
                  </button>
                </>
              )}

              {turnState === "AI_TURN" && !isLoading && !isSpeaking && (
                <span className="text-sm text-violet-600 font-medium flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-violet-500 animate-pulse inline-block" />
                  Prof. Alex is presenting...
                </span>
              )}

              <AskQuestionButton onInterrupt={handleInterrupt} />
            </div>
          </div>
        </main>
      </div>

      {/* Rolling subtitle bar */}
      <SubtitleBar spokenSoFar={subtitle} />
    </div>
  );
}

export default function WhiteboardPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Loading whiteboard...</p>
      </div>
    }>
      <WhiteboardInner />
    </Suspense>
  );
}
