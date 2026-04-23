# Full-Stack Project Playbook

A question-driven checklist to run through at the start of **any** new project — AI product, SaaS, internal tool, mobile app — _before_ a single line of code is written.

## Why this exists

Most new projects die (or get painful) because decisions get made fast and emotionally: "I know Next.js, let's use it." "Mongo feels flexible, let's use it." Six months later the wall is obvious — and was foreseeable.

This playbook forces four things:

1. **A real problem statement** before a solution.
2. **An architecture sized to real requirements**, not vibes.
3. **Tech choices with written reasoning** (so future-you can revisit them).
4. **A plan that survives expansion** — features you haven't shipped yet don't break the design.

## How to use it

1. Start a new project? Open this folder. Read files **00 → 07 in order**.
2. Each doc follows the same skeleton:
   - **Why this phase** — what decision comes out of it
   - **Questions to ask yourself** — a short checklist
   - **Mermaid decision tree** — visual "if X then Y" flowchart
   - **Reusable template** — a fill-in artifact you copy into your project repo
   - **Anti-patterns** — common mistakes to watch for
   - **Worked example** — decisions for _DocQ_, a fictional AI Q&A SaaS over user PDFs
3. Target: ~10 min per doc. Total playbook run ≈ 90 min.
4. You are **done** when you have, committed to the project repo:
   - A filled 1-page PRD (`docs/PRD.md`)
   - 3+ ADRs: backend, database, frontend (`docs/adr/*.md`)
   - A deployment + env sketch (`docs/deploy.md` or an ADR)

## Reading order

| #   | Doc                                                   | What you leave with                                               |
| --- | ----------------------------------------------------- | ----------------------------------------------------------------- |
| 00  | [Product vision & discovery](./00-product-vision.md)  | 1-page PRD, kill criteria                                         |
| 01  | [Architecture & system design](./01-architecture.md)  | Architectural shape: monolith / modular / micro + integration map |
| 02  | [Backend stack decision](./02-backend-stack.md)       | Language + framework ADR                                          |
| 03  | [Database selection](./03-database.md)                | Primary store ADR + schema canvas                                 |
| 04  | [Frontend stack decision](./04-frontend-stack.md)     | Frontend ADR + design-system choice                               |
| 05  | [Auth, security, compliance](./05-auth-security.md)   | Auth ADR + STRIDE-lite threat model                               |
| 06  | [DevOps & deployment](./06-devops.md)                 | Hosting ADR + env matrix + CI/CD + observability plan             |
| 07  | [Testing & quality strategy](./07-testing-quality.md) | Test pyramid + pre-commit gate                                    |

## Templates

Reusable fill-in documents. Copy into your project repo under `docs/`:

- [`templates/prd-1pager.md`](./templates/prd-1pager.md)
- [`templates/adr.md`](./templates/adr.md)
- [`templates/schema-canvas.md`](./templates/schema-canvas.md)
- [`templates/threat-model.md`](./templates/threat-model.md)

## Relationship to the TDD workflow

The global TDD-first workflow (from `~/.claude/CLAUDE.md`) has 7 steps:

1. Research — _covered here (00–07)_
2. Minimize dependencies — _covered here (02, 03, 06)_
3. Brainstorm — _covered here (every doc's "Questions" section)_
4. Tests first ←— **CODING STARTS HERE**
5. Red phase
6. Green phase
7. Pre-commit verify — _standards defined here in 07_

The playbook ends where code begins. It does **not** replace TDD — it makes sure you know _what_ you're about to TDD and _why_.

## Maintenance rule

After you've used this playbook on a real project, come back and update any decision tree that felt wrong, any question that was useless, any anti-pattern you actually fell into. The playbook gets sharper with every use.

---

_Canonical location: `ai-mastery/playbook/`. Version: v1 (2026-04-20)._
