---
title: Installer Verification (For Dev only)
description: Verify KiwiPanel software installers across Debian, Ubuntu, AlmaLinux, and Rocky Linux with Docker systemd containers and real VPS acceptance.
---

# Installer Verification (For Dev only)

KiwiPanel installs and configures system software through real Linux package managers and systemd. Unit tests and mocked shell tests are useful, but they cannot prove that:

- a package repository is reachable and correctly signed;
- a package exists for a particular distribution and architecture;
- systemd can manage the installed service;
- generated configuration is accepted by the installed software;
- credentials and data survive an interrupted installation or rerun.

KiwiPanel therefore verifies installers in layers, from fast static checks to full container matrices and representative real-VPS tests.

::: info Current coverage
Automated systemd-container verification currently covers **MariaDB** and **OpenLiteSpeed** on Debian, Ubuntu, AlmaLinux, and Rocky Linux.
:::

## Quick Start

Run a focused check while developing:

```bash
make install-verify COMPONENT=mariadb IMAGE=debian:12
make install-verify COMPONENT=openlitespeed IMAGE=debian:13
make install-verify COMPONENT=openlitespeed IMAGE=almalinux:9
```

Run a complete component matrix before merging installer changes:

```bash
make install-verify COMPONENT=mariadb
make install-verify COMPONENT=openlitespeed
```

Run both complete matrices before a release:

```bash
make install-verify COMPONENT=all
```

Because `all` is the default, this is equivalent:

```bash
make install-verify
```

::: warning Docker required
Installer verification starts privileged containers with systemd as PID 1. A working Docker installation is required.
:::

## Verification Levels

No single test environment covers every installer failure mode. Use all applicable levels.

### 1. Static Validation

Run static checks before starting containers:

```bash
bash -n kiwipanel/scripts/mariadb
bash -n kiwipanel/scripts/mariadb-platform
bash -n kiwipanel/scripts/lsws
bash -n .github/scripts/mariadb-systemd-container-test
bash -n .github/scripts/openlitespeed-systemd-container-test
git diff --check
```

Static validation should also confirm that:

- required harnesses are executable and tracked by Git;
- Makefile dispatch changes produce the expected commands with a dry run;
- component-specific unit, mock, and contract tests pass.

Static checks are fast, but they do not contact repositories, install packages, or exercise systemd.

### 2. Focused Container Verification

During development, test one component on one representative image. This is the recommended feedback loop after changing an installer.

| Change being tested | Recommended image |
|---|---|
| APT or Debian-family behavior | `debian:12` or `debian:13` |
| Ubuntu-specific behavior | `ubuntu:22.04` or `ubuntu:24.04` |
| DNF/RPM or EL9 behavior | `almalinux:9` or `rockylinux:9` |
| EL10 behavior | `almalinux:10` |

Examples:

```bash
# Fast MariaDB check
make install-verify COMPONENT=mariadb IMAGE=ubuntu:24.04

# Fast OpenLiteSpeed APT check
make install-verify COMPONENT=openlitespeed IMAGE=debian:13

# Fast OpenLiteSpeed DNF check
make install-verify COMPONENT=openlitespeed IMAGE=rockylinux:9
```

Focused runs avoid the time and bandwidth required by a complete matrix while still exercising a real package manager and systemd environment.

### 3. Full Component Matrix

Omit `IMAGE` to run every configured image for one component:

```bash
make install-verify COMPONENT=mariadb
make install-verify COMPONENT=openlitespeed
```

The current matrix contains:

| Family | Images |
|---|---|
| Debian | `debian:12`, `debian:13` |
| Ubuntu | `ubuntu:22.04`, `ubuntu:24.04` |
| AlmaLinux | `almalinux:9`, `almalinux:10` |
| Rocky Linux | `rockylinux:9` |

MariaDB and OpenLiteSpeed have independent matrix variables. They can diverge if an upstream package stops supporting a distribution.

### 4. Full Installer Matrix

Use the combined matrix when changing shared installation behavior or preparing a release:

```bash
make install-verify COMPONENT=all
```

This runs MariaDB and OpenLiteSpeed sequentially across their configured images.

::: tip Why sequential execution?
Sequential execution keeps logs deterministic and avoids excessive CPU, memory, disk, and network pressure. Use a focused `IMAGE` during development when you need faster feedback.
:::

### 5. Real VPS Verification

Privileged systemd containers are higher fidelity than mocks, but they are not virtual machines. Use a disposable VPS for high-impact changes involving:

- repository definitions or signing keys;
- package selection or architecture detection;
- systemd service startup;
- configuration publication;
- interruption recovery;
- persistent data or credentials.

A real-VPS test should include:

1. A fresh installation from the exact candidate commit or release artifact.
2. Repository trust and package-provenance verification.
3. Service status and application-level readiness.
4. An installer rerun to prove idempotency.
5. A service restart and, where practical, a server reboot.
6. Confirmation that credentials and existing application data remain unchanged.
7. Review of installer and systemd logs for warnings or false-success messages.

::: danger Container tests are not VPS certification
Containers do not validate provider-specific images, VM boot behavior, reboot persistence, kernel-level behavior, or package-manager recovery at the virtual-machine boundary.
:::

## Command Reference

The public local interface is:

```bash
make install-verify COMPONENT=<component> [IMAGE=<container-image>]
```

### Components

| Value | Behavior |
|---|---|
| `mariadb` | Runs MariaDB installer acceptance |
| `openlitespeed` | Runs OpenLiteSpeed repository acceptance |
| `all` | Runs both component matrices |

### Parameters

| Parameter | Required | Default | Description |
|---|---:|---|---|
| `COMPONENT` | No | `all` | Component to verify |
| `IMAGE` | No | Full component matrix | Restricts verification to one container image |

Invalid component names fail immediately with exit status `2`. The command also fails early if Docker is unavailable.

## How the Harnesses Work

The component harnesses are:

- `.github/scripts/mariadb-systemd-container-test`
- `.github/scripts/openlitespeed-systemd-container-test`

Each harness:

1. Accepts exactly one allowlisted image.
2. Builds a small image with systemd and package-manager prerequisites.
3. Starts a privileged container with cgroup access and systemd as PID 1.
4. Waits for systemd to report `running` or `degraded`.
5. Mounts the repository read-only at `/workspace`.
6. Copies the production helper into `/opt/kiwipanel/scripts`.
7. Invokes production functions rather than duplicating installation logic.
8. Verifies component-specific postconditions.
9. Removes its temporary container, image, and build context on exit.

The repository is mounted read-only so installer code running inside a container cannot mutate the local working tree.

## MariaDB Acceptance Contract

MariaDB verification covers more than package installation because MariaDB owns persistent data and credentials.

The harness requires:

- fresh production convergence;
- final Bash installer state `complete`;
- generated server and application credentials;
- secret ownership and mode exactly `root:root:0600`;
- a simulated interrupted state followed by a production rerun;
- unchanged credentials across rerun;
- successful restart of the real systemd service;
- credentialed health checks;
- parser validation of generated configuration with the installed server executable;
- absence of deprecated or unsupported directives.

::: warning Package installation is not enough
A MariaDB test must fail if it proves only that packages were installed. Service readiness, configuration validity, credential preservation, and safe reruns are part of the installation contract.
:::

## OpenLiteSpeed Acceptance Contract

OpenLiteSpeed verification currently focuses on repository correctness and idempotency for APT and DNF systems.

### Debian and Ubuntu

The harness requires:

- repository setup under restrictive `umask 077`;
- LiteSpeed source and keyring ownership/mode normalized to `root:root:0644`;
- both keyrings readable by the `_apt` sandbox user;
- the expected LiteSpeed signing fingerprint;
- successful `apt-get update`;
- an installable `openlitespeed` candidate;
- an idempotent second repository setup with the same package candidate.

::: details Why test with `umask 077`?
The upstream LiteSpeed repository helper inherits the caller's umask. With a restrictive root umask, it can create keyrings with mode `0600`. Root can read those files, but APT's unprivileged `_apt` user cannot.

APT then ignores the keyrings, reports a missing public key, and rejects the repository signature. The upstream helper may still print a success message. Testing under `umask 077` ensures KiwiPanel normalizes the files and verifies the repository independently.
:::

### AlmaLinux and Rocky Linux

The harness requires:

- a production DNF repository definition;
- the repository enabled with GPG verification active;
- a non-empty LiteSpeed GPG key file;
- an imported RPM public key;
- successful metadata refresh using only the LiteSpeed repository;
- an installable `openlitespeed` candidate;
- an idempotent second repository setup with the same candidate.

### Planned OpenLiteSpeed Expansion

Repository acceptance should eventually be supplemented with complete package and service acceptance:

- install the real OpenLiteSpeed package;
- verify expected binaries and package architecture;
- exercise production service guard and unguard behavior;
- validate generated OpenLiteSpeed configuration;
- start the detected systemd service;
- verify service activity, port 80, and an HTTP response;
- rerun installation and verify idempotency.

Repository checks should remain independently diagnosable so repository trust failures are not hidden by later package or service errors.

## Adding Another Component

When KiwiPanel starts installing another system component:

1. Define the installation contract: repository, packages, configuration, service, readiness, state, credentials, and rerun behavior.
2. List supported distribution/version combinations explicitly.
3. Create a dedicated systemd-container harness rather than coupling unrelated components.
4. Invoke the exact production helper functions from the harness.
5. Assert component-specific postconditions; do not stop at package-manager exit status.
6. Add an independent image-matrix variable to the Makefile.
7. Add the component to the `install-verify` dispatcher and help output.
8. Test one APT-family and one RPM-family image locally where applicable.
9. Run the complete component matrix before release.
10. Perform representative real-VPS acceptance for high-impact changes.

::: tip Check ignored files
If `.gitignore` covers a helper or harness directory, explicitly unignore new source files and confirm they appear in `git status --short`.
:::

## Investigating Installer Failures

Use this workflow when an installation fails:

1. Preserve the complete output and identify the first real failure, not only the final wrapper error.
2. Consider repository reachability, key presence, key validity, file permissions, package availability, architecture, service lifecycle, configuration, and false-success error propagation.
3. Narrow the hypotheses using read-only diagnostics.
4. Reproduce the issue in a focused container using the same distribution and production function.
5. Log owner, group, numeric mode, package candidate, key fingerprint, service state, and command exit status.
6. Confirm the diagnosis before changing production behavior.
7. Apply the smallest repair on a disposable or affected host and verify that only the suspected variable changed.
8. Convert the reproduction into a positive regression test.
9. Run a representative image first, then the complete matrix.

::: danger Never bypass repository security
Do not disable GPG verification, add insecure repository flags, suppress package-manager errors, or accept a package merely because an upstream helper printed a success message.
:::

## Interpreting Results

A passing container matrix means:

- repositories and package candidates were available at the time of the test;
- the production helper completed its asserted contract on those images;
- the tested architecture passed;
- defined rerun and idempotency checks passed.

A passing matrix does **not** mean:

- every cloud provider image behaves identically;
- kernel reboot behavior was tested;
- repository availability will remain unchanged;
- package-manager interruption was tested at the VM boundary;
- untested configuration or application workflows are correct.

Local Docker on Apple Silicon commonly exercises `arm64`. GitHub-hosted Linux runners commonly exercise `amd64`. Record the image, architecture, package candidate/version, date, exact commit, and environment—local Docker, CI, or VPS—when using results as release evidence.

## Release Checklist

Before releasing installer changes, confirm:

- [ ] Shell syntax checks pass.
- [ ] Unit, mock, and contract tests pass.
- [ ] `git diff --check` passes.
- [ ] New helpers and harnesses are tracked and executable.
- [ ] A focused representative container passes during development.
- [ ] The complete matrix for every affected component passes.
- [ ] Logs contain no generated passwords or secrets.
- [ ] Repository signature verification remains enabled.
- [ ] Package candidates and architectures are expected.
- [ ] Idempotent rerun checks pass.
- [ ] Service and application readiness checks pass where required.
- [ ] A representative disposable VPS passes for high-impact changes.
- [ ] Release artifacts contain the exact production helpers that were tested.

::: info Governing principle
Installation success means verified convergence to usable system state—not merely a zero exit code from a repository helper or package manager.
:::
