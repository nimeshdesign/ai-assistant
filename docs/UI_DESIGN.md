# UI design

Calm, dense, keyboard-friendly — in the spirit of Linear and Raycast. Neutral zinc surfaces, **one violet accent**, colour used only for meaning (status, scores, recording).

## Design tokens

Defined as CSS variables in [`apps/client/src/index.css`](../apps/client/src/index.css) and exposed to Tailwind via `@theme inline`. Dark mode flips the `.dark` class on `<html>` (Light / Dark / System, persisted, applied before first paint).

| Token | Use |
|---|---|
| `background`, `card`, `popover`, `sidebar` | Surfaces (4 elevation steps) |
| `foreground`, `muted-foreground` | Primary / secondary text |
| `primary` (violet) | Primary actions, active nav, focus ring |
| `accent` | Hover / selected backgrounds |
| `success` / `warning` / `destructive` | Fills and bars for scores ≥ 75 / 50–74 / < 50, API status, errors |
| `success-text` / `warning-text` / `destructive-text` | Status-coloured **text** (badges, big scores). Darker in light mode; measured ≥ 5.2:1 on cards and badge tints in both themes |
| `recording` (red) | **Reserved** for live capture & microphone indicators |
| `border`, `input`, `ring` | Hairlines, inputs, focus |

- **Type:** Inter (UI), JetBrains Mono (code, scores). Scale: 12 / 14 (body) / 16 / 20 / 24 (page title).
- **Radius:** 10 px base (cards 14 px, controls 8 px). **Spacing:** 4 px grid, page padding 24–32 px.
- **Motion:** 150–200 ms ease-out for hover, collapse, panel expand. `prefers-reduced-motion` turns off chart and pulse animations.
- **Charts:** one measure per chart (never dual-axis). Single series use `primary` with no legend. Every chart has a hover tooltip and a visually hidden data table. Score bars always print the number, so colour is never the only signal.
- **Components:** shadcn/ui (Radix + Tailwind), Lucide icons, Recharts for charts (Phase 2).

## App shell

```
┌────────────┬──────────────────────────────────────────────────────────┐
│ ◆ Interview│  Dashboard                          ● API online   ☀ ▾   │  ← topbar 56px, sticky, blurred
│   AI       ├──────────────────────────────────────────────────────────┤
│            │                                                          │
│ ▣ Dashboard│   Page title                                [Actions]    │
│ PREPARE    │   description                                            │
│ ▢ Practice │                                                          │
│ ▢ Mock     │   content (max-width 1280px)                             │
│ ASSIST     │                                                          │
│ ▢ Screen   │                                                          │
│ ▢ Voice    │                                                          │
│ LIBRARY    │                                                          │
│ ▢ History  │                                                          │
│ ▢ Settings │                                                          │
│ « Collapse │                                                          │
└────────────┴──────────────────────────────────────────────────────────┘
 240px / 64px collapsed · off-canvas drawer below md (768px)
```

## Key screens

### Dashboard (Phase 2)
```
[ Questions practised ] [ Mock interviews ] [ Skills score ] [ Streak ]     ← stat tiles, 4-up → 2-up → 1-up
┌──────── Learning progress (line, 8 weeks) ───────┐ ┌── Weak topics ──────┐
│                                                   │ │ Redux      ▓▓▓░ 48  │
│                                                   │ │ SQL joins  ▓▓▓▓░ 55 │
└───────────────────────────────────────────────────┘ └─────────────────────┘
┌──────── Recent sessions (table) ─────────────────┐ ┌── Recommended ──────┐
│ Mock · Frontend · 78 · 2h ago            View →   │ │ • useMemo vs useCb… │
└───────────────────────────────────────────────────┘ └─────────────────────┘
```

### Answer card (Phase 5, reused everywhere)
```
┌ Q: What is a closure in JavaScript?                     [Short|Normal|Detailed] ┐
│ Direct answer        A closure is a function that remembers…                    │
│ Simple explanation   …                                                          │
│ Real-world example   …                                                          │
│ Code                 ┌ js ───────────────────────────── [Copy] ┐                │
│                      └──────────────────────────────────────────┘               │
│ ★ Interview-ready    "So basically, a closure is…"          [Copy] [▶ Speak]   │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Floating assistant (Phase 8, Electron — route `/desktop`)
```
 collapsed:  ( ◆ )  ← 72px window; the ring drags it, the button opens the panel; red ring while capturing

 expanded (440×720, min 360×480, resizable, always-on-top by default, header drags the window):
┌ ◆ Interview AI   ● Screen  ● Mic        📌  ⤡  👁̸ ┐   ← capture indicators · Keep on top · Collapse · Hide to tray
│ [ Screen | Voice | Ask ]                           │
├────────────────────────────────────────────────────┤
│ Screen: [▶ Start reading screen] [⏸ Pause] [■ Stop] │
│         preview · status ("Watching for questions…")│
│         latest detected question → compact answer   │
│ Voice:  mic button + level ring → answer card       │
│ Ask:    type a question → answer card               │
└────────────────────────────────────────────────────┘

 "Choose what to share" dialog: Screens / Windows thumbnails (listboxes); Share disabled until one is selected.
```
In a normal browser the same route works as a preview (a notice says so, and there is no tray button). The window is never hidden from screen sharing.

### Mock interview (Phase 9)
Routes: `/mock-interview` (setup), `/mock-interview/:id` (room) and `/mock-interview/:id/report`; `/mock-interview/report` opens the latest report. Three-step setup (role → level → focus/length), with a "You have an unfinished interview: Resume / Discard" banner and a **Past interviews** list (score, Report link, delete with confirmation) below. The room is a single-question focus view with a progress bar, text box plus mic toggle, Skip and "Submit answer". Feedback appears in place: overall score, five criterion bars, what went well, how to improve and an "Improved answer", then "Next question" (or "See report" after the last one). The report shows the overall score with a plain-language summary, the five criteria (confidence explained as answer and speech patterns only), strengths, areas to improve with weak topics, a per-question breakdown, speech patterns for spoken answers, and JSON export.

## States & accessibility
- Every data view has **skeleton**, **empty** (with a next action), and **error** (with retry) states.
- AA contrast in both themes; visible focus rings; skip-to-content link; `aria-live` on API status and on newly generated answers.
- Every action is reachable by keyboard. `⌘/Ctrl K` opens the command palette (pages, practice topics, theme). Practice sessions support `←`/`→` and `R` to reveal.
