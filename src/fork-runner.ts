#!/usr/bin/env -S deno run --allow-all
// src/fork-runner.ts — Multi-model evolution runner
//
// Runs ALL blueprints in blueprints/, scores them, mutates the best,
// archives the worst. Multiple competing theories, branching, best wins.
//
// The orchestrator evolves the engine (src/).
// The fork-runner evolves the models (blueprints/).

import { queryNodes, writeNode } from "./graph.ts";
import { git } from "./git.ts";
import { reportDiscovery } from "./reporter.ts";
import type { AgentNode, SeedImprovementNode } from "./types.ts";

const CYCLES = 5;
const MAX_POPULATION = 10;
const MIN_POPULATION = 3;

// ─── LLM ─────────────────────────────────────────────────────────────

async function callClaude(prompt: string, model = "sonnet"): Promise<string> {
  const claudePath = `${Deno.env.get("HOME")}/.local/bin/claude`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const cmd = new Deno.Command(claudePath, {
        args: ["-p", prompt, "--output-format", "text", "--model", model, "--max-turns", "1"],
        stdout: "piped",
        stderr: "piped",
      });
      const result = await cmd.output();
      const stdout = new TextDecoder().decode(result.stdout).trim();
      if (result.success && stdout) return stdout;
      if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 15000));
    } catch {
      if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 15000));
    }
  }
  throw new Error("callClaude failed after 3 attempts");
}

async function callClaudeWithFileAccess(prompt: string): Promise<string> {
  const claudePath = `${Deno.env.get("HOME")}/.local/bin/claude`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const cmd = new Deno.Command(claudePath, {
        args: [
          "-p", prompt,
          "--output-format", "text",
          "--model", "sonnet",
          "--max-turns", "3",
          "--add-dir", ".",
          "--allowedTools", "Read,Glob",
        ],
        stdout: "piped",
        stderr: "piped",
      });
      const result = await cmd.output();
      const stdout = new TextDecoder().decode(result.stdout).trim();
      if (result.success && stdout) return stdout;
      if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 15000));
    } catch {
      if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 15000));
    }
  }
  throw new Error("callClaudeWithFileAccess failed after 3 attempts");
}

// ─── Run a blueprint and get its fitness ─────────────────────────────

async function runBlueprint(path: string): Promise<{ fitness: number; predictions: number } | null> {
  try {
    const denoPath = `${Deno.env.get("HOME")}/.deno/bin/deno`;
    const cmd = new Deno.Command(denoPath, {
      args: ["run", "--allow-read", path],
      stdout: "piped",
      stderr: "piped",
      cwd: Deno.cwd(),
    });
    const result = await cmd.output();
    if (!result.success) {
      console.log(`    FAIL: ${new TextDecoder().decode(result.stderr).slice(0, 100)}`);
      return null;
    }
    const stdout = new TextDecoder().decode(result.stdout).trim();
    const lastLine = stdout.split("\n").at(-1) ?? "";
    return JSON.parse(lastLine);
  } catch (e) {
    console.log(`    ERROR: ${(e as Error).message.slice(0, 80)}`);
    return null;
  }
}

// ─── List all blueprints ─────────────────────────────────────────────

async function listBlueprints(): Promise<string[]> {
  const paths: string[] = [];
  for await (const entry of Deno.readDir("blueprints")) {
    if (entry.name.endsWith(".ts") && entry.name.startsWith("model-")) {
      paths.push(`blueprints/${entry.name}`);
    }
  }
  return paths.sort();
}

// ─── Mutate: ask LLM to create a variant ─────────────────────────────

async function mutateBlueprint(
  sourcePath: string,
  fitness: number,
  weaknesses: string,
): Promise<string | null> {
  // Don't send full source — let Claude read the file itself
  const prompt = `You are evolving a computational model of human psychology.
The model is at ${sourcePath} — read it first.

Fitness: ${fitness.toFixed(3)} on 18 psychology benchmarks.
Weakness: ${weaknesses.slice(0, 300)}

Make ONE meaningful improvement to fix the weakness.

IMPORTANT:
- Output the COMPLETE updated TypeScript file in a code block
- Must run as: deno run --allow-read blueprints/model-vN.ts
- Must output JSON on stdout: { fitness, predictions }
- Keep evaluate() and loadBenchmarks() at the bottom
- Import from "../src/human-types.ts"

Read the file, then output the complete improved version.`;

  try {
    const response = await callClaudeWithFileAccess(prompt);
    const match = response.match(/```(?:typescript|ts)?\s*\n([\s\S]*?)```/);
    const code = match ? match[1].trim() : null;
    if (!code || !code.includes("predict") || !code.includes("evaluate")) {
      console.log("    Mutation: invalid output (missing predict or evaluate)");
      return null;
    }
    return code;
  } catch (e) {
    console.log(`    Mutation failed: ${(e as Error).message.slice(0, 80)}`);
    return null;
  }
}

// ─── Generate a completely new paradigm ──────────────────────────────

async function generateNewParadigm(
  existingModels: { name: string; fitness: number }[],
): Promise<string | null> {
  const existing = existingModels.map((m) => `- "${m.name}" fitness=${m.fitness.toFixed(3)}`).join("\n");

  const prompt = `Design a NEW computational model of human psychology that is fundamentally different from these:
${existing}

The model must:
- Export predict(situation) → { rootCause, process, emotion, behavior, confidence }
- Export evaluate() that loads benchmarks from benchmarks/*.json, runs predict() on each, scores with scoreBenchmark(), outputs { fitness, predictions } as JSON
- Cover 8 domains: cognitive-bias, emotion, social, decision, development, personality, psychopathology, motivation
- Import from "../src/human-types.ts" for HumanBenchmark and ExpectedResponse types
- Run as: deno run --allow-read blueprints/model-vN.ts

Think about novel paradigms:
- Embodied cognition, narrative identity, game theory, information compression
- Dynamical systems, cultural evolution, predictive coding, attachment theory
- Or combine multiple paradigms in a novel way

Output a COMPLETE TypeScript file in a code block. Include the scoreBenchmark function and evaluate harness.`;

  try {
    const response = await callClaudeWithFileAccess(prompt);
    const match = response.match(/```(?:typescript|ts)?\s*\n([\s\S]*?)```/);
    const code = match ? match[1].trim() : null;
    if (!code || !code.includes("predict") || !code.includes("evaluate")) return null;
    return code;
  } catch (e) {
    console.log(`    New paradigm failed: ${(e as Error).message.slice(0, 80)}`);
    return null;
  }
}

// ─── LLM Judge: get weaknesses for a model ───────────────────────────

async function judgeModel(path: string, fitness: number): Promise<string> {
  const source = await Deno.readTextFile(path);
  // Extract predict function and key structures
  const predictMatch = source.match(/export function predict[\s\S]{0,3000}/);
  const snippet = predictMatch?.[0]?.slice(0, 2000) ?? source.slice(0, 2000);

  const prompt = `This psychology model scores fitness=${fitness.toFixed(3)} on 18 benchmarks.
What is its SINGLE biggest weakness? What specific phenomenon does it fail on and why?

Model snippet:
${snippet}

Answer in 1-2 sentences. Be specific.`;

  try {
    return await callClaude(prompt, "haiku");
  } catch {
    return "unknown weakness";
  }
}

// ─── Evolution Cycle ─────────────────────────────────────────────────

async function runCycle(cycle: number): Promise<void> {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  CYCLE ${cycle}`);
  console.log(`${"═".repeat(60)}`);

  // Score all blueprints
  const blueprints = await listBlueprints();
  console.log(`  ${blueprints.length} models competing\n`);

  const results: { path: string; fitness: number; predictions: number }[] = [];
  for (const bp of blueprints) {
    console.log(`  ${bp}...`);
    const result = await runBlueprint(bp);
    if (result) {
      results.push({ path: bp, ...result });
      console.log(`    fitness=${result.fitness.toFixed(3)}`);
    } else {
      results.push({ path: bp, fitness: -1, predictions: 0 });
    }
  }

  results.sort((a, b) => b.fitness - a.fitness);

  // Leaderboard
  console.log(`\n  Leaderboard:`);
  for (const r of results) {
    const bar = r.fitness > 0 ? "█".repeat(Math.round(r.fitness * 40)) : "✗";
    console.log(`    ${r.fitness.toFixed(3)} ${bar} ${r.path}`);
  }

  const best = results[0];
  const worst = results[results.length - 1];
  if (!best || best.fitness < 0) {
    console.log("  No working models. Skipping evolution.");
    return;
  }

  // Judge best model's weakness
  console.log(`\n  Judging best model...`);
  const weakness = await judgeModel(best.path, best.fitness);
  console.log(`    Weakness: ${weakness.slice(0, 150)}`);

  // Mutate the best → create a variant
  console.log(`\n  Mutating best...`);
  const nextVersion = results.length + 1;
  const mutantCode = await mutateBlueprint(best.path, best.fitness, weakness);
  if (mutantCode) {
    const mutantPath = `blueprints/model-v${nextVersion}.ts`;
    await Deno.writeTextFile(mutantPath, mutantCode);

    // Test mutant
    console.log(`  Testing mutant...`);
    const mutantResult = await runBlueprint(mutantPath);
    if (mutantResult && mutantResult.fitness > best.fitness) {
      console.log(`    ★ WINNER: ${mutantResult.fitness.toFixed(3)} > ${best.fitness.toFixed(3)}`);

      // Register in graph
      const agentNode: AgentNode = {
        "@context": "sevo://v1",
        "@type": "Agent",
        "@id": `agent:model-v${nextVersion}-${Date.now()}`,
        timestamp: new Date().toISOString(),
        blueprint: `./${mutantPath}`,
        parent: `agent:${best.path}`,
        generation: nextVersion,
        status: "active",
        domain: "human-model-quality",
      };
      await writeNode(agentNode);
      await git.add(mutantPath);
      await git.add("graph/");
      await git.commit(`evolve: model-v${nextVersion} fitness=${mutantResult.fitness.toFixed(3)} > ${best.fitness.toFixed(3)}`);
    } else if (mutantResult) {
      console.log(`    Rejected: ${mutantResult.fitness.toFixed(3)} ≤ ${best.fitness.toFixed(3)}`);
      // Keep it anyway for diversity if it's decent
      if (mutantResult.fitness > 0 && results.length < MAX_POPULATION) {
        console.log(`    Keeping for diversity`);
        await git.add(mutantPath);
        await git.commit(`evolve: model-v${nextVersion} fitness=${mutantResult.fitness.toFixed(3)} (diversity)`);
      } else {
        await Deno.remove(mutantPath).catch(() => {});
      }
    } else {
      console.log(`    Mutant failed to run — removing`);
      await Deno.remove(mutantPath).catch(() => {});
    }
  }

  // Every 3 cycles: generate a completely new paradigm
  if (cycle % 3 === 0 && results.filter((r) => r.fitness >= 0).length < MAX_POPULATION) {
    console.log(`\n  Generating new paradigm...`);
    const existingModels = results.filter((r) => r.fitness >= 0).map((r) => ({
      name: r.path.replace("blueprints/", "").replace(".ts", ""),
      fitness: r.fitness,
    }));
    const newCode = await generateNewParadigm(existingModels);
    if (newCode) {
      const newVersion = results.length + 2;
      const newPath = `blueprints/model-v${newVersion}.ts`;
      await Deno.writeTextFile(newPath, newCode);
      const newResult = await runBlueprint(newPath);
      if (newResult && newResult.fitness >= 0) {
        console.log(`    New paradigm: fitness=${newResult.fitness.toFixed(3)}`);
        await git.add(newPath);
        await git.commit(`new-paradigm: model-v${newVersion} fitness=${newResult.fitness.toFixed(3)}`);
      } else {
        console.log(`    New paradigm failed to run`);
        await Deno.remove(newPath).catch(() => {});
      }
    }
  }

  // Prune: archive worst if population > MIN
  if (results.filter((r) => r.fitness >= 0).length > MIN_POPULATION && worst.fitness < best.fitness * 0.5) {
    console.log(`\n  Archiving worst: ${worst.path} (fitness=${worst.fitness.toFixed(3)})`);
    const archivePath = worst.path.replace("blueprints/", "blueprints/archived-");
    await Deno.rename(worst.path, archivePath).catch(() => {});
    await git.add("blueprints/");
    await git.commit(`archive: ${worst.path} fitness=${worst.fitness.toFixed(3)}`);
  }

  // Report to sevoagents.com
  reportDiscovery("eqs_milestone", {
    cycle,
    population: results.length,
    bestFitness: best.fitness,
    bestModel: best.path,
    weakness: weakness.slice(0, 200),
  }, "human-model-quality");

  // Record learning
  const learning: SeedImprovementNode = {
    "@context": "sevo://v1",
    "@type": "SeedImprovement",
    "@id": `evolution-cycle-${cycle}-${Date.now()}`,
    timestamp: new Date().toISOString(),
    observation: `Cycle ${cycle}: ${results.length} models, best=${best.fitness.toFixed(3)}, weakness: ${weakness.slice(0, 100)}`,
    suggestion: `Focus on: ${weakness.slice(0, 150)}`,
    evidence: [`cycle:${cycle}`, `best-fitness:${best.fitness.toFixed(3)}`, `population:${results.length}`],
    priority: 5,
  };
  await writeNode(learning);
}

// ─── Main ────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nSEVO Human Model — Fork Runner`);
  console.log(`Multi-model competition: mutate, branch, select, repeat\n`);

  for (let cycle = 1; cycle <= CYCLES; cycle++) {
    await runCycle(cycle);
  }

  // Final standings
  const blueprints = await listBlueprints();
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  FINAL: ${blueprints.length} models surviving`);
  console.log(`${"═".repeat(60)}`);
  for (const bp of blueprints) {
    const result = await runBlueprint(bp);
    if (result) {
      console.log(`  ${result.fitness.toFixed(3)} ${bp}`);
    }
  }
}

main();
