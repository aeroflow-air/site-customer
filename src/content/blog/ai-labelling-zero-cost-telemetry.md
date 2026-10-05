---
title: "The cost of AI coding telemetry — and why we chose zero"
description: "What Cursor Enterprise AI Code Tracking, Copilot usage metrics, and other vendor APIs actually cost for PR labelling, and why AeroFlow labels ai-authored vs ai-reviewed with GitHub-native signals only."
pubDate: 2026-10-05
author: Tony Joanes
tags:
  - platform-engineering
  - ai
  - metrics
  - adr
---

I wanted a trustworthy answer to a simple question: of the pull requests we merge, how many were substantially AI-authored — and do those merges take longer to review or fail more often?

That question sits in [ADR-0011](https://github.com/aeroflow-air/platform-handbook/blob/main/docs/decisions/0011-platform-developer-productivity-metrics.md): measure how the platform serves **teams**, join AI share to review time and change failure rate, and never publish individual productivity scores. [ADR-0012](https://github.com/aeroflow-air/platform-handbook/blob/main/docs/decisions/0012-ai-assisted-pr-labelling.md) is the labelling convention that makes the AI panel real. The redesign that kept it affordable is [platform-handbook#41](https://github.com/aeroflow-air/platform-handbook/pull/41).

None of the labelling runs in production yet. The decisions are written. The workflow and template caller are still landing. This post is about the cost fork we hit before writing a line of collector code.

## What “join to a PR” actually requires

Labelling a pull request needs a signal that points at **that** PR or at a commit SHA on it. Most vendor “AI analytics” products do not do that. They report org, team, or user-day aggregates: sessions, acceptance rates, lines suggested. Useful for seat justification. Useless for `ai-authored` on `#123`.

After reading the docs, only two surfaces looked like they could join to a specific change:

1. **Cursor AI Code Tracking** — per-commit SHA attribution (TAB vs Composer vs non-AI lines). [Enterprise only](https://cursor.com/docs/account/teams/ai-code-tracking-api), currently alpha.
2. **GitHub Copilot cloud-agent authorship** — when the PR author (or opening actor) is Copilot’s cloud agent, the identity is on the `pull_request` event. Free if you already use GitHub. No vendor poll.

Everything else we evaluated for labelling was aggregate-only or paid-and-still-aggregate.

## Options evaluated (with published prices)

### Cursor Teams / Enterprise and AI Code Tracking

Cursor publishes [Teams Standard at $40 per user per month and Teams Premium at $120 per user per month](https://cursor.com/docs/account/teams/pricing). Enterprise is **custom** — contact sales; there is no public list price for the seat.

The [AI Code Tracking API](https://cursor.com/docs/account/teams/ai-code-tracking-api) is documented as **Enterprise only**. It returns commit hashes and line attribution you can join to GitHub commits. That is the right shape for auto-labelling. It is also the wrong shape for a portfolio that refuses **additional** spend for metrics theatre: buying Enterprise solely to label PRs fails the cost rule, and Cursor does not publish what that seat costs.

A nightly collector that cached Cursor commit metrics was sketched and abandoned under the zero-cost redesign. No `CURSOR_API_KEY`. No poll job.

### GitHub Copilot Business / Enterprise and usage metrics

GitHub publishes [Copilot Business at $19 per granted seat per month and Copilot Enterprise at $39 per granted seat per month](https://docs.github.com/en/copilot/about-github-copilot/plans-for-github-copilot) (plus pooled AI credits and overage at published rates — not the point here).

The [Copilot usage metrics REST API](https://docs.github.com/en/rest/copilot/copilot-usage-metrics) exposes enterprise and organisation **reports**: day and 28-day aggregates, user-level engagement, repository PR activity summaries. Those reports are for adoption and billing insight. They do not hand you a PR number and say “this diff was AI-authored.” So even on a plan that already includes the metrics API, it is the wrong tool for ADR-0012 labels.

What **does** work for free at event time is Copilot **cloud-agent** authorship: if the bot opened the PR, we can label `ai-authored` without calling any usage API.

### Claude Code / Anthropic analytics

Anthropic’s [Claude Code Analytics API](https://platform.claude.com/docs/en/manage-claude/analytics-api) is available to organisations with Admin API access and is **free to use**. It returns **daily per-user** productivity and cost estimates (sessions, lines, commits, PRs as counts). That is aggregate / user-day grain — not a join key for a GitHub label. Enterprise Analytics is similarly organisation and user activity oriented. Out of labelling.

### Windsurf / Devin analytics

Windsurf’s editorial surface now points at Cognition’s [Devin pricing](https://devin.ai/pricing). Teams is published as **$80 per month for the team plan plus $40 per month per full developer seat**, and that tier includes an admin dashboard with analytics. Enterprise is “Let’s talk.” Nothing on the public pricing or plan compare claims per-commit or per-PR AI attribution suitable for labelling. Treat analytics there as aggregate until a vendor page says otherwise — and do not invent a join that is not documented.

## Why zero extra cost won

AeroFlow is a squad of about six and a public portfolio. ADR-0011 already rejects individual AI-usage leaderboards. Paying Enterprise seats so a bot can guess which human commits were IDE-assisted, then still needing honest self-declaration for the cases vendors miss, is the wrong spend.

The redesign in [#41](https://github.com/aeroflow-air/platform-handbook/pull/41) is blunt: **no additional cost** for labelling. Prefer GitHub-native signals. Leave paid and aggregate APIs out of the PR label path. If the organisation later buys Cursor Enterprise for other reasons, revisit SHA join then — not before.

## How labelling works (the zero-cost design)

Two content labels matter for metrics:

- **`ai-authored`** — a substantial share of the diff was AI-generated or AI-edited. Counts for ADR-0011’s AI share.
- **`ai-reviewed`** — AI helped in review only. Tracked separately; does **not** count as AI-authored.

Meta labels: `ai-label:auto` (automation applied something), `ai-label:manual` (human lock — automation must not overwrite), and `ai-declaration:none` when the author explicitly asserts neither.

### Precedence (stop at the first decisive band)

1. **Manual `/ai-label` override** — locks with `ai-label:manual`.
2. **PR body template markers / checkboxes** — human declaration.
3. **Copilot cloud-agent author or actor** — GitHub-native, free, event-time → `ai-authored` + `ai-label:auto` plus a sticky comment explaining why.
4. **Commit trailers** — `Ai-Assisted: authored|reviewed|none` (fallback).
5. **Co-Authored-By allow-list** — known AI agents only; not Dependabot (fallback).
6. **Remind when `ready_for_review` and undeclared** — Phase B, non-blocking.

Auto applications always carry `ai-label:auto` and an explanatory comment so the timeline stays auditable. Metrics snapshot labels **at merge time**.

### What the free Copilot-agent signal covers

It covers PRs **opened by** the cloud agent. It does **not** cover human PRs where Cursor, Copilot completions, Claude Code, or chat only helped in the IDE. That gap stays a trust-and-template problem. Building collectors to close it under a no-extra-cost rule is not worth it.

Implementation status as of 5 October 2026 (Europe/London): ADR-0011 and ADR-0012 are on `main` as drafts ([#37](https://github.com/aeroflow-air/platform-handbook/pull/37), [#38](https://github.com/aeroflow-air/platform-handbook/pull/38), redesigned in [#41](https://github.com/aeroflow-air/platform-handbook/pull/41)). The zero-cost labelling workflow landed in [aeroflow-workflows#6](https://github.com/aeroflow-air/aeroflow-workflows/pull/6). The template caller with no Cursor secret is still an open draft: [template-dotnet-service#7](https://github.com/aeroflow-air/template-dotnet-service/pull/7). Closed unmerged paid-Cursor drafts stay closed. **Nothing is deployed; no labels have run in production.**

## Honest verdict

**Marginal yes** for a tiny event-time Copilot-agent check when Phase B exists. **No** for multi-vendor Enterprise telemetry as a platform product.

The free signal correctly tags a real, growing class of agent-opened PRs and stops ADR-0011 from under-counting that work. It does not pretend IDE-assisted human PRs are solved. Under-counting undeclared human AI use is better than inventing usage from aggregates or buying seats to half-automate honesty.

## Limits (read these before copying the design)

- Auto-coverage is **narrow**: agent-authored PRs only.
- “Substantial” AI edits inside a human’s commits remain author judgement.
- Aggregate vendor dashboards (Copilot metrics, Claude Code analytics, Windsurf/Devin admin analytics) stay out of labelling and out of per-person charts — ADR-0011 measures teams, not individuals.
- Cursor SHA join is the only other PR-capable path we found, and it sits behind unpublished Enterprise pricing we chose not to pay for labelling alone.
- Enforcement stays phased: docs → warn → optional ruleset. Starting at a required checkbox produces performative `none` ticks.

If you need the short version for a stakeholder: we measured the price of knowing, decided most of the paid APIs still would not label a PR, kept the one free GitHub-native join, and wrote the rest down so the portfolio does not quietly grow a telemetry product.
