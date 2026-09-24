# DESIGN DIRECTION

## Concept

"the owner's digital oasis and homebase."

Private command center.

Batcave rather than SaaS analytics.

## Tone

- calm
- technical
- precise
- compact
- purposeful

## Avoid

- huge cards
- excessive rounded corners
- oversized charts
- rainbow status colors
- decorative gradients
- generic inspirational text
- too much empty space
- every feed item having equal visual weight

## Use

- thin separators
- tight grid
- monospace telemetry
- readable sans-serif body copy
- muted neutral palette
- state colors only where meaningful
- subtle sparklines
- compact timestamps
- keyboard-friendly navigation

## Suggested nav

```text
HOME
LAB
SECURITY
CAREER
GAMES
FAMILY
SYSTEM
```

## Home sections

1. Attention
2. Today
3. Status strip
4. Focus
5. Recent changes

## Example status strip

```text
LAB 97% | SECURITY 2 | CAREER 4 | FAMILY OK | GAMES PATCH
```

## Interaction model

Clicking summary items should open detailed context.

Example:

Home:

> Docker VM disk usage crossed 75%

Click:

> Lab -> Storage -> trend -> affected filesystem -> last 7 days

## Final style and readability pass

After the core HOMEBASE infrastructure and service connections are complete and
stable, review the entire interface as one product. Use real operational data and
realistic empty, loading, stale, warning, and failure states during this pass.

Focus on:

- visual hierarchy and information density
- typography, contrast, spacing, and scanability
- consistent labels, status language, and timestamps
- responsive behavior across desktop, tablet, and phone
- keyboard navigation and accessibility
- removing visual noise and repeated or low-value information

Keep this as a dedicated final design pass so individual integration work does not
produce isolated styling decisions or premature polish.
