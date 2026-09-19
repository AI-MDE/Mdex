import { randomUUID } from "node:crypto";

export class MemoryStore {
  constructor(entities) {
    this.entities = entities;
    this.data = new Map([...entities.keys()].map(name => [name, new Map()]));
    this.historyData = new Map([...entities.keys()].map(name => [name, new Map()]));
  }

  execute(entityName, operationName, args = {}) {
    const entity = this.#entity(entityName);
    const operation = entity.operations?.[operationName];
    if (!operation) throw new Error(`Unknown operation: ${entityName}.${operationName}`);
    switch (operation.action) {
      case "create": return this.create(entityName, args.data ?? args, args.actor);
      case "get": return this.get(entityName, args.id);
      case "list": return this.list(entityName, args.where);
      case "update": return this.update(entityName, args.id, args.data ?? {}, args.actor);
      case "delete": return this.delete(entityName, args.id, args.actor);
      case "custom": return this.custom(entityName, operationName, args.id, args.data ?? args, args.actor);
      case "transition": return this.transition(entityName, args.id, operation.transition, args.actor);
      default: throw new Error(`Unsupported operation action: ${operation.action}`);
    }
  }

  create(entityName, input, actor="System") {
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
    if (entity.architectureFeatures?.auditStamp) { const now=new Date().toISOString();record._audit={createdAt:now,createdBy:actor,updatedAt:now,updatedBy:actor}; }
    this.data.get(entityName).set(key, record);
    this.#recordHistory(entityName,key,"create",record,actor);
    return record;
  }

  list(entityName, where) {
    this.#entity(entityName);
    const values = [...this.data.get(entityName).values()];
    if (!where) return values;
    return values.filter(record => Object.entries(where).every(([key, value]) => record[key] === value));
  }

  get(entityName, id) { this.#entity(entityName); return this.data.get(entityName).get(id); }

  update(entityName, id, patch, actor="System") {
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
    if(entity.architectureFeatures?.auditStamp)current._audit={createdAt:current._audit?.createdAt||new Date().toISOString(),createdBy:current._audit?.createdBy||actor,updatedAt:new Date().toISOString(),updatedBy:actor};
    this.#recordHistory(entityName,id,"update",current,actor);
    return current;
  }

  delete(entityName, id, actor="System") { this.#entity(entityName);const current=this.get(entityName,id);if(current)this.#recordHistory(entityName,id,"delete",current,actor);return this.data.get(entityName).delete(id); }

  history(entityName,id){this.#entity(entityName);return this.historyData.get(entityName).get(id)||[];}

  snapshot(){return {type:"data",records:Object.fromEntries([...this.data].map(([name,records])=>[name,[...records.values()]])),history:Object.fromEntries([...this.historyData].map(([name,records])=>[name,Object.fromEntries(records)]))};}

  hydrate(snapshot){for(const [name,records] of Object.entries(snapshot.records||{})){const entity=this.#entity(name),target=this.data.get(name);for(const record of records){const key=record[entity.key];if(!key)throw new Error(`Missing key ${entity.key}`);target.set(key,record)}}for(const [name,records] of Object.entries(snapshot.history||{})){this.#entity(name);const target=this.historyData.get(name);for(const [id,events] of Object.entries(records))target.set(id,events)}}


  custom(entityName, operationName, id, args = {}, actor="System") {
    const entity = this.#entity(entityName), operation = entity.operations[operationName];
    const current = this.get(entityName, id);
    if (!current) return undefined;
    this.#checkRules(entity, current, operation.rules);
    const patch = {};
    for (const [name, value] of Object.entries(operation.set ?? {})) patch[name] = typeof value === "string" && value.startsWith("$") ? args[value.slice(1)] : value;
    let result = Object.keys(patch).length ? this.update(entityName, id, patch, actor) : current;
    if (operation.create) {
      const data = {};
      for (const [name, value] of Object.entries(operation.create.data ?? {})) data[name] = value === "$self" ? id : (typeof value === "string" && value.startsWith("$") ? args[value.slice(1)] : value);
      result = this.create(operation.create.entity, data, actor);
    }
    return result;
  }

  transition(entityName, id, transitionName, actor="System") {
    const entity = this.#entity(entityName), transition = entity.transitions?.[transitionName], current = this.get(entityName, id);
    if (!current) return undefined;
    if (!transition) throw new Error(`Unknown transition: ${entityName}.${transitionName}`);
    const stateName = entity.stateAttribute;
    if (!transition.from.includes(current[stateName])) throw new Error(`Transition ${transitionName} is not allowed from ${current[stateName]}`);
    this.#checkRules(entity, current, transition.rules);
    current[stateName] = transition.to;
    this.#checkConstraints(entity, current);
    if(entity.architectureFeatures?.auditStamp)current._audit={createdAt:current._audit?.createdAt||new Date().toISOString(),createdBy:current._audit?.createdBy||actor,updatedAt:new Date().toISOString(),updatedBy:actor};
    this.#recordHistory(entityName,id,"transition",current,actor);
    return current;
  }

  #recordHistory(entityName,id,action,record,actor){if(!this.#entity(entityName).architectureFeatures?.trackHistory)return;const history=this.historyData.get(entityName),events=history.get(id)||[];events.push({action,at:new Date().toISOString(),actor,record:structuredClone(record)});history.set(id,events);}

  #checkRules(entity, record, names = []) {
    for (const name of names) {
      const rule = entity.rules?.[name];
      if (!rule) throw new Error(`Unknown rule: ${entity.name}.${name}`);
      const kind = rule.kind ?? (rule.forbid ? "constraint" : "precondition");
      if (kind !== "precondition") throw new Error(`Rule ${entity.name}.${name} is not a precondition`);
      if (rule.when && !Object.entries(rule.when).every(([k,v]) => record[k] === v)) throw new Error(rule.message || rule.description || name);
    }
  }

  #checkConstraints(entity, record) {
    for (const [name, rule] of Object.entries(entity.rules ?? {})) {
      const kind = rule.kind ?? (rule.forbid ? "constraint" : "precondition");
      if (kind !== "constraint" || !rule.when || !Object.entries(rule.when).every(([k,v]) => record[k] === v)) continue;
      for (const [field, condition] of Object.entries(rule.forbid ?? {})) {
        if (condition !== "present") throw new Error(`Unsupported rule condition: ${entity.name}.${name}.${field} ${condition}`);
        if (record[field] != null && record[field] !== "") throw new Error(rule.message || rule.description || `Constraint ${entity.name}.${name} failed`);
      }
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
