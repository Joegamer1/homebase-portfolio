# Attention engine

The attention engine ranks items from different parts of Homebase in one list.

## Initial scoring model

Use a simple deterministic score before considering ML or LLMs.

Suggested normalized dimensions:

- urgency: 0–100
- relevance: 0–100
- consequence: 0–100
- recency: 0–100
- confidence: 0–100

Initial weighted score:

```text
score =
  urgency     * 0.30 +
  relevance   * 0.30 +
  consequence * 0.20 +
  recency     * 0.10 +
  confidence  * 0.10
```

The initial weights are fixed. Configurable weights are planned.

## Domain-specific examples

### Career

High:

- excellent role match
- newly posted
- deadline approaching
- meaningful career advancement

Low:

- vague recruiter blast
- poor level fit
- commute mismatch
- help-desk regression

### Security

High:

- installed technology affected
- actively exploited
- internet-facing component
- patch available

Low:

- unrelated product
- speculative issue
- ancient unsupported version that is not present

### Lab

High:

- backup failed
- service down
- disk nearly full
- SMART issue
- repeated container restart

Low:

- normal CPU fluctuation
- harmless telemetry change

### Games

High:

- tracked champion/hero changed
- major item/build impact
- ranked system change

Low:

- cosmetic news
- unrelated character change

### Family

High:

- near-term appointment
- forgotten commitment risk
- urgent household issue

Low:

- passive information with no action

## Dedupe

Do not create repeated attention items for the same ongoing condition.

Use a fingerprint derived from:

- source
- entity
- event type
- stable identifier

Update the existing item's `lastSeen`.

## Lifecycle

```text
new -> acknowledged -> resolved
             |
             -> dismissed
```

Later add snooze.

## Explainability

Every score should produce short text:

> Backup failed on a monitored VM; check the task log.

Show which inputs contributed to the score.
