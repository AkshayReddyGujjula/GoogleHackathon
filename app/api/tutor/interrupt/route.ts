import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import type { TutorResponse } from "@/lib/tutorTypes";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);

const INTERRUPT_SYSTEM_PROMPT = `You are Prof. Alex, a passionate human teacher. A student has interrupted to ask a question.
NEVER refer to yourself as an AI, assistant, or bot. You are a real teacher.

Respond directly and helpfully to their question. Look at the whiteboard image to understand context. You may add a quick clarifying drawing or highlight an existing object (use highlight action with its target_id).

CRITICAL: Respond ONLY with valid JSON — no markdown, no code fences.

Schema:
{
  "speech": "2-3 sentence response to the student's question — warm, clear, direct",
  "canvas_commands": [],
  "image_prompt": null,
  "status": "CONTINUE"
}

Status is always "CONTINUE". Be brief — the student just has a quick question.`;

export async function POST(req: NextRequest) {
  try {
    const { transcribedText, canvasBase64 } = await req.json() as {
      transcribedText: string;
      canvasBase64?: string;
    };

    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: INTERRUPT_SYSTEM_PROMPT,
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.5,
      },
    });

    const contentParts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
      { text: `Student's question: "${transcribedText}"` },
    ];

    if (canvasBase64) {
      const base64Data = canvasBase64.replace(/^data:image\/\w+;base64,/, "");
      contentParts.push({ inlineData: { mimeType: "image/png", data: base64Data } });
      contentParts.push({ text: "This is what is currently on the whiteboard." });
    }

    const result = await model.generateContent({
      contents: [{ role: "user", parts: contentParts }],
    });

    const rawText = result.response.text();

    let tutorResponse: TutorResponse;
    try {
      tutorResponse = JSON.parse(rawText);
    } catch {
      const cleaned = rawText.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
      tutorResponse = JSON.parse(cleaned);
    }

    return NextResponse.json(tutorResponse);
  } catch (err) {
    console.error("[/api/tutor/interrupt] Error:", err);
    return NextResponse.json(
      { error: "Interrupt failed", detail: String(err) },
      { status: 500 }
    );
  }
}
