/**
 * Human Model v2 — "The Prediction Engine"
 *
 * Core thesis: The brain is a prediction machine. All behavior, emotion, and
 * cognition arise from one principle: MINIMIZE PREDICTION ERROR.
 *
 * The brain constantly generates predictions about what will happen next.
 * When reality matches prediction → calm, satisfaction.
 * When reality violates prediction → surprise signal → update model or change reality.
 *
 * This explains:
 * - Cognitive biases: predictions resist updating (confirmation bias = protecting predictions)
 * - Emotions: prediction errors generate emotions proportional to surprise magnitude
 * - Social behavior: we predict others' behavior; group norms are shared predictions
 * - Decision-making: we choose options whose outcomes we can best predict
 * - Psychopathology: stuck predictions that can't update (anxiety = predicting threat that doesn't come)
 *
 * 6 primitives in 2 layers:
 *
 *   PREDICTION
 *     ├── world-model        — internal model of how things work
 *     ├── prediction-generator — generates expectations from world-model
 *     └── error-signal        — compares prediction to reality
 *
 *   RESPONSE
 *     ├── model-updater      — updates world-model when error is accepted
 *     ├── reality-changer    — acts on world to match prediction instead
 *     └── precision-weighter — decides how much to trust prediction vs sensory input
 */

import type {
  HumanModel,
  Primitive,
  Situation,
  Response,
  ProcessStep,
} from "../src/human-types.ts";

const primitives: Primitive[] = [
  {
    id: "world-model",
    domain: "cognition",
    description:
      "The brain's internal model of how everything works — physical, social, self. Built from experience. Contains beliefs, expectations, and learned patterns. Resists rapid change (stability is valuable). This is what we call 'understanding.'",
    triggers: ["always active — provides the substrate for all prediction"],
    transformation: "accumulated experience → structured expectations about how world/self/others behave",
    relatesTo: ["prediction-generator", "model-updater", "precision-weighter"],
    relationDescription:
      "World-model feeds prediction-generator with expectations. Model-updater modifies it when errors are accepted. Precision-weighter determines how resistant it is to change.",
  },
  {
    id: "prediction-generator",
    domain: "cognition",
    description:
      "Continuously generates predictions: what will happen next, what others will do, what I will feel. Predictions are automatic and mostly unconscious. The gap between prediction and reality IS the experience of surprise, novelty, and emotion.",
    triggers: ["any new stimulus", "any context change", "anticipation of event"],
    transformation: "world-model + current context → specific prediction about what happens next",
    relatesTo: ["world-model", "error-signal"],
    relationDescription:
      "Takes from world-model, sends predictions to error-signal for comparison with reality. Speed of prediction determines whether response feels automatic or deliberate.",
  },
  {
    id: "error-signal",
    domain: "emotion",
    description:
      "Compares prediction to actual reality. The SIZE of the mismatch becomes the emotion. Small error → mild surprise. Large error on important predictions → strong emotion (fear, anger, joy, grief). Zero error → calm, flow, boredom. This is the engine of all feeling.",
    triggers: ["reality observed", "prediction compared", "outcome known"],
    transformation: "prediction vs reality → error magnitude × importance = emotional intensity and valence",
    relatesTo: ["prediction-generator", "model-updater", "reality-changer", "precision-weighter"],
    relationDescription:
      "Receives predictions from generator, compares to reality. Sends error to both model-updater (update beliefs) and reality-changer (change behavior). Precision-weighter modulates how big the error feels.",
  },
  {
    id: "model-updater",
    domain: "cognition",
    description:
      "When prediction error is accepted, updates the world-model. This is LEARNING. But updating is costly and risky (what if the new data is wrong?). So the system is conservative — it takes repeated errors to change deep beliefs. This conservatism IS confirmation bias.",
    triggers: ["prediction error detected", "error exceeds threshold", "repeated errors accumulate"],
    transformation: "accepted error → adjusts world-model beliefs, expectations, or predictions",
    relatesTo: ["error-signal", "world-model", "precision-weighter"],
    relationDescription:
      "Receives errors from error-signal. Updates world-model. But precision-weighter gates this — high-confidence predictions resist updating even with evidence.",
  },
  {
    id: "reality-changer",
    domain: "behavior",
    description:
      "Instead of updating the model, ACT on the world to make reality match the prediction. This is all behavior: if you predict 'I should be safe' and reality says 'threat', you flee to MAKE yourself safe. If you predict 'people will accept me' and they don't, you conform to MAKE them accept you. Action serves prediction.",
    triggers: ["prediction error where action is possible", "error too costly to accept as learning"],
    transformation: "prediction error + available actions → behavior that minimizes the gap between expected and actual",
    relatesTo: ["error-signal", "precision-weighter"],
    relationDescription:
      "Receives error from error-signal. Competes with model-updater — do we change our beliefs or change the world? Precision-weighter determines which path is chosen.",
  },
  {
    id: "precision-weighter",
    domain: "cognition",
    description:
      "Controls how much weight to give predictions vs incoming data. High precision on predictions → ignore contradictory evidence (confirmation bias, delusion). High precision on sensory data → update rapidly (learning, flexibility). This is the meta-dial that controls all other primitives. Personality traits, arousal, and context all tune this dial.",
    triggers: ["confidence assessment needed", "conflicting signals", "trait-based baseline", "arousal change"],
    transformation: "confidence in prediction vs confidence in new data → weighting that biases all downstream processing",
    relatesTo: ["world-model", "error-signal", "model-updater", "reality-changer"],
    relationDescription:
      "THE master controller. Modulates error-signal (how big does the error feel?), model-updater (should we learn?), and reality-changer (should we act?). Tuned by personality (neuroticism = high precision on threat predictions) and context (stress narrows precision to predictions, ignoring data).",
  },
];

// ─── Prediction Engine ───────────────────────────────────────────────

function predict(situation: Situation): Response {
  const { context, person, stimulus } = situation;

  // Step 1: World-model generates baseline understanding
  const worldState = buildWorldState(person);

  // Step 2: Prediction-generator creates expectation
  const prediction = generatePrediction(worldState, context, stimulus);

  // Step 3: Error-signal compares prediction to stimulus reality
  const error = computeError(prediction, stimulus, person);

  // Step 4: Precision-weighter determines response strategy
  const precision = computePrecision(person, error);

  // Step 5: Route to model-updater or reality-changer
  const response = resolveError(error, precision, prediction, situation);

  const chain: ProcessStep[] = [
    {
      primitive: "world-model",
      input: `Person beliefs: ${person.beliefs.join(", ")}`,
      transformation: `Activates relevant mental models: ${worldState.activeModels.join(", ")}`,
      output: `Baseline expectation: ${worldState.baseline}`,
    },
    {
      primitive: "prediction-generator",
      input: `${worldState.baseline} + stimulus: ${stimulus.description}`,
      transformation: `Generates prediction: "${prediction.expected}"`,
      output: `Expected outcome: ${prediction.expected} (confidence: ${(prediction.confidence * 100).toFixed(0)}%)`,
    },
    {
      primitive: "error-signal",
      input: `Predicted: "${prediction.expected}" vs Reality: "${stimulus.description}"`,
      transformation: `Error magnitude: ${(error.magnitude * 100).toFixed(0)}%, valence: ${error.valence}`,
      output: `Emotion generated: ${error.emotion} (intensity: ${(error.emotionIntensity * 100).toFixed(0)}%)`,
    },
    {
      primitive: "precision-weighter",
      input: `Prediction confidence: ${(prediction.confidence * 100).toFixed(0)}%, Error: ${(error.magnitude * 100).toFixed(0)}%`,
      transformation: `Precision on predictions: ${(precision.predictionWeight * 100).toFixed(0)}% — ${precision.strategy}`,
      output: `Strategy: ${precision.strategy === "protect-prediction" ? "change reality (act)" : "update model (learn)"}`,
    },
    {
      primitive: precision.strategy === "protect-prediction" ? "reality-changer" : "model-updater",
      input: `Error: ${error.emotion}, Strategy: ${precision.strategy}`,
      transformation: precision.strategy === "protect-prediction"
        ? `Act to make reality match prediction: ${response.behavior}`
        : `Update beliefs: ${response.beliefChange ?? "adjust expectations"}`,
      output: response.behavior,
    },
  ];

  return {
    rootCause: {
      type: error.magnitude > 0.5 ? "structural" : "learned",
      mechanism: precision.strategy === "protect-prediction" ? "prediction-protection" : "prediction-error-learning",
      explanation: `The brain predicted "${prediction.expected}" but encountered "${stimulus.description}". ${
        precision.strategy === "protect-prediction"
          ? "High confidence in existing prediction → acts to change reality rather than updating beliefs."
          : "Error accepted → world-model updates to accommodate new information."
      } ${getDeepExplanation(error, precision, person)}`,
    },
    process: {
      activatedPrimitives: chain.map((s) => s.primitive),
      chain,
    },
    effect: {
      emotionChange: error.emotion,
      arousalChange: error.magnitude * (error.valence === "negative" ? 0.5 : error.valence === "positive" ? 0.3 : 0.1),
      beliefChange: response.beliefChange,
      attentionShift: error.magnitude > 0.5 ? "narrows to error source" : "broadens for context",
    },
    result: {
      behavior: response.behavior,
      decision: response.decision,
      expression: response.expression,
      verbalization: response.verbalization,
    },
    confidence: prediction.confidence * (1 - error.magnitude * 0.3),
  };
}

// ─── Internal Types ──────────────────────────────────────────────────

interface WorldState {
  activeModels: string[];
  baseline: string;
}

interface Prediction {
  expected: string;
  confidence: number;
  domain: string;
}

interface PredictionError {
  magnitude: number;       // 0-1
  valence: "positive" | "negative" | "neutral";
  emotion: string;
  emotionIntensity: number;
  domain: string;
}

interface Precision {
  predictionWeight: number;   // 0-1 (high = trust prediction, low = trust data)
  strategy: "protect-prediction" | "update-model" | "mixed";
}

interface ErrorResolution {
  behavior: string;
  decision?: string;
  beliefChange?: string;
  expression?: string;
  verbalization?: string;
}

// ─── Processing Functions ────────────────────────────────────────────

function buildWorldState(person: Situation["person"]): WorldState {
  const models: string[] = [];
  if (person.beliefs.length > 0) models.push("belief-system");
  if (person.needs.some((n) => ["safety", "certainty", "security"].includes(n))) models.push("threat-prediction");
  if (person.needs.some((n) => ["belonging", "connection", "social-acceptance", "social-harmony", "reassurance"].includes(n))) models.push("social-prediction");
  if (person.needs.some((n) => ["competence", "autonomy", "mastery", "accuracy"].includes(n))) models.push("competence-prediction");
  if (person.history && person.history.length > 0) models.push("experiential-pattern");

  const baseline = person.beliefs[0] ?? "world operates predictably";
  return { activeModels: models, baseline };
}

function generatePrediction(world: WorldState, context: Situation["context"], stimulus: Situation["stimulus"]): Prediction {
  // Generate what the person EXPECTS given their world-model
  let expected: string;
  let confidence: number;
  let domain: string;

  if (world.activeModels.includes("threat-prediction") && stimulus.intensity > 0.6) {
    expected = "danger — need to protect myself";
    confidence = 0.7 + stimulus.intensity * 0.2;
    domain = "safety";
  } else if (world.activeModels.includes("social-prediction") && stimulus.type === "social") {
    expected = "social situation will follow predictable norms";
    confidence = 0.6;
    domain = "social";
  } else if (stimulus.type === "choice") {
    expected = "I can evaluate options and choose the best one";
    confidence = 0.5;
    domain = "competence";
  } else if (stimulus.type === "internal") {
    expected = "my internal state is manageable";
    confidence = 0.5;
    domain = "self";
  } else {
    expected = "situation will unfold normally";
    confidence = 0.6;
    domain = "general";
  }

  // Low novelty → higher confidence (we've seen this before)
  confidence += (1 - stimulus.novelty) * 0.2;
  confidence = Math.min(0.95, confidence);

  return { expected, confidence, domain };
}

function computeError(prediction: Prediction, stimulus: Situation["stimulus"], person: Situation["person"]): PredictionError {
  // How much does reality diverge from prediction?
  let magnitude = stimulus.novelty * 0.4 + stimulus.intensity * 0.3 + stimulus.personalRelevance * 0.3;

  // Neuroticism amplifies negative prediction errors
  const neuroticism = person.traits.neuroticism ?? 0.5;
  if (stimulus.intensity > 0.5) magnitude += neuroticism * 0.2;

  magnitude = Math.min(1, magnitude);

  // Valence: does the error feel good or bad?
  const valence: PredictionError["valence"] =
    stimulus.intensity > 0.6 && prediction.domain === "safety" ? "negative" :
    stimulus.type === "social" && person.needs.includes("belonging") ? "negative" :
    stimulus.novelty > 0.7 && person.traits.openness && person.traits.openness > 0.6 ? "positive" :
    magnitude > 0.5 ? "negative" : "neutral";

  // Emotion from error
  let emotion: string;
  let emotionIntensity = magnitude;

  if (valence === "negative" && magnitude > 0.7) {
    emotion = prediction.domain === "safety" ? "fear" : prediction.domain === "social" ? "shame" : "distress";
  } else if (valence === "negative" && magnitude > 0.4) {
    emotion = prediction.domain === "safety" ? "anxiety" : prediction.domain === "social" ? "discomfort" : "frustration";
  } else if (valence === "positive") {
    emotion = magnitude > 0.5 ? "excitement" : "curiosity";
  } else {
    emotion = "mild-surprise";
    emotionIntensity *= 0.5;
  }

  return { magnitude, valence, emotion, emotionIntensity, domain: prediction.domain };
}

function computePrecision(person: Situation["person"], error: PredictionError): Precision {
  // Precision-weighter: how much to trust predictions vs new data?
  let predictionWeight = 0.5;

  // Personality tilts the dial
  const neuroticism = person.traits.neuroticism ?? 0.5;
  const openness = person.traits.openness ?? 0.5;
  predictionWeight += neuroticism * 0.2;    // neurotic → trusts threat predictions more
  predictionWeight -= openness * 0.15;       // open → trusts new data more

  // High arousal → trust predictions (no time to update)
  predictionWeight += person.arousal * 0.2;

  // Strong existing beliefs → trust predictions
  if (person.beliefs.length > 2) predictionWeight += 0.1;

  // History of this being true → trust predictions
  if (person.history && person.history.length > 2) predictionWeight += 0.1;

  predictionWeight = Math.max(0.1, Math.min(0.95, predictionWeight));

  const strategy: Precision["strategy"] =
    predictionWeight > 0.65 ? "protect-prediction" :
    predictionWeight < 0.35 ? "update-model" : "mixed";

  return { predictionWeight, strategy };
}

function resolveError(
  error: PredictionError,
  precision: Precision,
  prediction: Prediction,
  situation: Situation,
): ErrorResolution {
  const { person, stimulus } = situation;

  if (precision.strategy === "protect-prediction") {
    // High precision on predictions → change reality / ignore data
    if (error.domain === "safety") {
      return {
        behavior: "avoids or escapes to restore predicted safety",
        expression: "tense, vigilant",
        verbalization: error.magnitude > 0.7 ? undefined : "I need to get out of here",
      };
    }
    if (error.domain === "social") {
      return {
        behavior: "conforms to restore predicted social harmony, monitors others for approval",
        expression: "alert to social cues, adjusts behavior to match group",
        verbalization: "I think you're right",
      };
    }
    if (stimulus.type === "choice") {
      return {
        behavior: "chooses the most predictable option, avoids uncertainty",
        decision: "selects familiar/safe choice over potentially better unknown",
        expression: "cautious",
        verbalization: "I'll go with what I know",
      };
    }
    if (stimulus.type === "information") {
      return {
        behavior: "discounts disconfirming information, seeks confirmatory evidence",
        beliefChange: "existing beliefs reinforced",
        expression: "dismissive of contradictory data",
        verbalization: "That doesn't sound right to me",
      };
    }
    return {
      behavior: "acts to restore predicted state — resists change",
      expression: "defensive",
    };
  }

  if (precision.strategy === "update-model") {
    // Low precision on predictions → learn from new data
    return {
      behavior: "absorbs new information, adjusts expectations",
      beliefChange: "updates world-model toward new evidence",
      expression: "thoughtful, open",
      verbalization: "Hm, I didn't expect that. Let me reconsider.",
    };
  }

  // Mixed strategy: partial update, partial action
  return {
    behavior: "partially updates beliefs while cautiously acting to test new information",
    decision: stimulus.type === "choice" ? "delays decision to gather more data" : undefined,
    beliefChange: "slightly adjusts expectations",
    expression: "uncertain but engaged",
    verbalization: "I'm not sure about this yet",
  };
}

function getDeepExplanation(error: PredictionError, precision: Precision, person: Situation["person"]): string {
  if (precision.strategy === "protect-prediction" && error.domain === "social") {
    return "Social predictions are high-stakes because group rejection was historically lethal. The brain prioritizes protecting social predictions over learning from social errors.";
  }
  if (precision.strategy === "protect-prediction" && error.domain === "safety") {
    return "Threat predictions have asymmetric cost: a false negative (missing real danger) is fatal, while a false positive (seeing danger that isn't there) is merely stressful. So the system is biased to trust threat predictions.";
  }
  if (error.magnitude > 0.7) {
    return "Large prediction errors feel overwhelming because updating a deep world-model is computationally expensive. The emotional intensity IS the cost signal — it says 'this is a big deal, pay attention.'";
  }
  return "The balance between trusting predictions and trusting new data is tuned by personality, arousal, and context.";
}

// ─── Explain ─────────────────────────────────────────────────────────

function explain(situation: Situation): Response & { reasoning: string } {
  const response = predict(situation);
  const reasoning = `
Model "The Prediction Engine" explains this as follows:

The brain predicted: ${response.process.chain[1]?.output ?? "something"}
Reality presented: ${situation.stimulus.description}
Error signal: ${response.effect.emotionChange} (magnitude determined emotion type and intensity)
Precision weighting: ${response.process.chain[3]?.transformation ?? "balanced"}
Resolution: ${response.rootCause.explanation}
`.trim();

  return { ...response, reasoning };
}

// ─── Export ──────────────────────────────────────────────────────────

const model: HumanModel = {
  id: "prediction-engine",
  version: 2,
  name: "The Prediction Engine",
  description:
    "The brain is a prediction machine. All behavior arises from one principle: minimize prediction error. Six primitives (world-model, prediction-generator, error-signal, model-updater, reality-changer, precision-weighter) explain cognition, emotion, and action as aspects of the same prediction-error-minimization loop.",
  primitives,
  predict,
  explain,
};

export default model;
export { model };

// Run evaluation when executed as subprocess
import { evaluate } from "../src/evaluate.ts";
if (import.meta.main) await evaluate(model);
