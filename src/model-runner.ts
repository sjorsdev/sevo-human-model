// src/model-runner.ts — Universal interpreter for JSON-defined human models
//
// A model is a JSON config: a list of primitives with triggers, weights,
// and output templates. This interpreter runs ANY model config against
// benchmarks. Mutations are JSON patches — fast, reliable, no code gen.
//
// This is the equivalent of sevo-life's simulation engine — the physics
// is fixed, the genomes (model configs) evolve.

import type {
  HumanBenchmark,
  Situation,
  Response,
  RootCause,
  ProcessStep,
  Primitive,
} from "./human-types.ts";

// ─── Model Config (the genome) ───────────────────────────────────────

export interface ModelConfig {
  id: string;
  name: string;
  description: string;
  version: number;
  primitives: PrimitiveConfig[];
}

export interface PrimitiveConfig {
  id: string;
  domain: string;
  description: string;
  // Trigger weights: how strongly this primitive responds to each input feature
  weights: {
    stimulusIntensity: number;     // -1 to 1
    stimulusNovelty: number;       // -1 to 1
    personalRelevance: number;     // -1 to 1
    socialPresence: number;        // -1 to 1  (>0 = needs social context)
    threatLevel: number;           // -1 to 1  (>0 = activated by threat)
    choicePresent: number;         // -1 to 1  (>0 = activated by decisions)
    arousal: number;               // -1 to 1  (>0 = activated by high arousal)
    neuroticism: number;           // -1 to 1  (>0 = amplified by neuroticism)
    openness: number;              // -1 to 1
    agreeableness: number;         // -1 to 1
  };
  // Output when this primitive activates
  emotionOutput: string;           // what emotion it produces
  arousalDelta: number;            // -1 to 1
  behaviorBias: string;            // behavioral tendency
  rootCauseType: RootCause["type"];
  // Relations to other primitives
  relatesTo: string[];
  amplifies: string[];             // IDs of primitives it strengthens
  inhibits: string[];              // IDs of primitives it weakens
}

// ─── Interpreter ─────────────────────────────────────────────────────

export function predict(config: ModelConfig, situation: Situation): Response {
  const features = extractFeatures(situation);

  // Compute activation for each primitive
  const activations: { primitive: PrimitiveConfig; strength: number }[] = [];
  for (const p of config.primitives) {
    const raw = computeActivation(p, features);
    activations.push({ primitive: p, strength: raw });
  }

  // Apply amplification/inhibition between primitives
  for (const a of activations) {
    for (const targetId of a.primitive.amplifies) {
      const target = activations.find((x) => x.primitive.id === targetId);
      if (target) target.strength += a.strength * 0.3;
    }
    for (const targetId of a.primitive.inhibits) {
      const target = activations.find((x) => x.primitive.id === targetId);
      if (target) target.strength -= a.strength * 0.2;
    }
  }

  // Clamp and sort
  for (const a of activations) a.strength = Math.max(0, Math.min(1, a.strength));
  activations.sort((a, b) => b.strength - a.strength);

  // Top activated primitives drive the response
  const active = activations.filter((a) => a.strength > 0.2);
  const dominant = activations[0];
  const secondary = activations[1];

  // Build process chain
  const chain: ProcessStep[] = active.slice(0, 5).map((a) => ({
    primitive: a.primitive.id,
    input: `activation=${(a.strength * 100).toFixed(0)}%`,
    transformation: `${a.primitive.description.slice(0, 60)} → ${a.primitive.emotionOutput}`,
    output: a.primitive.behaviorBias,
  }));

  // Compose emotion from top primitives
  const emotion = dominant?.primitive.emotionOutput ?? "neutral";
  const arousalChange = active.reduce((sum, a) => sum + a.primitive.arousalDelta * a.strength, 0);

  // Compose behavior from dominant + secondary primitives
  let behavior: string;
  let decision: string | undefined;
  const domBias = dominant?.primitive.behaviorBias ?? "no response";
  if (secondary && dominant.strength - secondary.strength < 0.15 && secondary.strength > 0.3) {
    const secBias = secondary.primitive.behaviorBias;
    behavior = `${domBias}, while also ${secBias.toLowerCase().split(",")[0]}`;
  } else {
    behavior = domBias;
  }

  if (situation.stimulus.type === "choice") {
    decision = domBias;
  }

  return {
    rootCause: {
      type: dominant?.primitive.rootCauseType ?? "structural",
      mechanism: dominant?.primitive.id ?? "none",
      explanation: `${dominant?.primitive.id} activated at ${(dominant?.strength * 100).toFixed(0)}% by ${describeFeatures(features)}. ${dominant?.primitive.description.slice(0, 100)}`,
    },
    process: {
      activatedPrimitives: active.map((a) => a.primitive.id),
      chain,
    },
    effect: {
      emotionChange: emotion,
      arousalChange: Math.max(-1, Math.min(1, arousalChange)),
      attentionShift: dominant?.strength > 0.7 ? "narrows to stimulus" : "monitoring",
    },
    result: {
      behavior,
      decision,
    },
    confidence: dominant?.strength ?? 0,
  };
}

// ─── Feature Extraction ──────────────────────────────────────────────

interface Features {
  stimulusIntensity: number;
  stimulusNovelty: number;
  personalRelevance: number;
  socialPresence: number;
  threatLevel: number;
  choicePresent: number;
  arousal: number;
  neuroticism: number;
  openness: number;
  agreeableness: number;
}

function extractFeatures(s: Situation): Features {
  const socialKeywords = ["stranger", "group", "colleague", "team", "manager", "authority", "family", "partner", "friend"];
  const socialPresence = s.context.socialSetting === "alone" ? 0 :
    socialKeywords.some((k) => s.context.socialSetting.includes(k)) ? 0.8 : 0.4;

  const threatLevel = s.stimulus.intensity > 0.7 ? 0.8 :
    s.stimulus.type === "social" && s.stimulus.personalRelevance > 0.5 ? 0.5 :
    s.stimulus.intensity > 0.5 ? 0.4 : 0.1;

  return {
    stimulusIntensity: s.stimulus.intensity,
    stimulusNovelty: s.stimulus.novelty,
    personalRelevance: s.stimulus.personalRelevance,
    socialPresence,
    threatLevel,
    choicePresent: s.stimulus.type === "choice" ? 1 : 0,
    arousal: s.person.arousal,
    neuroticism: s.person.traits.neuroticism ?? 0.5,
    openness: s.person.traits.openness ?? 0.5,
    agreeableness: s.person.traits.agreeableness ?? 0.5,
  };
}

function computeActivation(p: PrimitiveConfig, f: Features): number {
  let activation = 0;
  activation += p.weights.stimulusIntensity * f.stimulusIntensity;
  activation += p.weights.stimulusNovelty * f.stimulusNovelty;
  activation += p.weights.personalRelevance * f.personalRelevance;
  activation += p.weights.socialPresence * f.socialPresence;
  activation += p.weights.threatLevel * f.threatLevel;
  activation += p.weights.choicePresent * f.choicePresent;
  activation += p.weights.arousal * f.arousal;
  activation += p.weights.neuroticism * f.neuroticism;
  activation += p.weights.openness * f.openness;
  activation += p.weights.agreeableness * f.agreeableness;
  return activation;
}

function describeFeatures(f: Features): string {
  const parts: string[] = [];
  if (f.stimulusIntensity > 0.6) parts.push("high-intensity stimulus");
  if (f.socialPresence > 0.5) parts.push("social context");
  if (f.threatLevel > 0.5) parts.push("threat detected");
  if (f.choicePresent > 0.5) parts.push("decision required");
  if (f.stimulusNovelty > 0.6) parts.push("novel situation");
  return parts.join(", ") || "neutral situation";
}

// ─── Convert to Primitive interface (for compatibility) ──────────────

export function configToPrimitives(config: ModelConfig): Primitive[] {
  return config.primitives.map((p) => ({
    id: p.id,
    domain: p.domain,
    description: p.description,
    triggers: Object.entries(p.weights)
      .filter(([_, v]) => v > 0.3)
      .map(([k]) => k),
    transformation: `${p.emotionOutput} → ${p.behaviorBias}`,
    relatesTo: [...p.relatesTo, ...p.amplifies, ...p.inhibits],
    relationDescription: `amplifies: ${p.amplifies.join(",")} inhibits: ${p.inhibits.join(",")}`,
  }));
}

// ─── Run evaluation (when executed as subprocess) ────────────────────

export async function evaluateConfig(config: ModelConfig): Promise<void> {
  const benchmarks: HumanBenchmark[] = [];
  for await (const path of walkDir("benchmarks")) {
    if (path.endsWith(".json")) {
      benchmarks.push(JSON.parse(await Deno.readTextFile(path)));
    }
  }

  const predictions = benchmarks.map((b) => {
    try {
      const r = predict(config, b.situation);
      return { id: b.id, domain: b.domain, name: b.name, behavior: r.result.behavior.slice(0, 80), emotion: r.effect.emotionChange, mechanism: r.rootCause.mechanism, confidence: r.confidence };
    } catch {
      return { id: b.id, domain: b.domain, name: b.name, behavior: "CRASHED", emotion: "none", mechanism: "none", confidence: 0 };
    }
  });

  // Structural coherence
  const ids = new Set(config.primitives.map((p) => p.id));
  let validRefs = 0, totalRefs = 0;
  for (const p of config.primitives) {
    for (const r of [...p.relatesTo, ...p.amplifies, ...p.inhibits]) {
      totalRefs++;
      if (ids.has(r)) validRefs++;
    }
  }
  const coherence = totalRefs > 0 ? validRefs / totalRefs : 0;

  // Check output diversity (penalty for identical outputs)
  const behaviors = predictions.map((p) => p.behavior);
  const uniqueBehaviors = new Set(behaviors).size;
  const diversityRatio = uniqueBehaviors / Math.max(behaviors.length, 1);

  console.log(JSON.stringify({
    fitness: 0,
    coherence,
    diversityRatio,
    primitiveCount: config.primitives.length,
    modelName: config.name,
    modelVersion: config.version,
    modelDescription: config.description,
    primitives: config.primitives.map((p) => `${p.id}: ${p.description.slice(0, 50)}`).join(" | "),
    predictions,
    benchmarkCount: benchmarks.length,
    uniqueBehaviors,
    passed: predictions.filter((p) => p.confidence > 0.2).length,
  }));
}

async function* walkDir(dir: string): AsyncGenerator<string> {
  for await (const entry of Deno.readDir(dir)) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory) yield* walkDir(path);
    else yield path;
  }
}
