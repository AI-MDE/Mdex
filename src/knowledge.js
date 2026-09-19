import fs from "node:fs";
import path from "node:path";

export function loadEntities(directory) {
  const entities = new Map();
  entities.sourceFiles = new Map();
  for (const file of fs.readdirSync(directory).filter(f => f.endsWith(".json"))) {
    const artifact = JSON.parse(fs.readFileSync(path.join(directory, file), "utf8"));
    if (artifact.type !== "entity" || !artifact.name || !artifact.attributes) throw new Error(`Invalid entity artifact: ${file}`);
    entities.set(artifact.name, artifact);
    entities.sourceFiles.set(artifact.name, path.join(directory, file));
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

export function loadArchitecture(file) {
  if (!fs.existsSync(file)) return { type: "architecture", name: "Architecture", principles: [], constraints: {} };
  const artifact = JSON.parse(fs.readFileSync(file, "utf8"));
  if (artifact.type !== "architecture") throw new Error("Invalid architecture artifact");
  return artifact;
}

export function validateArchitecture(architecture, entities, useCases) {
  const findings = [];
  const add=(status,subject,message)=>findings.push({status,subject,message});
  for (const [name,e] of entities) {
    if (architecture.constraints?.entitiesRequireKey) add(e.key && e.attributes?.[e.key] ? "Pass":"Fail",name,e.key && e.attributes?.[e.key] ? "Entity key is defined.":"Entity key is missing or not an attribute.");
    if (architecture.constraints?.referencesMustTargetEntity) {
      for (const [a,s] of Object.entries(e.attributes||{})) if(s.type==="reference") add(entities.has(s.entity)?"Pass":"Fail",name+"."+a,entities.has(s.entity)?"Reference target exists.":`Unknown reference target ${s.entity}.`);
      for (const [relationship,s] of Object.entries(e.children||{})) { const child=entities.get(s.entity),foreignKey=child?.attributes?.[s.foreignKey];add(!!child&&foreignKey?.type==="reference"&&foreignKey.entity===name?"Pass":"Fail",name+"."+relationship,child?`Child relationship uses ${s.entity}.${s.foreignKey}.`:`Unknown child entity ${s.entity}.`); }
    }
    if (architecture.constraints?.operationsMustDeclareAction) for (const [op,s] of Object.entries(e.operations||{})) add(s.action?"Pass":"Fail",name+"."+op,s.action?"Operation action is declared.":"Operation action is missing.");
    if (architecture.constraints?.rulesMustResolve) {
      for (const [operation,spec] of Object.entries(e.operations||{})) for (const rule of spec.rules||[]) add(!!e.rules?.[rule]?"Pass":"Fail",name+"."+operation,!!e.rules?.[rule]?`Rule ${rule} exists.`:`Unknown rule ${name}.${rule}.`);
      for (const [transition,spec] of Object.entries(e.transitions||{})) for (const rule of spec.rules||[]) add(!!e.rules?.[rule]?"Pass":"Fail",name+"."+transition,!!e.rules?.[rule]?`Rule ${rule} exists.`:`Unknown rule ${name}.${rule}.`);
    }
  }
  if (architecture.constraints?.useCaseInvokesDeclaredOperations) for (const [name,u] of useCases) for (const step of u.steps||[]) if(step.invoke){const ref=step.invoke.entity;const input=typeof ref==="string"&&ref.startsWith("$")?u.inputs?.[ref.slice(1)]:null;const entity=input?.entity||ref;add(entities.get(entity)?.operations?.[step.invoke.operation]?"Pass":"Fail",name,entities.get(entity)?.operations?.[step.invoke.operation]?`Operation ${entity}.${step.invoke.operation} exists.`:`Unknown operation ${entity}.${step.invoke.operation}.`);}
  return findings;
}
