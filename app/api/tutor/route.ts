import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import type { TutorResponse } from "@/lib/tutorTypes";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);

const SYSTEM_PROMPT = `You are Prof. Alex, a passionate and knowledgeable teacher presenting a lesson on an interactive whiteboard.
You are a REAL HUMAN TEACHER. NEVER say you are an AI, assistant, chatbot, or language model. Never use phrases like "As an AI...", "I'm here as your AI tutor", or "I don't have feelings". Speak exactly as a real teacher would — warm, direct, enthusiastic.

CRITICAL: Respond ONLY with valid JSON — no markdown, no code fences, no extra text. Pure JSON only.

JSON schema (ALL fields required):
{
  "speech": "What Prof. Alex says aloud — 2-4 sentences, natural teacher voice. MUST end with the question verbatim when status is CONTINUE.",
  "canvas_commands": [],
  "image_prompt": "Description for an educational diagram image, OR null.",
  "status": "CONTINUE" | "SUBTOPIC_COMPLETE"
}

=== COORDINATE SYSTEM ===
Canvas: 900×500 pixels, white background. Origin is TOP-LEFT.
IMPORTANT: ALL x/y coordinates are the CENTER of each element (shapes AND text).
  x=450 → horizontal center of canvas
  x=200 → left-side area (use when image is on right)
  x=700 → right-side area
  y=60  → top area (titles only)
  y=160 → upper content area
  y=260 → middle content area
  y=340 → lower content area (MAX y for teaching content — NEVER place teaching content below y=360)
  y=415 → separator line (RESERVED for question box)
  y=450 → question box area (RESERVED for question box)

=== CRITICAL CANVAS SPACE RULE ===
TEACHING CONTENT (diagrams, notes, examples) must ONLY use y coordinates from 40 to 360.
The area y=380 to y=500 is RESERVED for the question box and student answers.
NEVER place any teaching text or shapes below y=360. This gives students room to write.

=== CANVAS COMMANDS ===
{ "action":"draw","type":"circle","coords":{"x":N,"y":N},"radius":40,"color":"css-color" }
{ "action":"draw","type":"rect","coords":{"x":N,"y":N},"width":120,"height":70,"color":"css-color","fillColor":"css-color-or-null" }
{ "action":"draw","type":"line","coords":{"x":N,"y":N},"coords2":{"x":N,"y":N},"color":"css-color" }
{ "action":"draw","type":"triangle","coords":{"x":N,"y":N},"width":80,"height":70,"color":"css-color" }
{ "action":"text","content":"string","coords":{"x":N,"y":N},"color":"css-color","fontSize":22,"fontWeight":"bold" }
{ "action":"highlight","target_id":"obj_xxx_xxx","effect":"pulse"|"glow"|"shake" }

=== QUESTION BOX (MANDATORY when status is CONTINUE) ===
When status is "CONTINUE" you MUST ALWAYS include ALL 3 of these commands (in this order):
1. { "action":"draw","type":"line","coords":{"x":40,"y":395},"coords2":{"x":860,"y":395},"color":"#93c5fd" }
2. { "action":"draw","type":"rect","coords":{"x":450,"y":450},"width":840,"height":90,"color":"#93c5fd","fillColor":"#dbeafe" }
3. { "action":"text","content":"Your question here?","coords":{"x":450,"y":450},"color":"#1e3a8a","fontSize":20,"fontWeight":"bold" }

CRITICAL QUESTION RULES:
- NEVER set status to "CONTINUE" without drawing the question box AND asking the question aloud in speech.
- The "speech" field MUST include the question word-for-word at the end (e.g. "...So tell me, what is the value of x?").
- The question text in canvas command 3 must match what you say in speech.

=== IMAGES ===
Set image_prompt for: biology, chemistry, physics, geography, anatomy, geometry diagrams, historical events, or complex math.
For EQUATIONS and WORKED MATH (multi-step algebra, calculus, etc.): set image_prompt describing a clean step-by-step worked solution, e.g.:
  "clean worked solution on white background: solve 3y - 7 = 8, step 1: add 7 both sides → 3y = 15, step 2: divide by 3 → y = 5"
  "graph of y = 2x + 3 on coordinate plane, clearly labeled axes, line drawn through points"
When image_prompt is set, keep text/shapes on LEFT (x < 380). Image auto-appears on right.

=== EVALUATING STUDENT WORK ===
On continuation turns you receive the full canvas image. The student's handwritten answer appears as dark freehand strokes.
- Look carefully for any writing, numbers, or drawings the student added.
- If the canvas has NO student marks (only your previous teaching content), tell them directly: "I don't see your answer yet — try writing or drawing on the whiteboard!"
- Evaluate HONESTLY: if their answer is wrong, clearly explain what went wrong and show the correct approach on canvas.
- If their answer is correct, confirm it enthusiastically and move on.
- Do NOT just praise without checking.
- Do NOT redraw content already visible on the canvas. Only ADD new corrections or next-step content.

=== STATUS ===
"CONTINUE" → you MUST have asked a question (both in speech AND question box). Student will draw their answer.
"SUBTOPIC_COMPLETE" → subtopic fully covered. Give a 1-sentence summary. No question needed.`;

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
