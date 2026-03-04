import { v4 as uuidv4 } from "uuid";
import type { Canvas, Object as FabricObject } from "fabric";

/**
 * Generates a unique, human-readable ID for a canvas object.
 * Format: obj_<timestamp>_<8-char uuid fragment>
 * This allows the AI to reference objects by ID in subsequent commands.
 */
export function generateObjectId(): string {
  return `obj_${Date.now()}_${uuidv4().slice(0, 8)}`;
}

/**
 * Assigns a unique ID to a Fabric.js object and adds it to the canvas.
 * Every object placed on the canvas MUST go through this function
 * so the AI can later reference it via highlight/modify commands.
 */
export function addObjectWithId(
  canvas: Canvas,
  fabricObj: FabricObject,
  customId?: string
): FabricObject {
  const id = customId ?? generateObjectId();
  // Fabric.js allows arbitrary custom properties via set()
  (fabricObj as FabricObject & { id: string }).id = id;
  canvas.add(fabricObj);
  return fabricObj;
}

/**
 * Finds a canvas object by its custom `id` property.
 * Returns null if not found — callers must handle this gracefully.
 */
export function findObjectById(
  canvas: Canvas,
  id: string
): (FabricObject & { id: string }) | null {
  const objects = canvas.getObjects() as (FabricObject & { id: string })[];
  return objects.find((obj) => obj.id === id) ?? null;
}

/**
 * Exports the current canvas state as a Base64-encoded PNG data URL.
 * Used for: sending canvas snapshots to the AI, saving subtopic history.
 */
export function canvasToBase64(canvas: Canvas): string {
  return canvas.toDataURL({ format: "png", multiplier: 1 });
}

/**
 * Locks the canvas for the AI's turn:
 * - Disables free drawing
 * - Makes all objects non-selectable and non-interactive
 */
export function lockCanvas(canvas: Canvas): void {
  canvas.isDrawingMode = false;
  canvas.selection = false;
  canvas.getObjects().forEach((obj) => {
    obj.selectable = false;
    obj.evented = false;
  });
  canvas.renderAll();
}

/**
 * Unlocks the canvas for the student's turn:
 * - Enables freehand pencil drawing
 * - Configures brush width and color
 */
export function unlockCanvas(canvas: Canvas): void {
  canvas.isDrawingMode = true;
  canvas.selection = false; // keep object selection disabled; student only draws
  if (canvas.freeDrawingBrush) {
    canvas.freeDrawingBrush.width = 3;
    (canvas.freeDrawingBrush as { color: string }).color = "#1e293b";
  }
  canvas.renderAll();
}
