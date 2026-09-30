---
title: "I nearly banned squads from infrastructure"
description: "How a squad, including a coding agent, is meant to ship an Azure service without a platform team on every change, and why none of that runs yet."
pubDate: 2026-09-30
author: Tony Joanes
tags:
  - platform-engineering
  - azure
  - infrastructure
---

I'm designing how a squad, including a coding agent, ships an Azure service without a platform team sitting in the middle of every change.

The project is AeroFlow, a fictional airport. I'm building it in public so the decisions are written down before the code pretends they already exist. Nine decisions are accepted. One earlier one is superseded. The interesting part so far is the writing down, not the shipping.

## The problem is the queue

A platform team that owns every resource becomes the path to production. Squads wait. Agents make it worse, because they can open a pull request faster than a person can review a resource group. Ban them from infrastructure and the queue just moves: every need the paved road does not cover lands back on the platform team.

I nearly did that ban. The route to live would have allowed application code only, and any infrastructure change would have been a platform job. That is safe, and it does not scale past the first uncovered need.

## The rule now

Squads write the application. They ask for infrastructure through a workload manifest, and only for capabilities that already have a governed module. A new capability needs a module and a decision record first. Raw resources stay off the route to live.

The side door stays open. A human can still hand-compose those same governed modules, with a squad reviewer, and platform review when the change touches identity or network. Repeated side-door work is the signal to promote it into a capability. About three services is the rule of thumb, not a gate.

Plan and apply are separate identities. A pull request can be shown a plan. Applying on the route to live happens only in GitHub Actions, through the shared deploy workflow. A person or a laptop cannot apply there.

None of that runs yet. There is no manifest, no module, no deploy workflow, and no identity. The record says what those things are for. The next work is building the first one.
