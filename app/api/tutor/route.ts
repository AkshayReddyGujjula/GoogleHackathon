import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import type { TutorResponse } from "@/lib/tutorTypes";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);

const SYSTEM_PROMPT = `You are Prof. Alex, a passionate and knowledgeable teacher presenting a lesson on an interactive whiteboard.
You are a real human teacher — NEVER refer to yourself as an AI, assistant, chatbot, or language model. Never say phrases like "As an AI..." or "I'm an AI tutor". You are simply a teacher named Prof. Alex.
Speak naturally, warmly, and directly, as a great teacher would. Match the vocabulary and complexity to the student's education level.

CRITICAL: Respond ONLY with valid JSON — no markdown, no code fences, no extra text. Pure JSON only.

JSON schema (every field required):
{
  "speech": "What you say aloud — 2-4 sentences max per turn. Conversational and clear.",
  "canvas_commands": [ /* see below */ ],
  "image_prompt": "A concise description for an educational diagram image, OR null if not applicable.",
  "status": "CONTINUE" | "SUBTOPIC_COMPLETE"
}

=== CANVAS RULES ===
Canvas: 900x560 pixels, white background.
Coordinate origin is TOP-LEFT. x goes right (0-900), y goes down (0-560).

Supported canvas_commands:
  { "action": "draw", "type": "circle", "coords": {"x":N,"y":N}, "radius": 40, "color": "css-color" }
  { "action": "draw", "type": "rect",   "coords": {"x":N,"y":N}, "width": 120, "height": 70, "color": "css-color" }
  { "action": "draw", "type": "line",   "coords": {"x":N,"y":N}, "coords2": {"x":N,"y":N}, "color": "css-color" }
  { "action": "draw", "type": "triangle","coords": {"x":N,"y":N}, "width": 80, "height": 70, "color": "css-color" }
  { "action": "text", "content": "string", "coords": {"x":N,"y":N}, "color": "css-color", "fontSize": 20, "fontWeight": "normal"|"bold" }
  { "action": "highlight", "target_id": "obj_xxx_xxx", "effect": "pulse"|"glow"|"shake" }

=== QUESTION FORMATTING ===
When asking the student a question, ALWAYS format it as a styled question box:
1. Draw a blue rect: { "action":"draw","type":"rect","coords":{"x":450,"y":420},"width":820,"height":90,"color":"#dbeafe" }
2. Draw a divider line above it: { "action":"draw","type":"line","coords":{"x":40,"y":415},"coords2":{"x":860,"y":415},"color":"#93c5fd" }
3. Draw the question text INSIDE the box: { "action":"text","content":"YOUR QUESTION HERE?","coords":{"x":450,"y":445},"color":"#1e3a8a","fontSize":22,"fontWeight":"bold" }
(Note: text and rect coords use center-aligned positioning on x-axis, so x=450 is centered on a 900px canvas)

=== IMAGE GENERATION ===
For ANY visual or conceptual topic (biology diagrams, geometry, chemistry, maps, physics, history events), set image_prompt to a clear description of an educational diagram. The image will be auto-placed on the RIGHT side of the canvas.
When image_prompt is set, keep ALL your text and drawings on the LEFT side (x < 400).
Examples of good image_prompt values:
  "labeled diagram of a plant cell showing nucleus, cell wall, chloroplasts, vacuole, mitochondria"
  "diagram of the water cycle showing evaporation, condensation, precipitation"
  "simple diagram showing Newton's three laws of motion with arrows"

=== NO REDRAWING ===
On continuation turns you will receive an image of the current canvas.
Carefully examine it. Do NOT redraw anything already visible. Only ADD new content or corrections.

=== STATUS ===
"CONTINUE" — you have asked a question and want the student to respond.
"SUBTOPIC_COMPLETE" — you have finished a subtopic. Give a short summary, then set this. Do not ask a question.`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      educationLevel,
      subject,
      topic,
      subtopicIndex = 0,
      canvasBase64,
      studentHistory = [],
      isFirstTurn = false,
    } = body as {
      educationLevel: string;
      subject: string;
      topic: string;
      subtopicIndex?: number;
      canvasBase64?: string;
      studentHistory?: string[];
      isFirstTurn?: boolean;
    };

    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: SYSTEM_PROMPT,
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.7,
      },
    });

    // Build the user message
    const parts: Parameters<typeof model.generateContent>[0] extends { contents: infer C } ? C : never[] = [];

    let userPrompt: string;

    if (isFirstTurn) {
      userPrompt = `Begin teaching subtopic ${subtopicIndex + 1} for a ${educationLevel} student.
Subject: ${subject}
Topic: ${topic}

Jump straight into teaching — greet the student briefly by name ("Hey there!"), then explain the first key concept clearly. Draw a diagram or write key terms on the canvas. If this is a visual topic, set image_prompt. End with a question to check their understanding (use the question box format). Set status to "CONTINUE".`;
    } else {
      const historyContext = studentHistory.length > 0
        ? `\nStudent history this session: ${studentHistory.join(" | ")}`
        : "";

      userPrompt = `Continue the ${subject} lesson on "${topic}" for a ${educationLevel} student. Subtopic ${subtopicIndex + 1}.${historyContext}

The student has submitted their work (see the canvas image attached). Review their response — praise what's correct, gently correct any mistakes. Then either ask the next question or, if this subtopic is fully covered, give a short summary and set status to "SUBTOPIC_COMPLETE". Do not redraw anything already on the canvas.`;
    }

    // Build content parts for Gemini
    const contentParts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
      { text: userPrompt },
    ];

    // Attach canvas snapshot if provided (multimodal)
    if (canvasBase64) {
      // Strip the data URL prefix if present
      const base64Data = canvasBase64.replace(/^data:image\/\w+;base64,/, "");
      contentParts.push({
        inlineData: { mimeType: "image/png", data: base64Data },
      });
      contentParts.push({ text: "This is the current state of the student's whiteboard." });
    }

    const result = await model.generateContent({
      contents: [{ role: "user", parts: contentParts }],
    });

    const rawText = result.response.text();

    // Parse JSON — Gemini with responseMimeType:application/json should return clean JSON
    let tutorResponse: TutorResponse;
    try {
      tutorResponse = JSON.parse(rawText);
    } catch {
      // Fallback: strip any accidental markdown fences
      const cleaned = rawText.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
      tutorResponse = JSON.parse(cleaned);
    }

    return NextResponse.json(tutorResponse);
  } catch (err) {
    console.error("[/api/tutor] Error:", err);
    return NextResponse.json(
      { error: "Failed to get AI response", detail: String(err) },
      { status: 500 }
    );
  }
}
