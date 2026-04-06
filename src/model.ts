// src/model.ts — The Human Model
//
// This file IS the model. It will be evolved by the orchestrator.
// Start near-empty. Let structure emerge.
//
// The model is a function: situation → response
// How it works internally is up to evolution.

import type { HumanBenchmark } from "./human-types.ts";

// ─── The Model ───────────────────────────────────────────────────────

export interface Situation {
  context: { environment: string; socialSetting: string; timeConstraint?: string };
  person: { traits: Record<string, number>; needs: string[]; beliefs: string[]; emotionalState: string; arousal: number; history?: string[] };
  stimulus: { type: string; description: string; intensity: number; novelty: number; personalRelevance: number };
}

export interface Response {
  rootCause: string;
  process: string;
  emotion: string;
  behavior: string;
  confidence: number;
}

// ─── Active Inference (Free Energy Minimization) ─────────────────────
// Each need has a prior: expected relevance and precision (inverse variance).
// Prediction error (PE) = |observation - expected| scaled by precision.
// Free energy F = PE² · precision. The mind minimizes F.
// Emotion and behavior emerge from which need has highest F.

const NEED_PRIORS: Record<string, { expected: number; precision: number }> = {
  safety:        { expected: 0.2, precision: 3.0 },
  belonging:     { expected: 0.5, precision: 2.0 },
  esteem:        { expected: 0.5, precision: 2.0 },
  autonomy:      { expected: 0.5, precision: 1.5 },
  achievement:   { expected: 0.4, precision: 1.5 },
  fairness:      { expected: 0.3, precision: 2.5 },
  understanding: { expected: 0.4, precision: 1.0 },
  pleasure:      { expected: 0.3, precision: 1.0 },
};

const THREAT_STIMULI = new Set(["threat", "loss", "rejection", "failure", "danger", "conflict", "criticism"]);
const GAIN_STIMULI   = new Set(["reward", "success", "praise", "opportunity", "connection", "discovery", "achievement"]);

export function predict(situation: Situation): Response {
  const { person, stimulus } = situation;
  const obs = stimulus.personalRelevance; // 0–1 observation
  const arousal = person.arousal ?? 0.5;   // precision multiplier

  // Build priors from person's needs (fall back to generic prior)
  let maxF = -1;
  let dominantNeed = "unknown";

  const activeNeeds = person.needs.length > 0 ? person.needs : Object.keys(NEED_PRIORS);

  for (const need of activeNeeds) {
    const key = need.toLowerCase().replace(/\s+/g, "-");
    const prior = NEED_PRIORS[key] ?? { expected: 0.4, precision: 1.0 };
    const scaledPrecision = prior.precision * (0.5 + arousal);
    const pe = Math.abs(obs - prior.expected);
    const F = pe * pe * scaledPrecision;
    if (F > maxF) { maxF = F; dominantNeed = need; }
  }

  const pe = Math.sqrt(maxF / Math.max((0.5 + arousal), 0.001));
  const isThreat = THREAT_STIMULI.has(stimulus.type.toLowerCase()) || obs < 0.3;
  const isGain   = GAIN_STIMULI.has(stimulus.type.toLowerCase())   || obs > 0.7;
  const PE_THRESHOLD = 0.25;

  // Emotion
  let emotion: string;
  if (pe > PE_THRESHOLD) {
    if (isThreat)       emotion = arousal > 0.6 ? "fear" : "anxiety";
    else if (isGain)    emotion = stimulus.novelty > 0.6 ? "surprise" : "joy";
    else                emotion = "tension";
  } else {
    emotion = "calm";
  }

  // Behavior: minimize free energy
  let behavior: string;
  if (pe > PE_THRESHOLD) {
    if (isThreat && arousal > 0.7)      behavior = "flee";
    else if (isThreat && arousal > 0.4) behavior = "freeze";
    else if (isThreat)                  behavior = "appease";
    else if (isGain)                    behavior = "approach";
    else                                behavior = "seek-information";
  } else {
    behavior = "continue";
  }

  const confidence = Math.min(0.9, 0.4 + pe * 1.2);

  return {
    rootCause: `${dominantNeed} need — prediction error ${pe.toFixed(2)}`,
    process: `active-inference: F=${maxF.toFixed(3)}, PE=${pe.toFixed(2)}, arousal=${arousal}`,
    emotion,
    behavior,
    confidence,
  };
}

// ─── Semantic Scoring ────────────────────────────────────────────────
// Score a single benchmark response against expected fields.
// emotionMatch: +1 if response.emotion appears in emotionChange or vice versa
// behaviorMatch: +1 if response.behavior overlaps with expected.behavior
// mustIncludeHit: +1 if any mustInclude term found in combined output text
// mustNotIncludePenalty: -1 if any mustNotInclude term found in combined output
// Normalize by maxPossible (count of positive dimensions with criteria defined).

import type { ExpectedResponse } from "./human-types.ts";

function scoreBenchmark(response: Response, expected: ExpectedResponse): number {
  const combined = `${response.emotion} ${response.behavior} ${response.rootCause} ${response.process}`.toLowerCase();
  let score = 0;
  let maxScore = 0;

  if (expected.emotionChange !== undefined) {
    maxScore += 1;
    const exp = expected.emotionChange.toLowerCase();
    const got = response.emotion.toLowerCase();
    if (exp.includes(got) || got.includes(exp) || combined.includes(exp)) score += 1;
  }

  if (expected.behavior !== undefined) {
    maxScore += 1;
    const expB = expected.behavior.toLowerCase();
    const gotB = response.behavior.toLowerCase();
    // token overlap: any word >3 chars from expected appears in response behavior, or vice versa
    const expTokens = expB.split(/\W+/).filter((w) => w.length > 3);
    if (gotB.split(/\W+/).some((w) => w.length > 3 && expB.includes(w)) ||
        expTokens.some((w) => gotB.includes(w))) score += 1;
  }

  if (expected.mustInclude && expected.mustInclude.length > 0) {
    maxScore += 1;
    if (expected.mustInclude.some((term) => combined.includes(term.toLowerCase()))) score += 1;
  }

  if (expected.mustNotInclude && expected.mustNotInclude.length > 0) {
    if (expected.mustNotInclude.some((term) => combined.includes(term.toLowerCase()))) score -= 1;
  }

  if (maxScore === 0) return 0.5; // no scoreable criteria → neutral
  return Math.max(0, score) / maxScore;
}

// ─── Evaluation: run model against all benchmarks ────────────────────

export async function evaluate(): Promise<{
  fitness: number;
  results: { benchmark: string; response: Response; score: number }[];
}> {
  const benchmarks = await loadBenchmarks();
  const results = benchmarks.map((b) => {
    const response = predict(b.situation as Situation);
    const score = scoreBenchmark(response, b.expected);
    return { benchmark: `[${b.domain}] ${b.name}`, response, score };
  });

  const fitness = results.reduce((sum, r) => sum + r.score, 0) / Math.max(results.length, 1);

  return { fitness, results };
}

async function loadBenchmarks(): Promise<HumanBenchmark[]> {
  const benchmarks: HumanBenchmark[] = [];
  for await (const path of walkDir("benchmarks")) {
    if (path.endsWith(".json")) {
      benchmarks.push(JSON.parse(await Deno.readTextFile(path)));
    }
  }
  return benchmarks;
}

async function* walkDir(dir: string): AsyncGenerator<string> {
  for await (const entry of Deno.readDir(dir)) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory) yield* walkDir(path);
    else yield path;
  }
}

// Run when executed directly
if (import.meta.main) {
  const { fitness, results } = await evaluate();
  console.log(JSON.stringify({ fitness, predictions: results.length }));
}
