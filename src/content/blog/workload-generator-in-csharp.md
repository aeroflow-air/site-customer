---
title: "The workload generator, now in C#"
description: "Why AeroFlow now has a .NET 10 single-file C# port of the workload generator, how golden-file tests keep its Bicep identical to the Python original, and why Python is still the deploy default."
pubDate: 2026-11-12
author: Tony Joanes
tags:
  - platform-engineering
  - dotnet
  - bicep
  - github-actions
  - adr
---

In [Services declare, the platform builds](/site-customer/engineering/services-declare-the-platform-builds/) I described the contract: a service asks for infrastructure with a short `workload.yaml`, and a generator in CI turns that into Bicep built only from governed modules. That part has not changed. What has changed is the language the generator is written in.

The first generator was Python: `generate.py` in [aeroflow-workflows](https://github.com/aeroflow-air/aeroflow-workflows). That was a reasonable start. The same repo already validated the manifest schema with Python, and Python is already on GitHub-hosted runners, so there was no extra SDK and no build step. The people who write AeroFlow services, and who would change the generator, write C#. A Python-only tool in the middle of a C# platform is a tool fewer of us will happily open.

So on 31 October 2026 I ported it. The C# version landed on `main` on 12 November 2026, in [aeroflow-workflows #12](https://github.com/aeroflow-air/aeroflow-workflows/pull/12). The decision is recorded as [ADR-0021](https://github.com/aeroflow-air/platform-handbook/blob/main/docs/decisions/0021-csharp-workload-generator.md) (draft, in a handbook pull request).

## A single file, no project

`generate.cs` is a [.NET 10 file-based app](https://learn.microsoft.com/dotnet/core/sdk/file-based-apps): one `.cs` file, no `.csproj`. Its NuGet packages, YamlDotNet 18.1.0 and JsonSchema.Net 9.6.0, are declared with `#:package` directives at the top of the file. It needs the .NET 10 SDK, not just the runtime.

```bash
dotnet run generator/generate.cs -- --manifest ../svc-flight-status/workload.yaml --out-dir out --local-modules modules
```

The CLI is the same as the Python script: `--manifest` (default `workload.yaml`), `--out-dir`, and `--local-modules`. It uses the same schema file, the same rules (including ADR-0019 topic ownership), and the same output template. The generated Bicep still calls the `container-app-service` module, and it is still a build artifact, not a file committed to the service repo. [ADR-0009](https://github.com/aeroflow-air/platform-handbook/blob/main/docs/decisions/0009-workload-manifest.md) is unchanged.

If the file ever outgrows a comfortable size, `dotnet project convert generator/generate.cs` turns it into a normal project. We have not needed that.

## Byte-identical output, or CI fails

A port that almost matches would be a bad outcome. Two generators that drift would give services two slightly different compositions, and nobody would be sure which one was right.

The proof is the existing golden files in `tests/generator/golden/`. `tests/generator/run_csharp_golden.sh` runs the C# CLI for every golden case and requires the output to match **byte for byte**. It also checks that invalid schema fixtures and a set of rule violations exit 1 and write no `main.bicep`. Those checks run in the aeroflow-workflows self-test, in the same required `lint` job as the Python tests, with `actions/setup-dotnet` installing the 10.0.x SDK. Golden files are still refreshed from Python; the C# script only checks them.

The one deliberate difference is schema-error wording. That text comes from JsonSchema.Net rather than Python's `jsonschema`, so a message may read differently. The failing paths and the exit code stay the same.

## Python is still the default

We have not switched the deploy workflow. `workload-deploy.yml` still defaults to `python`. Callers can opt in:

```yaml
jobs:
  workload:
    uses: aeroflow-air/aeroflow-workflows/.github/workflows/workload-deploy.yml@<tag>
    with:
      workflows_ref: <tag>
      generator: csharp
```

The .NET 10 SDK is installed only when that input is set. Existing callers do not change.

The C# port is on `main` after #12. It is not in a tagged release yet. The latest tag is `v0.4.0`, from 18 October 2026, which predates the port. Callers pin tags, never `main`, so nothing changes for a service until a later tag is cut and that service moves its pin in its own pull request.

## The trade-offs

- **Runners need the .NET 10 SDK** when C# is selected, not only the runtime. The first `dotnet run` restores and builds (a few seconds); later runs reuse the SDK build cache. Python has no build step.
- **Two implementations means two schema stacks to keep in step.** YamlDotNet and JsonSchema.Net have to behave like PyYAML and `jsonschema` for the types the schema sees. The golden-file tests are there to catch drift. We still refresh goldens from Python.
- **We will have to choose.** ADR-0021 is explicit that a later decision will pick one default and retire the other, so there is one schema stack again. That switch is not made yet. I would rather watch the C# path stay green first than flip the default in the same change.

The contract for a service is still `workload.yaml`. The platform still builds the Bicep. The change is that the generator is now something a C# team can open, read and change, with a test that refuses any output that does not match what we already ship.
