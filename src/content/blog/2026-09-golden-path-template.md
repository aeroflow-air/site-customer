---
title: Golden-path .NET template and reusable CI
description: How a squad of six spins up a new AeroFlow service without a shared framework package — and what still belongs in aeroflow-workflows.
pubDate: 2026-09-18
author: AeroFlow Platform
tags:
  - golden-path
  - dotnet
  - ci
---

AeroFlow’s product face is a fictional airport ops tool. The work that matters for the portfolio is how a small squad starts a new service without inventing a framework.

## What “golden path” means here

We published [`template-dotnet-service`](https://github.com/aeroflow-air/template-dotnet-service): an ASP.NET Core Web API starter with health checks, structured logging, ProblemDetails, and a stub for OpenTelemetry. Composition stays in `Program.cs`. There is no heavy shared NuGet that every squad must inherit.

Create a service with **Use this template** on GitHub, or clone and rename. Keep the layout: `src/`, `tests/`, `Dockerfile`, and a local CI workflow. Rename the solution and namespaces to match the service (`svc-booking`, and so on).

What we deliberately left out of the template:

- Kubernetes manifests and Helm charts
- Dagger pipelines
- Pulumi (or other IaC frameworks) in-repo for day one
- A kitchen-sink “platform SDK”

Infrastructure as Bicep/AVM will land under `infra/` when the modules are ready. Until then the template stays runnable locally and as a container.

## Local CI first, reusable workflows next

The template ships a **local** GitHub Actions workflow that restores, builds, and tests on every push and pull request. Job-level `permissions` are explicit because the organisation `GITHUB_TOKEN` is read-only by default.

Reusable build/test workflows belong in [`aeroflow-workflows`](https://github.com/aeroflow-air/aeroflow-workflows). Today that repo focuses on decisions validation — we do **not** invent a broken `workflow_call` reference. When a quality-gate workflow is published, the template’s job should call it; until then local CI is honest and green.

## Where decisions live

This post narrates the path. The decision to publish a public site and blog (and keep ADRs in the handbook) is **ADR-0003** in [`platform-handbook`](https://github.com/aeroflow-air/platform-handbook). The Platform page on this site only links into those records — it does not copy them.

If you are starting a new `svc-*` repo: use the template, keep CI boring, and open a handbook PR when something needs a real decision.
