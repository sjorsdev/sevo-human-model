import { HumanBenchmark, ExpectedResponse } from "../src/human-types.ts";

interface Response {
  rootCause: string;
  process: string;
  emotion: string;
  behavior: string;
  confidence: number;
}

interface Situation {
  context: { environment: string; socialSetting: string; timeConstraint?: string };
  person: {
    traits: Record<string, number>;
    needs: string[];
    beliefs: string[];
    emotionalState: string;
    arousal: number;
    history?: string[];
  };
  stimulus: {
    type: string;
    description: string;
    intensity: number;
    novelty: number;
    personalRelevance: number;
  };
}

function buildNarrative(person: Situation["person"]): {
  themes: string[];
  core: string;
  vulnerabilities: string[];
} {
  const themes: string[] = [];

  // Extract narrative themes from beliefs
  if (person.beliefs.some((b) => b.includes("competence") || b.includes("able")))
    themes.push("achievement");
  if (
    person.beliefs.some((b) => b.includes("autonomy") || b.includes("free"))
  )
    themes.push("autonomy");
  if (
    person.beliefs.some((b) => b.includes("belong") || b.includes("connect"))
  )
    themes.push("connection");
  if (person.beliefs.some((b) => b.includes("fair") || b.includes("just")))
    themes.push("fairness");

  // Trait-based themes
  if ((person.traits["extraversion"] ?? 0.5) > 0.5)
    themes.push("social-visibility");
  if ((person.traits["openness"] ?? 0.5) > 0.5)
    themes.push("exploration");
  if ((person.traits["conscientiousness"] ?? 0.5) > 0.5)
    themes.push("control");

  const core = person.needs[0] || "survival";
  const vulnerabilities: string[] = [];
  if ((person.traits["neuroticism"] ?? 0.5) > 0.6)
    vulnerabilities.push("self-doubt");
  if ((person.traits["agreeableness"] ?? 0.5) < 0.4)
    vulnerabilities.push("conflict-aversion");

  return { themes: themes.length > 0 ? themes : ["meaning"], core, vulnerabilities };
}

function narrativeCongruence(
  themes: string[],
  stimulus: Situation["stimulus"]
): { alignment: number; threat: boolean; growth: boolean } {
  const stimulusKeywords = stimulus.description.toLowerCase().split(/\W+/);
  const themesLower = themes.map((t) => t.toLowerCase());

  const matches = stimulusKeywords.filter((word) =>
    themesLower.some((theme) => theme.includes(word.slice(0, 4)))
  ).length;

  const alignment = Math.min(1, matches / Math.max(1, themesLower.length));

  // Threat: high intensity + low alignment + high personal relevance
  const threat =
    stimulus.intensity > 0.6 &&
    alignment < 0.4 &&
    stimulus.personalRelevance > 0.5;

  // Growth: novelty + some alignment + moderate arousal
  const growth =
    stimulus.novelty > 0.5 &&
    alignment > 0.2 &&
    stimulus.intensity < 0.8;

  return { alignment, threat, growth };
}

export function predict(situation: Situation): Response {
  const narrative = buildNarrative(situation.person);
  const { alignment, threat, growth } = narrativeCongruence(
    narrative.themes,
    situation.stimulus
  );

  // DEFENSIVE: Narrative integrity under attack
  if (threat) {
    const emotion =
      situation.person.arousal > 0.75 ?
        "panic"
      : situation.person.arousal > 0.6 ?
        "anger"
      : "anxiety";

    const behavior =
      situation.stimulus.type.includes("social") ?
        "blame-externalize"
      : situation.stimulus.type.includes("failure") ?
        "deny-make-excuses"
      : "avoid-confront";

    return {
      rootCause: `narrative-threat: ${situation.stimulus.type} contradicts ${narrative.themes[0]} identity`,
      process: "defensive-assimilation",
      emotion,
      behavior,
      confidence: 0.65,
    };
  }

  // GROWTH: Narrative expansion opportunity
  if (growth && alignment > 0.1) {
    const emotion =
      situation.person.arousal > 0.7 ?
        "energized"
      : situation.stimulus.novelty > 0.7 ?
        "curiosity"
      : "intrigue";

    const behavior =
      situation.stimulus.type.includes("challenge") ?
        "engage-learn-evolve"
      : situation.stimulus.type.includes("social") ?
        "approach-connect"
      : "experiment-integrate";

    return {
      rootCause: `narrative-expansion: ${narrative.themes.slice(0, 2).join("+")} identity growth potential`,
      process: "accommodative-learning",
      emotion,
      behavior,
      confidence: 0.78,
    };
  }

  // MAINTENANCE: Narrative coherence already intact
  const isAroused = situation.person.arousal > 0.6;
  const emotion =
    situation.person.emotionalState === "anxious" ?
      isAroused ?
        "hypervigilance"
      : "caution"
    : isAroused ?
      "activation"
    : "equilibrium";

  const behavior =
    situation.stimulus.type.includes("routine") ?
      "execute-habitually"
    : situation.stimulus.type.includes("social") ?
      "socialize-authentically"
    : situation.stimulus.type.includes("decision") ?
      "decide-aligned-with-values"
    : "respond-fluidly";

  return {
    rootCause: `narrative-maintenance: stimulus fits ${narrative.core}-oriented identity`,
    process: "equilibrium-response",
    emotion,
    behavior,
    confidence: 0.62 + alignment * 0.25,
  };
}

function scoreBenchmark(
  response: Response,
  expected: ExpectedResponse
): number {
  const combined = `${response.emotion} ${response.behavior} ${response.rootCause}`.toLowerCase();
  let score = 0,
    max = 0;

  if (expected.emotionChange) {
    max++;
    const expectedTokens = expected.emotionChange
      .toLowerCase()
      .split(/\W+/)
      .filter((t) => t.length > 2);
    if (expectedTokens.some((t) => combined.includes(t))) score++;
  }

  if (expected.behavior) {
    max++;
    const expectedTokens = expected.behavior
      .toLowerCase()
      .split(/\W+/)
      .filter((t) => t.length > 3);
    if (expectedTokens.some((t) => combined.includes(t))) score++;
  }

  if (expected.mustInclude?.length) {
    max++;
    if (
      expected.mustInclude.some((t) =>
        combined.includes(t.toLowerCase().slice(0, 5))
      )
    )
      score++;
  }

  if (
    expected.mustNotInclude?.some((t) =>
      combined.includes(t.toLowerCase().slice(0, 5))
    )
  )
    score--;

  return max === 0 ? 0.5 : Math.max(0, score) / max;
}

export async function evaluate(): Promise<{
  fitness: number;
  predictions: Array<{ id: string; score: number; response: Response }>;
}> {
  const benchmarkDir = "./benchmarks";
  const predictions: Array<{ id: string; score: number; response: Response }> =
    [];
  let totalScore = 0,
    count = 0;

  try {
    for await (const entry of Deno.readDir(benchmarkDir)) {
      if (entry.isFile && entry.name.endsWith(".json")) {
        const content = await Deno.readTextFile(
          `${benchmarkDir}/${entry.name}`
        );
        const benchmark: HumanBenchmark = JSON.parse(content);

        const response = predict(benchmark.situation);
        const score = scoreBenchmark(response, benchmark.expected);

        predictions.push({ id: benchmark.id, score, response });
        totalScore += score;
        count++;
      }
    }
  } catch (_e) {
    // Benchmarks may not exist in early iterations
  }

  const fitness = count > 0 ? totalScore / count : 0.1;
  console.log(JSON.stringify({ fitness, predictions }));

  return { fitness, predictions };
}

if (import.meta.main) {
  await evaluate();
}