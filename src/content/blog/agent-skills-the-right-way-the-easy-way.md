---
title: "Agent skills: making the right way the easy way for AI too"
description: "How AeroFlow gives AI coding agents its standards: an audit of the CLAUDE.md files we had, versioned skills owned by the platform team, what squads control, and which rules are enforced by the build rather than a prompt."
pubDate: 2026-11-22
author: Tony Joanes
tags:
  - platform-engineering
  - ai
  - github-actions
  - golden-path
  - adr
---

AI coding agents already write and review a lot of AeroFlow code. Claude reviews every pull request (I wrote about that in [How AeroFlow Air uses Claude to review our code](/site-customer/engineering/claude-code-reviews/)), and squads use Claude Code, Copilot and other agents in their editors. Each of those agents is only as good as what it is told about how we build things.

I think the platform team's job here is the same as it is with pipelines: **make the right way the easy way.** We don't ask every squad to write its own CI. We publish versioned, reusable workflows and let them pin a tag. Agent guidance should work the same way. This post covers how I got there, and what is still not done.

## The audit

Before changing anything, I looked at every repo in the organisation for anything an agent might read: `AGENTS.md`, `CLAUDE.md`, `.github/copilot-instructions.md`, `.github/instructions/`, `.claude/skills/`, Cursor rules and the rest. There was exactly one kind of file: `CLAUDE.md`, in 6 of 11 repos.

That sounds tidy, but it wasn't:

- **Copying had caused drift.** The same 12-line conventions block sat in the three services and the template, restating our [C# coding standards](https://github.com/aeroflow-air/platform-handbook/blob/main/docs/standards/coding-standards.md). Four copies of one rule set means four places to forget to update.
- **Stale docs were feeding agents wrong facts.** The handbook's `CLAUDE.md` promised separate libraries for config binding and ProblemDetails. We have one observability package and per-service code. Docs linked from the service files still said no package feed existed, the day after we published one. The AI review prompt asked for "minimal API conventions" in an estate that uses controllers everywhere.
- **Some rules lived only in code.** How errors become ProblemDetails was done three slightly different ways. No service validated its options at startup. The test approach, readiness checks and how to write a decision record from a service repo weren't written down for agents at all.
- **Some repos had nothing.** The local airport repo, the most intricate one, had no agent context.

None of this is anyone's fault. It is what happens when guidance is copied rather than published. The full audit is in [ADR-0023](https://github.com/aeroflow-air/platform-handbook/blob/main/docs/decisions/0023-central-agent-skills.md) and its [appendix](https://github.com/aeroflow-air/platform-handbook/blob/main/docs/design/agent-context-audit.md).

## Plain Markdown, any agent

The fix is a new repo, [agent-skills](https://github.com/aeroflow-air/agent-skills). It holds one small skill per task: add an endpoint, add a queue consumer, add observability, write a decision record, and a new-service checklist. Each skill is one `SKILL.md`, under 60 lines, with three sections: when to use it, the steps, and links to real code in our repos to copy.

I kept them deliberately plain. They use the open Agent Skills format (a `name` and a `description` in the front matter), so Claude Code and Copilot pick them up from `.claude/skills/`. But nothing depends on that. An agent that just reads files, like Grok, or a person, gets told where they are by the repo's `AGENTS.md` and can follow the same steps. If a rule only works in one tool, it isn't a standard.

Every repo also gets a short `AGENTS.md`, under 40 lines, with the non-negotiables and the build commands. `CLAUDE.md` becomes a one-line pointer to it. This is an excerpt from the template's:

```markdown
## Non-negotiables (* = enforced by build or CI)
- The HTTP edge is `[ApiController]` controllers in `Controllers/`, not minimal APIs.
- * Log with `[LoggerMessage]` only (CA1848/CA2254), never `Console`/`Debug.WriteLine` (RS0030).
  Business event ids start at 10,000.
- * `AddServiceDefaults()` + `MapDefaultEndpoints()` give OTel, request logs,
  `/health` (readiness) and `/alive` (liveness).
```

## Who owns what

This is the part I care most about, because it's where platform teams usually go wrong with shared tooling: either nobody owns it, or the platform owns everything and squads route around it.

**The platform team owns:**

- the `aeroflow-*` skills and their examples;
- the non-negotiables that go into every `AGENTS.md`;
- the [sync-agent-skills.yml](https://github.com/aeroflow-air/aeroflow-workflows/blob/main/.github/workflows/sync-agent-skills.yml) workflow that keeps copies honest.

**Squads own:**

- which version they pin;
- which platform skills they don't want;
- any skills of their own.

A repo declares it in one file:

```yaml
# .agent-skills.yaml
source: aeroflow-air/agent-skills
version: v0.2.0
skills: default
exclude: []        # e.g. [aeroflow-add-queue-consumer] for an API-only service
```

The sync only ever touches folders named `aeroflow-*`. A squad's own skill, say `baggage-add-endpoint`, is never read, changed or deleted. To replace a platform skill, a squad excludes it and adds its own under a different name. Overrides stay visible in one file and show up in review.

## Versioned like any dependency

Agents can't read across repos, so each repo keeps a pinned copy of the skills. Copies drift, so the copy is checked. On every pull request the workflow fetches the pinned release and fails if any `aeroflow-*` folder differs from it. Once a week, the same workflow looks for a newer release and opens one pull request that bumps the pin and re-syncs the files, like Dependabot for a library.

Releases follow SemVer, the same habit as our [reusable workflows](https://github.com/aeroflow-air/aeroflow-workflows/releases) and our NuGet package:

- **minor:** a new skill or new steps;
- **major:** a rename or a changed rule;
- **patch:** wording.

[v0.1.0](https://github.com/aeroflow-air/agent-skills/releases/tag/v0.1.0) shipped the five starter skills. [v0.2.0](https://github.com/aeroflow-air/agent-skills/releases/tag/v0.2.0) added one step to the new-service checklist (more on that below). The workflow itself shipped in [aeroflow-workflows v0.7.0](https://github.com/aeroflow-air/aeroflow-workflows/releases/tag/v0.7.0).

## Prompts are not enforcement

A rule an agent can skip is a suggestion. The rules that matter have to fail a build, whoever or whatever wrote the code. So ADR-0023 lists every non-negotiable next to how it is, or could be, enforced. Being honest about that table was the most useful part of the exercise.

**Enforced today:**

- `Console` and `Debug.WriteLine` are banned (RS0030).
- Free-text `ILogger` calls and non-constant templates fail the build (CA1848, CA2254).
- Warnings are errors.
- Health endpoints have tests.
- Decision records are validated on every PR.
- Skill copies must match their pin.

It helps to be clear about what each check guards. The drift check guards the instructions: it proves the skills an agent reads are the released ones, and says nothing about the code the agent writes. The code is guarded by analysers and tests. The skill files and `AGENTS.md` are guarded by CODEOWNERS, so a change to them asks the platform team for review (this is going into the template alongside the architecture tests below).

**Not enforced yet:**

- Business event ids at 10,000 or above. This needs a small analyser.
- No logging, I/O or clock reads in domain code. Architecture tests for this are going into the template first, in review as I write this. The services don't have them yet.
- ProblemDetails on every error response.
- Options validated at startup.
- `docs/service.md` updated when behaviour changes. Today only the AI reviewer checks this.

Those are written down as "could be enforced by", not quietly assumed. That list is the backlog.

## Secret scanning, everywhere

While doing this we switched on GitHub secret scanning and push protection across all 12 repos in the organisation. Agents write config and workflow files quickly, and a pasted connection string is exactly the mistake push protection is there to block.

One detail caught us out: a repo created from a template does not copy the template's security settings. So the new-service checklist skill now has a step to switch them on, and that step is the whole of v0.2.0. It is a small change, but it is the kind of thing that gets missed once and then stays missed.

## What is not done yet

- **The rollout is template-first.** The [service template](https://github.com/aeroflow-air/template-dotnet-service) has the pin, the synced skills, the workflow and its `AGENTS.md`. The three live services and the other repos still have their old `CLAUDE.md` files and the stale docs the audit found. Those are the next pull requests.
- **Bump pull requests don't run CI yet.** A pull request opened with the built-in `GITHUB_TOKEN` doesn't trigger other workflows, so its required checks never start. The workflow accepts an optional GitHub App token that fixes this, but the organisation doesn't have that app yet. Until then, someone closes and reopens the pull request, and the PR description says so.
- **The skills check isn't a required check yet.** It runs on the template's pull requests, but I'd rather watch it for a while before letting it block merges.
- **The decision is still a draft.** ADR-0023 is merged as a draft, like every new record in the handbook.

None of this is clever. It is the same platform move as reusable workflows and a shared observability package: write the standard once, version it, let squads pin it and opt out visibly, and enforce the parts that matter in the build. The only new thing is that some of the people reading it are agents.
