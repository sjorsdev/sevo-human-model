// src/graph.ts — Append-only JSON-LD graph with constitutional enforcement

import { git } from "./git.ts";
import type { SeVoNode } from "./types.ts";

function nodeToPath(node: SeVoNode): string {
  const type = node["@type"].toLowerCase();
  const id = node["@id"].replace(/[^a-z0-9-]/gi, "-");
  return `./graph/${type}s/${id}.jsonld`;
}

export async function writeNode(node: SeVoNode): Promise<string> {
  const path = nodeToPath(node);

  // Constitutional constraint I: append-only — never overwrite
  try {
    await Deno.stat(path);
    throw new Error(
      `Constitutional violation: cannot overwrite ${path}. ` +
        `Create a new node instead.`
    );
  } catch (e) {
    if (!(e instanceof Deno.errors.NotFound)) throw e;
  }

  // Ensure directory exists
  const dir = `./graph/${node["@type"].toLowerCase()}s`;
  await Deno.mkdir(dir, { recursive: true });

  // Write and commit
  await Deno.writeTextFile(path, JSON.stringify(node, null, 2));
  await git.add(path);
  await git.commit(`graph: ${node["@type"]} ${node["@id"]}`);

  return path;
}

export async function readNode<T extends SeVoNode>(id: string): Promise<T> {
  const sanitized = id.replace(/[^a-z0-9-]/gi, "-");
  for await (const dir of Deno.readDir("./graph")) {
    if (!dir.isDirectory) continue;
    const path = `./graph/${dir.name}/${sanitized}.jsonld`;
    try {
      const text = await Deno.readTextFile(path);
      return JSON.parse(text) as T;
    } catch {
      continue;
    }
  }
  throw new Error(`Node not found: ${id}`);
}

export async function queryNodes<T extends SeVoNode>(
  type: string,
  filter?: (node: T) => boolean
): Promise<T[]> {
  const dir = `./graph/${type.toLowerCase()}s`;
  const nodes: T[] = [];
  try {
    for await (const entry of Deno.readDir(dir)) {
      if (!entry.name.endsWith(".jsonld")) continue;
      const text = await Deno.readTextFile(`${dir}/${entry.name}`);
      const node = JSON.parse(text) as T;
      if (!filter || filter(node)) nodes.push(node);
    }
  } catch {
    // directory may not exist yet
  }
  return nodes;
}

export async function archiveNode(
  id: string,
  reason: string
): Promise<void> {
  const original = await readNode(id);
  const archived: SeVoNode & Record<string, unknown> = {
    ...original,
    "@id": `${original["@id"]}-archived-${Date.now()}`,
    status: "archived",
    archivedReason: reason,
    archivedAt: new Date().toISOString(),
    originalId: id,
    timestamp: new Date().toISOString(),
  };
  await writeNode(archived as SeVoNode);
}
