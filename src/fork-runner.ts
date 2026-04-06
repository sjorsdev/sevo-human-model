// src/fork-runner.ts — Domain evolution runner for sevo-human-model
//
// Evolves computational models of human psychology.
// Each model is a TypeScript blueprint that takes benchmarks via stdin,
// runs predictions, and outputs fitness JSON on stdout.
//
// Meta-cycle: EVOLVE → REFLECT → THINK → BRAINSTORM → REALIGN

import { queryNodes, writeNode } from "./graph.ts";
import { run, SEVO_PERMISSIONS } from "./runner.ts";
import { score } from "./scorer.ts";
import { git } from "./git.ts";
import { computeSevoScore } from "./sevoscore.ts";
import type {
  AgentNode,
  FitnessNode,
  BenchmarkNode,
  SeedImprovementNode,
  SevoScoreNode,
} from "./types.ts";
import type { HumanBenchmark } from "./human-types.ts";

// ---------------------------------------------------------------------------
// LLM helper
// ---------------------------------------------------------------------------
async function callClaude(prompt: string, retries = 3): Promise<string> {
  const claudePath = `${Deno.env.get("HOME")}/.local/bin/claude`;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const cmd = new Deno.Command(claudePath, {
        args: ["-p", prompt, "--output-format", "text", "--model", "haiku"],
        stdout: "piped",
        stderr: "piped",
      });
      const result = await cmd.output();
      const stdout = new TextDecoder().decode(result.stdout).trim();
      if (!result.success || !stdout) {
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, attempt * 15_000));
          continue;
        }
        throw new Error(`claude CLI failed: ${new TextDecoder().decode(result.stderr).slice(0, 200)}`);
      }
      return stdout;
    } catch (e) {
      if (attempt === retries) throw e;
      await new Promise((r) => setTimeout(r, attempt * 15_000));
    }
  }
  throw new Error("callClaude: unreachable");
}

// ---------------------------------------------------------------------------
// Goal loading
// ---------------------------------------------------------------------------
interface GoalConfig {
  id: string;
  name: string;
  domain: string;
  formula: string;
}

async function loadGoal(): Promise<GoalConfig> {
  const goal = JSON.parse(await Deno.readTextFile("./goal.jsonld"));
  return {
    id: goal["@id"],
    name: goal.name,
    domain: goal["@id"].replace("goal:", ""),
    formula: goal.formula ?? goal.metric ?? "",
  };
}

// ---------------------------------------------------------------------------
// Load benchmarks from JSON files
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Domain agent loading
// ---------------------------------------------------------------------------
async function getDomainAgents(domain: string): Promise<AgentNode[]> {
  const agents = await queryNodes<AgentNode>("agent",
    (n) => n.status === "active" && n.domain === domain,
  );
  if (agents.length === 0) {
    // Bootstrap: register models from blueprints/
    return await bootstrapAgents(domain);
  }
  return agents;
}

async function bootstrapAgents(domain: string): Promise<AgentNode[]> {
  const agents: AgentNode[] = [];
  for await (const entry of Deno.readDir("blueprints")) {
    if (entry.name.startsWith("model-v") && entry.name.endsWith(".ts")) {
      const path = `./blueprints/${entry.name}`;
      const version = entry.name.match(/model-v(\d+)/)?.[1] ?? "1";
      const agentNode: AgentNode = {
        "@context": "sevo://v1",
        "@type": "Agent",
        "@id": `agent:model-v${version}-${Date.now()}`,
        timestamp: new Date().toISOString(),
        blueprint: path,
        generation: parseInt(version),
        status: "active",
        domain,
      };
      await writeNode(agentNode);
      agents.push(agentNode);
      console.log(`  Registered: ${agentNode["@id"]}`);
    }
  }
  return agents;
}

// ---------------------------------------------------------------------------
// Run a model blueprint and LLM-judge its output
// ---------------------------------------------------------------------------
async function evaluateModel(
  agent: AgentNode,
  _benchmarks: HumanBenchmark[],
): Promise<{ fitness: number; details: Record<string, unknown> } | null> {
  const permissions = {
    ...SEVO_PERMISSIONS,
    read: [...SEVO_PERMISSIONS.read, "./blueprints", "./src", "./benchmarks"],
  };

  // Step 1: Run blueprint as subprocess (outputs predictions JSON)
  try {
    const result = await run(agent.blueprint, permissions, 120_000);
    if (!result.success || !result.fitnessOutput) {
      console.log(`    FAILED: ${result.stderr.slice(0, 200)}`);
      return null;
    }

    const output = result.fitnessOutput;
    const predictions = output.predictions as Array<Record<string, unknown>> ?? [];
    const coherence = (output.coherence as number) ?? 0;
    const primitiveCount = (output.primitiveCount as number) ?? 1;
    const modelName = (output.modelName as string) ?? "unknown";
    const modelDescription = (output.modelDescription as string) ?? "";
    const primitivesStr = (output.primitives as string) ?? "";

    // Step 2: LLM judge (called from fork-runner, not subprocess)
    const predSummary = predictions.map((p) =>
      `[${p.domain}] ${p.name}: ${p.behavior} | emotion=${p.emotion} | cause=${p.mechanism}`
    ).join("\n  ");

    const prompt = `Score this psychology model (0.0-1.0). Be rigorous and specific.

"${modelName}" (${primitiveCount} primitives): ${modelDescription.slice(0, 120)}
Primitives: ${primitivesStr.slice(0, 300)}

Predictions on ${predictions.length} benchmarks:
  ${predSummary}

Score: accuracy (psychologically correct?), coverage (how many well-handled?), coherence (unified theory?).
JSON only: {"accuracy": 0.0, "coverage": 0.0, "coherence": 0.0, "strengths": ["..."], "weaknesses": ["..."]}`;

    let accuracy = 0, coverage = 0, llmCoherence = 0;
    let strengths: string[] = [], weaknesses: string[] = [];

    try {
      const response = await callClaude(prompt);
      const match = response.match(/\{[\s\S]*\}/);
      if (match) {
        const json = JSON.parse(match[0]);
        accuracy = Math.min(1, Math.max(0, Number(json.accuracy ?? 0)));
        coverage = Math.min(1, Math.max(0, Number(json.coverage ?? 0)));
        llmCoherence = Math.min(1, Math.max(0, Number(json.coherence ?? 0)));
        strengths = (json.strengths ?? []) as string[];
        weaknesses = (json.weaknesses ?? []) as string[];
      }
    } catch {
      // Fallback to structural scoring
      const passed = predictions.filter((p) => (p.confidence as number) > 0.3).length;
      accuracy = passed / Math.max(predictions.length, 1);
      coverage = passed / Math.max(predictions.length, 1);
    }

    // Blend structural + LLM coherence
    const finalCoherence = coherence * 0.4 + llmCoherence * 0.6;
    const fitness = (coverage * accuracy * finalCoherence) / Math.sqrt(primitiveCount);

    return {
      fitness,
      details: {
        fitness,
        accuracy,
        coverage,
        coherence: finalCoherence,
        primitiveCount,
        strengths,
        weaknesses,
        modelName,
        benchmarkCount: predictions.length,
      },
    };
  } catch (e) {
    console.log(`    ERROR: ${(e as Error).message.slice(0, 150)}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// LLM-as-judge: batch evaluate a model's predictions
// ---------------------------------------------------------------------------
async function llmJudge(
  modelName: string,
  modelDescription: string,
  primitives: string,
  predictions: string,
): Promise<{ accuracy: number; coverage: number; coherence: number; strengths: string[]; weaknesses: string[] }> {
  const prompt = `Score this human psychology model (0.0-1.0 each).

Model: "${modelName}" — ${modelDescription}
Primitives: ${primitives}

Predictions on benchmarks:
${predictions}

Respond JSON only:
{"accuracy": 0.0, "coverage": 0.0, "coherence": 0.0, "strengths": ["..."], "weaknesses": ["..."]}`;

  const response = await callClaude(prompt);
  const match = response.match(/\{[\s\S]*\}/);
  if (!match) return { accuracy: 0, coverage: 0, coherence: 0, strengths: [], weaknesses: [] };
  try {
    const json = JSON.parse(match[0]);
    return {
      accuracy: Math.min(1, Math.max(0, Number(json.accuracy ?? 0))),
      coverage: Math.min(1, Math.max(0, Number(json.coverage ?? 0))),
      coherence: Math.min(1, Math.max(0, Number(json.coherence ?? 0))),
      strengths: json.strengths ?? [],
      weaknesses: json.weaknesses ?? [],
    };
  } catch {
    return { accuracy: 0, coverage: 0, coherence: 0, strengths: [], weaknesses: [] };
  }
}

// ---------------------------------------------------------------------------
// Mutation: evolve a model blueprint
// ---------------------------------------------------------------------------
async function mutateModel(
  agent: AgentNode,
  weaknesses: string[],
  goal: GoalConfig,
): Promise<string | null> {
  const blueprint = await Deno.readTextFile(agent.blueprint);
  const weaknessText = weaknesses.map((w) => `- ${w.slice(0, 120)}`).join("\n");

  // Extract model info from blueprint
  const nameMatch = blueprint.match(/name:\s*"([^"]+)"/);
  const primCountMatch = blueprint.match(/primitives\.length/);
  const modelName = nameMatch?.[1] ?? "unknown";

  const prompt = `Evolve this human psychology model. Fix these weaknesses:
${weaknessText}

Model: "${modelName}" at ${agent.blueprint}
Goal: ${goal.formula}

Read the file at ${agent.blueprint}, then output a COMPLETE improved TypeScript file.
Rules:
- Fix weaknesses with minimal changes
- Prefer refining primitives over adding new ones
- Make predict() produce DIFFERENT outputs for DIFFERENT scenarios
- Keep coherent. Increment version.
- Import from "../src/human-types.ts"

CRITICAL: The biggest issue is output collapse — all scenarios get the same response.
Fix predict() to use stimulus.type, person.needs, person.traits, and context to
produce genuinely different behaviors for different situations.

Output the complete TypeScript file in a code block.`;

  try {
    const response = await callClaude(prompt);
    const codeMatch = response.match(/```(?:typescript|ts)?\s*\n([\s\S]*?)```/);
    const code = codeMatch ? codeMatch[1].trim() : response.trim();

    if (!code.includes("import") || !code.includes("export")) {
      console.log("    Mutation produced invalid code");
      return null;
    }
    return code;
  } catch (e) {
    console.log(`    Mutation failed: ${(e as Error).message.slice(0, 100)}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Run a domain evolution cycle
// ---------------------------------------------------------------------------
async function runDomainCycle(
  goal: GoalConfig,
  cycle: number,
  benchmarks: HumanBenchmark[],
): Promise<{ improvements: string[]; bestFitness: number; bestAgentId: string | null }> {
  const cycleId = `${goal.domain}-cycle-${cycle}-${Date.now()}`;
  const improvements: string[] = [];

  console.log(`\n--- ${goal.domain}: Cycle ${cycle} ---`);

  const agents = await getDomainAgents(goal.domain);
  console.log(`  ${agents.length} active models`);

  // Evaluate all models
  let bestFitness = 0;
  let bestAgent: AgentNode | null = null;
  let bestWeaknesses: string[] = [];

  for (const agent of agents) {
    console.log(`  Testing ${agent["@id"]} (${agent.blueprint})...`);
    const result = await evaluateModel(agent, benchmarks);

    if (result) {
      const fitness = result.fitness;
      await score(agent["@id"], {
        success: true,
        stdout: "",
        stderr: "",
        exitCode: 0,
        durationMs: 0,
        fitnessOutput: result.details,
      }, cycleId);

      const acc = (result.details.accuracy as number ?? 0).toFixed(2);
      const cov = (result.details.coverage as number ?? 0).toFixed(2);
      const coh = (result.details.coherence as number ?? 0).toFixed(2);
      const pCount = result.details.primitiveCount ?? "?";
      console.log(`    fitness=${fitness.toFixed(3)} acc=${acc} cov=${cov} coh=${coh} prims=${pCount}`);

      if (result.details.weaknesses) {
        const weaknesses = result.details.weaknesses as string[];
        if (weaknesses.length > 0) console.log(`    weak: ${weaknesses[0]?.slice(0, 80)}`);
      }

      if (fitness > bestFitness) {
        bestFitness = fitness;
        bestAgent = agent;
        bestWeaknesses = (result.details.weaknesses as string[]) ?? [];
      }
    }
  }

  if (!bestAgent) {
    return { improvements: [], bestFitness: 0, bestAgentId: null };
  }

  console.log(`  Best: ${bestAgent["@id"]} fitness=${bestFitness.toFixed(3)}`);

  // Mutate the best model to create a variant
  if (bestWeaknesses.length > 0) {
    console.log(`  Mutating...`);
    const mutatedCode = await mutateModel(bestAgent, bestWeaknesses, goal);

    if (mutatedCode) {
      const gen = bestAgent.generation + 1;
      const mutantPath = `./blueprints/model-v${gen}.ts`;
      await Deno.writeTextFile(mutantPath, mutatedCode);

      // Test mutant
      const agentNode: AgentNode = {
        "@context": "sevo://v1",
        "@type": "Agent",
        "@id": `agent:model-v${gen}-${Date.now()}`,
        timestamp: new Date().toISOString(),
        blueprint: mutantPath,
        parent: bestAgent["@id"],
        generation: gen,
        status: "active",
        domain: goal.domain,
      };

      const testResult = await evaluateModel(agentNode, benchmarks);
      if (testResult && testResult.fitness > bestFitness) {
        await writeNode(agentNode);
        await git.add(mutantPath);
        await git.commit(`evolve(${goal.domain}): model-v${gen} fitness=${testResult.fitness.toFixed(3)}`);
        console.log(`  WINNER: model-v${gen} fitness=${testResult.fitness.toFixed(3)}`);
        improvements.push(`model-v${gen} improved from ${bestFitness.toFixed(3)} to ${testResult.fitness.toFixed(3)}`);
        bestFitness = testResult.fitness;
      } else {
        console.log(`  Rejected mutant (${testResult?.fitness.toFixed(3) ?? "failed"} <= ${bestFitness.toFixed(3)})`);
        try { await Deno.remove(mutantPath); } catch { /* ok */ }
      }
    }
  }

  return { improvements, bestFitness, bestAgentId: bestAgent["@id"] };
}

// ---------------------------------------------------------------------------
// Record domain learnings
// ---------------------------------------------------------------------------
async function recordLearnings(
  domain: string,
  improvements: string[],
  fitness: number,
  cycle: number,
): Promise<void> {
  if (improvements.length === 0) return;
  const node: SeedImprovementNode = {
    "@context": "sevo://v1",
    "@type": "SeedImprovement",
    "@id": `learning-${domain}-cycle-${cycle}-${Date.now()}`,
    timestamp: new Date().toISOString(),
    observation: `Domain ${domain} (fitness ${fitness.toFixed(3)}) generated ${improvements.length} insights`,
    suggestion: improvements.join("; "),
    evidence: [`domain:${domain}`, `cycle:${cycle}`],
    priority: 5,
  };
  await writeNode(node);
  console.log(`  Recorded ${improvements.length} learnings`);
}

// ---------------------------------------------------------------------------
// REFLECT
// ---------------------------------------------------------------------------
const fitnessHistory: number[] = [];

async function reflect(
  goal: GoalConfig,
): Promise<{ plateauing: boolean; trend: string; summary: string }> {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  REFLECT`);
  console.log(`${"=".repeat(60)}`);

  const recent = fitnessHistory.slice(-10);
  const older = fitnessHistory.slice(-20, -10);
  const recentAvg = recent.length > 0 ? recent.reduce((a, b) => a + b, 0) / recent.length : 0;
  const olderAvg = older.length > 0 ? older.reduce((a, b) => a + b, 0) / older.length : 0;
  const delta = recentAvg - olderAvg;

  const plateauing = recent.length >= 5 && Math.abs(delta) < 0.01;
  const trend = delta > 0.02 ? "improving" : delta < -0.02 ? "declining" : "plateau";
  const summary = `Fitness trend: ${trend} (recent avg: ${recentAvg.toFixed(3)}, delta: ${delta.toFixed(4)}). ${plateauing ? "PLATEAU — need structural change." : ""}`;

  console.log(`  ${summary}`);
  return { plateauing, trend, summary };
}

// ---------------------------------------------------------------------------
// THINK
// ---------------------------------------------------------------------------
async function think(
  goal: GoalConfig,
  reflectionSummary: string,
): Promise<string[]> {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  THINK — creative reasoning`);
  console.log(`${"=".repeat(60)}`);

  const prompt = `You are designing theories of human psychology for a competition.

STATE: ${reflectionSummary}
GOAL: ${goal.name} — ${goal.formula}

Current models compete on: cognitive biases, emotions, social behavior, decisions, motivation, personality, development, psychopathology.

Think creatively about what makes a BETTER model of human nature:
- What fundamental mechanisms are all models missing?
- What paradigms from other fields could apply? (physics, biology, game theory, information theory)
- What's the most compact set of primitives that could explain everything?
- Is there a single principle (like F=ma) that unifies all human behavior?

Respond JSON: {"ideas": [{"idea": "...", "fields": ["..."], "testable": "..."}]}`;

  try {
    const response = await callClaude(prompt);
    const match = response.match(/\{[\s\S]*\}/);
    if (!match) return [];
    const parsed = JSON.parse(match[0]);
    const ideas: string[] = [];
    if (parsed.ideas) {
      for (const idea of parsed.ideas) {
        console.log(`  IDEA [${idea.fields?.join("+")}]: ${idea.idea}`);
        ideas.push(`[${idea.fields?.join("+")}] ${idea.idea}`);
      }
    }
    return ideas;
  } catch (e) {
    console.log(`  Think failed: ${(e as Error).message.slice(0, 100)}`);
    return [];
  }
}

// ---------------------------------------------------------------------------
// REALIGN
// ---------------------------------------------------------------------------
async function realign(goal: GoalConfig, bestFitness: number): Promise<void> {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  REALIGN`);
  console.log(`${"=".repeat(60)}`);

  const agents = await queryNodes<AgentNode>("agent", (a) => a.status === "active" && a.domain === goal.domain);
  console.log(`  Goal: ${goal.name}`);
  console.log(`  Active models: ${agents.length}`);
  console.log(`  Best fitness: ${bestFitness.toFixed(3)}`);
  console.log(`  Are we finding F=ma for the mind? ${bestFitness > 0.5 ? "Getting closer." : "Still searching."}`);
}

// ===========================================================================
// MAIN — EVOLVE → REFLECT → THINK → REALIGN
// ===========================================================================
const EVOLVE_CYCLES = 10;

async function main() {
  const goal = await loadGoal();
  const benchmarks = await loadBenchmarks();

  console.log(`\nSEVO Human Model Evolution: ${goal.name}`);
  console.log(`Benchmarks: ${benchmarks.length} across ${new Set(benchmarks.map((b) => b.domain)).size} domains`);
  console.log(`Meta-cycle: EVOLVE → REFLECT → THINK → REALIGN`);

  // --- EVOLVE ---
  let bestFitness = 0;
  let bestAgentId: string | null = null;

  for (let cycle = 1; cycle <= EVOLVE_CYCLES; cycle++) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`  EVOLVE ${cycle}/${EVOLVE_CYCLES}`);
    console.log(`${"=".repeat(60)}`);

    const result = await runDomainCycle(goal, cycle, benchmarks);

    if (result.improvements.length > 0) {
      await recordLearnings(goal.domain, result.improvements, result.bestFitness, cycle);
    }

    fitnessHistory.push(result.bestFitness);
    if (result.bestFitness > bestFitness) {
      bestFitness = result.bestFitness;
      bestAgentId = result.bestAgentId;
    }

    await computeSevoScore(
      `${goal.domain}-cycle-${cycle}-${Date.now()}`,
      bestAgentId ?? "unknown",
      bestFitness,
      bestFitness,
    );
  }

  // --- REFLECT ---
  const reflection = await reflect(goal);

  // --- THINK ---
  await think(goal, reflection.summary);

  // --- REALIGN ---
  await realign(goal, bestFitness);

  console.log(`\n${goal.domain} meta-cycle complete.`);
}

main();
