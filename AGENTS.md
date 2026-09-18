# AI Agent Instructions

## Purpose

MDEX is an experiment in knowledge-driven applications.

The central rule is:

> **AI manages knowledge. The MDEX runtime executes knowledge.**

Prefer interpretation over generation. Application behavior should normally be expressed as semantic artifacts and interpreted by the generic runtime rather than implemented as application-specific source code.

## Repository model

The repository contains four different kinds of material:

- `sample/entities/` — executable application model: entities, attributes, references, operations, rules, states, and relationships.
- `sample/use-cases/` — executable goal-oriented orchestration over entity operations.
- `sample/architecture/` — architecture principles and executable architecture constraints.
- `sample/seed/` — sample instance data.
- `src/` — generic MDEX runtime. It must remain application-independent.
- `public/` — generic Workbench UI. It must discover and render application knowledge rather than contain Employee-, Project-, or other domain-specific behavior.
- `test/` — runtime tests.

## Rules for AI agents

### 1. Change knowledge before code

When a requested change can be represented using the existing semantic model, modify the knowledge artifact rather than adding application-specific code.

Example: adding an Employee operation belongs in `sample/entities/employee.json`, not in a JavaScript Employee controller.

Change `src/` only when the runtime lacks a **generic capability** that should work for many applications.

### 2. Keep the runtime domain-independent

Never add logic such as:

- `if (entity === "Employee")`
- hard-coded Project, Department, Skill, or other sample-domain behavior
- application-specific routes or screens

Instead, extend the semantic vocabulary and teach the generic runtime or Workbench to interpret it.

### 3. Business behavior belongs in operations and rules

Use cases orchestrate behavior; they do not duplicate it.

A use case should invoke declared entity operations. Rules and state constraints belong with the entity/operation that owns the behavior.

### 4. Architecture is executable

Read `sample/architecture/architecture.json` before making structural or UI changes.

Architecture constraints are not merely documentation. The runtime and Workbench should validate or enforce them wherever practical.

Keep `architecture.md` aligned with the executable architecture artifact.

### 5. Preserve the three model levels

Do not confuse:

1. **Meta-model** — concepts such as Entity, Attribute, Operation, Rule, Use Case.
2. **Application model** — Employee, Project, Department, Transfer Employee.
3. **Instance data** — Ada Lovelace, Apollo, Engineering.

Persistence implementation is a separate concern and should not leak into the semantic model.

### 6. Business-facing UI must remain semantic

Do not expose technical identifiers when a business label exists.

References should display meaningful labels. Navigation must not depend on technical IDs being visible.

Owned/related collections should be presented from their semantic relationships.

### 7. Use cases are orchestration

Use cases may contain multiple steps. Each executable step should invoke a declared semantic operation.

Do not move business rules into use-case flow simply to make the flow work.

### 8. Treat user annotations as requests, not model truth

When annotations/review notes are introduced, preserve the distinction:

- Knowledge describes the current application.
- Annotation describes a requested change, question, or review comment.

An AI agent may analyze an annotation and propose or implement changes, but should not reinterpret the annotation itself as already-approved application knowledge.

### 9. Keep changes small

MDEX is an architectural experiment. Prefer the smallest vertical slice that proves a concept.

Do not introduce frameworks, abstractions, persistence technologies, workflow engines, or UI layers unless the current experiment requires them.

### 10. Verify changes

Before considering work complete:

- validate JSON artifacts;
- run the automated tests when execution is available;
- check architecture validation;
- verify that generic behavior still works for more than one entity;
- ensure no domain-specific logic has leaked into the runtime.

Do not claim tests passed unless they were actually executed.

## Decision rule

When deciding where a change belongs, ask:

> **Is this application knowledge, or is it a generic capability required to interpret application knowledge?**

If it is application knowledge, change an artifact under `sample/`.

If it is generic interpretation/execution capability, change the runtime or Workbench.

If it cannot reasonably be represented semantically, ordinary code is the escape hatch—but it should be the exception, not the default.

## Current architectural direction

```text
Human
  ↕
AI Agent
  ↕
Semantic Knowledge
  ├── Architecture
  ├── Entities / Rules / Operations
  ├── Use Cases
  └── Instance Data
        ↓
MDEX Runtime
        ↓
Generic Workbench / Application
```

The long-term objective is not to generate more application code. It is to make more of the application understandable, governable, executable, and evolvable as durable semantic knowledge.
