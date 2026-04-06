# sevo-human-model

Find the `F = ma` of human psychology.

## What This Is

A human model is a function: **situation in → explanation out**. The model starts near-empty. The sevo orchestrator evolves it — structure, logic, everything.

No prescribed architecture. The best internal representation (graphs, rules, weights, hierarchies, or something novel) will emerge through evolution.

## Run

```bash
# Evaluate the current model
deno run --allow-read src/model.ts

# Evolve the model (runs continuously)
deno run --allow-all ../sevo/src/orchestrator.ts .
```

## Structure

```
src/model.ts        # THE model — evolved by orchestrator
src/human-types.ts  # Domain types (Situation, Response, Benchmark)
benchmarks/         # 18 test cases across 8 psychology domains
graph/              # Evolution history (SEVO-compatible)
```

## Benchmarks

18 known psychological phenomena: confirmation bias, anchoring, sunk cost, fear response, emotional contagion, grief, bystander effect, conformity, obedience, loss aversion, framing effect, choice overload, overjustification, learned helplessness, introversion, anxious attachment, anxiety loops, addiction relapse.
