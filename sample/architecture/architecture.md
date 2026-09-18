# MDEX Application Architecture

## Purpose
Define architecture decisions that the MDEX runtime and Workbench can understand, display, validate, and where possible enforce.

## Principles
- Business behavior is executed through declared entity operations.
- Business rules are enforced by the runtime, not presentation code.
- References are shown using business labels rather than technical identifiers.
- Generated technical keys are hidden from normal business-facing views.
- Owned child collections are presented in the context of their parent.

## Enforced constraints
| Constraint | Enforcement |
| --- | --- |
| Every entity has a valid key | Architecture validation |
| References target known entities | Architecture validation and runtime |
| Operations declare an action | Architecture validation and runtime |
| Use cases invoke declared operations | Architecture validation |
| Generated technical keys are hidden | Workbench presentation |
| References use business labels | Workbench presentation |
| Child collections use tabs | Workbench presentation |

The executable source for these policies is `architecture.json`. This document is the human-readable architecture view.
