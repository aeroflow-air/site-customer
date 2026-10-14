---
title: "How AeroFlow Air uses Claude to review our code"
description: "How every AeroFlow pull request gets a first review from Claude: a shared, versioned GitHub workflow, CLAUDE.md standards files, how we tested it with deliberately bad code, and what we learned."
pubDate: 2026-10-14
author: Tony Joanes
tags:
  - platform-engineering
  - ai
  - code-review
  - github-actions
  - dotnet
---

At AeroFlow Air, every pull request now gets a first review from Claude, Anthropic's AI model. It doesn't replace our engineers. It handles the routine checks quickly and the same way every time, so human reviewers can focus on design and intent.

## How the review flow works

When a developer opens a pull request, a shared GitHub workflow starts. That workflow lives in one central repo, and every service pins it to a released version. Some PRs are skipped: drafts, PRs from forks, and anything over 1,500 changed lines, because a PR that big needs a proper human review anyway.

For every other PR, Claude reads the code changes along with the repo's `CLAUDE.md` file and our platform coding standards. It then posts comments on specific lines of the PR. A human still reviews the PR and makes the call to merge.

```mermaid
flowchart TD
    A[Developer opens PR] --> B[Shared GitHub workflow<br/>pinned to a release]
    B --> C{Draft, fork, or<br/>over 1,500 lines?}
    C -- Yes --> D[Skip AI review]
    C -- No --> E[Claude reads the diff,<br/>CLAUDE.md and coding standards]
    E --> F[Inline review comments on the PR]
    F --> G[Human reviews and merges]
    D --> G
```

## What it checks

- **Bugs and edge cases**, such as duplicate events, null handling and errors that get swallowed
- **Security issues**, such as hard-coded secrets and unsafe input
- **Our functional C# conventions**: `Result` types instead of exceptions, immutable records, and pure domain logic with no side effects
- **Tests and documentation**, both missing and out of date

## The CLAUDE.md setup

A generic AI reviewer gives generic advice. We wanted it to review against *our* standards, so we wrote them down in two layers. The platform coding standards apply to every service. Each service also has its own `CLAUDE.md`, which covers its events, its rules and the mistakes that are easy to make in that service.

```mermaid
flowchart LR
    P[Platform coding standards] --> R[Claude review]
    S[Service CLAUDE.md] --> R
    D[PR diff] --> R
    R --> O[Consistent, standards-aware feedback]
```

## Testing it before trusting it

Before relying on it, we tried to catch it out. We opened pull requests with problems planted on purpose:

- **Bad-code test:** Claude caught **9 of 9** planted issues, including duplicate-event handling, a fake secret, swallowed errors and missing tests.
- **Style test:** in C# written against our functional style, it flagged **13 of 14** problems.

```mermaid
xychart-beta
    title "Planted issues caught"
    x-axis ["Bad code", "Non-functional C#"]
    y-axis "Issues" 0 --> 15
    bar [9, 13]
    line [9, 14]
```

## What we learned

1. **The reviewer is only as good as the standards you write down.** Once the `CLAUDE.md` files existed, the style review improved a lot.
2. **Humans stay in charge of merges.** Claude gives advice, and people make the decisions.
3. **One shared, versioned workflow keeps reviews the same in every repo.** We change it in one place, release it, and each repo moves to the new version when it's ready.

```mermaid
flowchart LR
    W[aeroflow-workflows<br/>release v0.3.x] --> S1[svc-gate-allocation]
    W --> S2[svc-flight-status]
    W --> S3[svc-baggage-reclaim]
    W --> T[template-dotnet-service]
```

## Next steps

- Tune the review prompts based on real PRs
- Track which comments developers actually act on, so we can measure whether the reviews help and not just how much they say
