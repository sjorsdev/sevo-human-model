#!/usr/bin/env -S deno run --allow-all
// src/fork-runner.ts — Multi-model competition
//
// Runs ALL blueprints, scores them via LLM judge, generates new
// competing models, archives losers. Real sevo evolution.

import { writeNode } from "./graph.ts";
import { git } from "./git.ts";
import { reportDiscovery } from "./reporter.ts";
import type { AgentNode, SeedImprovementNode } from "./types.ts";

const CYCLES = 10;
const MAX_POPULATION = 8;

// ─── LLM (uses the working pattern: simple -p, no file access) ──────

async function callClaude(prompt: string, model = "haiku"): Promise<string> {
  const claudePath = `${Deno.env.get("HOME")}/.local/bin/claude`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const cmd = new Deno.Command(claudePath, {
        args: ["-p", prompt, "--output-format", "text", "--model", model, "--max-turns", "1"],
        stdout: "piped",
        stderr: "piped",
        env: { ...Deno.env.toObject() },
      });
      const result = await cmd.output();
      const stdout = new TextDecoder().decode(result.stdout).trim();
      if (result.success && stdout) return stdout;
      console.log(`    [retry ${attempt}/3]`);
      if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 10000));
    } catch {
      if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 10000));
    }
  }
  throw new Error("callClaude failed");
}

// ─── Run a blueprint ─────────────────────────────────────────────────

async function runBlueprint(path: string): Promise<{ fitness: number; predictions: number } | null> {
  try {
    const denoPath = `${Deno.env.get("HOME")}/.deno/bin/deno`;
    const cmd = new Deno.Command(denoPath, {
      args: ["run", "--allow-read", path],
      stdout: "piped",
      stderr: "piped",
      env: { ...Deno.env.toObject() },
    });
    const result = await cmd.output();
    if (!result.success) return null;
    const stdout = new TextDecoder().decode(result.stdout).trim();
    const lastLine = stdout.split("\n").at(-1) ?? "";
    return JSON.parse(lastLine);
  } catch {
    return null;
  }
}

// ─── List blueprints ─────────────────────────────────────────────────

async function listBlueprints(): Promise<string[]> {
  const paths: string[] = [];
  for await (const entry of Deno.readDir("blueprints")) {
    if (entry.name.endsWith(".ts") && entry.name.startsWith("model-")) {
      paths.push(`blueprints/${entry.name}`);
    }
  }
  return paths.sort();
}

// ─── Score + judge via LLM ───────────────────────────────────────────

interface ScoredModel {
  path: string;
  fitness: number;
  llmAccuracy: number;
  weakness: string;
  summary: string;
}

async function scoreAndJudge(path: string): Promise<ScoredModel | null> {
  const result = await runBlueprint(path);
  if (!result || result.fitness < 0) return null;

  // Read first 100 lines to get model description
  const source = await Deno.readTextFile(path);
  const header = source.split("\n").slice(0, 30).join("\n");
  const predictFn = source.match(/export function predict[\s\S]{0,500}/)?.[0]?.slice(0, 400) ?? "";

  const prompt = `Score this psychology model (0.0-1.0). It scores ${result.fitness.toFixed(3)} on 18 benchmarks.

Header:
${header.slice(0, 500)}

Predict function (snippet):
${predictFn}

Rate accuracy (0.0-1.0) and state the SINGLE biggest weakness in 1 sentence.
JSON: {"accuracy": 0.0, "weakness": "..."}`;

  try {
    const response = await callClaude(prompt);
    const match = response.match(/\{[\s\S]*?\}/);
    if (match) {
      const json = JSON.parse(match[0]);
      const acc = Math.min(1, Math.max(0, Number(json.accuracy ?? 0.3)));
      return {
        path,
        fitness: result.fitness,
        llmAccuracy: acc,
        weakness: String(json.weakness ?? "unknown"),
        summary: header.slice(0, 200),
      };
    }
  } catch { /* fallback */ }

  return {
    path,
    fitness: result.fitness,
    llmAccuracy: 0.3,
    weakness: "could not judge",
    summary: header.slice(0, 200),
  };
}

// ─── Generate a new model from scratch ───────────────────────────────
// This is the key: fresh ~200 line models, not patches of 2K line files.

async function generateModel(
  existingModels: ScoredModel[],
  approach?: string,
): Promise<string | null> {
  const existing = existingModels
    .map((m) => `- ${m.path} (fitness=${m.fitness.toFixed(3)}, acc=${m.llmAccuracy.toFixed(2)}): weak on ${m.weakness.slice(0, 80)}`)
    .join("\n");

  const approaches = [
    "dual-process theory (System 1 fast/automatic vs System 2 slow/deliberate)",
    "predictive processing (brain minimizes prediction error, emotions are error signals)",
    "social identity theory (all behavior serves social self-construction)",
    "homeostatic regulation (behavior maintains internal equilibrium across needs)",
    "attachment theory (early bonds shape all subsequent behavior patterns)",
    "narrative identity (humans construct and maintain coherent life stories)",
    "evolutionary game theory (behavior as fitness-maximizing strategies)",
    "embodied cognition (thought grounded in body states and metaphors)",
    "appraisal theory (emotions from evaluating events on dimensions: novelty, valence, control, relevance)",
    "self-determination theory (autonomy, competence, relatedness as fundamental needs)",
    "prospect theory + bounded rationality (loss aversion, framing, heuristics)",
    "polyvagal theory (autonomic nervous system states drive social behavior)",
  ];
  const selectedApproach = approach ?? approaches[Math.floor(Math.random() * approaches.length)];

  const prompt = `Write a computational model of human psychology using: ${selectedApproach}

Existing models (be DIFFERENT from these):
${existing}

Requirements:
1. Export \`predict(situation)\` returning \`{ rootCause, process, emotion, behavior, confidence }\`
2. Export \`evaluate()\` that loads benchmarks and scores the model
3. Must handle 8 domains: cognitive-bias, emotion, social, decision, development, personality, psychopathology, motivation
4. Import types from "../src/human-types.ts" (HumanBenchmark, ExpectedResponse)
5. Include scoreBenchmark() function for fitness scoring
6. Output JSON on stdout when run: \`{ fitness, predictions }\`
7. CRITICAL: produce DIFFERENT outputs for DIFFERENT benchmarks. No template responses.
8. Keep it under 300 lines. Compact model > complex model.

The Situation interface:
\`\`\`
{ context: { environment, socialSetting, timeConstraint? },
  person: { traits: Record<string,number>, needs: string[], beliefs: string[], emotionalState: string, arousal: number, history?: string[] },
  stimulus: { type, description, intensity, novelty, personalRelevance } }
\`\`\`

The scoreBenchmark function pattern:
\`\`\`typescript
function scoreBenchmark(response: Response, expected: ExpectedResponse): number {
  const combined = \`\${response.emotion} \${response.behavior} \${response.rootCause}\`.toLowerCase();
  let score = 0, max = 0;
  if (expected.emotionChange) { max++; if (combined.includes(expected.emotionChange.toLowerCase().slice(0,4))) score++; }
  if (expected.behavior) { max++; const words = expected.behavior.toLowerCase().split(/\\W+/).filter(w => w.length > 3); if (words.some(w => combined.includes(w))) score++; }
  if (expected.mustInclude?.length) { max++; if (expected.mustInclude.some(t => combined.includes(t.toLowerCase()))) score++; }
  if (expected.mustNotInclude?.some(t => combined.includes(t.toLowerCase()))) score--;
  return max === 0 ? 0.5 : Math.max(0, score) / max;
}
\`\`\`

Output the COMPLETE TypeScript file in a code block. Make predict() genuinely different per situation.`;

  try {
    const response = await callClaude(prompt, "haiku");
    const match = response.match(/```(?:typescript|ts)?\s*\n([\s\S]*?)```/);
    const code = match?.[1]?.trim();
    if (!code || !code.includes("predict") || !code.includes("evaluate")) return null;
    return code;
  } catch (e) {
    console.log(`    Generate failed: ${(e as Error).message.slice(0, 80)}`);
    return null;
  }
}

// ─── Cycle ───────────────────────────────────────────────────────────

async function runCycle(cycle: number): Promise<void> {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  CYCLE ${cycle}`);
  console.log(`${"═".repeat(60)}`);

  // Score all blueprints
  const blueprints = await listBlueprints();
  console.log(`  ${blueprints.length} models competing\n`);

  const results: ScoredModel[] = [];
  for (const bp of blueprints) {
    console.log(`  ${bp}...`);
    const scored = await scoreAndJudge(bp);
    if (scored) {
      results.push(scored);
      console.log(`    fitness=${scored.fitness.toFixed(3)} llm=${scored.llmAccuracy.toFixed(2)} | ${scored.weakness.slice(0, 60)}`);
    } else {
      console.log(`    FAILED`);
    }
  }

  // Sort by combined score (fitness + LLM accuracy)
  results.sort((a, b) => (b.fitness + b.llmAccuracy) - (a.fitness + a.llmAccuracy));

  // Leaderboard
  console.log(`\n  Leaderboard:`);
  for (const r of results) {
    const bar = "█".repeat(Math.round((r.fitness + r.llmAccuracy) * 20));
    console.log(`    ${(r.fitness + r.llmAccuracy).toFixed(2)} ${bar} ${r.path}`);
  }

  const best = results[0];
  if (!best) { console.log("  No models. Skipping."); return; }

  // Generate 2 new competing models per cycle
  const populationSpace = MAX_POPULATION - results.length;
  const toGenerate = Math.min(2, Math.max(1, populationSpace));

  for (let i = 0; i < toGenerate; i++) {
    const nextVersion = blueprints.length + i + 1;
    console.log(`\n  Generating model-v${nextVersion}...`);

    const code = await generateModel(results);
    if (code) {
      const newPath = `blueprints/model-v${nextVersion}.ts`;
      await Deno.writeTextFile(newPath, code);

      const testResult = await runBlueprint(newPath);
      if (testResult && testResult.fitness >= 0) {
        console.log(`    ✓ fitness=${testResult.fitness.toFixed(3)}`);

        // Register
        const agent: AgentNode = {
          "@context": "sevo://v1",
          "@type": "Agent",
          "@id": `agent:model-v${nextVersion}-${Date.now()}`,
          timestamp: new Date().toISOString(),
          blueprint: `./${newPath}`,
          generation: nextVersion,
          status: "active",
          domain: "human-model-quality",
        };
        await writeNode(agent);
        await git.add(newPath);
        await git.add("graph/");
        await git.commit(`new-model: model-v${nextVersion} fitness=${testResult.fitness.toFixed(3)}`);
      } else {
        console.log(`    ✗ failed to run — removing`);
        await Deno.remove(newPath).catch(() => {});
      }
    }
  }

  // Prune worst if over population limit
  const allBlueprints = await listBlueprints();
  if (allBlueprints.length > MAX_POPULATION) {
    // Re-score to find actual worst
    const worst = results[results.length - 1];
    if (worst && results.length > 3) {
      console.log(`\n  Archiving worst: ${worst.path} (fitness=${worst.fitness.toFixed(3)})`);
      const archived = worst.path.replace("blueprints/model-", "blueprints/archived-model-");
      await Deno.rename(worst.path, archived).catch(() => {});
      await git.add("blueprints/");
      await git.commit(`archive: ${worst.path} (fitness=${worst.fitness.toFixed(3)})`);
    }
  }

  // Report
  reportDiscovery("eqs_milestone", {
    cycle, population: results.length,
    bestFitness: best.fitness, bestAccuracy: best.llmAccuracy,
    bestModel: best.path,
  }, "human-model-quality");

  // Learn
  const learning: SeedImprovementNode = {
    "@context": "sevo://v1",
    "@type": "SeedImprovement",
    "@id": `cycle-${cycle}-${Date.now()}`,
    timestamp: new Date().toISOString(),
    observation: `Cycle ${cycle}: ${results.length} models, best=${best.fitness.toFixed(3)} (${best.path}), weakness: ${best.weakness.slice(0, 80)}`,
    suggestion: `Improve: ${best.weakness.slice(0, 120)}`,
    evidence: [`cycle:${cycle}`, `population:${results.length}`],
    priority: 5,
  };
  await writeNode(learning);
}

// ─── Main ────────────────────────────────────────────────────────────

async function main() {
  console.log(`SEVO Human Model — Fork Runner`);
  console.log(`Generate, compete, select. Best theory wins.\n`);

  for (let cycle = 1; cycle <= CYCLES; cycle++) {
    try {
      await runCycle(cycle);
    } catch (e) {
      console.error(`Cycle ${cycle} failed: ${(e as Error).message}`);
    }
  }

  // Final
  const blueprints = await listBlueprints();
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  FINAL: ${blueprints.length} models`);
  console.log(`${"═".repeat(60)}`);
  for (const bp of blueprints) {
    const r = await runBlueprint(bp);
    console.log(`  ${r?.fitness.toFixed(3) ?? "FAIL"} ${bp}`);
  }
}

main();
