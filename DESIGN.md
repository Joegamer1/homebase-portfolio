# Interface design

I wanted Homebase to be easy to check during the day. The home screen puts the attention list and today's events first, with service status and recent changes nearby. Each section has its own page for details.

## Layout and type

I use a compact grid, thin separators, and small timestamps to fit useful information on screen. Body text uses a readable sans-serif font; telemetry and short technical labels use monospace. Color is reserved mostly for state: warnings, failures, and selected controls.

Large cards, oversized charts, decorative gradients, and repeated summaries make the page harder to scan. Feed items should get space according to their importance.

## Navigation

```text
HOME
LAB
SECURITY
CAREER
GAMES
FAMILY
SYSTEM
```

The home screen groups Attention, Today, status, Focus, and recent changes. A summary should lead to the relevant detail. For example, a disk warning should open the affected system and explain which storage is filling up.

## Review checklist

When reviewing a page, I check:

- Can I find the most urgent item quickly?
- Are labels, timestamps, and status colors consistent?
- Does it explain loading, empty, stale, and failed states?
- Is the text readable on a phone as well as a desktop?
- Can I use the controls with a keyboard?
- Is any information repeated without a reason?

The integration pages need to work together, so I also review the whole interface after adding a new source.
