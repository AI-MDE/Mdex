import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { validateArchitecture } from "./knowledge.js";

export class EntityDesignService {
  constructor({ entities, useCases, architecture }) {
    this.entities = entities;
    this.useCases = useCases;
    this.getArchitecture = architecture;
  }

  propose(name, changes) {
    const entity = this.entities.get(name);
    if (!entity) throw new EntityDesignError(`Entity “${name}” was not found.`, 404, [{ section: "entity", field: name, message: "The entity does not exist." }]);
    const proposed = { ...entity };
    const schema = this.#schema();
    proposed.architectureFeatures ??= Object.fromEntries(schema.features.map(feature => [feature, false]));
    for (const section of Object.keys(schema.sections)) if (changes[section] !== undefined) proposed[section] = changes[section];
    if (changes.architectureFeatures !== undefined) proposed.architectureFeatures = { ...changes.architectureFeatures };
    if (changes.stateAttribute !== undefined) proposed.stateAttribute = changes.stateAttribute || undefined;
    return { entity, proposed, requestedKey: changes.key, sourceFile: this.entities.sourceFiles?.get(name), schema };
  }

  check(name, proposal) {
    const { entity, proposed, sourceFile, schema } = proposal;
    const violations = [];
    if (!sourceFile) violations.push(this.#violation("entity", name, `The source file for “${name}” is unavailable.`));
    if (proposal.requestedKey !== undefined && proposal.requestedKey !== entity.key) violations.push(this.#violation("key", "key", "Changing the system key requires a data migration and is not supported here."));
    if (!proposed.attributes?.[entity.key]) violations.push(this.#violation("attributes", entity.key, `The system-key attribute “${entity.key}” must remain declared.`));
    if (proposed.stateAttribute && !proposed.attributes?.[proposed.stateAttribute]) violations.push(this.#violation("states", "stateAttribute", `State attribute “${proposed.stateAttribute}” is not declared on ${name}.`));
    for (const [section, expectedType] of Object.entries(schema.sections)) {
      const value = proposed[section];
      const invalid = expectedType === "array" ? !Array.isArray(value) : !value || Array.isArray(value) || typeof value !== "object";
      if (value !== undefined && invalid) violations.push(this.#violation(section, section, expectedType === "array" ? `${this.#label(section)} must be an ordered list.` : `${this.#label(section)} must be a named collection.`));
    }
    for (const [ruleName, rule] of Object.entries(proposed.rules ?? {})) {
      if (!rule || Array.isArray(rule) || typeof rule !== "object") { violations.push(this.#violation("rules", ruleName, `Rule “${ruleName}” must be a definition.`)); continue; }
      const kind = rule.kind ?? (rule.forbid ? "constraint" : "precondition");
      if (!["precondition", "constraint"].includes(kind)) violations.push(this.#violation("rules", `${ruleName}.kind`, `Rule “${ruleName}” has unknown kind “${kind}”.`));
      if (!rule.message?.trim()) violations.push(this.#violation("rules", `${ruleName}.message`, `Rule “${ruleName}” needs a business message.`));
      for (const section of ["when", "forbid"]) if (rule[section] !== undefined) {
        if (!rule[section] || Array.isArray(rule[section]) || typeof rule[section] !== "object") { violations.push(this.#violation("rules", `${ruleName}.${section}`, `${this.#label(section)} must be a named condition collection.`)); continue; }
        for (const field of Object.keys(rule[section])) if (!proposed.attributes?.[field]) violations.push(this.#violation("rules", `${ruleName}.${section}.${field}`, `Rule “${ruleName}” refers to unknown attribute “${field}”.`));
      }
      if (kind === "precondition" && rule.forbid) violations.push(this.#violation("rules", `${ruleName}.forbid`, `Precondition “${ruleName}” cannot declare a constraint.`));
      if (kind === "constraint" && !rule.forbid) violations.push(this.#violation("rules", `${ruleName}.forbid`, `Constraint “${ruleName}” must declare what is forbidden.`));
      for (const [field, condition] of Object.entries(rule.forbid ?? {})) if (condition !== "present") violations.push(this.#violation("rules", `${ruleName}.forbid.${field}`, `Unknown condition “${condition}”; currently supported: present.`));
    }
    for (const feature of schema.features) {
      const value = proposed.architectureFeatures?.[feature];
      if (typeof value !== "boolean") violations.push(this.#violation("architectureFeatures", feature, `${this.#label(feature)} must be enabled or disabled; received ${JSON.stringify(value)}.`));
    }
    if (!violations.length) {
      const proposedEntities = new Map(this.entities);
      proposedEntities.set(name, proposed);
      const findings = validateArchitecture(this.getArchitecture(), proposedEntities, this.useCases);
      for (const finding of findings.filter(value => value.status === "Fail")) {
        const [subjectEntity, field = finding.subject] = finding.subject.split(".");
        violations.push(this.#violation(subjectEntity === name ? this.#sectionFor(proposed, field) : "relationships", field, finding.message));
      }
      if (!violations.length) return { ...proposal, findings };
    }
    throw new EntityDesignError(`The ${name} design has ${violations.length} issue${violations.length === 1 ? "" : "s"}.`, 400, violations);
  }

  commit(name, checked) {
    const { proposed, sourceFile, findings } = checked;
    const temporaryFile = path.join(path.dirname(sourceFile), `.${path.basename(sourceFile)}.${randomUUID()}.tmp`);
    try {
      fs.writeFileSync(temporaryFile, JSON.stringify(proposed, null, 2));
      fs.renameSync(temporaryFile, sourceFile);
    } catch (error) {
      if (fs.existsSync(temporaryFile)) fs.unlinkSync(temporaryFile);
      throw new EntityDesignError(`The ${name} design could not be saved safely: ${error.message}`, 500, [this.#violation("entity", name, "The design file was not changed.")]);
    }
    this.entities.set(name, proposed);
    return { entity: proposed, findings };
  }

  update(name, changes) { return this.commit(name, this.check(name, this.propose(name, changes))); }
  #schema() {
    const schema = this.getArchitecture().entityDesign;
    if (!schema?.sections || !Object.keys(schema.sections).length || !schema?.features?.length) throw new EntityDesignError("Entity design configuration is unavailable.", 500, [this.#violation("architecture", "entityDesign", "Define editable sections and features in the architecture artifact.")]);
    return schema;
  }
  #violation(section, field, message) { return { section, field, message }; }
  #label(value) { return value.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, letter => letter.toUpperCase()); }
  #sectionFor(entity, field) { return entity.attributes?.[field] ? "attributes" : entity.children?.[field] ? "children" : entity.operations?.[field] ? "operations" : "entity"; }
}

export class EntityDesignError extends Error {
  constructor(message, status = 400, violations = []) { super(message); this.status = status; this.violations = violations; }
}
