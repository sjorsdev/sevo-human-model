# sevo-human-model

Find the most compact, coherent model of human thinking, psychology, and behavior.

## What This Is

A human model is a function: put in a **situation** (context, person, stimulus), get out an **explanation** (root cause, cognitive process, emotional effect, behavioral result).

The best model explains the most phenomena with the fewest primitives. Compactness is a virtue — it means the primitives are tracking real cognitive structures, not memorizing individual cases.

**The model itself is the pearl.** It should be readable, coherent, and obviously correct to a human reader.

## How It Works

1. **Models** live in `blueprints/` — each defines a set of primitives (fundamental psychological mechanisms) and uses them to explain human behavior
2. **Benchmarks** live in `benchmarks/` — known psychological phenomena across 8 domains (cognitive biases, emotions, social behavior, decision-making, development, personality, psychopathology, motivation)
3. **Scoring** uses LLM-as-judge — Claude evaluates whether the model's explanations are accurate, coherent, and obviously correct
4. **Evolution** (via SEVO) mutates models to improve the score while minimizing primitive count

## Score Formula

```
ModelScore = (coverage × accuracy × coherence) / sqrt(primitiveCount)
```

- **Accuracy** — Is the explanation psychologically correct?
- **Coverage** — How many phenomena can it explain?
- **Coherence** — Do primitives form a connected, logical system?
- **Compactness** — Fewer primitives = higher score (tiebreaker)

## Competing Models

Three fundamentally different theories of human nature compete in an arena:

| Model | Primitives | Core Thesis |
|-------|-----------|-------------|
| v1 — The Drive Machine | 7 | Three competing drives (safety, belonging, competence) generate emotions that bias action selection |
| v2 — The Prediction Engine | 6 | The brain minimizes prediction error. All emotion is the gap between expected and actual. |
| v3 — The Social Self | 5 | The self is a social construction. All behavior serves face-management of the social identity. |

## The Arena

Models don't just get scored — they fight head-to-head on specific benchmarks. An LLM judge picks the better explanation. ELO ratings track who's winning.

- **Matchups**: Two models explain the same phenomenon, judge picks the winner
- **Bounties**: Benchmarks ALL models fail become worth 2x — driving innovation
- **Crossover**: Best primitives from two models get grafted together
- **Pruning**: Models that fall too far behind get archived
- **Challengers**: New paradigms periodically enter the arena

```bash
# Run the arena (3 rounds of competition)
deno run --allow-all src/arena.ts 3

# Score a single model against all benchmarks
deno run --allow-all src/scorer.ts blueprints/model-v1.ts
```

## Project Structure

```
blueprints/     # Competing model implementations (the pearl)
benchmarks/     # Test scenarios across 8 domains of psychology
src/
  arena.ts      # Competitive evolution engine
  scorer.ts     # LLM-as-judge scoring
  evolve.ts     # Mutation and paradigm generation
  types.ts      # All type definitions
graph/          # Evolution history (SEVO-compatible)
```
