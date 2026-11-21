---
title: "Opinionated observability on the golden path"
description: "Why every AeroFlow service now emits the same traces, metrics and structured logs by default, what teams still write themselves, and what is not done yet."
pubDate: 2026-11-21
author: Tony Joanes
tags:
  - platform-engineering
  - opentelemetry
  - dotnet
  - observability
  - adr
---

Observability is the part of a platform most teams bolt on after the first outage. Every service needs traces, metrics, structured logs and health checks, and if each squad wires those by hand you get many slightly different exporters, field names and log lines. Then you cannot follow one flight across services, because nobody agreed what that story looks like in the telemetry.

On AeroFlow I wanted the same principle we already use for infrastructure. In [Services declare, the platform builds](/site-customer/engineering/services-declare-the-platform-builds/) a service asks for infrastructure with a short `workload.yaml`, and the platform turns that into governed Bicep. Observability should work the same way: **a service declares what it is, and the platform makes it observable.** Squads do not wire exporters.

The decision is [ADR-0022](https://github.com/aeroflow-air/platform-handbook/blob/main/docs/decisions/0022-observability-on-the-golden-path.md) (still a draft in the handbook; new records start that way). The longer design is in [docs/design/observability.md](https://github.com/aeroflow-air/platform-handbook/blob/main/docs/design/observability.md). The first piece of it is now real: a shared package, `AeroFlow.ServiceDefaults` 0.1.0, lives in [template-dotnet-service](https://github.com/aeroflow-air/template-dotnet-service) and the template already calls it ([#21](https://github.com/aeroflow-air/template-dotnet-service/pull/21), [#23](https://github.com/aeroflow-air/template-dotnet-service/pull/23)).

## What the platform does

After `builder.AddServiceDefaults()`, the package emits OpenTelemetry traces, metrics and structured logs. Locally it exports OTLP when `OTEL_EXPORTER_OTLP_ENDPOINT` is set, which is how the Aspire dashboard receives them. If `APPLICATIONINSIGHTS_CONNECTION_STRING` is present, it exports to Azure Monitor. Squads do not write that wiring.

It also maps `/health` (readiness) and `/alive` (liveness) in every environment, and keeps those probes out of request logs and traces so they do not drown the dashboard.

The package writes the standard log lines itself, with fixed event ids and the same fields every time:

| Event id | Name | Level | When |
| --- | --- | --- | --- |
| 1000 | HttpRequestCompleted | Information | An HTTP request finished with a non-5xx status |
| 1001 | HttpRequestFailed | Warning | The request finished with a 5xx status |
| 1002 | HttpRequestUnhandled | Error | An unhandled exception escaped the pipeline |
| 2000 | MessagePublished | Information | A message was sent |
| 2001 | MessagePublishFailed | Error | Send failed |
| 2002 | MessageConsumed | Information | A message was handled |
| 2003 | MessageConsumeFailed | Error | Handling threw |
| 3000 | OperationFailed | Error | An unexpected failure at the edge |

HTTP request logs are automatic. Messaging and unexpected failures go through `IObservabilityLog`, which processors and publishers call at the edge. The lines use one category, `AeroFlow.ServiceDefaults`. Platform event ids are reserved below 10,000.

Every platform line carries the same fields: `service.name`, `service.version`, `deployment.environment`, `aeroflow.squad`, and the current `trace.id` when there is one. `flight.id` is included when the edge has it, from an `X-Flight-Id` header, activity baggage, or a value passed into `IObservabilityLog`. Flight id is an operational identifier, not personal data. It belongs on traces and logs, never as a metric dimension. Logs and attributes never contain personal data, secrets, tokens or connection strings.

A squad fills in a few settings, usually in `appsettings.json`:

```json
{
  "Observability": {
    "ServiceName": "template-dotnet-service",
    "ServiceVersion": "0.1.0",
    "Environment": "local",
    "Squad": "platform"
  }
}
```

All four are optional, but `Squad` should be set. If it is missing the field is still present, with the fallback `unknown`.

## What teams do

A new service made from the template gets all of the above without writing any telemetry code. A team then does four things:

1. Set `Observability:Squad`, and the service name and version if the defaults are not enough.
2. Log their own business events with source-generated `[LoggerMessage]` methods, using event ids from 10,000 upwards.
3. List those events in the service docs, next to the failure modes they already have to document.
4. Keep the contract test passing. The template already includes one.

They do not wire exporters, write the standard request lines, or add the required fields by hand. Domain code stays silent, as [ADR-0004](https://github.com/aeroflow-air/platform-handbook/blob/main/docs/decisions/0004-functional-style-csharp.md) already required: no `ILogger`, no `Console`, no `Activity` in `Domain`. If a domain decision needs to be visible, the edge logs it after it has a result.

A business event looks like this, which is the example already in the template:

```csharp
using Microsoft.Extensions.Logging;

namespace AeroFlow.ServiceTemplate;

internal static partial class BookingLog
{
    [LoggerMessage(
        EventId = 10_000,
        Level = LogLevel.Information,
        Message = "Booking {BookingId} confirmed on flight {FlightNumber}")]
    public static partial void BookingConfirmed(ILogger logger, string bookingId, string flightNumber);

    [LoggerMessage(
        EventId = 10_001,
        Level = LogLevel.Information,
        Message = "Booking {BookingId} was not found")]
    public static partial void BookingNotFound(ILogger logger, string bookingId);
}
```

The build fails if someone uses a free-text `ILogger.Log*` call (CA1848), a non-constant message template (CA2254), or `Console` / `Debug.WriteLine` (RS0030, via BannedApiAnalyzers). A test helper in `AeroFlow.ServiceDefaults.Testing` (`LogCollector` and `ObservabilityLogAssertions`) boots the service, captures what it logs, and checks the required fields are present:

```csharp
host.Logs
    .RequireHttpRequest("GET", "/ping", 200)
    .RequireRequiredFields(host.Resource)
    .RequireFlightId("AF204");
```

## Seeing it locally

Point `OTEL_EXPORTER_OTLP_ENDPOINT` at the Aspire dashboard and you can already inspect what the package emits. Under Traces you see requests and the spans the OpenTelemetry SDK creates. Under Structured logs you see the standard lines and any business events, with the same fields, so you can filter by `flight.id` or squad. Metrics shows the HTTP rate, errors and latency the instrumentation already records.

You can see that today by running the template service. You will not yet see it for the live airport in the AppHost, and you will not yet see one flight as a single trace from the simulator through gate allocation to baggage reclaim. That needs the next steps.

## What is not done yet

I would rather be precise than imply the whole design has landed.

- **The three live services are not on the package yet.** Flight status, gate allocation and baggage reclaim are being rolled over separately. Until those pull requests merge, the Aspire dashboard for the running airport will not show these standard lines.
- **One flight is not yet one trace.** [ADR-0013](https://github.com/aeroflow-air/platform-handbook/blob/main/docs/decisions/0013-central-event-bus.md) already requires W3C `traceparent` / `tracestate` on every Service Bus message, including delayed sends from the outbox. Publishers today set `MessageId`, `Subject` and `CorrelationId` (the flight id) but do not restore or emit that trace context. That is the next follow-up, and it is the change that makes the demo much stronger.
- **Consumer signals are not in the package yet.** The design calls for queue depth, message age and dead-letter count. Today the package logs publish and consume at the edge, through `IObservabilityLog`. The metrics themselves come later.
- **There is no shared library repo or package feed yet.** Version 0.1.0 lives in the template repository, and other repos will take it as a project reference until a `lib-service-defaults` repo publishes to GitHub Packages.
- **SLOs in `workload.yaml` are agreed in shape only.** An optional `observability.slos` block will later be turned into Azure Monitor alerts and a standard workbook by the generator. Observability itself stays always on: it is not a capability a service can forget to request. The schema and the generator have not changed. There is no Azure deployment and no personal subscription, so Application Insights is the target shape, not something we have provisioned.

ADR-0022 also leaves sampling and daily caps as platform defaults, not a per-service choice. Locally, traces are not sampled, because a dashboard that hides the flight you are watching is useless.

The package docs, including the full event catalogue, are in [docs/service-defaults.md](https://github.com/aeroflow-air/template-dotnet-service/blob/main/docs/service-defaults.md).

The point is the same as the workload manifest. Standards get applied once, in the platform, instead of being remembered in every repo. Teams still write the logs that are specific to their domain. Everything else is already there.
