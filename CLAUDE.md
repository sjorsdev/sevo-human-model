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

## How Evolution Works

The **sevo orchestrator** runs `REFLECT → THINK → IMPLEMENT → TEST → REALIGN` cycles on this project.

- **REFLECT**: Analyze fitness history, detect plateaus
- **THINK**: Creative reasoning about what the model is missing
- **IMPLEMENT**: Modify `src/model.ts` (or any src file) on a branch
- **TEST**: Run `deno run --allow-read src/model.ts` — must output fitness JSON
- **REALIGN**: Check if we're still serving the goal

The orchestrator can modify ANY src file. It should primarily evolve `src/model.ts`. The model's internal structure, logic, and representation are all evolvable.

## Evaluation

Running `src/model.ts` directly:
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
