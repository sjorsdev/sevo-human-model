// blueprints/run-config.ts — Runs a model config file through the interpreter
// Usage: deno run --allow-read blueprints/run-config.ts configs/seed-drive-machine.json

import { evaluateConfig } from "../src/model-runner.ts";
import type { ModelConfig } from "../src/model-runner.ts";

const configPath = Deno.args[0];
if (!configPath) {
  console.error("Usage: run-config.ts <config.json>");
  Deno.exit(1);
}

const config: ModelConfig = JSON.parse(await Deno.readTextFile(configPath));
await evaluateConfig(config);
