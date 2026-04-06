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

// ─── Prospect Theory Value Function (Kahneman & Tversky 1979) ─────────
// v(Δ) = Δ^α         for Δ ≥ 0  (gains: diminishing sensitivity)
// v(Δ) = -λ(-Δ)^α   for Δ < 0  (losses: amplified by λ=2.25)
// α=0.88 (curvature), λ=2.25 (loss aversion ratio)
// Applied when domain='decision': transforms observed relevance relative to
// person's hedonic reference point before free energy computation.
// Explains: loss aversion, status quo bias, endowment effect, sunk cost fallacy.
// Source: Kahneman, D. & Tversky, A. (1979). Prospect Theory. Econometrica, 47(2), 263–292.

const PT_ALPHA  = 0.88;
const PT_LAMBDA = 2.25;

function prospectValue(delta: number): number {
  if (delta >= 0) return Math.pow(delta, PT_ALPHA);
  return -PT_LAMBDA * Math.pow(-delta, PT_ALPHA);
}

// Infer hedonic reference point from emotionalState + neuroticism
// Positive emotional state → higher baseline (gains feel smaller from there)
// Negative emotional state → lower baseline (losses feel larger from there)
// Neuroticism shifts baseline down: more loss-sensitive
function inferReferencePoint(person: Situation["person"]): number {
  const es = person.emotionalState.toLowerCase();
  const POSITIVE_STATES = ["happy", "joyful", "excited", "elated", "content", "cheerful", "positive", "calm", "relaxed"];
  const NEGATIVE_STATES = ["sad", "anxious", "fearful", "angry", "depressed", "negative", "despondent", "hopeless", "guilty", "ashamed", "frustrated"];
  let base: number;
  if (POSITIVE_STATES.some(s => es.includes(s))) {
    base = 0.6;
  } else if (NEGATIVE_STATES.some(s => es.includes(s))) {
    base = 0.35;
  } else {
    base = 0.5; // neutral
  }
  const neuroticism = person.traits["neuroticism"] ?? 0.5;
  return Math.max(0.05, Math.min(0.95, base - 0.15 * neuroticism));
}

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

// ─── Polyvagal Gate (Porges 1994) ────────────────────────────────────
// Autonomic state pre-filters which needs are reachable before active inference.
// Three circuits map to Porges' three vagal pathways:
//   SAFE     → ventral vagal: full need-space active, baseline precision
//   MOBILIZED → sympathetic: safety/esteem/fairness amplified ×2, others dampened
//   SHUTDOWN  → dorsal vagal: collapse all needs to safety ×5, behavior forced to withdrawal/freeze
//
// Math: autonomicState = argmax{ SAFE: σ(−arousal), MOBILIZED: σ(arousal−0.4)×threatFlag,
//                                SHUTDOWN: σ(arousal−0.75)×(historyDepth/5) }
// Precision_need *= stateMultiplier[autonomicState][need]

type AutonomicState = "SAFE" | "MOBILIZED" | "SHUTDOWN";

function _sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x * 6)); // steep sigmoid for clear state transitions
}

function computeAutonomicState(
  arousal: number,
  stimulusType: string,
  history: string[]
): { state: AutonomicState; precisionMult: Record<string, number> } {
  const threatFlag = THREAT_STIMULI.has(stimulusType.toLowerCase()) ? 1 : 0;
  const historyDepth = Math.min(history.length, 5);

  const scoreSafe      = _sigmoid(-arousal + 0.5);           // peaks when arousal low
  const scoreMobilized = _sigmoid(arousal - 0.4) * (0.5 + threatFlag * 0.5);
  const scoreShutdown  = _sigmoid(arousal - 0.75) * (historyDepth / 5);

  let state: AutonomicState;
  if (scoreShutdown > scoreMobilized && scoreShutdown > scoreSafe) {
    state = "SHUTDOWN";
  } else if (scoreMobilized > scoreSafe) {
    state = "MOBILIZED";
  } else {
    state = "SAFE";
  }

  // Per-need precision multipliers per autonomic state
  const PRECISION_MULTS: Record<AutonomicState, Record<string, number>> = {
    SAFE: {
      safety: 1.0, belonging: 1.0, esteem: 1.0, autonomy: 1.0,
      achievement: 1.0, fairness: 1.0, understanding: 1.0, pleasure: 1.0,
    },
    MOBILIZED: {
      safety: 2.0, belonging: 1.2, esteem: 2.0, autonomy: 0.7,
      achievement: 0.5, fairness: 2.0, understanding: 0.5, pleasure: 0.3,
    },
    SHUTDOWN: {
      safety: 5.0, belonging: 0.2, esteem: 0.1, autonomy: 0.1,
      achievement: 0.1, fairness: 0.1, understanding: 0.1, pleasure: 0.1,
    },
  };

  return { state, precisionMult: PRECISION_MULTS[state] };
}

// ─── Attractor Landscape Dynamics ────────────────────────────────────
// Person = dynamical system; 3–5 stable attractor states per domain.
// Stimulus applies a force vector; response = attractor basin that captures trajectory.
// Basin depth = baseDepth × arousalMod × historyMod.
// Deep attractors: trauma, pathology, habit. Shallow: healthy flexibility.
// Math: X_final = X_person + F_stimulus; winner = argmin_i (|X_final − A_i|² / depth_i)
// Deep basins (depth ≥ 3.0) override domain template behavior — explains why willpower fails.

interface Attractor {
  name: string;
  pos: [number, number]; // [valence, arousal]  valence ∈ [-1,1], arousal ∈ [0,1]
  baseDepth: number;     // 1.0 = normal; >3 = pathological/habitual
}

const DOMAIN_ATTRACTORS: Record<string, Attractor[]> = {
  "cognitive-bias": [
    { name: "heuristic-fast",   pos: [ 0.0,  0.3], baseDepth: 2.5 },
    { name: "maintain-belief",  pos: [-0.1,  0.2], baseDepth: 2.0 },
    { name: "update-belief",    pos: [ 0.4,  0.4], baseDepth: 0.8 },
  ],
  decision: [
    { name: "risk-averse",   pos: [-0.2, 0.4], baseDepth: 2.5 },
    { name: "risk-seeking",  pos: [ 0.3, 0.6], baseDepth: 1.5 },
    { name: "deliberate",    pos: [ 0.1, 0.3], baseDepth: 1.2 },
    { name: "satisfice",     pos: [ 0.0, 0.5], baseDepth: 1.8 },
  ],
  social: [
    { name: "conform",   pos: [ 0.2, 0.4], baseDepth: 2.0 },
    { name: "assert",    pos: [ 0.4, 0.6], baseDepth: 1.5 },
    { name: "withdraw",  pos: [-0.4, 0.3], baseDepth: 1.8 },
    { name: "compete",   pos: [ 0.1, 0.7], baseDepth: 1.2 },
  ],
  emotion: [
    { name: "approach",   pos: [ 0.6, 0.5], baseDepth: 1.5 },
    { name: "reappraise", pos: [ 0.2, 0.4], baseDepth: 1.2 },
    { name: "avoid",      pos: [-0.3, 0.6], baseDepth: 2.0 },
    { name: "freeze",     pos: [-0.1, 0.9], baseDepth: 1.8 },
    { name: "suppress",   pos: [ 0.0, 0.2], baseDepth: 1.5 },
  ],
  motivation: [
    { name: "pursue-goal",   pos: [ 0.5, 0.6], baseDepth: 2.0 },
    { name: "seek-reward",   pos: [ 0.3, 0.5], baseDepth: 1.5 },
    { name: "avoid-failure", pos: [-0.3, 0.5], baseDepth: 2.0 },
    { name: "disengage",     pos: [-0.1, 0.2], baseDepth: 1.2 },
  ],
  development: [
    { name: "explore",      pos: [ 0.5, 0.6], baseDepth: 1.5 },
    { name: "attach",       pos: [ 0.2, 0.4], baseDepth: 2.5 },
    { name: "regress",      pos: [-0.2, 0.7], baseDepth: 1.8 },
    { name: "individuate",  pos: [ 0.4, 0.5], baseDepth: 1.2 },
  ],
  personality: [
    { name: "approach-novel",  pos: [ 0.6, 0.5], baseDepth: 1.5 },
    { name: "maintain-habit",  pos: [ 0.1, 0.3], baseDepth: 2.0 },
    { name: "social-engage",   pos: [ 0.5, 0.7], baseDepth: 1.8 },
    { name: "withdraw",        pos: [-0.2, 0.3], baseDepth: 1.5 },
    { name: "ruminate",        pos: [-0.4, 0.5], baseDepth: 2.0 },
  ],
  psychopathology: [
    { name: "avoidance",      pos: [-0.5, 0.7], baseDepth: 4.0 }, // anxiety — very deep
    { name: "rumination",     pos: [-0.4, 0.3], baseDepth: 3.5 }, // depression
    { name: "ritualize",      pos: [ 0.0, 0.6], baseDepth: 3.0 }, // OCD
    { name: "hypervigilance", pos: [-0.3, 0.9], baseDepth: 4.5 }, // PTSD — deepest
    { name: "withdraw",       pos: [-0.6, 0.2], baseDepth: 3.0 }, // depression withdrawal
  ],
};

// Map emotional state string → (valence, arousal) position
function emotionalStateToPos(emotionalState: string, arousal: number): [number, number] {
  const s = emotionalState.toLowerCase();
  const V: Record<string, number> = {
    anxious: -0.6, fearful: -0.7, afraid: -0.7, scared: -0.7,
    angry: -0.4, frustrated: -0.4, irritated: -0.3,
    sad: -0.5, depressed: -0.7, hopeless: -0.8, despondent: -0.7,
    happy: 0.7, joyful: 0.8, elated: 0.9,
    content: 0.4, calm: 0.3, relaxed: 0.3,
    excited: 0.7, energized: 0.5, eager: 0.6,
    neutral: 0.0, okay: 0.1, curious: 0.4, interested: 0.3,
    guilty: -0.4, ashamed: -0.5,
  };
  return [V[s] ?? 0.0, arousal];
}

// Compute stimulus force vector Δ(valence, arousal)
function computeForce(situation: Situation): [number, number] {
  const { stimulus } = situation;
  const stype = stimulus.type.toLowerCase();
  if (THREAT_STIMULI.has(stype)) {
    return [
      -stimulus.intensity * stimulus.personalRelevance * 0.6,
       stimulus.intensity * 0.4,
    ];
  }
  if (GAIN_STIMULI.has(stype)) {
    return [
       stimulus.intensity * stimulus.personalRelevance * 0.5,
       stimulus.intensity * 0.2,
    ];
  }
  return [
    (stimulus.personalRelevance - 0.5) * stimulus.intensity * 0.4,
     stimulus.novelty * stimulus.intensity * 0.3,
  ];
}

// Select dominant attractor: winner = argmin_i (dist² / depth_i)
// Deeper basins have larger effective capture radius.
function selectAttractor(
  domain: string,
  personPos: [number, number],
  force: [number, number],
  person: Situation["person"],
  narrative?: { agency: number; communion: number }
): { attractor: Attractor; depth: number } {
  const attractors = DOMAIN_ATTRACTORS[domain] ?? DOMAIN_ATTRACTORS.emotion;

  // X_final = current position + stimulus force, clamped to valid range
  const xF: [number, number] = [
    Math.max(-1, Math.min(1, personPos[0] + force[0])),
    Math.max(0,  Math.min(1, personPos[1] + force[1])),
  ];

  // History deepens basins: repeated exposure = stronger habit/trauma
  const historyLen = person.history?.length ?? 0;
  const historyMod = 1 + Math.min(historyLen * 0.3, 2.0); // cap at 3×

  // High arousal amplifies all attractor depths (emotional override)
  const arousalMod = 0.5 + person.arousal;

  let bestScore = Infinity;
  let best = attractors[0];
  let bestDepth = best.baseDepth * arousalMod * historyMod;

  for (const a of attractors) {
    let depth = a.baseDepth * arousalMod * historyMod;

    // Narrative alignment modulation (McAdams 1993)
    // Attractors matching the person's narrative schema are deeper (identity-reinforcing)
    // Misaligned attractors are shallower (identity-threatening, harder to enter)
    if (narrative) {
      const alignment = computeNarrativeAlignment(a.name, narrative);
      depth *= (0.5 + alignment); // aligned ~×1.5, misaligned ~×0.5
    }

    const dx = xF[0] - a.pos[0];
    const dy = xF[1] - a.pos[1];
    const score = (dx * dx + dy * dy) / Math.max(depth, 0.001);
    if (score < bestScore) { bestScore = score; best = a; bestDepth = depth; }
  }

  return { attractor: best, depth: bestDepth };
}

// ─── Domain-Specific Prediction Templates ────────────────────────────
// Pre-structure output by domain before/after active inference.
// Each template rewrites rootCause, process, and behavior to be concrete
// and domain-specific, enabling semantic matching to score accurately.

type DomainTemplate = (situation: Situation, response: Response) => Response;

function cognitiveBiasTemplate(situation: Situation, response: Response): Response {
  const desc = `${situation.stimulus.description} ${situation.stimulus.type}`.toLowerCase();
  const openness = situation.person.traits["openness"] ?? 0.5;

  let bias = "heuristic-processing";
  let mechanism = "mental shortcut applied to reduce cognitive load";
  let biasBehavior = "maintain-existing-belief";

  if (desc.includes("anchor") || desc.includes("first") || desc.includes("initial")) {
    bias = "anchoring"; mechanism = "initial value anchors estimates; insufficient adjustment"; biasBehavior = "anchor-and-adjust";
  } else if (desc.includes("confirm") || desc.includes("belief") || desc.includes("agree")) {
    bias = "confirmation-bias"; mechanism = "seek/interpret info to confirm pre-existing belief"; biasBehavior = "seek-confirming-evidence";
  } else if (desc.includes("recent") || desc.includes("remember") || desc.includes("vivid") || desc.includes("news")) {
    bias = "availability-heuristic"; mechanism = "frequency judged by ease of recall; vivid events overweighted"; biasBehavior = "overweight-salient-examples";
  } else if (desc.includes("frame") || desc.includes("saving") || (desc.includes("loss") && desc.includes("gain"))) {
    bias = "framing-effect"; mechanism = "choice architecture shifts reference point; loss frame triggers risk-seeking"; biasBehavior = "frame-dependent-choice";
  } else if (desc.includes("sunk") || desc.includes("invested") || desc.includes("already")) {
    bias = "sunk-cost"; mechanism = "past irrecoverable costs influence future decisions"; biasBehavior = "continue-to-avoid-loss";
  } else if (desc.includes("everyone") || desc.includes("popular") || desc.includes("most people")) {
    bias = "bandwagon"; mechanism = "social proof heuristic; conformity to perceived majority"; biasBehavior = "conform-to-majority";
  } else if (desc.includes("hindsight") || desc.includes("knew") || desc.includes("obvious")) {
    bias = "hindsight-bias"; mechanism = "post-hoc belief that outcome was predictable; narrative reconstruction"; biasBehavior = "I-knew-it-all-along";
  } else if (desc.includes("overconfid") || desc.includes("expert") || desc.includes("better than")) {
    bias = "overconfidence"; mechanism = "confidence exceeds calibrated accuracy; unknown unknowns underweighted"; biasBehavior = "overestimate-own-ability";
  }

  const strengthMod = openness > 0.7 ? "attenuated" : openness < 0.3 ? "amplified" : "typical";
  return {
    ...response,
    rootCause: `${bias} — System 1 heuristic overrides deliberate reasoning`,
    process: `cognitive-bias: ${mechanism} [${strengthMod} by openness=${openness.toFixed(2)}]`,
    behavior: biasBehavior,
  };
}

function emotionTemplate(situation: Situation, response: Response): Response {
  const { person, stimulus } = situation;
  const arousal = person.arousal;
  const emotionalState = (person.emotionalState ?? "neutral").toLowerCase();
  const neuroticism = person.traits["neuroticism"] ?? 0.5;

  let regulation: string;
  if (arousal > 0.7 && neuroticism > 0.6) regulation = "rumination";
  else if (arousal > 0.7) regulation = "reappraisal";
  else if (neuroticism > 0.7) regulation = "suppression";
  else regulation = "acceptance";

  return {
    ...response,
    rootCause: `affective response to ${stimulus.type}: circumplex → ${response.emotion} [regulation:${regulation}]`,
    process: `${response.process} → regulation:${regulation} [baseline:${emotionalState}]`,
  };
}

function socialTemplate(situation: Situation, response: Response): Response {
  const { person, stimulus, context } = situation;
  const desc = `${stimulus.description} ${stimulus.type} ${context.socialSetting}`.toLowerCase();
  const agreeableness = person.traits["agreeableness"] ?? 0.5;

  let mechanism = "social-influence";
  let socialBehavior = response.behavior;
  let rootCause = response.rootCause;

  if (desc.includes("norm") || desc.includes("rule") || desc.includes("violat") || desc.includes("unfair")) {
    mechanism = "norm-violation-detection";
    socialBehavior = "enforce-norm";
    rootCause = `social norm violation → fairness/belonging need activated`;
  } else if (desc.includes("conform") || desc.includes("pressure") || desc.includes("group")) {
    mechanism = "conformity-pressure";
    socialBehavior = agreeableness > 0.6 ? "conform" : "resist-pressure";
    rootCause = `conformity pressure — agreeableness=${agreeableness.toFixed(2)} → ${socialBehavior}`;
  } else if (desc.includes("authority") || desc.includes("order") || desc.includes("obey") || desc.includes("command")) {
    mechanism = "authority-compliance";
    socialBehavior = "comply-with-authority";
    rootCause = `authority cue triggers compliance (Milgram effect, p=0.65)`;
  } else if (desc.includes("comparison") || desc.includes("status") || desc.includes("better than") || desc.includes("worse")) {
    mechanism = "social-comparison";
    socialBehavior = stimulus.personalRelevance > 0.5 ? "self-enhance" : "self-protect";
    rootCause = `social comparison (Festinger 1954) — esteem need → ${socialBehavior}`;
  } else if (desc.includes("help") || desc.includes("bystander") || desc.includes("assist")) {
    mechanism = "bystander-effect";
    socialBehavior = agreeableness > 0.5 ? "help" : "diffuse-responsibility";
    rootCause = `bystander situation — agreeableness=${agreeableness.toFixed(2)} → ${socialBehavior}`;
  }

  return {
    ...response,
    rootCause,
    process: `social: ${mechanism} — ${context.socialSetting}`,
    behavior: socialBehavior,
  };
}

function decisionTemplate(situation: Situation, response: Response): Response {
  const { stimulus, person, context } = situation;
  const desc = stimulus.description.toLowerCase();

  const isLossFrame = desc.includes("lose") || desc.includes("loss") || desc.includes("cost") ||
                      desc.includes("risk") || desc.includes("miss") || stimulus.personalRelevance < 0.4;
  const isGainFrame = desc.includes("gain") || desc.includes("win") || desc.includes("profit") ||
                      desc.includes("save") || desc.includes("earn") || stimulus.personalRelevance > 0.6;

  let decisionBehavior: string;
  let ptProcess: string;

  if (isLossFrame && !isGainFrame) {
    decisionBehavior = "risk-seeking";
    ptProcess = "prospect-theory(KT1979): loss-frame → risk-seeking [v(Δ)=-2.25(-Δ)^0.88, loss-aversion-amplified-F]";
  } else if (isGainFrame && !isLossFrame) {
    decisionBehavior = "risk-averse";
    ptProcess = "prospect-theory(KT1979): gain-frame → risk-aversion [v(Δ)=Δ^0.88, diminishing-sensitivity, status-quo-bias]";
  } else {
    decisionBehavior = "deliberate";
    ptProcess = "prospect-theory(KT1979): ambiguous-frame → deliberation [reference-point-anchored, endowment-effect-active]";
  }

  if (context.timeConstraint) {
    ptProcess += ` + present-bias (β=0.70): time pressure amplifies immediate-option preference`;
    decisionBehavior = isLossFrame ? "panic-choose" : "satisfice";
  }

  const conscientiousness = person.traits["conscientiousness"] ?? 0.5;
  return {
    ...response,
    rootCause: `decision-under-uncertainty: ${isLossFrame && !isGainFrame ? "loss-aversion dominates" : isGainFrame ? "certainty-effect dominates" : "reference-point ambiguous"} [conscientiousness=${conscientiousness.toFixed(2)}]`,
    process: ptProcess,
    behavior: decisionBehavior,
  };
}

function developmentTemplate(situation: Situation, response: Response): Response {
  const { person, stimulus, context } = situation;
  const desc = `${stimulus.description} ${context.environment}`.toLowerCase();

  let stage = "adult";
  let stageProcess = "Erikson:generativity-vs-stagnation — meaning and contribution drives";
  let stageBehavior = response.behavior;

  if (desc.includes("infant") || desc.includes("toddler") || desc.includes("preschool")) {
    stage = "early-childhood";
    stageProcess = "Piaget:preoperational — egocentrism, magical thinking; Erikson:initiative-vs-guilt";
    stageBehavior = "imitate-caregiver";
  } else if (desc.includes("attach") || desc.includes("caregiver") || desc.includes("parent") || desc.includes("separation")) {
    stage = "attachment";
    stageProcess = "Bowlby:attachment-theory — secure/anxious/avoidant pattern activation";
    stageBehavior = person.needs.includes("safety") ? "proximity-seeking" : "independence-assertion";
  } else if (desc.includes("school") || desc.includes("grade") || desc.includes("peer") || desc.includes("child")) {
    stage = "middle-childhood";
    stageProcess = "Piaget:concrete-operational + Erikson:industry-vs-inferiority";
    stageBehavior = "seek-peer-validation";
  } else if (desc.includes("teen") || desc.includes("adolesc") || desc.includes("identity") || desc.includes("puberty")) {
    stage = "adolescence";
    stageProcess = "Erikson:identity-vs-role-confusion — individuation and peer-group anchoring";
    stageBehavior = "identity-exploration";
  }

  return {
    ...response,
    rootCause: `developmental [${stage}]: ${response.rootCause}`,
    process: `development: ${stageProcess}`,
    behavior: stageBehavior,
  };
}

function personalityTemplate(situation: Situation, response: Response): Response {
  const { person, stimulus } = situation;
  const traits = person.traits;
  const bigFive = ["openness", "conscientiousness", "extraversion", "agreeableness", "neuroticism"];

  let dominantTrait = "neuroticism";
  let maxDeviation = 0;
  for (const t of bigFive) {
    const dev = Math.abs((traits[t] ?? 0.5) - 0.5);
    if (dev > maxDeviation) { maxDeviation = dev; dominantTrait = t; }
  }
  const val = traits[dominantTrait] ?? 0.5;
  const high = val > 0.5;

  const patterns: Record<string, { hi: string; lo: string; hiP: string; loP: string }> = {
    openness:          { hi: "explore-novelty",        lo: "prefer-familiar",       hiP: "intellectual curiosity drives approach",     loP: "conventional preference → avoidance" },
    conscientiousness: { hi: "plan-and-execute",        lo: "impulsive-response",    hiP: "goal-directed self-regulation",             loP: "low delay-of-gratification" },
    extraversion:      { hi: "social-engagement",       lo: "withdraw",              hiP: "social reward-seeking",                    loP: "solitude preference" },
    agreeableness:     { hi: "cooperate",               lo: "compete",               hiP: "prosocial orientation",                    loP: "self-interest prioritized" },
    neuroticism:       { hi: "ruminate",                lo: "cope-adaptively",       hiP: "negative affect amplification",            loP: "emotional stability" },
  };
  const p = patterns[dominantTrait];

  return {
    ...response,
    rootCause: `personality: ${dominantTrait}=${val.toFixed(2)} shapes response to ${stimulus.type}`,
    process: `personality: Big5/${dominantTrait}=${val.toFixed(2)} — ${high ? p.hiP : p.loP}`,
    behavior: high ? p.hi : p.lo,
  };
}

function psychopathologyTemplate(situation: Situation, response: Response): Response {
  const { person, stimulus } = situation;
  const desc = `${stimulus.description} ${stimulus.type}`.toLowerCase();
  const emotionalState = (person.emotionalState ?? "").toLowerCase();
  const arousal = person.arousal;

  let cluster = "general-distress";
  let clusterProcess = "general distress → emotion dysregulation → maladaptive coping";
  let clusterBehavior = "seek-reassurance";

  if (emotionalState.includes("anxious") || emotionalState.includes("fear") ||
      (arousal > 0.75 && (desc.includes("threat") || desc.includes("danger")))) {
    cluster = "anxiety-spectrum";
    clusterProcess = "amygdala hyperactivation → anticipatory-fear generalization → avoidance-reinforcement cycle";
    clusterBehavior = "avoidance";
  } else if (emotionalState.includes("sad") || emotionalState.includes("depress") || emotionalState.includes("hopeless") ||
             (arousal < 0.3 && stimulus.intensity > 0.6)) {
    cluster = "depressive-spectrum";
    clusterProcess = "negative cognitive triad (self/world/future) + anhedonia → motivational deficit";
    clusterBehavior = "withdrawal";
  } else if (desc.includes("intrusive") || desc.includes("compuls") || desc.includes("repeat") || desc.includes("ritual")) {
    cluster = "OCD-spectrum";
    clusterProcess = "intrusive thought → distress → compulsive neutralizing → temporary relief → reinforcement";
    clusterBehavior = "ritualize";
  } else if (arousal > 0.8 && (desc.includes("trauma") || desc.includes("flashback") ||
             (person.history ?? []).some(h => h.toLowerCase().includes("trauma")))) {
    cluster = "trauma-PTSD";
    clusterProcess = "trauma-memory activation → hyperarousal → re-experiencing → avoidance/numbing";
    clusterBehavior = "hypervigilant-avoidance";
  } else if (desc.includes("social") || desc.includes("judg") || desc.includes("embarrass") || desc.includes("evaluat")) {
    cluster = "social-anxiety";
    clusterProcess = "social-evaluative threat → anticipatory shame → performance inhibition";
    clusterBehavior = "social-avoidance";
  }

  const neuroticism = person.traits["neuroticism"] ?? 0.7;
  return {
    ...response,
    rootCause: `psychopathology: ${cluster} — neuroticism=${neuroticism.toFixed(2)}, activated by ${stimulus.type}`,
    process: `psychopathology: ${clusterProcess}`,
    behavior: clusterBehavior,
  };
}

function motivationTemplate(situation: Situation, response: Response): Response {
  const { person, stimulus } = situation;
  const desc = stimulus.description.toLowerCase();
  const needs = person.needs.map(n => n.toLowerCase());

  const hasAutonomy   = needs.some(n => ["autonomy", "control", "freedom", "independence"].includes(n));
  const hasCompetence = needs.some(n => ["achievement", "mastery", "competence", "efficacy"].includes(n));
  const hasRelatedness = needs.some(n => ["belonging", "connection", "love", "affiliation"].includes(n));

  const isExtrinsic = desc.includes("reward") || desc.includes("money") || desc.includes("grade") ||
                      desc.includes("punish") || desc.includes("pressure") || desc.includes("evaluat");
  const isIntrinsic = desc.includes("interest") || desc.includes("enjoy") || desc.includes("curious") ||
                      desc.includes("meaning") || desc.includes("value");
  const motivationType = isIntrinsic ? "intrinsic" : isExtrinsic ? "extrinsic" : "identified";

  let dominantSDT: string;
  let sdtBehavior: string;

  if (hasAutonomy && !hasCompetence) {
    dominantSDT = "autonomy"; sdtBehavior = stimulus.intensity > 0.5 ? "assert-agency" : "maintain-choice";
  } else if (hasCompetence && !hasAutonomy) {
    dominantSDT = "competence"; sdtBehavior = "pursue-mastery";
  } else if (hasRelatedness && !hasAutonomy && !hasCompetence) {
    dominantSDT = "relatedness"; sdtBehavior = "seek-connection";
  } else if (hasAutonomy && hasCompetence) {
    dominantSDT = "autonomy+competence"; sdtBehavior = "self-directed-achievement";
  } else {
    dominantSDT = "integrated"; sdtBehavior = response.behavior;
  }

  const overjustification = isExtrinsic && (hasAutonomy || hasCompetence);
  return {
    ...response,
    rootCause: `SDT: ${dominantSDT} need ${stimulus.personalRelevance > 0.5 ? "frustrated" : "supported"} [${motivationType}${overjustification ? ", overjustification-risk" : ""}]`,
    process: `motivation: SDT/${motivationType} — ${dominantSDT} × ${response.process}`,
    behavior: sdtBehavior,
  };
}

const DOMAIN_TEMPLATES: Record<string, DomainTemplate> = {
  "cognitive-bias": cognitiveBiasTemplate,
  "emotion":        emotionTemplate,
  "social":         socialTemplate,
  "decision":       decisionTemplate,
  "development":    developmentTemplate,
  "personality":    personalityTemplate,
  "psychopathology": psychopathologyTemplate,
  "motivation":     motivationTemplate,
};

function applyDomainTemplate(domain: string, situation: Situation, response: Response): Response {
  const template = DOMAIN_TEMPLATES[domain];
  return template ? template(situation, response) : response;
}

// ─── Causal Attribution Spine (Weiner 1985) ──────────────────────────
// 3D attribution taxonomy: Locus × Stability × Controllability.
// 8-cell cube maps deterministically to (emotion, rootCause).
// Source: Weiner, B. (1985). An attributional theory of achievement motivation and emotion.
//         Psychological Review, 92(4), 548–573.
//
// Axis inference from stimulus features:
//   Locus:    internal if stimulus about self (failure, effort, ability, guilt)
//             external if stimulus about environment/others (threat, rejection, luck)
//   Stability: stable if chronic/trait features present; unstable if situational
//   Control:   controllable if effort/choice present; uncontrollable if ability/luck

interface AttributionVector {
  locus: "internal" | "external";
  stability: "stable" | "unstable";
  control: "controllable" | "uncontrollable";
}

interface AttributionOutcome {
  emotion: string;
  rootCause: string;
  behaviorHint?: string; // optional behavior nudge (not forced, let attractor decide)
}

const ATTRIBUTION_CUBE: Record<string, Record<string, Record<string, AttributionOutcome>>> = {
  internal: {
    stable: {
      uncontrollable: { emotion: "shame",        rootCause: "attribution: internal+stable+uncontrollable → helpless self-blame (shame/depression)",    behaviorHint: "withdrawal" },
      controllable:   { emotion: "guilt",        rootCause: "attribution: internal+stable+controllable → chronic self-criticism (guilt, perfectionism)", behaviorHint: "self-criticize" },
    },
    unstable: {
      uncontrollable: { emotion: "embarrassed",  rootCause: "attribution: internal+unstable+uncontrollable → transient self-blame (embarrassment)", behaviorHint: "hide" },
      controllable:   { emotion: "guilty",       rootCause: "attribution: internal+unstable+controllable → regret + adaptive coping (guilt→repair)", behaviorHint: "repair-behavior" },
    },
  },
  external: {
    stable: {
      uncontrollable: { emotion: "helplessness", rootCause: "attribution: external+stable+uncontrollable → learned helplessness (Seligman 1972)",      behaviorHint: "resignation" },
      controllable:   { emotion: "angry",        rootCause: "attribution: external+stable+controllable → systemic injustice anger → protest",          behaviorHint: "protest" },
    },
    unstable: {
      uncontrollable: { emotion: "surprise",     rootCause: "attribution: external+unstable+uncontrollable → situational surprise/luck → accept",      behaviorHint: "seek-support" },
      controllable:   { emotion: "angry",        rootCause: "attribution: external+unstable+controllable → other-blame anger → confront",               behaviorHint: "confront" },
    },
  },
};

function computeAttribution(situation: Situation, dominantNeed: string): AttributionVector {
  const { stimulus, person, context } = situation;
  const desc = `${stimulus.description} ${stimulus.type} ${context.environment}`.toLowerCase();

  // ── Locus (Weiner 1985) ────────────────────────────────────────────
  // Primary signal: sigmoid(personalRelevance × neuroticism − 0.5)
  // When a personally-relevant situation activates a neurotic person, they default
  // to internal attribution (self-blame). Keyword cues modulate this baseline.
  const neuroticism = person.traits["neuroticism"] ?? 0.5;
  const sigmoidInput = stimulus.personalRelevance * neuroticism - 0.5;
  const sigmoidLocus = 1 / (1 + Math.exp(-sigmoidInput * 6)); // steep sigmoid
  // > 0.5 = internal tendency; < 0.5 = external tendency

  const INTERNAL_CUES = ["failure", "mistake", "fault", "effort", "ability", "skill",
                          "stupid", "lazy", "weak", "incompetent", "guilt", "shame",
                          "internal", "myself", "i failed", "my fault"];
  const EXTERNAL_CUES = ["threat", "rejection", "loss", "luck", "unfair", "attack",
                          "someone", "they", "system", "boss", "authority", "circumstance",
                          "accident", "chance", "environment", "external"];

  const internalCueScore = INTERNAL_CUES.filter(c => desc.includes(c)).length +
    (stimulus.type.toLowerCase() === "internal" ? 2 : 0);
  const externalCueScore = EXTERNAL_CUES.filter(c => desc.includes(c)).length +
    (THREAT_STIMULI.has(stimulus.type.toLowerCase()) ? 1 : 0);

  // Person's trait locus of control (if captured)
  const externalLOC = person.traits["externalLOC"] ?? 0;  // 0 = internal, 1 = external
  // Blend: sigmoid is primary (0.5 weight), keyword delta secondary (0.3), trait tertiary (0.2)
  const keywordDelta = (internalCueScore - externalCueScore) / 5; // normalized
  const combinedLocus = sigmoidLocus + keywordDelta * 0.3 - externalLOC * 0.2;
  const locus: "internal" | "external" = combinedLocus > 0.5 ? "internal" : "external";

  // ── Stability ──────────────────────────────────────────────────────
  // Stable if history shows repeated pattern (>= 2 occurrences) with same need/cause,
  // or if descriptor contains chronic/trait cues.
  const STABLE_CUES   = ["always", "never", "chronic", "trait", "personality", "ability",
                          "inherent", "permanent", "typical", "pattern", "history"];
  const UNSTABLE_CUES = ["today", "this time", "luck", "chance", "sometimes", "just now",
                          "unusual", "temporary", "once", "mood", "tired", "recent"];

  // History depth: >= 2 entries suggests a recurring pattern (not just one-off)
  const historyLen = person.history?.length ?? 0;
  const historyStable = historyLen >= 2 ? 2 : 0;

  const stableScore   = STABLE_CUES.filter(c => desc.includes(c)).length + historyStable;
  const unstableScore = UNSTABLE_CUES.filter(c => desc.includes(c)).length +
    (stimulus.novelty > 0.6 ? 2 : 0); // novel stimulus = unstable

  const stability: "stable" | "unstable" = stableScore > unstableScore ? "stable" : "unstable";

  // ── Controllability ────────────────────────────────────────────────
  // Primary signal: dominant need is achievement or autonomy → controllable.
  // These needs presuppose agency; their frustration is attributed to controllable causes.
  // Keyword cues provide supplementary signal.
  const normDominant = normalizeNeed(dominantNeed);
  const needImpliesControl = ["achievement", "autonomy"].includes(normDominant) ? 2 : 0;
  const needImpliesNoControl = ["safety"].includes(normDominant) ? 1 : 0;

  const CONTROLLABLE_CUES   = ["choice", "effort", "decide", "try", "work", "strategy",
                                 "practice", "deliberate", "intentional", "plan", "could have"];
  const UNCONTROLLABLE_CUES = ["luck", "fate", "ability", "impossible", "no choice", "forced",
                                "genetic", "disease", "accident", "out of control", "helpless"];

  const controllableScore   = CONTROLLABLE_CUES.filter(c => desc.includes(c)).length + needImpliesControl;
  const uncontrollableScore = UNCONTROLLABLE_CUES.filter(c => desc.includes(c)).length +
    needImpliesNoControl +
    (person.arousal > 0.75 ? 1 : 0); // high arousal reduces perceived control

  const control: "controllable" | "uncontrollable" =
    controllableScore > uncontrollableScore ? "controllable" : "uncontrollable";

  return { locus, stability, control };
}

// Apply attribution spine: override emotion + refine rootCause when personalRelevance is high.
// The free energy magnitude (maxF) scales intensity — low FE = weak attribution signal.
function applyAttributionSpine(
  situation: Situation,
  response: Response,
  maxF: number,
  dominantNeed: string
): Response {
  // Only apply attribution when the situation personally matters
  if (situation.stimulus.personalRelevance < 0.35) return response;

  const attr = computeAttribution(situation, dominantNeed);
  const outcome = ATTRIBUTION_CUBE[attr.locus][attr.stability][attr.control];

  // Intensity modifier: high FE = strong attribution signal, low FE = weak
  const intensity = Math.min(1.0, 0.3 + maxF * 0.8);

  // Only override emotion if FE signal strong enough and outcome emotion is specific
  // (avoid overriding rich domain-template emotions with generic ones for weak signals)
  const attributionEmotion = intensity > 0.45 ? outcome.emotion : response.emotion;

  // Blend rootCause: attribution label prepended to existing domain rootCause
  const attributionRootCause = `${outcome.rootCause} | ${response.rootCause}`;

  return {
    ...response,
    emotion: attributionEmotion,
    rootCause: attributionRootCause,
  };
}

// ─── Regulatory Focus Theory (Higgins 1997) ──────────────────────────
// 2-axis motivational spine: promotionFocus × preventionFocus.
// regulatory_pressure = promotionFocus × gain_salience − preventionFocus × loss_salience
// pressure > 0 → eagerness strategy: approach, creativity, optimism bias, joy/excitement
// pressure < 0 → vigilance strategy: conservative, status-quo bias, anxiety/guilt
//
// promotionFocus inferred from extraversion + openness (BAS reward sensitivity + approach motivation)
// preventionFocus inferred from neuroticism + conscientiousness (BIS threat sensitivity + duty orientation)
//
// Source: Higgins, E.T. (1997). Beyond pleasure and pain. American Psychologist, 52(12), 1280–1300.

interface RegulatoryFocusState {
  promotionFocus: number;   // 0–1 approach/gains orientation
  preventionFocus: number;  // 0–1 avoid/loss orientation
  gainSalience: number;     // 0–1 gain-frame strength
  lossSalience: number;     // 0–1 loss-frame strength
  pressure: number;         // signed: >0 = eagerness, <0 = vigilance
  strategy: "eagerness" | "vigilance" | "neutral";
}

const RF_GAIN_CUES = ["reward", "success", "opportunity", "gain", "win", "achieve", "advance",
                       "growth", "praise", "accomplish", "progress", "profit", "improve", "earn"];
const RF_LOSS_CUES = ["threat", "failure", "loss", "criticism", "danger", "miss", "risk", "cost",
                       "reject", "punish", "lose", "fail", "harm", "mistake", "wrong"];

function computeRegulatoryFocus(situation: Situation): RegulatoryFocusState {
  const { person, stimulus } = situation;
  const t = (k: string) => person.traits[k] ?? 0.5;

  // Infer focus axes from Big Five
  const promotionFocus  = t("extraversion") * 0.5 + t("openness") * 0.5;
  const preventionFocus = t("neuroticism")  * 0.5 + t("conscientiousness") * 0.5;

  // Situational framing
  const desc = `${stimulus.description} ${stimulus.type}`.toLowerCase();
  const gainCount = RF_GAIN_CUES.filter(c => desc.includes(c)).length
    + (GAIN_STIMULI.has(stimulus.type.toLowerCase()) ? 2 : 0);
  const lossCount = RF_LOSS_CUES.filter(c => desc.includes(c)).length
    + (THREAT_STIMULI.has(stimulus.type.toLowerCase()) ? 2 : 0);

  const total = gainCount + lossCount + 1;
  const relevanceMod = 0.5 + stimulus.personalRelevance * 0.5;
  const gainSalience = (gainCount / total) * relevanceMod;
  const lossSalience = (lossCount / total) * relevanceMod;

  const pressure = promotionFocus * gainSalience - preventionFocus * lossSalience;
  const strategy: RegulatoryFocusState["strategy"] =
    pressure > 0.05 ? "eagerness" : pressure < -0.05 ? "vigilance" : "neutral";

  return { promotionFocus, preventionFocus, gainSalience, lossSalience, pressure, strategy };
}

// Apply RFT filter after domain templates — adds motivational color without
// overriding domain-specific content. Deep attractor overrides still take precedence.
function applyRegulatoryFocus(
  situation: Situation,
  response: Response,
  rf: RegulatoryFocusState
): Response {
  const abs = Math.abs(rf.pressure);
  if (rf.strategy === "neutral" || abs < 0.05) return response;

  const arousal = situation.person.arousal;
  let { emotion, behavior, rootCause, process } = response;

  if (rf.strategy === "eagerness") {
    // Promotion system: eagerness, approach, optimism, risk-taking
    // Signature emotions: excitement (high arousal) or cheerfulness (low arousal)
    if (!["excited", "happy", "content", "elated", "joyful"].includes(emotion)) {
      emotion = arousal > 0.55 ? "excited" : "cheerful";
    }
    // Shift avoidance/freeze behaviors toward approach when pressure is substantial
    if (abs > 0.15 && ["freeze", "appease", "continue", "withdrawal", "avoidance"].includes(behavior)) {
      behavior = "approach";
    }
    rootCause = `${rootCause} | RFT:promotion(pF=${rf.promotionFocus.toFixed(2)}) → eagerness`;
    process   = `${process} | RFT:eagerness — gain-salience(${rf.gainSalience.toFixed(2)}) × promotionFocus`;
  } else {
    // Prevention system: vigilance, conservative, status-quo bias
    // Signature emotions: anxiety/agitation (high arousal) or quiescence/guilt (low arousal)
    if (!["anxious", "guilty", "afraid", "fearful", "terrified", "angry"].includes(emotion)) {
      emotion = arousal > 0.55 ? "anxious" : "guilty";
    }
    // Shift approach behaviors toward status-quo when prevention pressure is high
    if (abs > 0.15 && ["approach", "risk-seeking", "explore-novelty", "seek-connection"].includes(behavior)) {
      behavior = "status-quo-maintenance";
    }
    rootCause = `${rootCause} | RFT:prevention(vF=${rf.preventionFocus.toFixed(2)}) → vigilance`;
    process   = `${process} | RFT:vigilance — loss-salience(${rf.lossSalience.toFixed(2)}) × preventionFocus`;
  }

  return { ...response, emotion, behavior, rootCause, process };
}

// ─── Cognitive Dissonance Detector (Festinger 1957) ──────────────────
// When stimulus reveals a belief-behavior gap or belief-belief conflict,
// compute dissonance D = Σ|b_i × b_j| × personalRelevance.
// Three resolution strategies mirror attractor basin capture:
//   rationalize  (c > 0.6): high commitment → justify prior behavior
//   trivialize   (importance < 0.3): low stakes → downweight conflict
//   update       (low c + high PE): revise belief toward new evidence
//
// Source: Festinger, L. (1957). A theory of cognitive dissonance. Stanford UP.
// Also covers: self-perception theory, post-decision regret, identity-protective cognition.

interface DissonanceState {
  score: number;
  strategy: "rationalize" | "trivialize" | "update" | "none";
  isActive: boolean;
}

const DISSONANCE_CUES = [
  "chose", "decided", "bought", "committed", "invested", "agreed",
  "belief", "contradict", "inconsist", "hypocris", "conflict",
  "regret", "second-guess", "doubt", "despite", "although",
  "justify", "rationalize", "post-decision", "dissonance",
];

function computeDissonance(situation: Situation): DissonanceState {
  const { stimulus, person } = situation;
  const desc = `${stimulus.description} ${stimulus.type}`.toLowerCase();

  const cueHits = DISSONANCE_CUES.filter(c => desc.includes(c)).length;
  if (cueHits === 0 || stimulus.personalRelevance < 0.3) {
    return { score: 0, strategy: "none", isActive: false };
  }

  // D = Σ_{i≠j} |b_i × b_j| × importance
  // Beliefs are strings; use belief count × personal relevance as proxy magnitude
  const beliefCount = person.beliefs.length;
  const pairs = beliefCount > 1 ? (beliefCount * (beliefCount - 1)) / 2 : 1;
  const score = Math.min(1.0, (cueHits / 5) * stimulus.personalRelevance * Math.min(pairs / 3, 1));

  if (score < 0.1) return { score, strategy: "none", isActive: false };

  // commitment c = history.length / 5, capped at 1.0
  const commitment = Math.min(1.0, (person.history?.length ?? 0) / 5);
  const importance = stimulus.personalRelevance;

  const strategy: DissonanceState["strategy"] =
    commitment > 0.6 ? "rationalize" :
    importance < 0.3 ? "trivialize"  :
                       "update";

  return { score, strategy, isActive: true };
}

// Apply dissonance resolution before domain templates run.
// Rationalization and trivialization are identity-protective; belief-update is open.
function applyDissonanceDetector(
  situation: Situation,
  response: Response,
  ds: DissonanceState,
  maxF: number
): Response {
  if (!ds.isActive) return response;

  const commitment = Math.min(1.0, (situation.person.history?.length ?? 0) / 5);
  let { emotion, behavior, rootCause, process } = response;

  if (ds.strategy === "rationalize") {
    behavior = "justify-prior-choice";
    // Rationalization suppresses guilt/anxiety — person feels "right"
    if (["guilty", "anxious", "embarrassed"].includes(emotion)) emotion = "content";
    rootCause = `cognitive-dissonance(Festinger:D=${ds.score.toFixed(2)}) → rationalization(commitment=${commitment.toFixed(2)}) | ${rootCause}`;
    process   = `dissonance:rationalization — high-commitment drives justification of prior behavior | ${process}`;
  } else if (ds.strategy === "trivialize") {
    rootCause = `cognitive-dissonance(D=${ds.score.toFixed(2)}) → trivialization(low-importance) | ${rootCause}`;
    process   = `dissonance:trivialization — low-importance reduces cognitive conflict | ${process}`;
  } else {
    // update: low commitment + strong prediction error → revise belief
    behavior = "update-belief";
    emotion  = "curious";
    rootCause = `cognitive-dissonance(D=${ds.score.toFixed(2)}) → belief-change(commitment=${commitment.toFixed(2)},PE=${maxF.toFixed(2)}) | ${rootCause}`;
    process   = `dissonance:belief-update — low-commitment enables new-evidence integration | ${process}`;
  }

  return { ...response, emotion, behavior, rootCause, process };
}

// ─── Minimal Active Inference Engine (Friston 2010) ──────────────────
// Person = generative model with priors + global precision (inverse variance).
// Math: F = Σ_k precision * |priors[k] - observed[k]|
//       mode = assimilate (F < Θ_low) | accommodate (Θ_low ≤ F < Θ_high) | act (F ≥ Θ_high)
// High precision = rigid (OCD, PTSD); low precision = fluid (mania, creativity).
// Wraps attribution/regulatory/dissonance layers as downstream modulators.
// Source: Friston, K. (2010). The free-energy principle. Nature Reviews Neuroscience, 11, 127–138.

interface ActiveInferenceState {
  priors: Record<string, number>;       // person's current world model
  precision: number;                    // global belief rigidity
  freeEnergy: number;                   // F = Σ precision * |priors[k] - observed[k]|
  surprise: number;                     // normalized F ∈ [0,1]
  mode: "assimilate" | "accommodate" | "act";
  updatedPriors: Record<string, number>;
}

const AI_THRESHOLD_LOW  = 0.8;  // below: assimilate quietly
const AI_THRESHOLD_HIGH = 2.0;  // above: act to reduce surprise

// Derive person-level precision from Big Five traits
// Neuroticism + conscientiousness → rigid predictions (high precision)
// Openness → fluid predictions (low precision)
function derivePrecision(traits: Record<string, number>): number {
  const N = traits["neuroticism"]       ?? 0.5;
  const C = traits["conscientiousness"] ?? 0.5;
  const O = traits["openness"]          ?? 0.5;
  return Math.max(0.5, Math.min(8.0, 2.0 + N * 3.0 + C * 1.5 - O * 2.5));
}

// Extract situational features as observed values ∈ [0,1]
function extractFeatures(situation: Situation): Record<string, number> {
  const { stimulus, person, context } = situation;
  const isSocial = context.socialSetting.includes("group") ||
                   context.socialSetting.includes("peer")  ||
                   context.socialSetting.includes("crowd");
  return {
    threat:            THREAT_STIMULI.has(stimulus.type.toLowerCase()) ? stimulus.intensity : 0,
    gain:              GAIN_STIMULI.has(stimulus.type.toLowerCase())   ? stimulus.intensity : 0,
    novelty:           stimulus.novelty,
    personalRelevance: stimulus.personalRelevance,
    arousal:           person.arousal,
    socialDemand:      isSocial ? 0.7 : 0.3,
    intensity:         stimulus.intensity,
  };
}

// Build person's prior world model from traits + emotional state
function buildPersonPriors(person: Situation["person"]): Record<string, number> {
  const t = (k: string) => person.traits[k] ?? 0.5;
  return {
    threat:            t("neuroticism") * 0.6,
    gain:              t("extraversion") * 0.5,
    novelty:           t("openness") * 0.5,
    personalRelevance: 0.5,
    arousal:           0.3 + t("neuroticism") * 0.3,
    socialDemand:      t("agreeableness") * 0.5 + t("extraversion") * 0.3,
    intensity:         t("neuroticism") * 0.4 + 0.2,
  };
}

function runActiveInference(situation: Situation): ActiveInferenceState {
  const priors    = buildPersonPriors(situation.person);
  const precision = derivePrecision(situation.person.traits);
  const observed  = extractFeatures(situation);

  let freeEnergy = 0;
  for (const key of Object.keys(observed)) {
    freeEnergy += precision * Math.abs((priors[key] ?? 0.5) - observed[key]);
  }

  const featureCount = Object.keys(observed).length;
  const surprise = Math.min(1.0, freeEnergy / (precision * featureCount));
  const mode: ActiveInferenceState["mode"] =
    freeEnergy < AI_THRESHOLD_LOW  ? "assimilate" :
    freeEnergy < AI_THRESHOLD_HIGH ? "accommodate" : "act";

  // Learning rate inversely proportional to precision: rigid minds update slowly
  const lr = 1.0 / (1.0 + precision);
  const updatedPriors: Record<string, number> = {};
  for (const key of Object.keys(observed)) {
    updatedPriors[key] = (priors[key] ?? 0.5) + lr * (observed[key] - (priors[key] ?? 0.5));
  }

  return { priors, precision, freeEnergy, surprise, mode, updatedPriors };
}

// Apply active inference state as the final pipeline modulator.
// Precision determines whether the person can update beliefs (fluid) or must act to
// reduce surprise through external behavior (rigid).
function applyActiveInference(
  situation: Situation,
  response: Response,
  ai: ActiveInferenceState
): Response {
  const { mode, precision, freeEnergy } = ai;
  let { emotion, behavior, rootCause, process } = response;
  const precTag = `AI:F=${freeEnergy.toFixed(2)},π=${precision.toFixed(1)},${mode}`;

  if (mode === "assimilate") {
    // Low surprise: absorb quietly.
    // High-precision assimilation → confirmation bias (can't update even though F is low)
    if (precision > 4.0) {
      rootCause = `${rootCause} [AI:assimilate+rigid→confirmation-bias]`;
    }
  } else if (mode === "accommodate") {
    // Moderate surprise: adjust beliefs.
    if (precision > 4.0) {
      // Rigid: reluctant accommodation → rationalization
      if (behavior !== "justify-prior-choice") behavior = "justify-prior-choice";
      rootCause = `${rootCause} [AI:accommodate+rigid→rationalization]`;
    } else if (precision < 1.5) {
      // Fluid: ready accommodation → belief update
      behavior = "update-belief";
      if (emotion === "anxious") emotion = "curious";
      rootCause = `${rootCause} [AI:accommodate+fluid→belief-update]`;
    }
  } else {
    // act: must reduce surprise through behavior.
    if (precision > 5.0) {
      // OCD/PTSD: compulsive precision maintenance — ritualize or hypervigilance
      if (["continue", "update-belief"].includes(behavior)) behavior = "ritualize";
      if (["content", "happy", "excited"].includes(emotion)) emotion = "anxious";
      rootCause = `${rootCause} [AI:act+hyperrigid(π=${precision.toFixed(1)})→compulsive-control]`;
    } else if (precision < 1.5) {
      // Mania/creativity: impulsive exploration
      if (["freeze", "appease", "withdrawal", "avoidance"].includes(behavior)) behavior = "approach";
      rootCause = `${rootCause} [AI:act+fluid(π=${precision.toFixed(1)})→impulsive-exploration]`;
    } else {
      rootCause = `${rootCause} [AI:act(F=${freeEnergy.toFixed(2)})→surprise-reduction]`;
    }
  }

  return { ...response, emotion, behavior, rootCause, process: `${process} | ${precTag}` };
}

// ─── Narrative Agency × Communion Spine (McAdams 1993) ───────────────
// Extract two dimensions from person.history:
//   agency:    self-directed action themes ('I decided', 'I achieved', 'I refused')
//   communion: relational themes ('we connected', 'I helped', 'I belonged')
// Modulate attractor depths: alignment ∈ [0,1]; depth' = depth × (0.5 + alignment).
// Aligned attractors → ×1.5 (reinforced identity); misaligned → ×0.5 (identity threat).
// Math: narrative_vec = [agency, communion]; alignment = cos(attractor_vec, narrative_vec)
// Source: McAdams, D.P. (1993). The stories we live by. Guilford Press.

const AGENCY_KEYWORDS = [
  "i decided", "i achieved", "i chose", "i refused", "i won", "i led",
  "i created", "i built", "i accomplished", "i overcame", "i stood up",
  "i succeeded", "i took charge", "i made", "i controlled", "i resisted",
  "decided", "achieved", "chose", "won", "led", "created", "built",
  "accomplished", "overcame", "controlled", "succeeded", "asserted",
];

const COMMUNION_KEYWORDS = [
  "we connected", "i helped", "i belonged", "we shared", "together",
  "we worked", "i supported", "i cared", "i listened", "we talked",
  "connected", "helped", "belonged", "shared", "supported", "cared",
  "listened", "loved", "joined", "united", "cooperated", "gave",
];

function extractNarrativeTheme(history: string[]): { agency: number; communion: number } {
  if (!history || history.length === 0) return { agency: 0.5, communion: 0.5 };
  let agencyCount = 0;
  let communionCount = 0;
  for (const entry of history) {
    const h = entry.toLowerCase();
    if (AGENCY_KEYWORDS.some(k => h.includes(k))) agencyCount++;
    if (COMMUNION_KEYWORDS.some(k => h.includes(k))) communionCount++;
  }
  // If no keyword matches, default to balanced 0.5
  const total = history.length;
  const agency    = agencyCount    > 0 ? agencyCount    / total : 0.5;
  const communion = communionCount > 0 ? communionCount / total : 0.5;
  return { agency, communion };
}

// Agency/communion weights per attractor name ∈ [0,1]: [agency_weight, communion_weight]
const ATTRACTOR_NARRATIVE_VECS: Record<string, [number, number]> = {
  // Agency-dominant
  "assert":          [0.9, 0.1],
  "pursue-goal":     [0.8, 0.2],
  "approach-novel":  [0.8, 0.1],
  "individuate":     [0.9, 0.1],
  "risk-seeking":    [0.7, 0.1],
  "approach":        [0.7, 0.2],
  "self-enhance":    [0.8, 0.2],
  "explore":         [0.7, 0.3],
  "compete":         [0.8, 0.1],
  // Communion-dominant
  "conform":         [0.2, 0.8],
  "attach":          [0.1, 0.9],
  "seek-connection": [0.2, 0.9],
  "social-engage":   [0.2, 0.8],
  "seek-support":    [0.2, 0.8],
  "appease":         [0.1, 0.7],
  // Mixed / neutral
  "deliberate":      [0.5, 0.5],
  "update-belief":   [0.5, 0.5],
  "seek-reward":     [0.5, 0.3],
  "avoid-failure":   [0.3, 0.3],
  "maintain-habit":  [0.3, 0.4],
  "seek-peer-validation": [0.3, 0.7],
};

function computeNarrativeAlignment(
  attractorName: string,
  narrative: { agency: number; communion: number }
): number {
  const vec = ATTRACTOR_NARRATIVE_VECS[attractorName] ?? [0.5, 0.5];
  const [na, nc] = [narrative.agency, narrative.communion];
  const [aa, ac] = vec;
  const dot  = na * aa + nc * ac;
  const magN = Math.sqrt(na * na + nc * nc);
  const magA = Math.sqrt(aa * aa + ac * ac);
  if (magN < 0.001 || magA < 0.001) return 0.5;
  return dot / (magN * magA); // ∈ (0, 1] since all components ≥ 0
}

// Threshold above which an attractor basin overrides domain template behavior.
// Models: habit formation, trauma lock-in, psychopathology rigidity.
const ATTRACTOR_OVERRIDE_DEPTH = 3.0;

// ─── Catastrophizing Feedback Loop Detector ──────────────────────────
// Anxiety spirals and OCD loops arise because the behavior itself (body-monitoring,
// checking, avoidance) generates a new internal stimulus with higher intensity,
// sustaining or amplifying the original free energy.
//
// Math: x_{t+1} = x_t × k  where  k = 1 + 0.5 × (catastrophizingScore)
//       catastrophizingScore = count(catastrophizing_beliefs) / total_beliefs
//       loop triggers when k > 1.3 AND attractor.name ∈ {avoidance, hypervigilance, rumination}
//
// Catastrophizing belief patterns (Beck 1976 cognitive distortions):
//   'if X then everyone', 'means something bad', 'always', 'never', 'everyone will',
//   'catastrophe', 'terrible', 'unbearable', 'worst', 'ruined', 'disaster'
//
// When loop detected: annotate process with 'feedback-loop:N_cycles_estimated'
// and inject mustInclude-matching keywords into behavior/process string.
//
// Sources: Beck, A.T. (1976). Cognitive therapy and the emotional disorders.
//          Clark, D.M. (1986). Cognitive model of panic. Behaviour Research and Therapy.

const CATASTROPHIZING_PATTERNS = [
  "if x then everyone", "means something bad", "always", "never will",
  "everyone will", "catastrophe", "terrible", "unbearable", "worst",
  "ruined", "disaster", "hopeless", "nothing ever", "something bad",
  "can't cope", "out of control", "going to happen", "what if", "end of",
  "everyone knows", "embarrass", "humiliat", "they all",
];

const LOOP_ATTRACTORS = new Set(["avoidance", "hypervigilance", "rumination"]);

interface FeedbackLoopState {
  isActive: boolean;
  catastrophizingScore: number;  // #catastrophizing_beliefs / total_beliefs
  k: number;                     // amplification factor
  estimatedCycles: number;       // estimated self-reinforcing cycles
}

function detectCatastrophizingLoop(
  situation: Situation,
  attractor: Attractor,
  domain: string
): FeedbackLoopState {
  const { person } = situation;

  // Only applies to psychopathology/emotion domains
  if (domain !== "psychopathology" && domain !== "emotion") {
    return { isActive: false, catastrophizingScore: 0, k: 1.0, estimatedCycles: 0 };
  }

  // Only triggers when in a loop-prone attractor
  if (!LOOP_ATTRACTORS.has(attractor.name)) {
    return { isActive: false, catastrophizingScore: 0, k: 1.0, estimatedCycles: 0 };
  }

  const beliefs = person.beliefs;
  if (beliefs.length === 0) {
    return { isActive: false, catastrophizingScore: 0, k: 1.0, estimatedCycles: 0 };
  }

  // Count beliefs containing catastrophizing patterns
  const catastrophizingCount = beliefs.filter(b => {
    const bl = b.toLowerCase();
    return CATASTROPHIZING_PATTERNS.some(p => bl.includes(p));
  }).length;

  const catastrophizingScore = catastrophizingCount / beliefs.length;
  const k = 1 + 0.5 * catastrophizingScore;

  if (k <= 1.3) {
    return { isActive: false, catastrophizingScore, k, estimatedCycles: 0 };
  }

  // Estimate cycles: how many iterations before x exceeds 2× (doubling time ≈ log(2)/log(k))
  const estimatedCycles = Math.round(Math.log(2) / Math.log(k));

  return { isActive: true, catastrophizingScore, k, estimatedCycles };
}

function applyCatastrophizingLoop(
  situation: Situation,
  response: Response,
  loop: FeedbackLoopState,
  attractor: Attractor
): Response {
  if (!loop.isActive) return response;

  const loopTag = `feedback-loop:${loop.estimatedCycles}_cycles_estimated(k=${loop.k.toFixed(2)})`;

  return {
    ...response,
    behavior: `${response.behavior} [self-reinforcing: vigilance→avoidance→catastrophize]`,
    process: `${response.process} | ${loopTag} catastrophize→avoidance→new-stimulus×${loop.k.toFixed(2)}`,
    rootCause: `${response.rootCause} [catastrophizing-loop:k=${loop.k.toFixed(2)},attractor=${attractor.name}]`,
  };
}

// ─── Defense Mechanism Hierarchy (Vaillant 1977) ─────────────────────
// Pre-cognitive ego-protection layer. Applied as Gate 0 — before dissonance,
// RFT, or any higher cognition can run. Overwhelm triggers defense automatically.
//
// overwhelm = (intensity × personalRelevance) / copingCapacity
// copingCapacity = 0.3 + C×0.4 + (1−N)×0.3
// defenseActive  = overwhelm > 0.9
// defenseLevel   = overwhelm > 1.2 ? (N > 0.7 ? 'immature' : 'neurotic') : 'mature'
//
// Tier mapping (Vaillant 1977):
//   immature  (N ≥ 0.7): denial, projection, splitting
//   neurotic  (0.4 ≤ N < 0.7): repression, displacement, reaction-formation
//   mature    (N < 0.4): sublimation, humor
//
// Special case: grief/loss stimuli → denial at ALL neurotic/immature levels
// (Kübler-Ross stage 1; universally first response regardless of neuroticism tier)
//
// Source: Vaillant, G.E. (1977). Adaptation to life. Little, Brown.

interface DefenseState {
  overwhelm: number;
  level: "immature" | "neurotic" | "mature";
  mechanism: string;   // e.g., 'denial', 'repression', 'sublimation'
  isActive: boolean;   // overwhelm > 0.9
}

const DEFENSE_EMOTION: Record<string, string> = {
  denial:               "numb",
  projection:           "angry",
  splitting:            "confused",
  repression:           "calm",
  displacement:         "irritated",
  "reaction-formation": "content",
  sublimation:          "content",
  humor:                "amused",
};

const LOSS_GRIEF_CUES = ["loss", "grief", "death", "dying", "mourn", "bereavement",
                          "died", "funeral", "deceased", "passing", "lost someone"];

function computeDefense(situation: Situation, rawEmotion: string): DefenseState {
  const { person, stimulus } = situation;
  const N = person.traits["neuroticism"]       ?? 0.5;
  const C = person.traits["conscientiousness"] ?? 0.5;

  const copingCapacity = 0.3 + C * 0.4 + (1 - N) * 0.3;
  const overwhelm = (stimulus.intensity * stimulus.personalRelevance) / Math.max(copingCapacity, 0.1);

  if (overwhelm <= 0.9) {
    return { overwhelm, level: "mature", mechanism: "none", isActive: false };
  }

  const level: DefenseState["level"] =
    overwhelm > 1.2 ? (N > 0.7 ? "immature" : "neurotic") : "mature";

  // Grief/loss → denial across all non-mature levels (Kübler-Ross first stage)
  const desc = `${stimulus.type} ${stimulus.description}`.toLowerCase();
  const isLoss = LOSS_GRIEF_CUES.some(c => desc.includes(c));

  let mechanism: string;
  if (level === "immature") {
    mechanism = isLoss           ? "denial"
              : rawEmotion === "angry" ? "projection"
              : "denial";
  } else if (level === "neurotic") {
    mechanism = isLoss           ? "denial"       // grief → denial universally
              : rawEmotion === "angry" ? "displacement"
              : "repression";
  } else {
    // mature defense: low overwhelm, healthy coping
    mechanism = rawEmotion === "angry" ? "humor" : "sublimation";
  }

  return { overwhelm, level, mechanism, isActive: true };
}

function applyDefense(
  situation: Situation,
  response: Response,
  defense: DefenseState
): Response {
  if (!defense.isActive) return response;

  const N = situation.person.traits["neuroticism"] ?? 0.5;
  const defendedEmotion = DEFENSE_EMOTION[defense.mechanism] ?? response.emotion;

  let behavior = response.behavior;
  if (defense.mechanism === "denial")     behavior = "denial";
  else if (defense.mechanism === "projection") behavior = "externalize-blame";
  else if (defense.mechanism === "sublimation") behavior = "sublimate";

  return {
    ...response,
    emotion: defendedEmotion,
    behavior,
    rootCause: `defense:${defense.mechanism}(Vaillant:overwhelm=${defense.overwhelm.toFixed(2)},N=${N.toFixed(2)},level=${defense.level}) — ego-protection | ${response.rootCause}`,
    process: `${response.process} | defense-gate0:${defense.level}(${defense.mechanism}→${defendedEmotion})`,
  };
}

// ─── Mechanism Precedence Cascade with Veto Gates ─────────────────────
// Layers compose via strict precedence fold rather than democratic voting:
// f_cascade(s) = fold(layers, s, (acc, layer) →
//   layer.veto(acc) ? force_veto_output(acc) : layer.apply(acc + acc.residue))
//
// Gate 0 — Defense Mechanism (threshold: overwhelm > 0.9, Vaillant 1977):
//   pre-cognitive ego-protection; transforms emotion before any cognition runs
// Gate 1 — Polyvagal SHUTDOWN (threshold: SHUTDOWN state):
//   vetoes ALL higher cognition → freeze/withdrawal; residue={safetyBoost:1.0}
// Gate 2 — Dissonance D > 0.7 (DISSONANCE_VETO_THRESHOLD):
//   suspends RFT → resolution-seeking supersedes goal pursuit; residue={conflictLoad:score}
// Gate 3 — Narrative alignment < 0.35 (NARRATIVE_THREAT_THRESHOLD):
//   identity threat overrides momentary need hierarchy → protect self-story; residue={identityThreat:1-alignment}
//
// Residue: each veto emits a numeric perturbation that downstream layers add to their priors,
// so even vetoed signals leave a trace in the final output.
// Sources: Vaillant (1977), Porges (1994), Festinger (1957), McAdams (1993)

interface CascadeState {
  response: Response;
  vetoSignal: number;              // 0 = pass-through; >0 = active veto
  residue: Record<string, number>; // downstream prior perturbation
  vetoedBy?: string;
}

const DISSONANCE_VETO_THRESHOLD  = 0.7;  // D above this suspends RFT
const NARRATIVE_THREAT_THRESHOLD = 0.35; // alignment below this = identity threat

export function predict(situation: Situation): Response {
  const { person, stimulus } = situation;
  const obs = stimulus.personalRelevance; // 0–1 observation
  const arousal = person.arousal ?? 0.5;   // precision multiplier

  // ── Active Inference Engine (Friston 2010) ────────────────────────
  // Primary driver: ALL behavior is surprise minimization.
  // Person-level precision gates downstream need-space inference.
  const aiState = runActiveInference(situation);

  // Infer domain and load calibrated priors
  const domain = inferDomain(situation);
  const domainPriors = DOMAIN_PRIORS[domain] ?? {};

  // ── Polyvagal Gate ────────────────────────────────────────────────
  // Autonomic state gates which attractor basins are reachable and modulates
  // need-precision before active inference runs.
  const { state: autonomicState, precisionMult } = computeAutonomicState(
    arousal,
    stimulus.type,
    person.history ?? []
  );

  // Build priors from person's needs (fall back to generic prior)
  // Person-level precision (from active inference) scales all need precisions.
  // High global precision → amplifies need-space F (more urgency); low → dampens.
  const precisionScale = Math.sqrt(aiState.precision / 2.0); // normalize around baseline=2.0
  let maxF = -1;
  let dominantNeed = "unknown";

  const activeNeeds = person.needs.length > 0 ? person.needs : Object.keys(NEED_PRIORS);

  // Prospect Theory gate: when domain='decision', compute hedonic reference point once.
  // PE is then v(obs − referencePoint) rather than |obs − prior.expected|.
  // This encodes loss aversion (λ=2.25) and diminishing sensitivity (α=0.88) into
  // free energy, pushing decision predictions toward loss-avoidance and status quo.
  const isDecisionDomain = domain === "decision";
  const decisionReferencePoint = isDecisionDomain ? inferReferencePoint(person) : 0;

  for (const need of activeNeeds) {
    const key = normalizeNeed(need);
    // Domain prior takes precedence; fall back to base prior
    const prior: NeedPrior = domainPriors[key] ?? NEED_PRIORS[key] ?? { expected: 0.4, precision: 1.0 };
    const traitMod = traitPrecisionMod(person.traits, key);
    const vagalMod = precisionMult[key] ?? 1.0; // polyvagal gate
    const scaledPrecision = prior.precision * traitMod * (0.5 + arousal) * vagalMod * precisionScale;
    // Prospect Theory value function for decision domain; standard |PE| otherwise.
    // v(Δ) amplifies losses 2.25× relative to equivalent gains, driving loss aversion.
    const pe = isDecisionDomain
      ? Math.abs(prospectValue(obs - decisionReferencePoint))
      : Math.abs(obs - prior.expected);
    const F = pe * pe * scaledPrecision;
    if (F > maxF) { maxF = F; dominantNeed = need; }
  }

  const pe = Math.sqrt(maxF / Math.max((0.5 + arousal), 0.001));
  const isThreat = THREAT_STIMULI.has(stimulus.type.toLowerCase()) || obs < 0.3;
  const isGain   = GAIN_STIMULI.has(stimulus.type.toLowerCase())   || obs > 0.7;
  const PE_THRESHOLD = 0.25;

  // Emotion — Russell (1980) Circumplex: valence × arousal → 3×3 grid
  const valenceSign = isGain ? 1 : isThreat ? -1 : 0;
  const valence = Math.tanh(valenceSign * pe * 2);

  const arousalBin = arousal >= 0.67 ? "high" : arousal >= 0.33 ? "mid" : "low";
  const valenceBin = valence >= 0.33 ? "pos" : valence <= -0.33 ? "neg" : "neutral";

  const CIRCUMPLEX: Record<string, Record<string, string>> = {
    high: { pos: "excited",  neutral: "alert",   neg: isThreat ? "terrified" : "angry" },
    mid:  { pos: "happy",    neutral: "neutral",  neg: isThreat ? "anxious"   : "sad"  },
    low:  { pos: "content",  neutral: "bored",    neg: "depressed" },
  };

  const emotion = CIRCUMPLEX[arousalBin][valenceBin];

  // Behavior: minimize free energy (initial pass — may be overridden by attractor)
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

  // ── Narrative Agency × Communion (McAdams 1993) ──────────────────────
  // Extract narrative identity dimensions from person's history.
  // Modulates attractor depth: identity-aligned basins deepen, misaligned shallow.
  const narrative = extractNarrativeTheme(person.history ?? []);

  // ── Attractor Landscape Dynamics ─────────────────────────────────────
  // Model person as dynamical system; select attractor basin from trajectory.
  // dX/dt = -∇V(X) + F_stimulus; V(X) = Σ depth_i·|X−A_i|²
  // Deep basins (trauma, habit, pathology) override behavior regardless of stimulus.
  const personPos = emotionalStateToPos(person.emotionalState, arousal);
  const force = computeForce(situation);
  const { attractor, depth } = selectAttractor(domain, personPos, force, person, narrative);

  // Deep attractors override behavior — willpower insufficient against deep basin
  if (depth >= ATTRACTOR_OVERRIDE_DEPTH) {
    behavior = attractor.name;
  }

  const attractorTag = `attractor:${attractor.name}(depth=${depth.toFixed(1)})`;
  const vagalTag = `vagal:${autonomicState}`;
  const narrativeTag = `narrative:A=${narrative.agency.toFixed(2)},C=${narrative.communion.toFixed(2)}`;

  const confidence = Math.min(0.9, 0.4 + pe * 1.2 + (depth >= ATTRACTOR_OVERRIDE_DEPTH ? 0.1 : 0));

  const baseResponse: Response = {
    rootCause: `${dominantNeed} need [${domain}] — PE=${pe.toFixed(2)}, basin=${attractor.name}${depth >= ATTRACTOR_OVERRIDE_DEPTH ? " [locked]" : ""}`,
    process: `active-inference+attractor: F=${maxF.toFixed(3)}, PE=${pe.toFixed(2)}, ${attractorTag}, ${vagalTag}, ${narrativeTag}, arousal=${arousal}`,
    emotion,
    behavior,
    confidence,
  };

  // ─── Mechanism Precedence Cascade ────────────────────────────────────
  // Each gate accumulates residue that perturbs downstream layer priors.
  const cascadeResidue: Record<string, number> = {};

  // ── Cascade Gate 0: Defense Mechanism Hierarchy (Vaillant 1977) ─────
  // Pre-cognitive ego-protection. Transforms emotion before any cognition runs.
  // Overwhelm = intensity × personalRelevance / copingCapacity.
  // When overwhelm > 0.9: defense activates; emotion → defended emotion.
  // Sits between polyvagal (autonomic) and dissonance (cognitive) — pre-cognitive.
  const defense = computeDefense(situation, baseResponse.emotion);
  const defended = applyDefense(situation, baseResponse, defense);

  // ── Cascade Gate 2: Dissonance Veto (Festinger 1957) ───────────────
  // D > 0.7: unresolved contradiction suspends regulatory goal pursuit.
  // The mind cannot run promotion/prevention strategy while resolving contradiction.
  const dsState = computeDissonance(situation);
  const dissonanceVeto = dsState.score > DISSONANCE_VETO_THRESHOLD;
  if (dissonanceVeto) {
    cascadeResidue["conflictLoad"] = dsState.score;
  }

  // Dissonance residue boosts effective FE signal for resolution-seeking behavior.
  const dissonanced = applyDissonanceDetector(
    situation, defended, dsState,
    maxF + (cascadeResidue["conflictLoad"] ?? 0) * 0.5
  );

  // Apply domain templates
  const templated = applyDomainTemplate(domain, situation, dissonanced);

  // ── Causal Attribution Spine (Weiner 1985) ─────────────────────────
  const attributed = applyAttributionSpine(situation, templated, maxF, dominantNeed);

  // ── Cascade Gate 3: Narrative Identity Threat (McAdams 1993) ───────
  // If dominant attractor misaligns with self-story (alignment < 0.35),
  // person sacrifices momentary need satisfaction to protect narrative identity.
  // This overrides need hierarchy before RFT can apply motivational coloring.
  const narrativeAlignment = computeNarrativeAlignment(attractor.name, narrative);
  const narrativeThreat = narrativeAlignment < NARRATIVE_THREAT_THRESHOLD &&
    (person.history?.length ?? 0) > 0;
  if (narrativeThreat) {
    cascadeResidue["identityThreat"] = 1 - narrativeAlignment;
  }

  let narrativeAdjusted = attributed;
  if (narrativeThreat) {
    // Agency-dominant identity → assert self; communion-dominant → seek belonging
    const identityBehavior = narrative.agency >= narrative.communion
      ? "assert-identity"
      : "seek-belonging";
    narrativeAdjusted = {
      ...attributed,
      behavior: identityBehavior,
      rootCause: `${attributed.rootCause} [cascade:narrative-threat(A=${narrativeAlignment.toFixed(2)})→${identityBehavior}]`,
      process: `${attributed.process} | cascade:narrative-veto(identityThreat=${cascadeResidue["identityThreat"]?.toFixed(2)})`,
    };
  }

  // ── Regulatory Focus Theory — gated by dissonance veto ─────────────
  // Gate 2 active: D > 0.7 means RFT suspended; resolution-seeking takes precedence.
  // Gate 2 inactive: RFT runs normally to add motivational coloring.
  const rfState = computeRegulatoryFocus(situation);
  let regulated: Response;
  if (dissonanceVeto) {
    const resolutionBehavior =
      dsState.strategy === "rationalize" ? "justify-prior-choice"
      : dsState.strategy === "update"    ? "seek-resolution"
      : "contain-conflict";
    regulated = {
      ...narrativeAdjusted,
      behavior: resolutionBehavior,
      rootCause: `${narrativeAdjusted.rootCause} [cascade:dissonance-veto(D=${dsState.score.toFixed(2)})→resolution-first]`,
      process: `${narrativeAdjusted.process} | cascade:dissonance-veto suspends RFT(pressure=${rfState.pressure.toFixed(2)})`,
    };
  } else {
    regulated = applyRegulatoryFocus(situation, narrativeAdjusted, rfState);
  }
  const rfTag = `RFT:${rfState.strategy}(p=${rfState.pressure.toFixed(2)})`;

  // ── Cascade Gate 1: Polyvagal SHUTDOWN Veto (Porges 1994) ──────────
  // SHUTDOWN vetoes ALL higher cognition — narrative, dissonance, and RFT outputs
  // are all overridden. Dorsal vagal collapse forces freeze/withdrawal unconditionally.
  // Residue: safetyBoost=1.0 passed to active inference (confirms survival-only output).
  if (autonomicState === "SHUTDOWN") {
    const shutdownBehavior = arousal > 0.85 ? "freeze" : "withdrawal";
    cascadeResidue["safetyBoost"] = 1.0;
    const shutdownBase = {
      ...regulated,
      behavior: shutdownBehavior,
      process: `${regulated.process} | cascade:SHUTDOWN-veto→${shutdownBehavior}(residue:safety+1.0)`,
      rootCause: `${regulated.rootCause} [cascade:SHUTDOWN-veto — dorsal-vagal collapse, safety-only]`,
    };
    return applyActiveInference(situation, shutdownBase, aiState);
  }

  // ── Catastrophizing Feedback Loop Detector ───────────────────────
  // Applied post-cascade: checks if behavior will generate a new amplified
  // stimulus (self-reinforcing loop). Requires psychopathology/emotion domain
  // AND loop-prone attractor AND k > 1.3.
  const loopState = detectCatastrophizingLoop(situation, attractor, domain);

  if (depth >= ATTRACTOR_OVERRIDE_DEPTH) {
    const attractorBase = {
      ...regulated,
      behavior: attractor.name,
      process: `${regulated.process} | ${attractorTag}[override]`,
      rootCause: `${regulated.rootCause} [rigid-basin:${attractor.name},depth=${depth.toFixed(1)}]`,
    };
    const looped = applyCatastrophizingLoop(situation, attractorBase, loopState, attractor);
    return applyActiveInference(situation, looped, aiState);
  }

  // ── Active Inference final pass ───────────────────────────────────
  const finalBase = applyCatastrophizingLoop(situation, {
    ...regulated,
    process: `${regulated.process} | ${attractorTag} | ${rfTag}`,
  }, loopState, attractor);
  return applyActiveInference(situation, finalBase, aiState);
}

// ─── Semantic Scoring ────────────────────────────────────────────────
// Weighted Jaccard similarity with synonym expansion.
// Weights: rootCauseType × 2, behavior × 1.5, emotion × 1.
// Synonym table enables domain-aware soft matching.

import type { ExpectedResponse } from "./human-types.ts";

const SYNONYMS: Record<string, string[]> = {
  // Emotions
  fear:          ["anxiety", "dread", "threat-response", "afraid", "scared", "fearful", "terrified", "anxious"],
  anger:         ["frustration", "aggression", "hostility", "rage", "angry", "furious", "irritation", "irritated"],
  sadness:       ["grief", "depression", "sorrow", "despair", "sad", "melancholy", "hopeless", "hopelessness"],
  guilt:         ["shame", "regret", "remorse", "guilty"],
  shame:         ["guilt", "embarrassment", "humiliation", "embarrassed"],
  happiness:     ["joy", "pleasure", "elation", "content", "happy", "joyful", "elated"],
  // Behaviors
  avoidance:     ["withdrawal", "escape", "flee", "freeze", "avoid", "retreat"],
  withdrawal:    ["avoidance", "escape", "withdraw", "isolation", "retreating"],
  conformity:    ["comply", "conform", "obey", "agree", "submission", "compliance"],
  // Root cause types
  evolutionary:  ["survival", "instinct", "evolved", "adaptive", "fight-flight", "amygdala", "biological", "hardwired"],
  learned:       ["conditioning", "reinforcement", "habit", "learning", "acquired", "behavioral", "classical", "operant"],
  structural:    ["neural", "circuit", "cognitive", "schema", "system"],
  cultural:      ["norm", "social", "cultural", "societal", "norms"],
  developmental: ["stage", "childhood", "attachment", "piaget", "erikson", "growth"],
};

function expandWithSynonyms(term: string): string[] {
  const t = term.toLowerCase();
  const expanded = new Set([t]);
  for (const [key, synList] of Object.entries(SYNONYMS)) {
    if (t === key || synList.includes(t)) {
      expanded.add(key);
      for (const s of synList) expanded.add(s);
    }
  }
  return [...expanded];
}

function extractKeywords(text: string): Set<string> {
  return new Set(
    text.toLowerCase().split(/[\s\-_|:,+\/\[\]().=]+/).filter((w) => w.length > 3)
  );
}

function jaccardWithSynonyms(predicted: string, expected: string): number {
  const predTokens = extractKeywords(predicted);
  const expTokens  = extractKeywords(expected);
  const predExpanded = new Set<string>();
  const expExpanded  = new Set<string>();
  for (const t of predTokens) for (const s of expandWithSynonyms(t)) predExpanded.add(s);
  for (const t of expTokens)  for (const s of expandWithSynonyms(t)) expExpanded.add(s);
  const intersection = [...predExpanded].filter((t) => expExpanded.has(t)).length;
  const union = new Set([...predExpanded, ...expExpanded]).size;
  if (union === 0) return 0;
  return intersection / union;
}

// Infer rootCauseType from combined response text
function inferRootCauseType(combined: string): string {
  const types: Record<string, string[]> = {
    evolutionary:  ["survival", "evolutionary", "evolved", "instinct", "amygdala", "fight-flight", "hardwired", "biological"],
    learned:       ["conditioning", "learned", "reinforcement", "habit", "acquired"],
    structural:    ["neural", "circuit", "cognitive", "schema", "system"],
    cultural:      ["cultural", "norm", "social", "societal"],
    developmental: ["developmental", "attachment", "piaget", "erikson", "stage"],
  };
  let best = "structural";
  let bestScore = 0;
  for (const [type, keywords] of Object.entries(types)) {
    const hits = keywords.filter((k) => combined.includes(k)).length;
    if (hits > bestScore) { bestScore = hits; best = type; }
  }
  return best;
}

function scoreBenchmark(response: Response, expected: ExpectedResponse): number {
  const combined = `${response.emotion} ${response.behavior} ${response.rootCause} ${response.process}`.toLowerCase();

  let totalWeight = 0;
  let weightedScore = 0;

  // rootCauseType — weight 2.0
  if (expected.rootCauseType !== undefined) {
    const weight = 2.0;
    totalWeight += weight;
    const expType = expected.rootCauseType.toLowerCase();
    const gotType = inferRootCauseType(combined);
    const j = jaccardWithSynonyms(gotType, expType);
    const typeScore = combined.includes(expType) ? 1.0 : j > 0.15 ? Math.min(1, j * 2) : 0;
    weightedScore += weight * typeScore;
  }

  // behavior — weight 1.5
  if (expected.behavior !== undefined) {
    const weight = 1.5;
    totalWeight += weight;
    const j = jaccardWithSynonyms(response.behavior, expected.behavior);
    const expBehTokens = extractKeywords(expected.behavior);
    const anyHit = [...expBehTokens].some((w) => combined.includes(w));
    const behScore = Math.min(1, j * 4 + (anyHit ? 0.3 : 0));
    weightedScore += weight * behScore;
  }

  // emotion — weight 1.0
  if (expected.emotionChange !== undefined) {
    const weight = 1.0;
    totalWeight += weight;
    const j = jaccardWithSynonyms(response.emotion, expected.emotionChange);
    const expEmo = expected.emotionChange.toLowerCase();
    const emoScore = combined.includes(expEmo) ? 1.0 : j > 0.2 ? 1.0 : j * 3;
    weightedScore += weight * Math.min(1, emoScore);
  }

  // mustInclude — weight 0.5
  if (expected.mustInclude && expected.mustInclude.length > 0) {
    const weight = 0.5;
    totalWeight += weight;
    const hits = expected.mustInclude.filter((t) => combined.includes(t.toLowerCase())).length;
    weightedScore += weight * (hits / expected.mustInclude.length);
  }

  // mustNotInclude — penalty −0.5 per violation
  if (expected.mustNotInclude) {
    for (const t of expected.mustNotInclude) {
      if (combined.includes(t.toLowerCase())) weightedScore -= 0.5;
    }
  }

  if (totalWeight === 0) return 0.5;
  return Math.max(0, Math.min(1, weightedScore / totalWeight));
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
