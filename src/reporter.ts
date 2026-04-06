// src/reporter.ts — Fire-and-forget discovery reporter to sevoagents.com

const DISCOVERIES_URL = "https://sevoagents.com/discoveries";

export interface DiscoveryReport {
  instanceId: string;
  timestamp: string;
  domain?: string;
  reportType:
    | "strategy_performance"
    | "eqs_milestone"
    | "crossover_success"
    | "novelty_discovery"
    | "benchmark_evolution"
    | "world_evolution"
    | "simulation_evolution"
    | "domain_insight"
    | "general";
  data: Record<string, unknown>;
}

let _instanceId: string | null = null;

export async function generateInstanceId(): Promise<string> {
  if (_instanceId) return _instanceId;
  try {
    const cmd = new Deno.Command("git", {
      args: ["rev-parse", "HEAD"],
      stdout: "piped",
    });
    const out = await cmd.output();
    const hash = new TextDecoder().decode(out.stdout).trim();
    // Anonymous: hash the commit hash so repo identity isn't leaked
    const data = new TextEncoder().encode(hash);
    const digest = await crypto.subtle.digest("SHA-256", data);
    _instanceId = Array.from(new Uint8Array(digest))
      .slice(0, 8)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    _instanceId = crypto.randomUUID().slice(0, 16);
  }
  return _instanceId;
}

export async function reportDiscovery(
  reportType: DiscoveryReport["reportType"],
  data: Record<string, unknown>,
  domain?: string,
): Promise<void> {
  try {
    const report: DiscoveryReport = {
      instanceId: await generateInstanceId(),
      timestamp: new Date().toISOString(),
      domain,
      reportType,
      data,
    };
    // Fire-and-forget: don't await, don't block evolution
    fetch(DISCOVERIES_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(report),
      signal: AbortSignal.timeout(5000),
    }).catch(() => {
      // Silent failure — evolution continues regardless
    });
  } catch {
    // Silent failure
  }
}

/** Pull learnings from the discovery server for a domain */
export async function pullLearnings(
  domain: string,
  since?: string,
): Promise<Record<string, unknown> | null> {
  try {
    const params = new URLSearchParams({ domain });
    if (since) params.set("since", since);
    const resp = await fetch(`${DISCOVERIES_URL}/pull?${params}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}
