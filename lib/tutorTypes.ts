/**
 * Shared types for the AI tutor JSON protocol.
 * The AI always responds in this schema — both the main route and interrupt route.
 */

export type CanvasAction =
  | DrawCommand
  | TextCommand
  | HighlightCommand
  | ImageCommand;

export interface DrawCommand {
  action: "draw";
  type: "circle" | "rect" | "line" | "triangle";
  coords: { x: number; y: number };
  /** Optional second point for lines */
  coords2?: { x: number; y: number };
  color?: string;
  radius?: number;
  width?: number;
  height?: number;
  label?: string;
}

export interface TextCommand {
  action: "text";
  content: string;
  coords: { x: number; y: number };
  color?: string;
  fontSize?: number;
  fontWeight?: "normal" | "bold";
}

export interface HighlightCommand {
  action: "highlight";
  target_id: string;
  effect: "pulse" | "glow" | "shake";
}

export interface ImageCommand {
  action: "image";
  url: string;
  coords: { x: number; y: number };
  width?: number;
}

export interface TutorResponse {
  speech: string;
  canvas_commands: CanvasAction[];
  image_prompt: string | null;
  status: "CONTINUE" | "SUBTOPIC_COMPLETE";
}
