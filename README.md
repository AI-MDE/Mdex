# MDE Knowledge Runtime

First executable experiment for a knowledge-driven MDE application.

The runtime **interprets entity artifacts directly**. It does not generate entity-specific application source code.

## Model-level operations

Entities declare the operations that the runtime exposes. The first operation vocabulary is intentionally small:

- `create`
- `get`
- `list` with simple attribute filtering
- `update`
- `delete`

References are semantic model relationships, not passive IDs. The runtime validates references and can navigate them generically. This is the foundation for the Runtime Workbench to browse from an Employee to its Department, manager, and other related objects without entity-specific UI code.

## Run

```bash
cd framework/runtime
npm test
npm start
```

The sample knowledge contains `Department` and `Employee`.

## Current scope

- JSON entity artifacts
- declared entity operations
- UUID generated keys
- required attributes
- entity reference validation
- relationship navigation
- model-level filtering/query
- in-memory storage
- generic REST API

Next: seed data and a generic Runtime Workbench model/data browser. Business rules, Gherkin verification, use cases, and application pages follow after the executable model layer is usable.
