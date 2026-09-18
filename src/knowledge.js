import fs from "node:fs";
import path from "node:path";

export function loadEntities(directory) {
  const entities = new Map();
  for (const file of fs.readdirSync(directory).filter(f => f.endsWith(".json"))) {
    const artifact = JSON.parse(fs.readFileSync(path.join(directory, file), "utf8"));
    if (artifact.type !== "entity" || !artifact.name || !artifact.attributes) throw new Error(`Invalid entity artifact: ${file}`);
    entities.set(artifact.name, artifact);
  }
  return entities;
}

export function loadUseCases(directory) {
  const useCases = new Map();
  if (!fs.existsSync(directory)) return useCases;
  for (const file of fs.readdirSync(directory).filter(f => f.endsWith(".json"))) {
    const artifact = JSON.parse(fs.readFileSync(path.join(directory, file), "utf8"));
    if (artifact.type !== "use-case" || !artifact.name || !artifact.steps) throw new Error(`Invalid use-case artifact: ${file}`);
    useCases.set(artifact.name, artifact);
  }
  return useCases;
}
