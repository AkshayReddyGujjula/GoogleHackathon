# AI Tutor Whiteboard

An interactive, voice-enabled teaching app built with Next.js, React, Fabric.js, and Gemini.

The app simulates a live classroom experience where "Prof. Alex" teaches on a digital whiteboard, asks questions, and waits for the student to draw answers directly on the canvas.

## What This Project Does

AI Tutor Whiteboard provides a guided learning session with an AI teacher that can:

- deliver lesson content in spoken form
- draw diagrams and annotations on a shared whiteboard
- ask comprehension questions in a dedicated question area
- evaluate student work from a canvas snapshot
- support voice interruptions for quick student questions
- progress through subtopics while keeping visual history snapshots

## Core Features

- Structured lesson setup flow
	- Student chooses education level, subject, and topic before starting.
- Co-present whiteboard teaching
	- AI sends drawing commands that are rendered with Fabric.js.
- Turn-based interaction model
	- `AI_TURN`: board is locked while Prof. Alex presents.
	- `STUDENT_TURN`: board unlocks for student freehand drawing.
- Voice output with rolling subtitles
	- Speech synthesis reads lessons aloud.
	- Subtitle strip updates word-by-word during playback.
- Pause and resume speech
	- Keeps speech position and voice consistent.
- Push-to-talk interruption
	- Student can interrupt and ask a spoken question at any point.
	- Interrupt requests include current canvas image for context.
- Auto-generated visual aids
	- Optional image prompt flow generates right-side educational visuals.
- Canvas history sidebar
	- Completed subtopic snapshots are stored and previewable.
- Student tools
	- Undo last stroke.
	- Submit answer for AI evaluation.

## Tech Stack

- Framework: Next.js 16 (App Router)
- UI: React 19 + Tailwind CSS 4
- Whiteboard: Fabric.js
- AI model API: `@google/generative-ai` (Gemini)
- Speech:
	- Text-to-Speech: Web Speech API (`speechSynthesis`)
	- Speech-to-Text: Web Speech Recognition API (`webkitSpeechRecognition` / `SpeechRecognition`)
- Utilities: `uuid` for canvas object IDs

## Project Structure

```text
app/
	api/
		tutor/
			route.ts                 # Main lesson turn endpoint
			interrupt/
				route.ts               # Voice-interrupt endpoint
	whiteboard/
		page.tsx                   # Main teaching UI and turn orchestration
	globals.css
	layout.tsx
	page.tsx                     # Lesson setup (education level/subject/topic)

components/
	WhiteboardCanvas.tsx         # Fabric canvas wrapper + imperative API

lib/
	canvasUtils.ts               # Canvas locking, IDs, export helpers
	commandExecutor.ts           # Executes AI canvas commands
	tutorTypes.ts                # Shared JSON protocol types
	voiceUtils.ts                # TTS/STT helpers
```

## How The Flow Works

1. Student selects level, subject, and topic on the setup page.
2. App navigates to `/whiteboard` with query parameters.
3. Whiteboard page calls `POST /api/tutor` for the first teaching turn.
4. AI returns JSON with:
	 - `speech`
	 - `canvas_commands`
	 - optional `image_prompt`
	 - `status`
5. Client renders commands on canvas and speaks the lesson.
6. If status is `CONTINUE`, student writes answer and submits.
7. Client sends canvas snapshot (base64 PNG) back to `POST /api/tutor`.
8. AI evaluates student work and either:
	 - continues the same subtopic (`CONTINUE`), or
	 - ends current subtopic (`SUBTOPIC_COMPLETE`) and moves to next.
9. If the student interrupts by voice, app calls `POST /api/tutor/interrupt` with transcript + current canvas image.

## AI JSON Contract

Shared response type (`lib/tutorTypes.ts`):

```ts
interface TutorResponse {
	speech: string;
	canvas_commands: CanvasAction[];
	image_prompt: string | null;
	status: "CONTINUE" | "SUBTOPIC_COMPLETE";
}
```

Supported canvas command categories:

- `draw` (`circle`, `rect`, `line`, `triangle`)
- `text`
- `highlight` (`pulse`, `glow`, `shake`)
- `image`

## Environment Variables

Create a `.env.local` file in the project root:

```bash
GOOGLE_AI_API_KEY=your_google_ai_api_key_here
```

Without this key, `/api/tutor` and `/api/tutor/interrupt` will fail.

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Set environment variables

Add `GOOGLE_AI_API_KEY` to `.env.local`.

### 3. Run development server

```bash
npm run dev
```

Open the app at:

`http://localhost:3000`

## Available Scripts

- `npm run dev` - start development server
- `npm run build` - create production build
- `npm run start` - run production build
- `npm run lint` - run linting

## Browser Notes

- Speech synthesis and recognition support varies by browser and OS.
- Chrome/Edge generally provide the best Web Speech API compatibility.
- Microphone permissions must be allowed for push-to-talk questions.
- If no STT engine is available in the browser, interrupt capture may not work.

## License

Currently marked as `ISC` in `package.json`.

If you plan to open-source this broadly, consider adding a dedicated `LICENSE` file.