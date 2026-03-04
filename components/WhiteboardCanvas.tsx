"use client";

import { useEffect, useRef, useImperativeHandle, forwardRef } from "react";
import type { Canvas as FabricCanvas } from "fabric";
import { addObjectWithId, lockCanvas, unlockCanvas, canvasToBase64 } from "@/lib/canvasUtils";

export type TurnState = "AI_TURN" | "STUDENT_TURN";

export interface WhiteboardCanvasHandle {
  /** The underlying Fabric.js Canvas instance */
  fabricCanvas: FabricCanvas | null;
  /** Lock canvas (AI turn) or unlock it (student turn) */
  setTurnState: (state: TurnState) => void;
  /** Export current canvas as Base64 PNG */
  toBase64: () => string;
  /** Clear all objects from the canvas */
  clear: () => void;
  /** Expose addObjectWithId bound to this canvas */
  addObject: (fabricObj: Parameters<typeof addObjectWithId>[1], customId?: string) => ReturnType<typeof addObjectWithId>;
  /** Undo the last student-drawn path */
  undoStudentPath: () => void;
  /** Reset the undo stack (call when starting a new subtopic) */
  clearStudentPaths: () => void;
}

interface WhiteboardCanvasProps {
  turnState: TurnState;
  width?: number;
  height?: number;
}

const WhiteboardCanvas = forwardRef<WhiteboardCanvasHandle, WhiteboardCanvasProps>(
  ({ turnState, width = 900, height = 600 }, ref) => {
    const canvasElRef = useRef<HTMLCanvasElement>(null);
    const fabricRef = useRef<FabricCanvas | null>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const studentPathsRef = useRef<any[]>([]);

    // Initialize Fabric.js canvas once on mount.
    // The `cancelled` flag guards against React Strict Mode's double-invoke:
    // StrictMode runs mount → cleanup → mount in dev. Without the flag, the
    // async import from the first mount can race with the second mount and try
    // to initialize the same <canvas> element twice, which Fabric rejects.
    useEffect(() => {
      if (!canvasElRef.current || fabricRef.current) return;
      let cancelled = false;

      // Dynamic import keeps Fabric out of the server bundle (browser-only APIs)
      import("fabric").then(({ Canvas, PencilBrush }) => {
        // If cleanup already ran (StrictMode) or canvas was created by a
        // concurrent call, bail out before touching the DOM element.
        if (cancelled || fabricRef.current) return;

        const canvas = new Canvas(canvasElRef.current!, {
          width,
          height,
          backgroundColor: "#ffffff",
          isDrawingMode: false,
          selection: false,
        });

        // Set up pencil brush for student drawing
        canvas.freeDrawingBrush = new PencilBrush(canvas);
        canvas.freeDrawingBrush.width = 3;
        (canvas.freeDrawingBrush as { color: string }).color = "#1e293b";

        // Every path the student draws gets a unique ID and is tracked for undo
        canvas.on("path:created", (e) => {
          const path = e.path;
          if (path) {
            studentPathsRef.current.push(path);
            if (!(path as typeof path & { id?: string }).id) {
              import("@/lib/canvasUtils").then(({ generateObjectId }) => {
                (path as typeof path & { id: string }).id = generateObjectId();
              });
            }
          }
        });

        fabricRef.current = canvas;

        // Apply initial turn state
        if (turnState === "STUDENT_TURN") {
          unlockCanvas(canvas);
        } else {
          lockCanvas(canvas);
        }
      });

      return () => {
        cancelled = true;
        fabricRef.current?.dispose();
        fabricRef.current = null;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Run only on mount; turnState changes handled below

    // React to turn state changes after initialization
    useEffect(() => {
      const canvas = fabricRef.current;
      if (!canvas) return;

      if (turnState === "STUDENT_TURN") {
        unlockCanvas(canvas);
      } else {
        lockCanvas(canvas);
      }
    }, [turnState]);

    // Expose imperative API to parent via ref
    useImperativeHandle(ref, () => ({
      get fabricCanvas() {
        return fabricRef.current;
      },
      setTurnState(state: TurnState) {
        const canvas = fabricRef.current;
        if (!canvas) return;
        if (state === "STUDENT_TURN") unlockCanvas(canvas);
        else lockCanvas(canvas);
      },
      toBase64() {
        if (!fabricRef.current) return "";
        return canvasToBase64(fabricRef.current);
      },
      clear() {
        fabricRef.current?.clear();
        fabricRef.current?.set({ backgroundColor: "#ffffff" });
        fabricRef.current?.renderAll();
      },
      addObject(fabricObj, customId) {
        return addObjectWithId(fabricRef.current!, fabricObj, customId);
      },
      undoStudentPath() {
        const canvas = fabricRef.current;
        if (!canvas || studentPathsRef.current.length === 0) return;
        const last = studentPathsRef.current.pop();
        canvas.remove(last);
        canvas.renderAll();
      },
      clearStudentPaths() {
        studentPathsRef.current = [];
      },
    }));

    return (
      <div className="relative border-2 border-gray-300 rounded-lg shadow-lg overflow-hidden">
        <canvas ref={canvasElRef} />
        {/* Turn state indicator overlay */}
        <div
          className={`absolute top-2 right-2 px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
            turnState === "AI_TURN"
              ? "bg-violet-100 text-violet-700 border border-violet-300"
              : "bg-green-100 text-green-700 border border-green-300"
          }`}
        >
          {turnState === "AI_TURN" ? "AI is teaching..." : "Your turn — draw!"}
        </div>
      </div>
    );
  }
);

WhiteboardCanvas.displayName = "WhiteboardCanvas";

export default WhiteboardCanvas;
