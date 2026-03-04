/**
 * commandExecutor.ts
 *
 * Parses the AI's `canvas_commands` array and executes each command
 * against the live Fabric.js canvas. All objects are added via
 * addObjectWithId() so they remain referenceable by the AI in future turns.
 */

import type { Canvas as FabricCanvas } from "fabric";
import type { CanvasAction } from "./tutorTypes";
import { addObjectWithId, findObjectById } from "./canvasUtils";

/** Execute all commands sequentially, returning IDs of created objects */
export async function executeCanvasCommands(
  canvas: FabricCanvas,
  commands: CanvasAction[]
): Promise<void> {
  // Dynamic import keeps Fabric out of the server bundle
  const fabric = await import("fabric");

  for (const cmd of commands) {
    try {
      await executeSingle(canvas, cmd, fabric);
    } catch (err) {
      console.warn("[commandExecutor] Failed to execute command:", cmd, err);
    }
  }

  canvas.renderAll();
}

type FabricModule = typeof import("fabric");

async function executeSingle(
  canvas: FabricCanvas,
  cmd: CanvasAction,
  fabric: FabricModule
): Promise<void> {
  switch (cmd.action) {
    case "draw": {
      const color = cmd.color ?? "#1e40af";

      if (cmd.type === "circle") {
        const circle = new fabric.Circle({
          left: cmd.coords.x,
          top: cmd.coords.y,
          radius: cmd.radius ?? 40,
          fill: "transparent",
          stroke: color,
          strokeWidth: 2.5,
          selectable: false,
          evented: false,
          originX: "center",
          originY: "center",
        });
        addObjectWithId(canvas, circle);
      }

      else if (cmd.type === "rect") {
        const rect = new fabric.Rect({
          left: cmd.coords.x,
          top: cmd.coords.y,
          width: cmd.width ?? 120,
          height: cmd.height ?? 80,
          fill: cmd.fillColor ?? "transparent",
          stroke: color,
          strokeWidth: cmd.fillColor ? 1.5 : 2.5,
          selectable: false,
          evented: false,
          originX: "center",
          originY: "center",
        });
        addObjectWithId(canvas, rect);
      }

      else if (cmd.type === "line") {
        const x2 = cmd.coords2?.x ?? cmd.coords.x + 100;
        const y2 = cmd.coords2?.y ?? cmd.coords.y;
        const line = new fabric.Line([cmd.coords.x, cmd.coords.y, x2, y2], {
          stroke: color,
          strokeWidth: 2.5,
          selectable: false,
          evented: false,
        });
        addObjectWithId(canvas, line);
      }

      else if (cmd.type === "triangle") {
        const tri = new fabric.Triangle({
          left: cmd.coords.x,
          top: cmd.coords.y,
          width: cmd.width ?? 80,
          height: cmd.height ?? 70,
          fill: "transparent",
          stroke: color,
          strokeWidth: 2.5,
          selectable: false,
          evented: false,
          originX: "center",
          originY: "center",
        });
        addObjectWithId(canvas, tri);
      }

      // Optional label beneath the shape
      if (cmd.label) {
        const label = new fabric.Textbox(cmd.label, {
          left: cmd.coords.x,
          top: cmd.coords.y + (cmd.radius ?? 50) + 8,
          width: 200,
          fontSize: 14,
          fill: color,
          selectable: false,
          evented: false,
          textAlign: "center",
          originX: "center",
        });
        addObjectWithId(canvas, label);
      }
      break;
    }

    case "text": {
      // All text coords are treated as CENTER positions (consistent with shapes).
      // Width is computed adaptively so text can't overflow the 900px canvas.
      // Formula: widest box that fits symmetrically around the given x coordinate.
      const halfAvail = Math.min(cmd.coords.x, 900 - cmd.coords.x);
      const textWidth = Math.max(280, Math.min(840, halfAvail * 2 - 20));

      const textbox = new fabric.Textbox(cmd.content, {
        left: cmd.coords.x,
        top: cmd.coords.y,
        width: textWidth,
        fontSize: cmd.fontSize ?? 20,
        fontWeight: cmd.fontWeight ?? "normal",
        fill: cmd.color ?? "#111827",
        selectable: false,
        evented: false,
        fontFamily: "sans-serif",
        originX: "center",
        originY: "top",
        textAlign: "center",
        splitByGrapheme: false,
      });
      addObjectWithId(canvas, textbox);
      break;
    }

    case "highlight": {
      const obj = findObjectById(canvas, cmd.target_id);
      if (!obj) {
        console.warn(`[commandExecutor] highlight: object "${cmd.target_id}" not found`);
        return;
      }

      if (cmd.effect === "pulse") {
        pulseObject(obj, canvas, fabric);
      } else if (cmd.effect === "glow") {
        glowObject(obj, canvas);
      } else if (cmd.effect === "shake") {
        shakeObject(obj, canvas, fabric);
      }
      break;
    }

    case "image": {
      await new Promise<void>((resolve) => {
        fabric.FabricImage.fromURL(
          cmd.url,
          { crossOrigin: "anonymous" }
        ).then((img) => {
          const maxW = cmd.width ?? 200;
          const scale = maxW / (img.width ?? maxW);
          img.set({
            left: cmd.coords.x,
            top: cmd.coords.y,
            scaleX: scale,
            scaleY: scale,
            selectable: false,
            evented: false,
            originX: "center",
            originY: "center",
          });
          addObjectWithId(canvas, img);
          resolve();
        }).catch(() => resolve());
      });
      break;
    }
  }
}

// ── Animation helpers ─────────────────────────────────────────────────────────

function pulseObject(
  obj: ReturnType<typeof findObjectById>,
  canvas: FabricCanvas,
  fabric: FabricModule
): void {
  if (!obj) return;
  const originalScaleX = obj.scaleX ?? 1;
  const originalScaleY = obj.scaleY ?? 1;

  fabric.util.animate({
    startValue: 1,
    endValue: 1.18,
    duration: 350,
    easing: fabric.util.ease.easeInOutQuad,
    onChange(v: number) {
      obj.set({ scaleX: originalScaleX * v, scaleY: originalScaleY * v });
      canvas.renderAll();
    },
    onComplete() {
      fabric.util.animate({
        startValue: 1.18,
        endValue: 1,
        duration: 350,
        easing: fabric.util.ease.easeInOutQuad,
        onChange(v: number) {
          obj.set({ scaleX: originalScaleX * v, scaleY: originalScaleY * v });
          canvas.renderAll();
        },
        onComplete() {
          // Second pulse
          fabric.util.animate({
            startValue: 1,
            endValue: 1.12,
            duration: 250,
            easing: fabric.util.ease.easeInOutQuad,
            onChange(v: number) {
              obj.set({ scaleX: originalScaleX * v, scaleY: originalScaleY * v });
              canvas.renderAll();
            },
            onComplete() {
              fabric.util.animate({
                startValue: 1.12,
                endValue: 1,
                duration: 250,
                easing: fabric.util.ease.easeInOutQuad,
                onChange(v: number) {
                  obj.set({ scaleX: originalScaleX * v, scaleY: originalScaleY * v });
                  canvas.renderAll();
                },
              });
            },
          });
        },
      });
    },
  });
}

function glowObject(
  obj: ReturnType<typeof findObjectById>,
  canvas: FabricCanvas
): void {
  if (!obj) return;
  const originalStroke = obj.stroke;
  const originalStrokeWidth = obj.strokeWidth ?? 2;

  // Flash stroke to yellow 3 times
  let count = 0;
  const flash = () => {
    if (count >= 6) {
      obj.set({ stroke: originalStroke, strokeWidth: originalStrokeWidth });
      canvas.renderAll();
      return;
    }
    obj.set({
      stroke: count % 2 === 0 ? "#facc15" : originalStroke,
      strokeWidth: count % 2 === 0 ? originalStrokeWidth + 3 : originalStrokeWidth,
    });
    canvas.renderAll();
    count++;
    setTimeout(flash, 250);
  };
  flash();
}

function shakeObject(
  obj: ReturnType<typeof findObjectById>,
  canvas: FabricCanvas,
  fabric: FabricModule
): void {
  if (!obj) return;
  const originalLeft = obj.left ?? 0;
  const offsets = [8, -8, 6, -6, 4, -4, 2, -2, 0];
  let i = 0;

  const step = () => {
    if (i >= offsets.length) return;
    fabric.util.animate({
      startValue: obj.left ?? originalLeft,
      endValue: originalLeft + offsets[i],
      duration: 60,
      onChange(v: number) {
        obj.set({ left: v });
        canvas.renderAll();
      },
      onComplete() {
        i++;
        step();
      },
    });
  };
  step();
}
