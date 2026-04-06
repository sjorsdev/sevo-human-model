import { HumanBenchmark, ExpectedResponse } from "../src/human-types.ts";

interface Response {
  rootCause: string;
  process: string;
  emotion: string;
  behavior: string;
  confidence: number;
}

interface PredictRequest {
  context: { environment: string; socialSetting: string; timeConstraint?: string };
  person: {
    traits: Record<string, number>;
    needs: string[];
    beliefs: string[];
    emotionalState: string;
    arousal: number;
    history?: string[];
  };
  stimulus: { type: string; description: string; intensity: number; novelty: number; personalRelevance: number };
}

type AutonomicState = "ventral-vagal" | "sympathetic" | "dorsal-vagal";

function assessAutonomicState(situation: PredictRequest): AutonomicState {
  const { stimulus, person, context } = situation;
  const threatScore = (stimulus.intensity + stimulus.novelty + stimulus.personalRelevance) / 3;
  const hasTrauma = person.history?.some(h => h.includes("threat") || h.includes("harm")) || false;
  const isSocialContext = context.socialSetting?.toLowerCase().includes("social");
  
  // Dorsal vagal (shutdown): extreme threat or chronic stress
  if (threatScore > 0.8 || (person.arousal > 0.8 && hasTrauma) || person.arousal < 0.1) {
    return "dorsal-vagal";
  }
  // Sympathetic (fight/flight): moderate threat + arousal
  if (threatScore > 0.5 || person.arousal > 0.6) {
    return "sympathetic";
  }
  // Ventral vagal (safe/social): low threat, social context, calm
  return "ventral-vagal";
}

function predictFromAutonomicState(state: AutonomicState, situation: PredictRequest): Response {
  const { person, stimulus, context } = situation;
  const domain = stimulus.type;
  const extrovert = (person.traits["extraversion"] || 0.5) > 0.5;
  const openness = (person.traits["openness"] || 0.5) > 0.5;
  const agreeableness = (person.traits["agreeableness"] || 0.5) > 0.5;
  const neuroticism = (person.traits["neuroticism"] || 0.5) > 0.5;
  const conscientiousness = (person.traits["conscientiousness"] || 0.5) > 0.5;

  if (state === "ventral-vagal") {
    // Safe, socially engaged, reflective
    let emotion = person.arousal > 0.4 ? "engaged" : "content";
    let behavior = "";
    let rootCause = "autonomic safety permits social engagement";
    let process = "";
    let confidence = 0.75;

    if (domain === "social") {
      behavior = extrovert ? "initiates, shares authentically, seeks connection" : "listens actively, finds one-on-one meaningful";
      process = "mirror neurons active, mentalizing enabled";
      if (agreeableness > 0.6) behavior += "; prioritizes others' comfort";
    } else if (domain === "emotion") {
      behavior = "names feelings precisely, seeks perspective, adaptive coping";
      process = "emotional granularity, prefrontal-limbic integration";
      emotion = person.emotionalState?.toLowerCase().includes("stress") ? "resilient" : "balanced";
    } else if (domain === "decision") {
      behavior = "integrates values, considers consequences, reflects";
      process = "deliberative reasoning, dorsolateral prefrontal cortex engagement";
      if (conscientiousness > 0.6) behavior += "; systematic evaluation";
    } else if (domain === "cognitive-bias") {
      behavior = openness > 0.6 ? "questions assumptions, seeks evidence" : "applies learned heuristics appropriately";
      process = "metacognitive awareness, bias-checking available";
      confidence = 0.7;
    } else if (domain === "motivation") {
      behavior = openness > 0.6 ? "pursues growth, explores novelty" : "refines current competencies";
      process = "intrinsic motivation, approach system dominant";
      rootCause = "autonomic safety enables exploratory drive";
    } else if (domain === "personality") {
      behavior = "traits stabilize around consistent values and relationships";
      process = "identity coherence, trait expression";
    } else if (domain === "development") {
      behavior = "integrates new capacities, learns from experience";
      process = "neuroplasticity available, secure base enables growth";
    } else if (domain === "psychopathology") {
      behavior = neuroticism > 0.6 ? "manages vulnerabilities with insight" : "maintains equilibrium";
      process = "protective factors active; stress-buffering relationships";
      confidence = 0.68;
    }

    return { rootCause, process, emotion, behavior, confidence };
  }

  if (state === "sympathetic") {
    // Threat detected: aroused, mobilized, protective
    let emotion = person.needs?.includes("safety") ? "afraid" : "angry";
    let behavior = "";
    let rootCause = "threat perception; sympathetic activation (fight/flight)";
    let process = "";
    let confidence = 0.74;

    if (domain === "social") {
      behavior = extrovert ? "asserts, mobilizes allies, confronts" : "withdraws, guards boundaries";
      process = "defensive strategies, reduced empathy";
      if (agreeableness < 0.4) behavior += "; may blame or criticize";
    } else if (domain === "emotion") {
      emotion = "activated";
      behavior = "reacts intensely, seeks to remove threat, action-oriented";
      process = "amygdala dominance, emotion regulation offline";
      rootCause = "threat activates limbic system";
    } else if (domain === "decision") {
      behavior = "decides quickly, favors known solutions, risk-averse";
      process = "heuristic-driven, action bias, reduced deliberation";
      if (conscientiousness < 0.4) behavior += "; impulsive";
    } else if (domain === "cognitive-bias") {
      behavior = "confirmation bias amplified, threat-expectancy strengthened";
      process = "negativity bias, catastrophizing, tunnel vision";
      confidence = 0.77;
    } else if (domain === "psychopathology") {
      behavior = "anxiety escalates, hypervigilance, panic possible";
      process = "threat-scanning loop, amygdala sensitivity";
      emotion = "anxious";
    } else if (domain === "motivation") {
      behavior = "avoidance-driven, defensive efforts";
      process = "approach system inhibited, threat overrides goals";
    } else if (domain === "personality") {
      behavior = "displays defensive traits (withdrawn, rigid, critical)";
      process = "state-dependent trait expression";
    } else if (domain === "development") {
      behavior = "regresses to earlier coping, may harm relationships";
      process = "stress-reversion, executive function limited";
    }

    return { rootCause, process, emotion, behavior, confidence };
  }

  if (state === "dorsal-vagal") {
    // Overwhelming threat: shutdown, dissociation, collapse
    let emotion = "numb";
    let behavior = "";
    let rootCause = "severe threat overwhelms coping; dorsal vagal shutdown";
    let process = "";
    let confidence = 0.76;

    if (domain === "social") {
      behavior = "silent, disconnected, withdrawn; may freeze mid-interaction";
      process = "social disengagement system active, immobilization";
    } else if (domain === "emotion") {
      emotion = "despair";
      behavior = "numbs, collapses, ceases effort";
      process = "dissociation, emotional shutdown, learned helplessness";
      confidence = 0.79;
    } else if (domain === "decision") {
      behavior = "paralyzed, cannot decide, waits passively";
      process = "executive function offline, prefrontal shutdown";
    } else if (domain === "cognitive-bias") {
      behavior = "assumes helplessness, ignores positive evidence";
      process = "depressive realism, hopelessness bias";
      confidence = 0.75;
    } else if (domain === "psychopathology") {
      emotion = "despair";
      behavior = "depressive symptoms, withdrawal, suicidal ideation possible";
      process = "chronic dorsal vagal dominance, defeat response";
      confidence = 0.77;
    } else if (domain === "personality") {
      behavior = "traits appear suppressed; shows limited emotional range";
      process = "protective dissociation";
    } else if (domain === "development") {
      behavior = "reverts to infantile responses, cannot learn";
      process = "nervous system collapse, no growth possible";
    } else if (domain === "motivation") {
      behavior = "all motivation ceases; appears unmotivated";
      process = "approach/avoidance systems offline";
    }

    return { rootCause, process, emotion, behavior, confidence };
  }

  return { rootCause: "unknown", process: "", emotion: "neutral", behavior: "no response", confidence: 0.2 };
}

function scoreBenchmark(response: Response, expected: ExpectedResponse): number {
  const combined = `${response.emotion} ${response.behavior} ${response.rootCause}`.toLowerCase();
  let score = 0, max = 0;

  if (expected.emotionChange) {
    max++;
    if (combined.includes(expected.emotionChange.toLowerCase().slice(0, 4))) score++;
  }
  if (expected.behavior) {
    max++;
    const words = expected.behavior.toLowerCase().split(/\W+/).filter(w => w.length > 3);
    if (words.some(w => combined.includes(w))) score++;
  }
  if (expected.mustInclude?.length) {
    max++;
    if (expected.mustInclude.some(t => combined.includes(t.toLowerCase()))) score++;
  }
  if (expected.mustNotInclude?.some(t => combined.includes(t.toLowerCase()))) score--;

  return max === 0 ? 0.5 : Math.max(0, score) / max;
}

export function predict(situation: PredictRequest): Response {
  const state = assessAutonomicState(situation);
  return predictFromAutonomicState(state, situation);
}

export async function evaluate() {
  try {
    const benchmarkDir = "./benchmarks";
    const predictions: Array<{ benchmark: HumanBenchmark; response: Response; score: number }> = [];
    let totalScore = 0;

    for await (const file of Deno.readDir(benchmarkDir)) {
      if (file.name.endsWith(".json")) {
        const benchmark = JSON.parse(
          await Deno.readTextFile(`${benchmarkDir}/${file.name}`)
        ) as HumanBenchmark;
        const response = predict(benchmark.situation);
        const score = scoreBenchmark(response, benchmark.expected);
        predictions.push({ benchmark, response, score });
        totalScore += score;
      }
    }

    const fitness = predictions.length > 0 ? totalScore / predictions.length : 0;
    console.log(
      JSON.stringify({
        fitness,
        predictions: predictions.map(p => ({ id: p.benchmark.id, score: p.score, response: p.response })),
      })
    );
  } catch (e) {
    console.error("Evaluation failed:", e.message);
    console.log(JSON.stringify({ fitness: 0, predictions: [], error: e.message }));
  }
}

if (import.meta.main) {
  await evaluate();
}