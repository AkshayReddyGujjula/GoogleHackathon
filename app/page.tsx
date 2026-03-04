"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const EDUCATION_LEVELS = [
  "Elementary School (K-5)",
  "Middle School (6-8)",
  "High School (9-12)",
  "Undergraduate",
  "Graduate",
];

const SUBJECTS: Record<string, string[]> = {
  "Elementary School (K-5)": ["Math", "Reading", "Science", "Social Studies"],
  "Middle School (6-8)": ["Algebra", "Biology", "History", "English Literature"],
  "High School (9-12)": ["Calculus", "Chemistry", "Physics", "World History", "Economics"],
  "Undergraduate": ["Linear Algebra", "Statistics", "Computer Science", "Economics", "Philosophy"],
  "Graduate": ["Machine Learning", "Quantum Mechanics", "Advanced Algorithms", "Research Methods"],
};

const TOPICS: Record<string, string[]> = {
  "Math": ["Addition & Subtraction", "Multiplication Tables", "Fractions", "Geometry Basics"],
  "Reading": ["Phonics", "Reading Comprehension", "Vocabulary"],
  "Science": ["Plants & Animals", "Weather", "Solar System"],
  "Social Studies": ["Maps & Geography", "Community Helpers", "US States"],
  "Algebra": ["Linear Equations", "Inequalities", "Quadratic Equations", "Systems of Equations"],
  "Biology": ["Cell Structure", "Photosynthesis", "Genetics", "Ecosystems"],
  "History": ["Ancient Civilizations", "American Revolution", "World War II"],
  "English Literature": ["Poetry Analysis", "Short Stories", "Shakespeare"],
  "Calculus": ["Limits", "Derivatives", "Integrals", "Fundamental Theorem"],
  "Chemistry": ["Atomic Structure", "Periodic Table", "Chemical Bonds", "Stoichiometry"],
  "Physics": ["Kinematics", "Newton's Laws", "Thermodynamics", "Electromagnetism"],
  "World History": ["Renaissance", "Industrial Revolution", "Cold War"],
  "Economics": ["Supply & Demand", "Market Structures", "Macroeconomics"],
  "Linear Algebra": ["Vectors & Matrices", "Eigenvalues", "Linear Transformations"],
  "Statistics": ["Probability", "Hypothesis Testing", "Regression Analysis"],
  "Computer Science": ["Data Structures", "Algorithms", "Operating Systems"],
  "Philosophy": ["Ethics", "Logic", "Epistemology"],
  "Machine Learning": ["Supervised Learning", "Neural Networks", "Reinforcement Learning"],
  "Quantum Mechanics": ["Wave Functions", "Schrödinger Equation", "Quantum Entanglement"],
  "Advanced Algorithms": ["Graph Algorithms", "Dynamic Programming", "NP-Completeness"],
  "Research Methods": ["Experimental Design", "Statistical Analysis", "Academic Writing"],
};

export default function SetupPage() {
  const router = useRouter();
  const [educationLevel, setEducationLevel] = useState("");
  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");

  const availableSubjects = educationLevel ? SUBJECTS[educationLevel] ?? [] : [];
  const availableTopics = subject ? TOPICS[subject] ?? [] : [];

  const handleStart = (e: React.FormEvent) => {
    e.preventDefault();
    if (!educationLevel || !subject || !topic) return;

    const params = new URLSearchParams({ educationLevel, subject, topic });
    router.push(`/whiteboard?${params.toString()}`);
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-violet-50 to-indigo-100">
      <div className="bg-white rounded-2xl shadow-xl p-10 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-4xl mb-3">🎓</div>
          <h1 className="text-3xl font-bold text-gray-900">AI Tutor Whiteboard</h1>
          <p className="text-gray-500 mt-2 text-sm">
            Your personal co-present AI teacher — pick a topic and let&apos;s learn!
          </p>
        </div>

        <form onSubmit={handleStart} className="space-y-5">
          {/* Education Level */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Education Level
            </label>
            <select
              value={educationLevel}
              onChange={(e) => {
                setEducationLevel(e.target.value);
                setSubject("");
                setTopic("");
              }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-violet-500"
              required
            >
              <option value="">Select level...</option>
              {EDUCATION_LEVELS.map((lvl) => (
                <option key={lvl} value={lvl}>{lvl}</option>
              ))}
            </select>
          </div>

          {/* Subject */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
            <select
              value={subject}
              onChange={(e) => {
                setSubject(e.target.value);
                setTopic("");
              }}
              disabled={!educationLevel}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-50"
              required
            >
              <option value="">Select subject...</option>
              {availableSubjects.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Topic */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Topic</label>
            <select
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              disabled={!subject}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-50"
              required
            >
              <option value="">Select topic...</option>
              {availableTopics.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            disabled={!educationLevel || !subject || !topic}
            className="w-full bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg transition-colors"
          >
            Start Lesson →
          </button>
        </form>
      </div>
    </main>
  );
}
