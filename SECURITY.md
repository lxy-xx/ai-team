# Security Policy

AI Team Agent can execute local tools and may store provider, channel, and agent runtime configuration on disk. Treat local deployments as trusted development environments unless you have explicitly hardened them.

## Supported Versions

Security fixes currently target the `main` branch.

## Reporting a Vulnerability

Please do not open a public issue for a vulnerability.

Use GitHub private vulnerability reporting if it is enabled for this repository. If it is not enabled yet, open a minimal public issue asking for a private contact path without including exploit details, secrets, customer data, or reproduction payloads.

Helpful details include:

- A short description of the impact.
- A minimal reproduction path.
- Affected commit or version.
- Whether the issue involves local tool execution, provider configuration, channel credentials, dashboard access, or runtime data persistence.

## Local Secret Handling

Do not commit:

- `.env` files
- `data/`
- provider secrets or health files
- channel credential files
- agent traces containing customer data
- local project workspaces

Before publishing archives outside git, remove ignored runtime directories from the copied folder.
