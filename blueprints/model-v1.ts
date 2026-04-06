/**
 * Human Model v1 — "The Drive Machine"
 *
 * A first attempt at a minimal, coherent model of human thinking and behavior.
 *
 * Core thesis: Humans are drive-regulation systems. All behavior emerges from
 * a small set of fundamental drives competing for expression, filtered through
 * an appraisal system that evaluates situations against those drives, producing
 * emotional signals that bias action selection.
 *
 * The model has 7 primitives organized in 3 layers:
 *
 *   DRIVES (what we want)
 *     ├── safety-drive      — avoid harm, maintain predictability
 *     ├── belonging-drive   — connect with others, gain acceptance
 *     └── competence-drive  — master the environment, feel capable
 *
 *   PROCESSING (how we evaluate)
 *     ├── appraisal         — evaluate situation against active drives
 *     └── energy-budget     — regulate effort based on expected return
 *
 *   OUTPUT (what we do)
 *     ├── emotion-signal    — drives generate emotions that bias action
 *     └── action-selection  — pick behavior that best serves strongest drive
 *
 * Why these 7? They compose to explain a wide range of phenomena:
 * - Cognitive biases arise when appraisal takes shortcuts to protect drives
 * - Emotions are signals FROM drives TO action-selection
 * - Social behavior is belonging-drive + appraisal of social context
 * - Decision-making is competition between drives filtered by energy-budget
 * - Psychopathology is when a drive gets stuck in overdrive or shutdown
 */

import type {
  HumanModel,
  Primitive,
  Situation,
  Response,
  ProcessStep,
} from "../src/human-types.ts";

// ─── Primitives ──────────────────────────────────────────────────────

const primitives: Primitive[] = [
  // Layer 1: DRIVES
  {
    id: "safety-drive",
    domain: "motivation",
    description:
      "The need to avoid harm and maintain predictability. Activates when threat is detected or uncertainty rises. Produces fear, anxiety, or relief. Evolutionarily oldest drive.",
    triggers: ["threat detected", "uncertainty high", "loss possible", "environment unpredictable"],
    transformation: "situation with threat → urgency signal + narrowed attention + avoidance bias",
    relatesTo: ["appraisal", "emotion-signal", "belonging-drive"],
    relationDescription:
      "Appraisal feeds threat assessments to safety-drive. Safety-drive generates emotion-signals (fear, relief). Conflicts with belonging-drive when social situation feels unsafe.",
  },
  {
    id: "belonging-drive",
    domain: "social",
    description:
      "The need for social connection, acceptance, and group membership. Activates when social standing is at stake. Produces shame, pride, loneliness, warmth. Drives conformity, cooperation, and status-seeking.",
    triggers: ["social evaluation", "group presence", "rejection risk", "isolation", "approval opportunity"],
    transformation: "social context → social-alignment pressure + conformity bias + reputation monitoring",
    relatesTo: ["appraisal", "emotion-signal", "safety-drive", "competence-drive"],
    relationDescription:
      "Belonging-drive uses appraisal to read social cues. Generates emotion-signals (shame, pride, loneliness). Can override safety-drive (risk harm for group). Interacts with competence-drive (status through mastery).",
  },
  {
    id: "competence-drive",
    domain: "motivation",
    description:
      "The need to master the environment, feel capable, and achieve goals. Activates when challenge is present or competence is questioned. Produces frustration, satisfaction, curiosity, or helplessness.",
    triggers: ["challenge present", "skill tested", "goal in sight", "competence questioned", "learning opportunity"],
    transformation: "challenge → effort mobilization + persistence + goal-tracking",
    relatesTo: ["appraisal", "emotion-signal", "energy-budget", "belonging-drive"],
    relationDescription:
      "Appraisal evaluates if challenge is within capability. Emotion-signal reflects progress (satisfaction) or stagnation (frustration). Energy-budget gates how much effort to invest. Links to belonging-drive via status (competence earns respect).",
  },

  // Layer 2: PROCESSING
  {
    id: "appraisal",
    domain: "cognition",
    description:
      "Rapid, automatic evaluation of a situation against active drives. Asks: Is this relevant to my drives? Is it good or bad? Can I cope? Uses heuristics under time pressure, which creates cognitive biases. This is where 'fast thinking' lives.",
    triggers: ["any new stimulus", "context change", "information received"],
    transformation: "stimulus → relevance check → threat/opportunity/neutral classification → drive activation strength",
    relatesTo: ["safety-drive", "belonging-drive", "competence-drive", "energy-budget"],
    relationDescription:
      "Appraisal is the gateway — it evaluates every situation and routes it to the relevant drives. Under time pressure or high arousal, appraisal takes shortcuts (heuristics), creating cognitive biases. Consults energy-budget to decide depth of analysis.",
  },
  {
    id: "energy-budget",
    domain: "cognition",
    description:
      "Regulates cognitive and physical effort based on expected return. Conserves energy by default. Only invests effort when expected reward justifies the cost. Explains procrastination, satisficing, and why we take mental shortcuts.",
    triggers: ["effort required", "decision complexity", "fatigue", "expected reward changes"],
    transformation: "effort cost + expected reward → investment decision (engage deeply, satisfice, or withdraw)",
    relatesTo: ["appraisal", "competence-drive", "action-selection"],
    relationDescription:
      "Appraisal estimates the effort required; energy-budget decides if it's worth it. Modulates competence-drive (low budget → give up). Constrains action-selection (low budget → default/habitual action).",
  },

  // Layer 3: OUTPUT
  {
    id: "emotion-signal",
    domain: "emotion",
    description:
      "Drives produce emotions as internal signals. Emotions are not the endpoint — they are messages from drives to action-selection. Fear says 'escape now.' Shame says 'repair social standing.' Satisfaction says 'keep doing this.' Emotions also leak externally as expressions, enabling social coordination.",
    triggers: ["drive activated", "drive satisfied", "drive frustrated", "drive conflict"],
    transformation: "drive state → specific emotion → action bias + body state change + social signal",
    relatesTo: ["safety-drive", "belonging-drive", "competence-drive", "action-selection"],
    relationDescription:
      "Each drive produces characteristic emotions. Emotion-signal translates drive urgency into action bias (fear → flee, shame → conform, curiosity → explore). Feeds directly into action-selection as a weighting factor.",
  },
  {
    id: "action-selection",
    domain: "behavior",
    description:
      "Selects observable behavior by weighing competing drive signals, emotional biases, and energy budget. The strongest drive-emotion combination wins, unless overridden by a stronger competing drive. Habits are low-energy defaults. Deliberate choices happen when drives conflict and energy is available.",
    triggers: ["emotion-signal active", "response required", "competing options"],
    transformation: "competing drive-emotion signals + energy budget → selected behavior + confidence level",
    relatesTo: ["emotion-signal", "energy-budget", "appraisal"],
    relationDescription:
      "Receives emotion-signals as weighted votes. Energy-budget constrains the option space. When drives align → confident action. When drives conflict → hesitation, anxiety, deliberation. Appraisal provides the options to choose from.",
  },
];

// ─── Prediction Engine ───────────────────────────────────────────────

function predict(situation: Situation): Response {
  // Step 1: Appraisal — evaluate the situation
  const appraisalResult = runAppraisal(situation);

  // Step 2: Drive activation — which drives are engaged?
  const driveActivation = activateDrives(situation, appraisalResult);

  // Step 3: Energy budget — how much effort is available?
  const energyAvailable = assessEnergy(situation, driveActivation);

  // Step 4: Emotion signal — what emotions arise from the drives?
  const emotions = generateEmotions(driveActivation, appraisalResult);

  // Step 5: Action selection — what behavior wins?
  const action = selectAction(driveActivation, emotions, energyAvailable, situation);

  // Build the process chain
  const chain: ProcessStep[] = [
    {
      primitive: "appraisal",
      input: situation.stimulus.description,
      transformation: `Evaluates stimulus: relevance=${appraisalResult.relevance}, valence=${appraisalResult.valence}, coping=${appraisalResult.coping}`,
      output: `Classification: ${appraisalResult.classification}`,
    },
    ...Object.entries(driveActivation)
      .filter(([_, strength]) => strength > 0.3)
      .map(([drive, strength]) => ({
        primitive: drive,
        input: appraisalResult.classification,
        transformation: `Drive activated at ${(strength * 100).toFixed(0)}% — ${getDriveResponse(drive, appraisalResult.valence)}`,
        output: `${drive} demands: ${getDriveDemand(drive, appraisalResult)}`,
      })),
    {
      primitive: "energy-budget",
      input: `${Object.keys(driveActivation).length} active drives, complexity=${situation.stimulus.intensity}`,
      transformation: `Energy available: ${(energyAvailable * 100).toFixed(0)}% — ${energyAvailable > 0.6 ? "deep processing" : energyAvailable > 0.3 ? "heuristic mode" : "autopilot"}`,
      output: `Processing mode: ${energyAvailable > 0.6 ? "deliberate" : energyAvailable > 0.3 ? "heuristic" : "habitual"}`,
    },
    {
      primitive: "emotion-signal",
      input: `Drives: ${JSON.stringify(driveActivation)}`,
      transformation: `Generates: ${emotions.primary} (intensity: ${(emotions.intensity * 100).toFixed(0)}%)`,
      output: `Action bias: ${emotions.actionBias}`,
    },
    {
      primitive: "action-selection",
      input: `${emotions.primary} + energy=${(energyAvailable * 100).toFixed(0)}%`,
      transformation: `Strongest signal: ${action.dominantDrive} via ${emotions.primary}`,
      output: action.behavior,
    },
  ];

  return {
    rootCause: {
      type: action.rootCauseType,
      mechanism: action.dominantDrive,
      explanation: action.explanation,
    },
    process: {
      activatedPrimitives: chain.map((s) => s.primitive),
      chain,
    },
    effect: {
      emotionChange: emotions.primary,
      arousalChange: emotions.arousalDelta,
      beliefChange: action.beliefChange,
      attentionShift: appraisalResult.attentionShift,
    },
    result: {
      behavior: action.behavior,
      decision: action.decision,
      expression: emotions.expression,
      verbalization: action.verbalization,
    },
    confidence: action.confidence,
  };
}

// ─── Internal Processing Functions ───────────────────────────────────

interface AppraisalResult {
  relevance: number;          // 0-1: how relevant to any drive
  valence: "threat" | "opportunity" | "neutral" | "mixed";
  coping: number;             // 0-1: perceived ability to cope
  classification: string;
  attentionShift: string;
}

function runAppraisal(s: Situation): AppraisalResult {
  const { stimulus, person } = s;
  const relevance = stimulus.personalRelevance * 0.6 + stimulus.intensity * 0.4;

  // Valence: threat if high intensity + safety needs; opportunity if competence/belonging needs met
  const hasSafetyNeeds = person.needs.some((n) =>
    ["safety", "certainty", "security", "predictability"].includes(n)
  );
  const hasSocialNeeds = person.needs.some((n) =>
    ["belonging", "connection", "social-acceptance", "recognition", "social-harmony"].includes(n)
  );
  const hasGrowthNeeds = person.needs.some((n) =>
    ["competence", "autonomy", "mastery", "play", "meaning"].includes(n)
  );

  let valence: AppraisalResult["valence"] = "neutral";
  if (stimulus.intensity > 0.6 && hasSafetyNeeds) valence = "threat";
  else if (stimulus.type === "social" && hasSocialNeeds) valence = relevance > 0.5 ? "mixed" : "opportunity";
  else if (stimulus.type === "choice") valence = "mixed";
  else if (stimulus.novelty > 0.6 && hasGrowthNeeds) valence = "opportunity";
  else if (stimulus.intensity > 0.5) valence = "threat";

  const neuroticism = person.traits.neuroticism ?? 0.5;
  const coping = Math.max(0, (1 - neuroticism) * 0.5 + (1 - stimulus.intensity) * 0.3 + (person.arousal < 0.5 ? 0.2 : 0));

  const classification =
    valence === "threat" ? `Threat to ${hasSafetyNeeds ? "safety" : hasSocialNeeds ? "social standing" : "goals"}` :
    valence === "opportunity" ? `Opportunity for ${hasGrowthNeeds ? "growth" : hasSocialNeeds ? "connection" : "improvement"}` :
    valence === "mixed" ? "Competing demands — multiple drives engaged" :
    "Low-relevance stimulus — default processing";

  const attentionShift =
    valence === "threat" ? "narrows to threat source" :
    valence === "opportunity" ? "broadens to explore" :
    valence === "mixed" ? "oscillates between options" :
    "unchanged";

  return { relevance, valence, coping, classification, attentionShift };
}

function activateDrives(
  s: Situation,
  appraisal: AppraisalResult,
): Record<string, number> {
  const { person, stimulus, context } = s;
  const drives: Record<string, number> = {
    "safety-drive": 0,
    "belonging-drive": 0,
    "competence-drive": 0,
  };

  // Safety drive: activated by threat, uncertainty, potential loss
  if (appraisal.valence === "threat") drives["safety-drive"] += 0.6;
  if (stimulus.intensity > 0.7) drives["safety-drive"] += 0.3;
  if (person.needs.some((n) => ["safety", "certainty", "security"].includes(n))) drives["safety-drive"] += 0.2;
  if (person.emotionalState.includes("anx")) drives["safety-drive"] += 0.2;
  const neuroticism = person.traits.neuroticism ?? 0.5;
  drives["safety-drive"] += neuroticism * 0.2;

  // Belonging drive: activated by social context
  if (stimulus.type === "social") drives["belonging-drive"] += 0.5;
  if (context.socialSetting !== "alone") drives["belonging-drive"] += 0.2;
  if (person.needs.some((n) => ["belonging", "connection", "social-acceptance", "recognition", "social-harmony", "reassurance"].includes(n))) drives["belonging-drive"] += 0.3;
  const agreeableness = person.traits.agreeableness ?? 0.5;
  drives["belonging-drive"] += agreeableness * 0.15;

  // Competence drive: activated by challenge, choice, goal
  if (stimulus.type === "choice") drives["competence-drive"] += 0.4;
  if (person.needs.some((n) => ["competence", "autonomy", "mastery", "accuracy"].includes(n))) drives["competence-drive"] += 0.3;
  if (stimulus.novelty > 0.5) drives["competence-drive"] += 0.2;
  const openness = person.traits.openness ?? 0.5;
  drives["competence-drive"] += openness * 0.15;

  // Normalize to 0-1
  for (const key of Object.keys(drives)) {
    drives[key] = Math.min(1, Math.max(0, drives[key]));
  }

  return drives;
}

function assessEnergy(
  s: Situation,
  drives: Record<string, number>,
): number {
  // High arousal = less energy for deliberation
  let energy = 1 - s.person.arousal * 0.4;

  // Time pressure reduces available energy
  if (s.context.timeConstraint === "urgent") energy -= 0.3;
  else if (s.context.timeConstraint === "deadline") energy -= 0.15;

  // Emotional exhaustion (already stressed/fatigued)
  if (["stressed", "fatigued", "exhausted", "resigned"].includes(s.person.emotionalState)) {
    energy -= 0.3;
  }

  // Very strong drive activation = tunnel vision = less deliberation energy
  const maxDrive = Math.max(...Object.values(drives));
  if (maxDrive > 0.8) energy -= 0.2;

  return Math.max(0.05, Math.min(1, energy));
}

interface EmotionResult {
  primary: string;
  intensity: number;
  arousalDelta: number;
  actionBias: string;
  expression: string;
}

function generateEmotions(
  drives: Record<string, number>,
  appraisal: AppraisalResult,
): EmotionResult {
  const safety = drives["safety-drive"];
  const belonging = drives["belonging-drive"];
  const competence = drives["competence-drive"];

  // Determine dominant emotion from drive state + appraisal
  if (safety > 0.7 && appraisal.valence === "threat") {
    return {
      primary: "fear",
      intensity: safety,
      arousalDelta: 0.4,
      actionBias: "escape or freeze",
      expression: "wide eyes, tense posture, rapid breathing",
    };
  }

  if (belonging > 0.6 && appraisal.valence === "threat") {
    return {
      primary: "shame/anxiety",
      intensity: belonging,
      arousalDelta: 0.3,
      actionBias: "conform or withdraw",
      expression: "averted gaze, closed posture",
    };
  }

  if (belonging > 0.5 && appraisal.valence === "mixed") {
    return {
      primary: "social-anxiety",
      intensity: belonging * 0.8,
      arousalDelta: 0.2,
      actionBias: "monitor others, align with group",
      expression: "scanning faces, hesitant speech",
    };
  }

  if (competence > 0.5 && appraisal.coping < 0.4) {
    return {
      primary: "frustration",
      intensity: competence,
      arousalDelta: 0.2,
      actionBias: "withdraw or lower standards",
      expression: "furrowed brow, sighing",
    };
  }

  if (safety > 0.5 && appraisal.valence === "mixed") {
    return {
      primary: "apprehension",
      intensity: safety * 0.7,
      arousalDelta: 0.15,
      actionBias: "cautious avoidance of loss",
      expression: "slight tension, hesitation",
    };
  }

  if (appraisal.valence === "opportunity") {
    return {
      primary: "interest/curiosity",
      intensity: Math.max(competence, belonging) * 0.7,
      arousalDelta: 0.1,
      actionBias: "approach and explore",
      expression: "leaning forward, open posture",
    };
  }

  // Default: low-activation neutral
  return {
    primary: "neutral",
    intensity: 0.2,
    arousalDelta: 0,
    actionBias: "maintain current course",
    expression: "relaxed, minimal change",
  };
}

interface ActionResult {
  dominantDrive: string;
  behavior: string;
  decision?: string;
  verbalization?: string;
  beliefChange?: string;
  explanation: string;
  rootCauseType: "evolutionary" | "learned" | "structural" | "cultural" | "developmental";
  confidence: number;
}

function selectAction(
  drives: Record<string, number>,
  emotions: EmotionResult,
  energy: number,
  s: Situation,
): ActionResult {
  // Find the dominant drive
  const sorted = Object.entries(drives).sort((a, b) => b[1] - a[1]);
  const [dominantDrive, dominantStrength] = sorted[0];
  const [secondDrive, secondStrength] = sorted[1] ?? ["none", 0];

  // Drive conflict? If top two are close → hesitation
  const conflict = dominantStrength - secondStrength < 0.15 && dominantStrength > 0.3;

  // Low energy → default/habitual behavior
  if (energy < 0.3) {
    return {
      dominantDrive,
      behavior: getDefaultBehavior(dominantDrive, s),
      explanation: `Low energy budget → falls back on habitual ${dominantDrive} response. ${getDriveExplanation(dominantDrive)}`,
      rootCauseType: "structural",
      confidence: 0.5,
    };
  }

  // High conflict → deliberation or anxiety-driven avoidance
  if (conflict) {
    return {
      dominantDrive: `${dominantDrive} vs ${secondDrive}`,
      behavior: `hesitates, shows internal conflict between ${driveName(dominantDrive)} and ${driveName(secondDrive)}`,
      decision: energy > 0.5 ? `resolves toward ${dominantDrive} after deliberation` : `defaults to ${dominantDrive} under pressure`,
      explanation: `Competing drives: ${dominantDrive} (${(dominantStrength * 100).toFixed(0)}%) vs ${secondDrive} (${(secondStrength * 100).toFixed(0)}%). ${getDriveExplanation(dominantDrive)}`,
      rootCauseType: "structural",
      confidence: 0.4,
    };
  }

  // Clear dominant drive → execute its preferred action
  const behavior = getDriveBehavior(dominantDrive, emotions, s);

  return {
    dominantDrive,
    behavior: behavior.action,
    decision: behavior.decision,
    verbalization: behavior.verbalization,
    beliefChange: behavior.beliefChange,
    explanation: `${dominantDrive} dominates (${(dominantStrength * 100).toFixed(0)}%) → ${emotions.primary} → ${emotions.actionBias}. ${getDriveExplanation(dominantDrive)}`,
    rootCauseType: dominantDrive === "safety-drive" ? "evolutionary" :
      dominantDrive === "belonging-drive" ? "evolutionary" : "structural",
    confidence: dominantStrength * (1 - (conflict ? 0.3 : 0)),
  };
}

// ─── Drive-specific behavior patterns ────────────────────────────────

function getDriveBehavior(
  drive: string,
  emotions: EmotionResult,
  s: Situation,
): { action: string; decision?: string; verbalization?: string; beliefChange?: string } {
  switch (drive) {
    case "safety-drive":
      if (emotions.intensity > 0.7) {
        return {
          action: "immediate avoidance or freeze — automatic protective response before conscious evaluation",
          verbalization: s.stimulus.intensity > 0.8 ? undefined : "I don't think that's a good idea",
        };
      }
      return {
        action: "cautious approach, seeks more information before committing, avoids irreversible choices",
        decision: "prefers safe/known option over uncertain gain",
        verbalization: "Let me think about this more",
      };

    case "belonging-drive":
      if (s.context.socialSetting.includes("group") || s.context.socialSetting.includes("strangers")) {
        return {
          action: "monitors group consensus, adjusts position toward majority, avoids standing out",
          decision: "aligns with group preference even at cost to personal judgment",
          verbalization: "I see what you mean, I think I agree",
        };
      }
      return {
        action: "seeks connection, shows empathy, maintains social harmony",
        verbalization: "How are you feeling about this?",
      };

    case "competence-drive":
      if (emotions.primary === "frustration") {
        return {
          action: "reduces effort or lowers standards to protect sense of competence",
          decision: "satisfices rather than optimizes",
          beliefChange: "adjusts expectations downward",
        };
      }
      return {
        action: "engages with challenge, seeks to demonstrate mastery",
        decision: "chooses option that tests or displays ability",
        verbalization: "I can figure this out",
      };

    default:
      return { action: "maintains current behavior" };
  }
}

function getDefaultBehavior(drive: string, s: Situation): string {
  switch (drive) {
    case "safety-drive": return "avoids, withdraws, or freezes — conserves energy";
    case "belonging-drive": return "goes along with group, minimal social friction";
    case "competence-drive": return "takes easy/familiar path, avoids challenge";
    default: return "no specific action";
  }
}

function getDriveResponse(drive: string, valence: string): string {
  if (valence === "threat") {
    switch (drive) {
      case "safety-drive": return "threat detected → mobilizing avoidance";
      case "belonging-drive": return "social threat → mobilizing conformity/repair";
      case "competence-drive": return "challenge to competence → mobilizing effort or defense";
    }
  }
  switch (drive) {
    case "safety-drive": return "monitoring for threat";
    case "belonging-drive": return "reading social cues";
    case "competence-drive": return "assessing challenge";
  }
  return "processing";
}

function getDriveDemand(drive: string, appraisal: AppraisalResult): string {
  switch (drive) {
    case "safety-drive": return appraisal.valence === "threat" ? "escape or neutralize threat" : "maintain vigilance";
    case "belonging-drive": return "maintain or improve social standing";
    case "competence-drive": return appraisal.coping > 0.5 ? "engage and master" : "protect self-image";
  }
  return "unknown";
}

function getDriveExplanation(drive: string): string {
  switch (drive) {
    case "safety-drive":
      return "Safety-drive is evolutionarily primary — it overrides other drives when threat is salient. Explains risk aversion, loss aversion, and fear-based biases.";
    case "belonging-drive":
      return "Belonging-drive reflects our evolutionary dependence on group membership for survival. Explains conformity, obedience, shame, and social monitoring.";
    case "competence-drive":
      return "Competence-drive serves the need to predict and control the environment. Explains curiosity, frustration, achievement motivation, and sunk-cost commitment.";
  }
  return "";
}

function driveName(drive: string): string {
  return drive.replace("-drive", "");
}

// ─── Explain (with reasoning) ────────────────────────────────────────

function explain(situation: Situation): Response & { reasoning: string } {
  const response = predict(situation);
  const reasoning = `
Model "The Drive Machine" explains this as follows:

1. APPRAISAL: The stimulus "${situation.stimulus.description}" is evaluated automatically.
   Relevance: ${situation.stimulus.personalRelevance > 0.5 ? "high" : "moderate"}, Type: ${situation.stimulus.type}

2. DRIVES: ${response.process.chain
    .filter((s) => s.primitive.includes("drive"))
    .map((s) => `${s.primitive} → ${s.transformation}`)
    .join("; ")}

3. ENERGY: Processing mode determined by arousal (${situation.person.arousal}) and time pressure (${situation.context.timeConstraint ?? "none"}).

4. EMOTION: ${response.effect.emotionChange} arises as a signal from the dominant drive to action-selection.

5. ACTION: ${response.result.behavior}

ROOT CAUSE: ${response.rootCause.explanation}
`.trim();

  return { ...response, reasoning };
}

// ─── Export ──────────────────────────────────────────────────────────

const model: HumanModel = {
  id: "drive-machine",
  version: 1,
  name: "The Drive Machine",
  description:
    "Humans are drive-regulation systems. Three fundamental drives (safety, belonging, competence) compete for expression through an appraisal system, generating emotions that bias action selection. All complex behavior emerges from the interaction of these 7 primitives.",
  primitives,
  predict,
  explain,
};

export default model;
export { model };

// Run evaluation when executed as subprocess
import { evaluate } from "../src/evaluate.ts";
if (import.meta.main) await evaluate(model);
