// src/human-types.ts — Domain-specific types for human psychology models

// ─── Situation: What goes INTO the model ─────────────────────────────

export interface Context {
  environment: string;
  socialSetting: string;
  culturalNorms?: string;
  timeConstraint?: string;
}

export interface Person {
  traits: Record<string, number>;
  needs: string[];
  beliefs: string[];
  emotionalState: string;
  arousal: number;
  history?: string[];
}

export interface Stimulus {
  type: "information" | "event" | "social" | "internal" | "choice";
  description: string;
  intensity: number;
  novelty: number;
  personalRelevance: number;
}

export interface Situation {
  context: Context;
  person: Person;
  stimulus: Stimulus;
}

// ─── Response: What comes OUT of the model ───────────────────────────

export interface RootCause {
  type: "evolutionary" | "learned" | "structural" | "cultural" | "developmental";
  mechanism: string;
  explanation: string;
}

export interface ProcessStep {
  primitive: string;
  input: string;
  transformation: string;
  output: string;
}

export interface Process {
  activatedPrimitives: string[];
  chain: ProcessStep[];
}

export interface Effect {
  emotionChange: string;
  arousalChange: number;
  beliefChange?: string;
  attentionShift?: string;
}

export interface Result {
  behavior: string;
  decision?: string;
  expression?: string;
  verbalization?: string;
}

export interface Response {
  rootCause: RootCause;
  process: Process;
  effect: Effect;
  result: Result;
  confidence: number;
}

// ─── Model Primitives ────────────────────────────────────────────────

export interface Primitive {
  id: string;
  domain: string;
  description: string;
  triggers: string[];
  transformation: string;
  relatesTo: string[];
  relationDescription: string;
}

// ─── Model Interface ─────────────────────────────────────────────────

export interface HumanModel {
  id: string;
  version: number;
  name: string;
  description: string;
  primitives: Primitive[];
  predict: (situation: Situation) => Response;
  explain: (situation: Situation) => Response & { reasoning: string };
}

// ─── Benchmarks ──────────────────────────────────────────────────────

export type BenchmarkDomain =
  | "cognitive-bias"
  | "emotion"
  | "social"
  | "decision"
  | "development"
  | "personality"
  | "psychopathology"
  | "motivation";

export interface HumanBenchmark {
  id: string;
  domain: BenchmarkDomain;
  name: string;
  description: string;
  situation: Situation;
  expected: ExpectedResponse;
  sources: string[];
  difficulty: 1 | 2 | 3 | 4 | 5;
  tags: string[];
}

export interface ExpectedResponse {
  rootCauseType?: RootCause["type"];
  rootCauseMechanism?: string;
  keyProcess?: string[];
  emotionChange?: string;
  arousalDirection?: "up" | "down" | "stable";
  behavior?: string;
  decision?: string;
  mustInclude?: string[];
  mustNotInclude?: string[];
}
