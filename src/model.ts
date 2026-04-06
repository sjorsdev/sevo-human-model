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

export function predict(situation: Situation): Response {
  // v0: near-empty. One naive rule.
  // The orchestrator will evolve this function.
  return {
    rootCause: "unknown",
    process: "no model yet",
    emotion: "neutral",
    behavior: "no prediction",
    confidence: 0,
  };
}

// ─── Evaluation: run model against all benchmarks ────────────────────

export async function evaluate(): Promise<{
  fitness: number;
  results: { benchmark: string; response: Response }[];
}> {
  const benchmarks = await loadBenchmarks();
  const results = benchmarks.map((b) => ({
    benchmark: `[${b.domain}] ${b.name}`,
    response: predict(b.situation as Situation),
  }));

  // Fitness: fraction of benchmarks where confidence > 0
  const active = results.filter((r) => r.response.confidence > 0).length;
  const fitness = active / Math.max(results.length, 1);

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
