# AI-assisted product development

Homebase was built through iterative human direction and AI-assisted implementation. The owner set the product goals, chose the domains, defined the architecture and interface constraints, reviewed behavior, and validated releases in a private environment. AI helped turn those decisions into code, tests, integration adapters, and UI iterations.

The central product prompt was: **what deserves attention today?** That question guided a cross-domain Attention engine instead of a collection of unrelated status cards. Each major workspace was developed in stages: define useful decisions, normalize source data, expose a stable API, design loading and failure states, then verify the UI against realistic scenarios.

Several design choices came out of that cycle:

- The browser is an API client, so provider credentials and normalization stay on the server.
- Collectors share a contract but fail independently; stale data remains visible with its age and source.
- Security matches distinguish confirmed inventory from possible exposure.
- Career results separate skill match from career value and disclose estimated compensation.
- The web interface uses concise summaries and expandable detail to avoid turning the dashboard into a wall of telemetry.

AI output was reviewed through code changes, automated checks, and hands-on use. The repository captures the resulting product and engineering decisions, rather than raw private prompts or deployment logs.
