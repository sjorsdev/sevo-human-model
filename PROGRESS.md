# PROGRESS
## Cycle: 20
## Status: L1 evolving — Social Self dominates but LLM accuracy only 0.28
## Agents: 4 (3 seeds + 1 evolved best)
## Learnings: convergence problem — fitness rewards structure over accuracy
## Timestamp: 2026-04-06T23:30:00.000Z

## Architecture
- Models are JSON configs with numerical weights (not TypeScript)
- Shared interpreter (`model-runner.ts`) runs any config
- Mutations are weight patches — fast, reliable, hundreds per run
- LLM judge called periodically for accuracy/coherence scoring

## Current Best
- "The Social Self" (5 primitives) — structural fitness 0.298, LLM accuracy 0.28
- Dominates due to compactness (5p) and coherence but weak on non-social phenomena

## Known Issues
1. **Convergence to Social Self** — fewest primitives = best compactness score, even though accuracy is low
2. **Output diversity still low** — behavior strings too similar across benchmarks
3. **LLM accuracy only ~0.3** — models force their paradigm onto phenomena that don't fit
4. **Need fitness rebalancing** — accuracy should weight more than structural coherence

## Next Steps
- Rebalance fitness: accuracy×diversity should dominate over structural coherence
- Add diversity pressure in selection (novelty search)
- Generate more diverse seed models (not all social-dominated)
- Integrate with sevo orchestrator for project-level evolution
