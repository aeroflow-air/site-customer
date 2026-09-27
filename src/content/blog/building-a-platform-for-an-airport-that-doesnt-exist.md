---
title: "Building a platform for an airport that doesn't exist"
description: "Why I'm building an Azure-native internal developer platform for a fictional airport, and how it doubles as a learning lab and a public showcase."
pubDate: 2026-09-27
author: Tony Joanes
tags:
  - platform-engineering
  - azure
  - adr
---

AeroFlow Air is a fictional airport. It has flights between Gatwick, Edinburgh and Amsterdam, gates that change at the last minute, and delays that ripple through the day. None of it is real. The platform I'm building to run it is.

I'm a DevOps manager, and most of my working week goes on keeping real platforms running and supporting the teams that build on them. What I rarely get is a clean space to design a platform the way I think it should be done, from first principles, and then show the whole thing in public. AeroFlow is that space.

## Why an airport?

I needed a domain with real complexity, and airports have plenty. A flight has a lifecycle with rules: you can't board without a gate, you can't land before you've departed, and a cancelled flight stays cancelled. Operations run around the clock, lots of teams depend on the same data, and failures are visible to customers. That's the kind of pressure that exposes whether platform decisions actually hold up.

Because it's fictional, I can show everything: the code, the pipelines, the decisions and the mistakes.

## What I'm building

AeroFlow is an Azure-native internal developer platform. The goal is that a squad can create a new service and ship it to production on a paved road, without filing tickets or reinventing CI, infrastructure and quality checks each time.

So far that means:

- **A golden-path service template.** A .NET service with health checks, ProblemDetails error handling and tests. It's designed to be copied, so it has to be the best example of how we build.
- **Reusable CI workflows.** These are versioned and pinned by tag, so a change to the shared pipeline can't silently break every service.
- **A decision to use Bicep on Azure Verified Modules for infrastructure as code,** recorded in [ADR-0002](https://github.com/aeroflow-air/platform-handbook/blob/main/docs/decisions/0002-infrastructure-as-code-bicep.md). The modules themselves are next.
- **A handbook of Architecture Decision Records.** They're validated in CI, with main protected so a record can't skip its review lifecycle.
- **The first real service, `svc-flight-status`.** It models the flight lifecycle as a pure domain, with an API over the top.

## How I want it to work

The tools matter less than the patterns and processes around them, and that's where most of my opinions are:

- **Platform is a product.** Squads are its customers. That means discovery, experiments, and being willing to throw work away, not building what I assume people need.
- **Decisions get written down.** Every significant choice is an ADR, with the alternatives and what would make me revisit them.
- **Quality belongs in the squad.** There's no separate QA department and no "ready for QA" column, just shared accountability and a steep test pyramid.
- **Functional-style C#.** That means immutable data, pure domain logic, and explicit outcomes instead of exceptions for ordinary failures. It's idiomatic C#, not a framework.

## A learning lab and a showcase

AeroFlow is two things at once. It's a lab where I can try ideas properly, such as exhaustive pattern matching or the right shape for reusable pipelines, without the constraints of a live estate. It's also a showcase of how I think about platforms, and it's open for anyone to read.

That means I'll write about the mistakes too. The first one has already happened. I merged a pull request that accepted two ADRs while the validation check was failing, because the handbook's main branch had no protection. The fix was branch protection that applies to admins as well, and the lesson was that a check only protects you if something enforces it.

## What's next

Next up are more domain services alongside flight status, a small library for the functional patterns once a second service proves it's needed, and getting services deployed on Azure Container Apps. I'll write up each step as I go, including the decisions I'd make differently.
