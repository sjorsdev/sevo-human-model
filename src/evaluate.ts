// src/evaluate.ts — Shared evaluation harness for model blueprints
//
// Each blueprint imports this and calls evaluate(model) as its main().
// This loads benchmarks, runs predictions, calls LLM judge, and
// outputs fitness JSON on stdout (for the fork-runner to capture).

import type { HumanModel, HumanBenchmark, Situation, Response } from "./human-types.ts";

// Load all benchmarks from disk
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

// Run model predictions on all benchmarks (local, fast)
function runPredictions(model: HumanModel, benchmarks: HumanBenchmark[]): { id: string; domain: string; name: string; response: Response | null }[] {
  return benchmarks.map((b) => {
    try {
      return { id: b.id, domain: b.domain, name: b.name, response: model.predict(b.situation) };
    } catch {
      return { id: b.id, domain: b.domain, name: b.name, response: null };
    }
  });
}

// Call LLM to judge all predictions in one batch
async function batchJudge(
  model: HumanModel,
  predictions: { id: string; domain: string; name: string; response: Response | null }[],
  benchmarks: HumanBenchmark[],
): Promise<{ accuracy: number; coverage: number; coherence: number; strengths: string[]; weaknesses: string[] }> {
  const primSummary = model.primitives.map((p) => `${p.id}: ${p.description.slice(0, 60)}`).join("\n  ");

  const predSummary = predictions.map(({ name, domain, response: r }) => {
    if (!r) return `  [${domain}] ${name}: MODEL CRASHED`;
    return `  [${domain}] ${name}: behavior="${r.result.behavior.slice(0, 60)}" emotion=${r.effect.emotionChange} cause=${r.rootCause.mechanism}`;
  }).join("\n");

  const prompt = `Score this psychology model (0.0-1.0). Be rigorous.

"${model.name}" (${model.primitives.length} primitives): ${model.description.slice(0, 150)}
Primitives:
  ${primSummary}

Predictions on ${predictions.length} benchmarks:
${predSummary}

Score: accuracy (correct?), coverage (how many handled?), coherence (unified theory?).
JSON only: {"accuracy": 0.0, "coverage": 0.0, "coherence": 0.0, "strengths": ["...","..."], "weaknesses": ["...","..."]}`;

  try {
    const claudePath = `${Deno.env.get("HOME")}/.local/bin/claude`;
    const cmd = new Deno.Command(claudePath, {
      args: ["-p", prompt, "--output-format", "text", "--model", "haiku"],
      stdout: "piped",
      stderr: "piped",
    });
    const output = await cmd.output();
    const stdout = new TextDecoder().decode(output.stdout);
    const match = stdout.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("no JSON");
    const json = JSON.parse(match[0]);
    return {
      accuracy: Math.min(1, Math.max(0, Number(json.accuracy ?? 0))),
      coverage: Math.min(1, Math.max(0, Number(json.coverage ?? 0))),
      coherence: Math.min(1, Math.max(0, Number(json.coherence ?? 0))),
      strengths: (json.strengths ?? []) as string[],
      weaknesses: (json.weaknesses ?? []) as string[],
    };
  } catch {
    // Fallback: structural scoring only
    const passed = predictions.filter((p) => p.response && p.response.confidence > 0.3).length;
    return {
      accuracy: passed / predictions.length,
      coverage: passed / predictions.length,
      coherence: scoreCoherence(model),
      strengths: [],
      weaknesses: ["LLM judge unavailable — structural scoring only"],
    };
  }
}

// Structural coherence: are primitives connected?
function scoreCoherence(model: HumanModel): number {
  if (model.primitives.length <= 1) return 1;
  const ids = new Set(model.primitives.map((p) => p.id));
  let validRefs = 0;
  let totalRefs = 0;
  for (const p of model.primitives) {
    for (const rel of p.relatesTo) {
      totalRefs++;
      if (ids.has(rel)) validRefs++;
    }
  }
  return totalRefs > 0 ? validRefs / totalRefs : 0;
}

// Main evaluation function — blueprints call this
// Outputs predictions + model info as JSON for the fork-runner to judge
export async function evaluate(model: HumanModel): Promise<void> {
  const benchmarks = await loadBenchmarks();
  const predictions = runPredictions(model, benchmarks);

  // Structural coherence (computed locally, no LLM needed)
  const coherence = scoreCoherence(model);

  // Output predictions + metadata for fork-runner to LLM-judge
  const output = {
    fitness: 0, // placeholder — fork-runner computes real fitness via LLM judge
    coherence,
    primitiveCount: model.primitives.length,
    modelName: model.name,
    modelVersion: model.version,
    modelDescription: model.description,
    primitives: model.primitives.map((p) => `${p.id}: ${p.description.slice(0, 60)}`).join(" | "),
    predictions: predictions.map(({ id, domain, name, response: r }) => ({
      id, domain, name,
      behavior: r?.result.behavior?.slice(0, 80) ?? "CRASHED",
      emotion: r?.effect.emotionChange ?? "none",
      mechanism: r?.rootCause.mechanism ?? "none",
      confidence: r?.confidence ?? 0,
    })),
    benchmarkCount: benchmarks.length,
    passed: predictions.filter((p) => p.response && p.response.confidence > 0.3).length,
  };

  console.log(JSON.stringify(output));
}
