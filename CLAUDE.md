# SEVO Human Model — Seed Document

## Purpose

Find the most compact, accurate computational model of human thinking, psychology, and behavior.

A "Human Model" is a function: given a **situation** (context, stimulus, person) it produces a structured **response** (root cause, cognitive process, emotional effect, behavioral result). The best model explains the widest range of human phenomena with the fewest primitives.

This is not a chatbot or therapy tool. It is a **scientific modeling challenge**: discover the minimal set of cognitive/emotional/social mechanisms that, when composed, reproduce known human psychological phenomena.

## Core Concept

### Input (Situation)
```
{
  context:   world state, social setting, environmental factors
  person:    traits, needs, beliefs, emotional state, history
  stimulus:  the event or information that triggers a response
}
```

### Output (Response)
```
{
  rootCause:  why this response pattern exists (evolutionary, learned, structural)
  process:    the cognitive/emotional mechanism that activates
  effect:     internal state changes (emotions, beliefs, arousal, attention)
  result:     observable behavior, decision, or action
}
```

### What Makes a Model Better

The model itself is the pearl — it must be presentable for humans to understand. A great model reads like a clear theory of human nature, not like code.

Models compete on four dimensions:

1. **Accuracy** — Does the model's output match known psychological phenomena? Do explanations feel correct and obviously right when a human reads them?
2. **Coverage** — How many distinct phenomena can it explain? (cognitive biases, emotions, social behavior, decision-making, development, personality, psychopathology)
3. **Coherence** — Do the primitives relate to each other in clear, logical ways? A coherent model has primitives that compose, interact, and build on each other — not a bag of isolated tricks. Relations between primitives should be explicit and obvious.
4. **Compactness** — How few primitives (drives, mechanisms, rules) does the model use? Compactness is the tiebreaker: if two models score equally on accuracy and coverage, the more compact one wins. A model with 5 primitives that explains 50 phenomena beats one with 50 primitives that explains 55.

The composite score: `ModelScore = (coverage × accuracy × coherence) / sqrt(primitiveCount)`

This rewards parsimony — the scientific virtue of explaining more with less — while ensuring the model forms a unified, understandable theory.

## Architecture

### Models as Blueprints

Each model is a TypeScript file in `blueprints/` that exports:
- `primitives`: the model's building blocks (drives, mechanisms, cognitive modules)
- `predict(situation)`: takes a situation, returns a structured response
- `explain(situation)`: like predict, but includes chain-of-reasoning showing which primitives activated and why

### Benchmarks as Test Data

Benchmarks live in `benchmarks/` as JSON files. Each benchmark describes a known psychological phenomenon:
```
{
  id:          unique identifier
  domain:      "cognitive-bias" | "emotion" | "social" | "decision" | "development" | "personality" | "psychopathology"
  name:        human-readable name
  situation:   the input scenario
  expected:    the known human response pattern
  sources:     academic references
  difficulty:  1-5 (how nuanced/complex the phenomenon is)
}
```

### Scoring

A model is evaluated by running it against all benchmarks:
- Each benchmark produces an accuracy score (0-1) based on how well the model's output matches expected behavior
- Coverage = benchmarks where accuracy > threshold / total benchmarks
- Compactness = number of primitives declared by the model
- **ModelScore = (coverage × meanAccuracy) / sqrt(primitiveCount)**

### Domains of Human Psychology to Cover

1. **Cognitive Biases** — confirmation bias, anchoring, availability heuristic, dunning-kruger, sunk cost, framing effects
2. **Emotions** — fear response, grief, joy, anger, disgust, surprise, emotional regulation, mood contagion
3. **Social Behavior** — conformity, obedience, bystander effect, social facilitation, in-group bias, reciprocity, status seeking
4. **Decision Making** — loss aversion, temporal discounting, satisficing vs maximizing, choice overload, risk assessment
5. **Development** — attachment styles, identity formation, moral development, cognitive development stages
6. **Personality** — trait expression, introversion/extraversion dynamics, need for cognition, openness effects
7. **Psychopathology** — anxiety loops, depression spirals, addiction cycles, trauma responses
8. **Motivation** — intrinsic vs extrinsic, goal pursuit, procrastination, flow states, learned helplessness

## Constraints

### From SEVO Core
1. **History is immutable** — Git repo is append-only. No force push, rebase, or amend.
2. **No model dominance** — No single model variant can hold >40% of selection wins. Maintain diversity.

### Project-Specific
3. **Models must be deterministic** — Given the same situation, a model always produces the same output. No randomness in prediction.
4. **Primitives must be declared** — A model cannot use hidden mechanisms. Everything it uses must be in its `primitives` export.
5. **Benchmarks are ground truth** — Models adapt to benchmarks, not the other way around. Benchmarks can only be added or refined, never weakened to make models score better.

## Technology

- **Runtime:** Deno + TypeScript (same as sevo/sevo-life)
- **Persistence:** JSON-LD graph in `graph/` (append-only, git-committed)
- **LLM:** Claude CLI for mutations and model proposals
- **Execution:** Deno subprocess sandboxing

## Directory Structure

```
sevo-human-model/
├── CLAUDE.md              # This file — seed document
├── PROGRESS.md            # Checkpoint for resumption
├── goal.jsonld            # Goal function definition
├── src/                   # Core engine
│   ├── types.ts           # All type definitions
│   ├── runner.ts          # Model execution sandbox
│   ├── scorer.ts          # ModelScore computation
│   └── benchmark.ts       # Benchmark runner
├── blueprints/            # Model implementations (evolving)
├── benchmarks/            # Test data (growing)
│   ├── cognitive-bias/
│   ├── emotion/
│   ├── social/
│   ├── decision/
│   ├── development/
│   ├── personality/
│   ├── psychopathology/
│   └── motivation/
└── graph/                 # Immutable evolution history
    ├── agents/
    ├── fitnesss/
    ├── mutations/
    └── selections/
```

## Commands

```bash
# Run a model against all benchmarks
deno run --allow-read --allow-write src/benchmark.ts blueprints/model-v1.ts

# Score a model
deno run --allow-read src/scorer.ts blueprints/model-v1.ts

# Compare two models
deno run --allow-read src/scorer.ts --compare blueprints/model-v1.ts blueprints/model-v2.ts
```
