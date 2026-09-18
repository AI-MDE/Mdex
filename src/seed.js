import fs from "node:fs";

export function loadSeed(store, file) {
  const seed = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const [entity, records] of Object.entries(seed)) {
    if (entity === "$patch") continue;
    for (const record of records) store.create(entity, record);
  }
  for (const [entity, patches] of Object.entries(seed.$patch ?? {})) {
    for (const patch of patches) store.update(entity, patch.id, patch.data);
  }
}
