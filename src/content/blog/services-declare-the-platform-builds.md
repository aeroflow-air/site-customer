---
title: "Services declare, the platform builds"
description: "Why AeroFlow services ask for infrastructure with a five-line workload.yaml, how a CI generator turns that into governed Bicep, and the trade-offs of doing it this way on Azure."
pubDate: 2026-10-11
author: Tony Joanes
tags:
  - platform-engineering
  - bicep
  - azure
  - github-actions
  - adr
---

At scale, standards and consistency are key. Every service needs much the same infrastructure: somewhere to run, an identity, logs and an HTTP endpoint. If every squad writes that by hand, you end up with many slightly different versions of the same thing, each with its own naming, tags, security settings and mistakes. Reviews are slow, and a platform-wide fix means touching every repo.

On AeroFlow, my fictional airline platform, the answer is one principle: **a service declares what it needs, and the platform builds it.** As of 11 October 2026 that's real for the first service. This post covers how it works, what it costs (nothing so far), and where it falls short.

The full design is in the handbook: [the workload manifest platform](https://github.com/aeroflow-air/platform-handbook/blob/main/docs/design/workload-manifest-platform.md).

## What a service repo holds

A service repo like [svc-flight-status](https://github.com/aeroflow-air/svc-flight-status) now holds:

- the application code and tests
- a `workload.yaml` at the root
- an `infra/` folder that contains only a README, on purpose
- two thin caller workflows, `ci.yml` and `workload.yml`, with no real logic in them

Here's the real manifest, without its header comment:

```yaml
workload: svc-flight-status
repo: svc-flight-status
dataClass: internal
capabilities: [http]
```

That's the whole request. It says "I'm an internal HTTP service". It doesn't say which Azure resources to create. Capabilities come from a fixed list (`http`, `identity`, `store`, `queue`), and the schema rejects any other key, so you can't slip a raw resource or a block of Bicep into the manifest.

The platform owns everything else. [aeroflow-workflows](https://github.com/aeroflow-air/aeroflow-workflows) holds the schema, the generator and the reusable workflows, released as tags. [infra-platform](https://github.com/aeroflow-air/infra-platform) holds the governed Bicep modules. Today there's one, `container-app-service`: a Log Analytics workspace, a Container Apps environment, and a container app with a system-assigned managed identity, scale to zero and ingress on port 8080.

## What the generator writes

On every pull request, the service's `workload.yml` calls the shared `workload-deploy.yml`. It validates the manifest against the schema, generates `main.bicep`, then runs `bicep build` and `bicep lint` and uploads the result as an artifact. From the manifest above it writes (trimmed):

```bicep
targetScope = 'resourceGroup'

param location string = resourceGroup().location
param containerImage string
@allowed(['external', 'internal'])
param ingress string = 'internal'

module hosting '<container-app-service reference>' = {
  name: 'svc-flight-status-hosting'
  params: {
    name: 'svc-flight-status'
    location: location
    containerImage: containerImage
    ingress: ingress
  }
}
```

What's missing is the point. There are no `resource` blocks, naming rules, tags or identity settings. Those live once, inside the module. The test from [ADR-0009](https://github.com/aeroflow-air/platform-handbook/blob/main/docs/decisions/0009-workload-manifest.md) is simple: you can build a new service without writing a `resource` block.

The generated Bicep isn't committed to the service repo. It's a build artifact, so it can't drift from the generator.

## Versioning and rollout

The generator is shared code, so a bad change could reach every service at once. That's handled with pinned tags. The flight status caller looks like this:

```yaml
jobs:
  workload:
    uses: aeroflow-air/aeroflow-workflows/.github/workflows/workload-deploy.yml@v0.2.0
    with:
      workflows_ref: v0.2.0   # keep in sync with the uses: pin above
```

Callers pin tags, never `main`, and `workflows_ref` makes sure the schema and generator scripts match the workflow version. A generator change ships as a new tag in aeroflow-workflows after its self-test passes ([#7](https://github.com/aeroflow-air/aeroflow-workflows/pull/7) shipped `v0.2.0`). Nothing changes for a service until it moves its pin in its own pull request, where its own CI shows the result. Rollout is service by service, and an old tag keeps working for anyone not ready to move. Modules follow the same idea: exact pins, never overwritten ([ADR-0006](https://github.com/aeroflow-air/platform-handbook/blob/main/docs/decisions/0006-governed-bicep-modules-only.md)).

## The side door

Not every need fits the capabilities on offer, so ADR-0009 keeps a guarded side door. A squad can hand-compose governed `br/platform:*` modules in its own `infra/` folder. Raw resources and Azure Verified Modules stay out of service repos, and agents never use the side door: [ADR-0008](https://github.com/aeroflow-air/platform-handbook/blob/main/docs/decisions/0008-agents-request-infrastructure.md) limits them to changing the manifest.

I treat the side door as discovery, not failure. When roughly three services compose the same thing, it becomes a module and a capability, and those services move back onto the manifest. The guard itself (a `CODEOWNERS` entry for `infra/` and an automatic `infra-boundary` label) is planned but not in place yet.

## The trade-offs

- **The generator is a shared dependency.** A bug in it reaches every service. That's why it has unit tests, golden-file tests, a self-test, tagged releases and service-by-service rollout. It's still a single point of failure, and I'd rather say so.
- **Squads are limited to what's on offer.** Today only `http` and `identity` generate. Ask for `store` or `queue` and the generator fails with "not yet supported". That friction is intended, but it is friction.
- **Reviewers see YAML, not resources.** A one-line manifest change can create real infrastructure. The planned fix is to post the what-if result on the pull request, using a read-only plan identity ([ADR-0010](https://github.com/aeroflow-air/platform-handbook/blob/main/docs/decisions/0010-plan-and-apply-identities.md)), so reviewers see exactly what will change. Until that exists, this is the weakest part.
- **Shared resources need a home.** Things used by many services, like a registry, don't belong in any one manifest. They'll live in a platform stack owned by Platform.

## Why not Kratix, Score or Radius?

The pattern isn't new. **Kratix Promises** run inside Kubernetes: a custom resource as the API, a pipeline per request, and a controller reconciling continuously. **Score** is a platform-neutral workload spec that tools like score-compose or score-k8s turn into concrete config. **Radius** describes applications and their connections, with recipes supplying the infrastructure, and runs its control plane on Kubernetes.

AeroFlow targets only Azure Container Apps, has no Kubernetes cluster to host a controller, and has a tiny team. A generator in CI fits that. It costs nothing to run, needs no always-on service, uses the Bicep and GitHub Actions already chosen ([ADR-0006](https://github.com/aeroflow-air/platform-handbook/blob/main/docs/decisions/0006-governed-bicep-modules-only.md), [ADR-0007](https://github.com/aeroflow-air/platform-handbook/blob/main/docs/decisions/0007-container-apps-hosting.md)), and you can read it end to end. The cost is that nothing reconciles drift continuously. If AeroFlow ever adopts Kubernetes or a second cloud, those tools would be worth revisiting.

## Zero cost so far

Everything up to the artifact runs inside GitHub Actions with no Azure login. There's no what-if and no deployment yet, so the Azure bill is zero. That's deliberate: I'd rather prove the contract and the rollout model first.

## What's next

- **`store` and `queue`** capabilities, once their modules and ADRs exist.
- **Publishing the module.** CI currently builds against a local stand-in, a copy of `container-app-service` in aeroflow-workflows. Once infra-platform publishes a version, manifests pin it and the stand-in is deleted.
- **What-if and deploy**, once there's a personal Azure account: what-if on pull requests with the plan identity, and deployment from `main` with a separate apply identity.
- **Other services and the service template** adopting `workload-deploy.yml`.

The point isn't the YAML. It's that standards get applied once, in the platform, instead of being remembered in every repo. That's what lets a small platform team keep many services consistent.
