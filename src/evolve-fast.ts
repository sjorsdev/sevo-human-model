// src/evolve-fast.ts — Fast model evolution via JSON config mutation
//
// Instead of generating TypeScript (slow, brittle), models are JSON configs
// with numerical weights. Mutations are weight patches — fast, reliable.
// Can produce 100+ variants per run.
//
// Evolution strategy:
//   1. Load seed configs
//   2. For each generation:
//      a. Score all configs (run interpreter + LLM judge)
//      b. Keep top N survivors
//      c. Mutate survivors → many children
//      d. Crossover top 2 → children
//      e. Occasionally generate new random primitive sets
//      f. Repeat

import type { ModelConfig, PrimitiveConfig } from "./model-runner.ts";
import { predict } from "./model-runner.ts";
import type { HumanBenchmark } from "./human-types.ts";
import { writeNode } from "./graph.ts";
import { git } from "./git.ts";
import type { AgentNode, FitnessNode } from "./types.ts";

// ─── Constants ───────────────────────────────────────────────────────

const POPULATION_SIZE = 30;        // configs alive per generation
const SURVIVORS = 6;               // top N survive each generation
const MUTATIONS_PER_SURVIVOR = 4;  // children per survivor
const GENERATIONS = 50;            // total generations to run
const MUTATION_RATE = 0.25;        // probability of mutating each weight
const MUTATION_MAGNITUDE = 0.15;   // max change per mutation

// ─── LLM Helper ──────────────────────────────────────────────────────

async function callClaude(prompt: string): Promise<string> {
  const claudePath = `${Deno.env.get("HOME")}/.local/bin/claude`;
  const cmd = new Deno.Command(claudePath, {
    args: ["-p", prompt, "--output-format", "text", "--model", "haiku"],
    stdout: "piped",
    stderr: "piped",
  });
  const result = await cmd.output();
  return new TextDecoder().decode(result.stdout).trim();
}

// ─── Load Benchmarks ─────────────────────────────────────────────────

async function loadBenchmarks(): Promise<HumanBenchmark[]> {
  const benchmarks: HumanBenchmark[] = [];
  for await (const path of walkDir("benchmarks")) {
    if (path.endsWith(".json")) {
      benchmarks.push(JSON.parse(await Deno.readTextFile(path)));
    }
  }
  return benchmarks;
}

// ─── Score a Config (fast — local predictions + structural metrics) ──

function scoreConfig(config: ModelConfig, benchmarks: HumanBenchmark[]): {
  fitness: number;
  accuracy: number;
  diversity: number;
  coherence: number;
  domainCoverage: number;
  predictions: string[];
} {
  const predictions: string[] = [];
  const mechanisms: string[] = [];
  const emotions: string[] = [];
  const domainsHit = new Set<string>();
  let accuracyScore = 0;

  for (const b of benchmarks) {
    try {
      const r = predict(config, b.situation);
      predictions.push(`[${b.domain}] ${b.name}: ${r.result.behavior.slice(0, 60)} | ${r.effect.emotionChange} | ${r.rootCause.mechanism}`);
      mechanisms.push(r.rootCause.mechanism);
      emotions.push(r.effect.emotionChange);

      // Check accuracy against expected response
      let benchAccuracy = 0;
      const exp = b.expected;
      const behaviorLower = r.result.behavior.toLowerCase();
      const emotionLower = r.effect.emotionChange.toLowerCase();
      const mechanismLower = r.rootCause.mechanism.toLowerCase();

      // Does the predicted emotion match?
      if (exp.emotionChange && emotionLower.includes(exp.emotionChange.toLowerCase().slice(0, 4))) benchAccuracy += 0.25;

      // Does the behavior match keywords?
      if (exp.behavior) {
        const keywords = exp.behavior.toLowerCase().split(/\s+/).filter((w) => w.length > 4);
        const hits = keywords.filter((k) => behaviorLower.includes(k)).length;
        benchAccuracy += 0.35 * (hits / Math.max(keywords.length, 1));
      }

      // Does the mechanism match the expected root cause type?
      if (exp.rootCauseType && r.rootCause.type === exp.rootCauseType) benchAccuracy += 0.15;

      // Does the arousal direction match?
      if (exp.arousalDirection) {
        const arousalMatch =
          (exp.arousalDirection === "up" && r.effect.arousalChange > 0.1) ||
          (exp.arousalDirection === "down" && r.effect.arousalChange < -0.1) ||
          (exp.arousalDirection === "stable" && Math.abs(r.effect.arousalChange) < 0.15);
        if (arousalMatch) benchAccuracy += 0.15;
      }

      // Does it use appropriate primitives?
      if (exp.keyProcess) {
        const activatedIds = r.process.activatedPrimitives.map((p) => p.toLowerCase());
        const processHits = exp.keyProcess.filter((kp) =>
          activatedIds.some((a) => a.includes(kp.toLowerCase().slice(0, 5)))
        ).length;
        benchAccuracy += 0.10 * (processHits / Math.max(exp.keyProcess.length, 1));
      }

      accuracyScore += benchAccuracy;
      if (benchAccuracy > 0.3) domainsHit.add(b.domain);
    } catch {
      predictions.push(`[${b.domain}] ${b.name}: CRASHED`);
    }
  }

  const totalBenchmarks = benchmarks.length;
  const accuracy = accuracyScore / Math.max(totalBenchmarks, 1);

  // Diversity: how many DIFFERENT primitives dominate + different emotions produced
  const uniqueMechanisms = new Set(mechanisms).size;
  const uniqueEmotions = new Set(emotions).size;
  const mechanismDiversity = uniqueMechanisms / Math.max(config.primitives.length, 1); // should use all primitives
  const emotionDiversity = uniqueEmotions / Math.max(totalBenchmarks, 1);
  const diversity = (mechanismDiversity * 0.6 + emotionDiversity * 0.4);

  // Domain coverage: how many of the 8 domains have at least one good prediction
  const domainCoverage = domainsHit.size / 8;

  // Coherence: structural connectedness
  const ids = new Set(config.primitives.map((p) => p.id));
  let validRefs = 0, totalRefs = 0;
  for (const p of config.primitives) {
    for (const r of [...p.relatesTo, ...p.amplifies, ...p.inhibits]) {
      totalRefs++;
      if (ids.has(r)) validRefs++;
    }
  }
  const coherence = totalRefs > 0 ? validRefs / totalRefs : 0;

  // FITNESS: accuracy dominates. Diversity is a penalty for collapse, not a reward.
  const pCount = config.primitives.length;
  const collapsePenalty = diversity < 0.3 ? -0.15 : 0; // penalize severe output collapse
  const compactnessBonus = accuracy > 0.20 ? (1 - pCount / 15) * 0.03 : 0;
  const fitness =
    accuracy * 0.55 +
    domainCoverage * 0.30 +
    coherence * 0.05 +
    compactnessBonus +
    collapsePenalty;

  return { fitness, accuracy, diversity, coherence, domainCoverage, predictions };
}

// ─── LLM Judge (called sparingly — only for top candidates) ──────────

async function llmJudgeTop(
  config: ModelConfig,
  predictions: string[],
): Promise<{ accuracy: number; coherence: number; strengths: string[]; weaknesses: string[] }> {
  const prompt = `Score this psychology model (0.0-1.0). Be rigorous.

"${config.name}" (${config.primitives.length}p): ${config.description}
Primitives: ${config.primitives.map((p) => p.id).join(", ")}

Predictions:
${predictions.slice(0, 15).join("\n")}

JSON only: {"accuracy": 0.0, "coherence": 0.0, "strengths": ["..."], "weaknesses": ["..."]}`;

  try {
    const response = await callClaude(prompt);
    const match = response.match(/\{[\s\S]*\}/);
    if (!match) return { accuracy: 0.3, coherence: 0.3, strengths: [], weaknesses: [] };
    const json = JSON.parse(match[0]);
    return {
      accuracy: Math.min(1, Math.max(0, Number(json.accuracy ?? 0.3))),
      coherence: Math.min(1, Math.max(0, Number(json.coherence ?? 0.3))),
      strengths: json.strengths ?? [],
      weaknesses: json.weaknesses ?? [],
    };
  } catch {
    return { accuracy: 0.3, coherence: 0.3, strengths: [], weaknesses: [] };
  }
}

// ─── Mutation: perturb weights ───────────────────────────────────────

function mutateConfig(parent: ModelConfig, magnitude = MUTATION_MAGNITUDE): ModelConfig {
  const child: ModelConfig = JSON.parse(JSON.stringify(parent));
  child.id = `${parent.id}-m${Date.now().toString(36)}`;
  child.version = parent.version + 1;

  for (const p of child.primitives) {
    const weights = p.weights as Record<string, number>;
    for (const key of Object.keys(weights)) {
      if (Math.random() < MUTATION_RATE) {
        weights[key] += (Math.random() * 2 - 1) * magnitude;
        weights[key] = Math.max(-1, Math.min(1, weights[key]));
      }
    }

    // Occasionally mutate behavior text
    if (Math.random() < 0.1) {
      const suffixes = [
        ", then reconsiders", " while monitoring environment",
        " impulsively", " cautiously", " with visible conflict",
        " despite internal resistance", " under social pressure",
        " seeking more information first", " to reduce uncertainty",
        " to protect self-image", " to maintain group standing",
      ];
      p.behaviorBias = p.behaviorBias.split(",")[0] + suffixes[Math.floor(Math.random() * suffixes.length)];
    }
  }

  // Occasionally add or remove a primitive (minimum 4 to prevent collapse)
  if (Math.random() < 0.05 && child.primitives.length > 4) {
    // Remove least connected primitive
    const leastConnected = child.primitives
      .map((p) => ({ p, refs: p.relatesTo.length + p.amplifies.length + p.inhibits.length }))
      .sort((a, b) => a.refs - b.refs)[0];
    child.primitives = child.primitives.filter((p) => p.id !== leastConnected.p.id);
    child.name = `${parent.name} (compact)`;
  }

  if (Math.random() < 0.03 && child.primitives.length < 10) {
    // Add a novel primitive
    const novelPrimitives = [
      { id: "temporal-discount", domain: "decision", description: "Future rewards feel less valuable. Drives impulsive choices.", emotionOutput: "impatience", behaviorBias: "prefers immediate over delayed reward", rootCauseType: "evolutionary" as const },
      { id: "cognitive-load", domain: "cognition", description: "Limited processing capacity. Under load, defaults to heuristics.", emotionOutput: "overwhelm", behaviorBias: "simplifies, uses rules of thumb, avoids complexity", rootCauseType: "structural" as const },
      { id: "narrative-self", domain: "identity", description: "Constructs coherent self-story. Reinterprets events to fit narrative.", emotionOutput: "meaning/confusion", behaviorBias: "reframes events to maintain coherent self-story", rootCauseType: "cultural" as const },
      { id: "mimicry", domain: "social", description: "Unconsciously copies others' behavior, posture, speech patterns.", emotionOutput: "rapport", behaviorBias: "mirrors others automatically, synchronizes behavior", rootCauseType: "evolutionary" as const },
      { id: "reward-prediction", domain: "motivation", description: "Anticipates rewards and drives approach behavior. Craving when cue detected.", emotionOutput: "craving/anticipation", behaviorBias: "approaches reward source, rationalizes pursuit", rootCauseType: "evolutionary" as const },
    ];
    const novel = novelPrimitives[Math.floor(Math.random() * novelPrimitives.length)];
    if (!child.primitives.find((p) => p.id === novel.id)) {
      const weights: Record<string, number> = {};
      for (const key of ["stimulusIntensity", "stimulusNovelty", "personalRelevance", "socialPresence", "threatLevel", "choicePresent", "arousal", "neuroticism", "openness", "agreeableness"]) {
        weights[key] = (Math.random() * 2 - 1) * 0.5;
      }
      child.primitives.push({
        ...novel,
        weights: weights as PrimitiveConfig["weights"],
        arousalDelta: (Math.random() - 0.5) * 0.6,
        relatesTo: [child.primitives[0].id],
        amplifies: [],
        inhibits: [],
      });
      child.name = `${parent.name} (+${novel.id})`;
    }
  }

  return child;
}

// ─── Crossover: blend two configs ────────────────────────────────────

function crossover(a: ModelConfig, b: ModelConfig): ModelConfig {
  const child: ModelConfig = JSON.parse(JSON.stringify(a));
  child.id = `cross-${Date.now().toString(36)}`;
  child.name = `${a.name.split(" ")[0]} × ${b.name.split(" ")[0]}`;
  child.version = Math.max(a.version, b.version) + 1;

  // For each primitive in child, average weights with matching primitive from b
  for (const cp of child.primitives) {
    const bp = b.primitives.find((p) => p.id === cp.id || p.domain === cp.domain);
    if (bp) {
      const cw = cp.weights as Record<string, number>;
      const bw = bp.weights as Record<string, number>;
      for (const key of Object.keys(cw)) {
        if (key in bw) {
          cw[key] = (cw[key] + bw[key]) / 2 + (Math.random() - 0.5) * 0.1;
          cw[key] = Math.max(-1, Math.min(1, cw[key]));
        }
      }
    }
  }

  // Add unique primitives from b (up to size limit)
  for (const bp of b.primitives) {
    if (!child.primitives.find((p) => p.id === bp.id) && child.primitives.length < 8) {
      child.primitives.push(JSON.parse(JSON.stringify(bp)));
    }
  }

  return child;
}

// ─── Main Evolution Loop ─────────────────────────────────────────────

async function main() {
  const benchmarks = await loadBenchmarks();
  console.log(`Benchmarks: ${benchmarks.length}`);

  // Load seed configs
  let population: ModelConfig[] = [];
  for await (const entry of Deno.readDir("blueprints/configs")) {
    if (entry.name.endsWith(".json")) {
      const config = JSON.parse(await Deno.readTextFile(`blueprints/configs/${entry.name}`));
      population.push(config);
    }
  }
  console.log(`Seeds: ${population.length}`);

  // Fill initial population with mutations of seeds
  while (population.length < POPULATION_SIZE) {
    const parent = population[Math.floor(Math.random() * Math.min(population.length, 3))];
    population.push(mutateConfig(parent, 0.4)); // larger initial diversity
  }

  console.log(`\n╔═══════════════════════════════════════════════════╗`);
  console.log(`║  FAST EVOLUTION — ${GENERATIONS} generations, pop ${POPULATION_SIZE}         ║`);
  console.log(`╚═══════════════════════════════════════════════════╝`);

  let allTimeBest: { config: ModelConfig; fitness: number; gen: number } | null = null;

  for (let gen = 1; gen <= GENERATIONS; gen++) {
    // Score all configs (fast — no LLM)
    const scored = population.map((config) => {
      const s = scoreConfig(config, benchmarks);
      return { config, ...s };
    });
    scored.sort((a, b) => b.fitness - a.fitness);

    const best = scored[0];
    const worst = scored[scored.length - 1];
    const avgFitness = scored.reduce((s, x) => s + x.fitness, 0) / scored.length;

    if (!allTimeBest || best.fitness > allTimeBest.fitness) {
      allTimeBest = { config: best.config, fitness: best.fitness, gen };
    }

    // Print generation summary
    const bar = "█".repeat(Math.round(best.fitness * 50));
    console.log(`\n  Gen ${String(gen).padStart(2)}/${GENERATIONS} | best=${best.fitness.toFixed(3)} avg=${avgFitness.toFixed(3)} | pop=${population.length} | ${bar}`);
    console.log(`    #1 "${best.config.name}" (${best.config.primitives.length}p) acc=${best.accuracy.toFixed(2)} div=${best.diversity.toFixed(2)} dom=${best.domainCoverage.toFixed(2)} coh=${best.coherence.toFixed(2)}`);
    if (scored[1]) console.log(`    #2 "${scored[1].config.name}" (${scored[1].config.primitives.length}p) fit=${scored[1].fitness.toFixed(3)} acc=${scored[1].accuracy.toFixed(2)}`);
    console.log(`    worst="${worst.config.name}" fit=${worst.fitness.toFixed(3)}`);

    // LLM judge the top model every 5 generations
    if (gen % 5 === 0 || gen === GENERATIONS) {
      console.log(`    LLM judging top model...`);
      const judge = await llmJudgeTop(best.config, best.predictions);
      console.log(`    LLM: acc=${judge.accuracy.toFixed(2)} coh=${judge.coherence.toFixed(2)}`);
      if (judge.strengths.length) console.log(`    + ${judge.strengths[0]}`);
      if (judge.weaknesses.length) console.log(`    - ${judge.weaknesses[0]}`);

      // Recalculate with LLM scores
      const llmFitness = (best.diversity * 0.3 + judge.accuracy * 0.3 + judge.coherence * 0.3 + best.coherence * 0.1) / Math.sqrt(best.config.primitives.length);
      console.log(`    LLM-adjusted fitness: ${llmFitness.toFixed(3)}`);
    }

    if (gen === GENERATIONS) break;

    // Selection: keep top N, but ensure diversity of paradigms
    // Group by root seed (first word of name)
    const byFamily = new Map<string, typeof scored>();
    for (const s of scored) {
      const family = s.config.name.split(" ")[1] ?? s.config.name.split("-")[0] ?? "unknown"; // "The X" → "X"
      if (!byFamily.has(family)) byFamily.set(family, []);
      byFamily.get(family)!.push(s);
    }
    // Take best from each family first, then fill remaining slots by fitness
    const survivors: typeof scored = [];
    for (const [_, members] of byFamily) {
      if (survivors.length < SURVIVORS) {
        survivors.push(members[0]); // best of this family
      }
    }
    // Fill remaining slots with best overall
    for (const s of scored) {
      if (survivors.length >= SURVIVORS) break;
      if (!survivors.includes(s)) survivors.push(s);
    }

    // Reproduction: mutate survivors
    const children: ModelConfig[] = [];
    for (const s of survivors) {
      children.push(s.config); // survivor lives on
      for (let i = 0; i < MUTATIONS_PER_SURVIVOR; i++) {
        children.push(mutateConfig(s.config));
      }
    }

    // Crossover: top 2
    if (survivors.length >= 2) {
      children.push(crossover(survivors[0].config, survivors[1].config));
      children.push(crossover(survivors[1].config, survivors[0].config));
    }

    // Trim to population size
    population = children.slice(0, POPULATION_SIZE);
  }

  // Save the all-time best
  if (allTimeBest) {
    const bestPath = `blueprints/configs/best-gen${allTimeBest.gen}.json`;
    await Deno.writeTextFile(bestPath, JSON.stringify(allTimeBest.config, null, 2));
    console.log(`\n  All-time best saved to ${bestPath}`);
    console.log(`  "${allTimeBest.config.name}" — fitness=${allTimeBest.fitness.toFixed(3)} (gen ${allTimeBest.gen})`);
    console.log(`  Primitives (${allTimeBest.config.primitives.length}):`);
    for (const p of allTimeBest.config.primitives) {
      console.log(`    - ${p.id}: ${p.description.slice(0, 60)}`);
    }

    // Register in graph
    const agentNode: AgentNode = {
      "@context": "sevo://v1",
      "@type": "Agent",
      "@id": `agent:${allTimeBest.config.id}-${Date.now()}`,
      timestamp: new Date().toISOString(),
      blueprint: bestPath,
      generation: allTimeBest.gen,
      status: "active",
      domain: "human-model-quality",
    };
    await writeNode(agentNode);
    await git.add(bestPath);
    await git.add("graph/");
    await git.commit(`evolve: ${allTimeBest.config.name} fitness=${allTimeBest.fitness.toFixed(3)} gen${allTimeBest.gen}`);
  }
}

async function* walkDir(dir: string): AsyncGenerator<string> {
  for await (const entry of Deno.readDir(dir)) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory) yield* walkDir(path);
    else yield path;
  }
}

main();
