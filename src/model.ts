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

// ─── Calibrated Domain Priors ────────────────────────────────────────
// Empirically grounded prior distributions per psychological domain.
// π_d = 1/σ²_d where σ_d comes from published effect-size distributions.
//
// Sources:
//   loss_aversion_ratio = 2.25  (Kahneman & Tversky 1979, Prospect Theory)
//   present_bias β = 0.70       (Laibson 1997, hyperbolic discounting)
//   social_comparison_weight = 0.70  (Festinger 1954)
//   threat_prior_precision_mult = 3.0 (evolutionary asymmetry, Öhman 2001)
//   authority_compliance = 0.65 (Milgram 1963)

type NeedPrior = { expected: number; precision: number };

const DOMAIN_PRIORS: Record<string, Record<string, NeedPrior>> = {
  // Loss aversion 2.25× → safety precision boosted by that ratio
  decision: {
    safety:      { expected: 0.15, precision: 6.75 }, // 3.0 × 2.25
    achievement: { expected: 0.35, precision: 1.2  }, // gains discounted (present-bias β=0.7)
    autonomy:    { expected: 0.45, precision: 1.3  },
    belonging:   { expected: 0.40, precision: 1.5  },
    fairness:    { expected: 0.40, precision: 3.0  },
  },
  // Social comparison weight 0.70 → belonging/esteem highly precise
  social: {
    belonging:   { expected: 0.60, precision: 4.0 }, // 2.0 × 2.0
    esteem:      { expected: 0.55, precision: 3.5 },
    safety:      { expected: 0.30, precision: 2.0 },
    fairness:    { expected: 0.45, precision: 3.5 },
    autonomy:    { expected: 0.30, precision: 1.2 },
  },
  // Threat asymmetry 3× baseline (evolutionary negativity bias)
  emotion: {
    safety:        { expected: 0.15, precision: 9.0 }, // 3.0 × 3.0
    belonging:     { expected: 0.50, precision: 2.5 },
    esteem:        { expected: 0.45, precision: 2.5 },
    pleasure:      { expected: 0.40, precision: 1.5 },
    understanding: { expected: 0.35, precision: 1.2 },
  },
  // Achievement and autonomy are primary motivators (Self-Determination Theory)
  motivation: {
    achievement: { expected: 0.55, precision: 3.0 },
    autonomy:    { expected: 0.55, precision: 2.5 },
    belonging:   { expected: 0.45, precision: 1.8 },
    esteem:      { expected: 0.50, precision: 2.2 },
    pleasure:    { expected: 0.45, precision: 1.5 },
  },
  // Attachment theory: safety + belonging core in development
  development: {
    safety:      { expected: 0.30, precision: 4.5 },
    belonging:   { expected: 0.65, precision: 3.5 },
    esteem:      { expected: 0.40, precision: 2.0 },
    autonomy:    { expected: 0.35, precision: 1.8 },
    achievement: { expected: 0.35, precision: 1.5 },
  },
  // Anchoring + confirmation: understanding highly active
  "cognitive-bias": {
    understanding: { expected: 0.60, precision: 3.0 },
    achievement:   { expected: 0.50, precision: 2.0 },
    autonomy:      { expected: 0.55, precision: 2.0 },
    safety:        { expected: 0.25, precision: 2.5 },
    esteem:        { expected: 0.45, precision: 1.8 },
  },
  // Personality: all needs active, trait-driven
  personality: {
    esteem:        { expected: 0.50, precision: 2.5 },
    autonomy:      { expected: 0.55, precision: 2.0 },
    belonging:     { expected: 0.50, precision: 2.0 },
    achievement:   { expected: 0.45, precision: 1.8 },
    understanding: { expected: 0.45, precision: 1.5 },
  },
  // Psychopathology: hyper-vigilance → safety precision 10×
  psychopathology: {
    safety:        { expected: 0.10, precision: 10.0 },
    belonging:     { expected: 0.30, precision: 3.5  },
    esteem:        { expected: 0.20, precision: 4.0  },
    autonomy:      { expected: 0.25, precision: 2.5  },
    understanding: { expected: 0.30, precision: 1.5  },
  },
};

// Canonical need names — map synonyms to the 8 core needs
function normalizeNeed(need: string): string {
  const n = need.toLowerCase().trim();
  const aliases: Record<string, string> = {
    security: "safety", protection: "safety", threat: "safety",
    connection: "belonging", love: "belonging", affiliation: "belonging", social: "belonging",
    "self-esteem": "esteem", recognition: "esteem", status: "esteem", respect: "esteem",
    control: "autonomy", freedom: "autonomy", independence: "autonomy",
    mastery: "achievement", competence: "achievement", "self-efficacy": "achievement",
    justice: "fairness", equity: "fairness",
    curiosity: "understanding", learning: "understanding", knowledge: "understanding",
    comfort: "pleasure", enjoyment: "pleasure",
  };
  return aliases[n] ?? n.replace(/\s+/g, "-");
}

// Modulate precision by the person's Big Five traits (empirical correlations)
function traitPrecisionMod(traits: Record<string, number>, need: string): number {
  const t = (k: string) => traits[k] ?? 0.5;
  switch (need) {
    case "safety":        return 0.5 + t("neuroticism");
    case "belonging":     return 0.5 + t("extraversion") * 0.7 + t("agreeableness") * 0.3;
    case "esteem":        return 0.5 + (1 - t("neuroticism")) * 0.5 + t("extraversion") * 0.5;
    case "achievement":   return 0.5 + t("conscientiousness");
    case "autonomy":      return 0.5 + t("openness") * 0.6 + (1 - t("agreeableness")) * 0.4;
    case "understanding": return 0.5 + t("openness");
    case "fairness":      return 0.5 + t("agreeableness") * 0.7 + t("conscientiousness") * 0.3;
    case "pleasure":      return 0.5 + t("extraversion") * 0.6 + t("openness") * 0.4;
    default:              return 1.0;
  }
}

// Infer domain from stimulus features + context (no domain field in Situation)
function inferDomain(situation: Situation): string {
  const { stimulus, person, context } = situation;
  const stype = stimulus.type.toLowerCase();
  const env   = context.environment.toLowerCase();
  const social = context.socialSetting.toLowerCase();

  if (stype === "choice") return "decision";
  if (stype === "social" || social.includes("group") || social.includes("peer") ||
      social.includes("crowd") || social.includes("others")) return "social";
  if (stype === "information") return "cognitive-bias";
  if (stype === "internal") {
    const motivNeeds = ["achievement", "autonomy", "mastery", "competence"];
    if (person.needs.some(n => motivNeeds.includes(n.toLowerCase()))) return "motivation";
    return "emotion";
  }
  if (env.includes("school") || env.includes("home") || env.includes("family") ||
      env.includes("child") || env.includes("parent")) return "development";
  const bigFive = ["openness", "conscientiousness", "neuroticism", "extraversion", "agreeableness"];
  if (bigFive.some(t => t in person.traits)) {
    if (stimulus.novelty > 0.5 || stype === "event") return "personality";
  }
  if (person.arousal > 0.75 && (person.history?.length ?? 0) >= 2) return "psychopathology";
  return "emotion";
}

const THREAT_STIMULI = new Set(["threat", "loss", "rejection", "failure", "danger", "conflict", "criticism"]);
const GAIN_STIMULI   = new Set(["reward", "success", "praise", "opportunity", "connection", "discovery", "achievement"]);

export function predict(situation: Situation): Response {
  const { person, stimulus } = situation;
  const obs = stimulus.personalRelevance; // 0–1 observation
  const arousal = person.arousal ?? 0.5;   // precision multiplier

  // Infer domain and load calibrated priors
  const domain = inferDomain(situation);
  const domainPriors = DOMAIN_PRIORS[domain] ?? {};

  // Build priors from person's needs (fall back to generic prior)
  let maxF = -1;
  let dominantNeed = "unknown";

  const activeNeeds = person.needs.length > 0 ? person.needs : Object.keys(NEED_PRIORS);

  for (const need of activeNeeds) {
    const key = normalizeNeed(need);
    // Domain prior takes precedence; fall back to base prior
    const prior: NeedPrior = domainPriors[key] ?? NEED_PRIORS[key] ?? { expected: 0.4, precision: 1.0 };
    const traitMod = traitPrecisionMod(person.traits, key);
    const scaledPrecision = prior.precision * traitMod * (0.5 + arousal);
    const pe = Math.abs(obs - prior.expected);
    const F = pe * pe * scaledPrecision;
    if (F > maxF) { maxF = F; dominantNeed = need; }
  }

  const pe = Math.sqrt(maxF / Math.max((0.5 + arousal), 0.001));
  const isThreat = THREAT_STIMULI.has(stimulus.type.toLowerCase()) || obs < 0.3;
  const isGain   = GAIN_STIMULI.has(stimulus.type.toLowerCase())   || obs > 0.7;
  const PE_THRESHOLD = 0.25;

  // Emotion — Russell (1980) Circumplex: valence × arousal → 3×3 grid
  // valence = tanh((gain ? +1 : -1) × pe × 2), clamped to [-1, 1]
  const valenceSign = isGain ? 1 : isThreat ? -1 : 0;
  const valence = Math.tanh(valenceSign * pe * 2);

  // Bin arousal and valence into low/mid/high and neg/neutral/pos
  const arousalBin = arousal >= 0.67 ? "high" : arousal >= 0.33 ? "mid" : "low";
  const valenceBin = valence >= 0.33 ? "pos" : valence <= -0.33 ? "neg" : "neutral";

  // Circumplex grid (Russell 1980): arousal × valence → emotion label
  const CIRCUMPLEX: Record<string, Record<string, string>> = {
    high: { pos: "excited",   neutral: "alert",   neg: isThreat ? "terrified" : "angry" },
    mid:  { pos: "happy",     neutral: "neutral",  neg: isThreat ? "anxious"   : "sad"  },
    low:  { pos: "content",   neutral: "bored",    neg: "depressed" },
  };

  const emotion = CIRCUMPLEX[arousalBin][valenceBin];

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
    rootCause: `${dominantNeed} need [${domain}] — prediction error ${pe.toFixed(2)}`,
    process: `active-inference: F=${maxF.toFixed(3)}, PE=${pe.toFixed(2)}, arousal=${arousal}, domain=${domain}`,
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
