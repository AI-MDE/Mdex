import { randomUUID } from "node:crypto";

export class MemoryStore {
  constructor(entities) {
    this.entities = entities;
    this.data = new Map([...entities.keys()].map(name => [name, new Map()]));
  }

  execute(entityName, operationName, args = {}) {
    const entity = this.#entity(entityName);
    const operation = entity.operations?.[operationName];
    if (!operation) throw new Error(`Unknown operation: ${entityName}.${operationName}`);
    switch (operation.action) {
      case "create": return this.create(entityName, args.data ?? args);
      case "get": return this.get(entityName, args.id);
      case "list": return this.list(entityName, args.where);
      case "update": return this.update(entityName, args.id, args.data ?? {});
      case "delete": return this.delete(entityName, args.id);
      case "custom": return this.custom(entityName, operationName, args.id, args.data ?? args);
      case "transition": return this.transition(entityName, args.id, operation.transition);
      default: throw new Error(`Unsupported operation action: ${operation.action}`);
    }
  }

  create(entityName, input) {
    const entity = this.#entity(entityName);
    const record = {};
    for (const [name, spec] of Object.entries(entity.attributes)) {
      let value = input[name];
      if (value == null && spec.default != null) value = spec.default;
      if (spec.generated && spec.type === "uuid" && value == null) value = randomUUID();
      if (spec.required && (value == null || value === "")) throw new Error(`${name} is required`);
      if (spec.type === "reference" && value != null) this.#assertReference(spec, value);
      if (value != null) record[name] = value;
    }
    const key = record[entity.key];
    if (!key) throw new Error(`Missing key ${entity.key}`);
    this.data.get(entityName).set(key, record);
    return record;
  }

  list(entityName, where) {
    this.#entity(entityName);
    const values = [...this.data.get(entityName).values()];
    if (!where) return values;
    return values.filter(record => Object.entries(where).every(([key, value]) => record[key] === value));
  }

  get(entityName, id) { this.#entity(entityName); return this.data.get(entityName).get(id); }

  update(entityName, id, patch) {
    const entity = this.#entity(entityName);
    const current = this.get(entityName, id);
    if (!current) return undefined;
    for (const [name, value] of Object.entries(patch)) {
      const spec = entity.attributes[name];
      if (!spec) throw new Error(`Unknown attribute: ${entityName}.${name}`);
      if (spec.readOnly) throw new Error(`${name} is read-only`);
      if (spec.type === "reference" && value != null) this.#assertReference(spec, value);
      current[name] = value;
    }
    this.#checkConstraints(entity, current);
    return current;
  }

  delete(entityName, id) { this.#entity(entityName); return this.data.get(entityName).delete(id); }


  custom(entityName, operationName, id, args = {}) {
    const entity = this.#entity(entityName), operation = entity.operations[operationName];
    const current = this.get(entityName, id);
    if (!current) return undefined;
    this.#checkRules(entity, current, operation.rules);
    const patch = {};
    for (const [name, value] of Object.entries(operation.set ?? {})) patch[name] = typeof value === "string" && value.startsWith("$") ? args[value.slice(1)] : value;
    return this.update(entityName, id, patch);
  }

  transition(entityName, id, transitionName) {
    const entity = this.#entity(entityName), transition = entity.transitions?.[transitionName], current = this.get(entityName, id);
    if (!current) return undefined;
    if (!transition) throw new Error(`Unknown transition: ${entityName}.${transitionName}`);
    const stateName = entity.stateAttribute;
    if (!transition.from.includes(current[stateName])) throw new Error(`Transition ${transitionName} is not allowed from ${current[stateName]}`);
    this.#checkRules(entity, current, transition.rules);
    current[stateName] = transition.to;
    this.#checkConstraints(entity, current);
    return current;
  }

  #checkRules(entity, record, names = []) {
    for (const name of names) {
      const rule = entity.rules?.[name];
      if (!rule) throw new Error(`Unknown rule: ${entity.name}.${name}`);
      if (rule.when && !Object.entries(rule.when).every(([k,v]) => record[k] === v)) throw new Error(rule.message || rule.description || name);
    }
  }

  #checkConstraints(entity, record) {
    for (const rule of Object.values(entity.rules ?? {})) {
      if (!rule.forbid || !rule.when || !Object.entries(rule.when).every(([k,v]) => record[k] === v)) continue;
      for (const [field, condition] of Object.entries(rule.forbid)) if (condition === "present" && record[field] != null && record[field] !== "") throw new Error(rule.message || rule.description);
    }
  }

  related(entityName, id, attributeName) {
    const entity = this.#entity(entityName);
    const spec = entity.attributes[attributeName];
    if (!spec || spec.type !== "reference") throw new Error(`Not a reference: ${entityName}.${attributeName}`);
    const record = this.get(entityName, id);
    if (!record) return undefined;
    return this.get(spec.entity, record[attributeName]);
  }

  #assertReference(spec, id) {
    if (!this.get(spec.entity, id)) throw new Error(`Reference not found: ${spec.entity} ${id}`);
  }

  #entity(name) {
    const entity = this.entities.get(name);
    if (!entity) throw new Error(`Unknown entity: ${name}`);
    return entity;
  }
}
