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
  person: Situation["person"]
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
    const depth = a.baseDepth * arousalMod * historyMod;
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
    ptProcess = "prospect-theory: loss-frame → risk-seeking (λ=2.25, reference-point shift)";
  } else if (isGainFrame && !isLossFrame) {
    decisionBehavior = "risk-averse";
    ptProcess = "prospect-theory: gain-frame → risk-aversion (diminishing marginal utility)";
  } else {
    decisionBehavior = "deliberate";
    ptProcess = "prospect-theory: ambiguous frame → deliberation under uncertainty";
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

// Threshold above which an attractor basin overrides domain template behavior.
// Models: habit formation, trauma lock-in, psychopathology rigidity.
const ATTRACTOR_OVERRIDE_DEPTH = 3.0;

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

  // ── Attractor Landscape Dynamics ─────────────────────────────────────
  // Model person as dynamical system; select attractor basin from trajectory.
  // dX/dt = -∇V(X) + F_stimulus; V(X) = Σ depth_i·|X−A_i|²
  // Deep basins (trauma, habit, pathology) override behavior regardless of stimulus.
  const personPos = emotionalStateToPos(person.emotionalState, arousal);
  const force = computeForce(situation);
  const { attractor, depth } = selectAttractor(domain, personPos, force, person);

  // Deep attractors override behavior — willpower insufficient against deep basin
  if (depth >= ATTRACTOR_OVERRIDE_DEPTH) {
    behavior = attractor.name;
  }

  const attractorTag = `attractor:${attractor.name}(depth=${depth.toFixed(1)})`;

  const confidence = Math.min(0.9, 0.4 + pe * 1.2 + (depth >= ATTRACTOR_OVERRIDE_DEPTH ? 0.1 : 0));

  const baseResponse: Response = {
    rootCause: `${dominantNeed} need [${domain}] — PE=${pe.toFixed(2)}, basin=${attractor.name}${depth >= ATTRACTOR_OVERRIDE_DEPTH ? " [locked]" : ""}`,
    process: `active-inference+attractor: F=${maxF.toFixed(3)}, PE=${pe.toFixed(2)}, ${attractorTag}, arousal=${arousal}`,
    emotion,
    behavior,
    confidence,
  };

  // Apply domain templates; deep attractors re-assert behavior afterward
  const templated = applyDomainTemplate(domain, situation, baseResponse);

  if (depth >= ATTRACTOR_OVERRIDE_DEPTH) {
    // Pathological/habitual rigidity: template refines rootCause/process, attractor locks behavior
    return {
      ...templated,
      behavior: attractor.name,
      process: `${templated.process} | ${attractorTag}[override]`,
      rootCause: `${templated.rootCause} [rigid-basin:${attractor.name},depth=${depth.toFixed(1)}]`,
    };
  }

  return {
    ...templated,
    process: `${templated.process} | ${attractorTag}`,
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
