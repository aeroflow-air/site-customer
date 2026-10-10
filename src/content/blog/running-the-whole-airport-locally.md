---
title: "Running a whole airport on my laptop, for £0"
description: "How AeroFlow's full local stack (Service Bus emulator, Keycloak, two real services and six placeholders) starts with one .NET Aspire command, the snags I hit getting it running on Linux and Windows, and the trade-offs behind it."
pubDate: 2026-10-10
author: Tony Joanes
tags:
  - platform-engineering
  - dotnet
  - aspire
  - local-development
  - adr
---

AeroFlow Air is my fictional airline platform. I use it to show Azure-native platform engineering in C# and .NET, built in public. Until this week, every service ran on its own. If you wanted to see two of them talk to each other, you had to start things by hand and wire up connection strings yourself.

On 10 October 2026 I ran the whole airport on my own Windows machine with one command. This post covers how it fits together, what broke on the way, and why I chose to do it this way.

<!--
TODO (Tony): add the Aspire dashboard screenshot at
public/images/engineering/running-the-whole-airport-locally/aspire-dashboard.png
then uncomment the line below.

![The Aspire dashboard with every AeroFlow resource Running](/site-customer/images/engineering/running-the-whole-airport-locally/aspire-dashboard.png)
-->

## The rule: zero Azure cost

AeroFlow is a portfolio, not a funded product, so the rule is simple: running it locally must not cost anything. That rule drove most of the decisions below.

Two decision records set it up. [ADR-0013](https://github.com/aeroflow-air/platform-handbook/blob/main/docs/decisions/0013-central-event-bus.md) chose Azure Service Bus topics as the event bus, but locally I only use the Service Bus emulator, so there's no namespace to pay for. [ADR-0014](https://github.com/aeroflow-air/platform-handbook/blob/main/docs/decisions/0014-aspire-local-development.md) chose .NET Aspire as the local orchestrator. Writing those down first meant that when something got awkward later, I had a reason to point at rather than a vague memory of why.

## What one command starts

The new repo, [aeroflow-local](https://github.com/aeroflow-air/aeroflow-local), holds a .NET Aspire 9.5.2 AppHost. Running it starts:

- the **Service Bus emulator** with a `flight-events` topic, plus the SQL Server container the emulator needs
- **Keycloak** as a free local stand-in for identity
- the two real services, **svc-gate-allocation** and **svc-flight-status**, pulled in as sibling project references
- six **placeholder** services: baggage reclaim, turnaround, cleaning, catering, pushback and terminal
- an **ops dashboard** placeholder

The placeholders are deliberately tiny APIs that only answer health checks. They're there so the dashboard shows the whole airport and the wiring to messaging and identity is already in place. Each one gets swapped for a real service when its repo exists.

To try it yourself (you need the .NET 8 SDK, Git and a running Docker):

```bash
gh repo clone aeroflow-air/aeroflow-local
gh repo clone aeroflow-air/svc-gate-allocation
gh repo clone aeroflow-air/svc-flight-status
cd aeroflow-local
dotnet build AeroFlow.Local.sln
cd src/AeroFlow.Local.AppHost
dotnet run --launch-profile http
```

The first run pulls three images (servicebus-emulator 1.1.2, mssql 2022 and keycloak 26.3), so give it a few minutes.

Here's a trimmed version of the AppHost. It's short, which is the point:

```csharp
var builder = DistributedApplication.CreateBuilder(args);

// Event bus: Service Bus emulator only (zero Azure cost, ADR-0013)
var serviceBus = builder.AddAzureServiceBus("messaging").RunAsEmulator();
serviceBus.AddServiceBusTopic("flight-events");

// Identity stand-in: Keycloak, free and real OIDC
var keycloak = builder.AddKeycloak("identity", port: 8080);

// Real service from a sibling repo
builder.AddProject<Projects.AeroFlow_FlightStatus>("svc-flight-status")
    .WithEndpoint("http", e => e.Port = null) // let Aspire pick a free port
    .WithReference(serviceBus)
    .WithReference(keycloak)
    .WaitFor(serviceBus);

// ...gate allocation, six placeholders and the ops dashboard follow the same shape

builder.Build().Run();
```

## The gotchas

It didn't work first time. The first run on a Linux box took five attempts, and each failure taught me something.

1. **Aspire wants HTTPS.** With the plain `http` launch profile, the dashboard refuses to start unless `ASPIRE_ALLOW_UNSECURED_TRANSPORT` is set. Fine for a local stack, but it needs to be explicit.
2. **Everyone wanted port 5000.** The placeholders all fell back to Kestrel's default port and fought over it.
3. **8080 clashed with Keycloak.** The real services' launch settings pinned them to 8080, which is also Keycloak's port. Rather than edit the service repos for a local concern, the AppHost clears the host port and lets Aspire assign one (the `e.Port = null` line above).
4. **Docker networking on Linux.** A Docker bridge `FORWARD DROP` iptables rule stopped the emulator reaching SQL Server. That one took the longest to find.

All four are fixed in [aeroflow-local #3](https://github.com/aeroflow-air/aeroflow-local/pull/3).

Then I tried it at home on Windows with Docker Desktop, and hit two more:

5. **A leftover `DOCKER_HOST`.** Every container showed "Runtime unhealthy" with no start time. The logs showed Docker being looked for at `tcp://localhost:2375`, because of an old `DOCKER_HOST` setting. Docker Desktop on Windows uses a named pipe, so clearing that variable fixed it.
6. **Messaging "Running (Unhealthy)".** On first start the emulator waits for SQL Server, which takes a few minutes. That's normal, and it went healthy on its own.

After that, everything was Running. Both Windows notes went into the README's troubleshooting section in [aeroflow-local #4](https://github.com/aeroflow-air/aeroflow-local/pull/4), so the next person doesn't lose an evening to them.

## Making it move: a flight simulator

A healthy dashboard is nice, but nothing was happening. So the next piece, still a draft in [aeroflow-local #5](https://github.com/aeroflow-air/aeroflow-local/pull/5), is a flight simulator. A background worker publishes flight lifecycle events (scheduled, boarding, departed, landed, delayed) to the `flight-events` topic from a seeded random generator, so every run produces the same traffic, which is handy for demos.

In a verification run, the first event arrived about 40 seconds after start. After about two minutes, 45 events had been published and all six placeholders had received all 45. In the Aspire dashboard's Traces view you can follow a single event from the simulator out to every service.

To be clear about what isn't done: the real services don't subscribe to these events yet. That's the next job.

## API docs while I was there

The same day, I added API docs to both real services using OpenAPI and Scalar: the spec at `/openapi/v1.json` and a browsable UI at `/scalar` ([svc-flight-status #7](https://github.com/aeroflow-air/svc-flight-status/pull/7), [svc-gate-allocation #5](https://github.com/aeroflow-air/svc-gate-allocation/pull/5)). Since that's now a standard every HTTP service should follow, it's written up as ADR-0015 in [platform-handbook #57](https://github.com/aeroflow-air/platform-handbook/pull/57).

## The trade-offs

A few honest ones:

- **Emulator, not the real thing.** The Service Bus emulator costs nothing, but it isn't Azure. Some behaviour, quotas and authentication will differ, so local success doesn't prove production works.
- **Keycloak, not Entra ID.** Keycloak gives me real OIDC for free, so services validate tokens the way they will later. It's still a stand-in, and the switch will need testing.
- **Placeholders can mislead.** Six services that only answer health checks make the dashboard look more finished than the platform is. I kept them because the wiring is real and it shows where things are going, but I'd rather say so here than let a screenshot oversell it.
- **Sibling repos.** Project references to sibling folders mean you clone three repos side by side. It's a bit clunky, but it keeps each service in its own repo with its own CI, which matters more.
- **Docker is a hard dependency.** On a locked-down work laptop that might be the end of the road, so it's worth checking before you start.

## What's next

- Make the real services react to flight events.
- Build a live airport dashboard: departures, gates, baggage and turnaround, fed by the same events.
- Build the workload manifest generator from [ADR-0009](https://github.com/aeroflow-air/platform-handbook/blob/main/docs/decisions/0009-workload-manifest.md). Each service declares what it needs in a `workload.yaml`, and the platform builds the infrastructure. It's similar in spirit to Kratix Promises and Score, and it's the part of AeroFlow I'm most looking forward to.

The whole airport now runs on a laptop, for nothing, from one command. Most of the effort went into the snags rather than the code, and that's worth knowing before you plan something similar.
