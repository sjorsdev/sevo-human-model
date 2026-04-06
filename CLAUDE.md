# SEVO Human Model — Seed Document

## Purpose

Find the most compact, accurate computational model of human thinking, psychology, and behavior.

A "Human Model" is a function: given a **situation** (context, stimulus, person) it produces a **response** (root cause, process, emotion, behavior). The best model explains the widest range of human phenomena with the simplest internal structure.

The value is **compression** — like F=ma for the mind. The LLM already knows human psychology. This project distills that knowledge into the most compact, coherent, presentable theory.

## The Model

The model lives in **`src/model.ts`**. It exports:
- `predict(situation) → response`
- `evaluate() → { fitness, results }`

The model starts near-empty. The orchestrator evolves it. **No prescribed structure** — the model can use any internal representation: graphs, rules, state machines, hierarchies, neural-style weights, lookup tables, or something novel. The best structure will emerge through evolution.

## What Makes a Model Better

Models compete on four dimensions:

1. **Accuracy** — Does the model's output match known psychological phenomena? Does it feel obviously correct?
2. **Coverage** — How many distinct phenomena can it explain? (cognitive biases, emotions, social behavior, decision-making, development, personality, psychopathology, motivation)
3. **Coherence** — Does the internal structure form a unified theory? Not a bag of special cases.
4. **Compactness** — Fewer mechanisms = better. Compactness is tiebreaker only when accuracy is high.

Score: `ModelScore = (coverage × accuracy × coherence) / sqrt(primitiveCount)`

## Benchmarks

Benchmarks in `benchmarks/` are ground truth — known psychological phenomena:
```
{
  id, domain, name, description,
  situation: { context, person, stimulus },
  expected: { behavior, emotion, rootCauseType, ... },
  sources: academic references
}
```

8 domains: cognitive-bias, emotion, social, decision, development, personality, psychopathology, motivation.

## How Evolution Works — Two Levels

### Level 1: Model Competition (fork-runner)
Multiple competing models live in `blueprints/model-v*.ts`. The **fork-runner** scores all models, mutates the best, generates new paradigms, archives the worst.

```bash
deno run --allow-all src/fork-runner.ts
```

- Each blueprint is a self-contained model: `predict(situation) → response`
- Blueprints are scored by running `deno run --allow-read blueprints/model-vN.ts`
- Best model gets mutated → child competes with parent
- Every 3 cycles: a completely new paradigm is generated from scratch
- Population grows/shrinks between 3 and 10 competing models

### Level 2: Engine Evolution (orchestrator)
The **sevo orchestrator** evolves the engine itself — scoring logic, types, evaluation, infrastructure.

```bash
deno run --allow-all ../sevo/src/orchestrator.ts .
```

- **REFLECT**: Analyze fitness history, detect plateaus
- **THINK**: Creative reasoning about what's missing
- **IMPLEMENT**: Modify any `src/` file on a branch
- **TEST**: Verify changes work
- **REALIGN**: Check goal alignment

Both levels run independently. The orchestrator improves HOW models are evaluated. The fork-runner improves WHICH model wins.

## Evaluation

Running any blueprint directly:
1. Loads all benchmarks from `benchmarks/`
2. Calls `predict(situation)` for each
3. Outputs `{ fitness, predictions }` as JSON on stdout

The fork-runner or orchestrator then uses LLM-as-judge to score accuracy.

## Constraints

1. **History is immutable** — No force push, rebase, or amend.
2. **Models must be deterministic** — Same input → same output. No randomness.
3. **Benchmarks are ground truth** — Models adapt to benchmarks, never the reverse.
4. **The model is the pearl** — It must be readable and presentable to humans.

## Technology

- **Runtime:** Deno + TypeScript
- **Persistence:** JSON-LD graph in `graph/` (append-only)
- **Evolution:** sevo orchestrator (`deno run --allow-all /path/to/sevo/src/orchestrator.ts .`)
- **LLM:** Claude CLI for mutations, judging, reasoning

## Commands

```bash
# Run model evaluation
deno run --allow-read src/model.ts

# Run orchestrator (evolves the model)
deno run --allow-all ../sevo/src/orchestrator.ts .
```
