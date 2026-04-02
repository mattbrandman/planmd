# Floating Comment Composer

## Overview

The floating comment composer is a panel that appears to the right of content when a user clicks a section heading, text block, or line number to add a comment. It replaces the previous sidebar-based composers for section and line comments, keeping the comment form visually anchored to the content being discussed.

## Why Not Radix Popover

The original implementation used Radix UI's `Popover` component. This caused a critical bug: **the popover would not open on real browser clicks in Rendered mode**.

### Root cause

Radix Popover's `DismissableLayer` uses `pointerdown` event capture on `document` for click-outside detection. The comment "triggers" (section heading buttons, block wrappers, line gutter buttons) are scattered across the DOM and are NOT `Popover.Trigger` components. When a user clicks one of these triggers:

1. `pointerdown` fires on the trigger element
2. Radix's handler sees it as "outside the popover" and calls `onOpenChange(false)`
3. The trigger's `click` handler fires and sets state to open the popover
4. Radix's close wins the race, immediately closing it

Programmatic `.click()` calls (which skip `pointerdown`) worked fine, making the bug hard to catch in JS-driven tests but broken for actual users.

This is a well-documented Radix limitation (radix-ui/primitives#2782, #3320). The recommended workarounds (`onPointerDownOutside` + `preventDefault`, `requestAnimationFrame` delays) are fragile timing hacks.

### Additional constraint

`.plan-content-card` has `overflow: hidden` (for the decorative accent strip pseudo-element). An absolutely-positioned composer inside the `<article>` would be clipped. The composer must escape the article's overflow context.

## Current Implementation

### Architecture

```
<div ref={wrapperRef} className="relative">        <!-- positioning context -->
  <article className="plan-content-card overflow-hidden">
    {content}                                       <!-- rendered markdown or source view -->
  </article>

  {composerOpen && (
    <div ref={composerRef}                          <!-- absolutely positioned composer -->
         className="floating-composer absolute left-full ml-5 w-80 z-50"
         style={{ top: composerTop }}>
      <FloatingComposer /> or <SectionComposer />
    </div>
  )}
</div>
```

A wrapper `<div>` around the article provides `position: relative` without `overflow: hidden`. The composer is an absolutely-positioned sibling of the article, placed at `left: 100%` (right edge of the article) with a margin gap. It overlaps the sidebar column — same visual behavior as the old Radix Portal.

### Position calculation

When a trigger is clicked, `positionComposerAt()` computes the vertical offset:

```
composerTop = targetRect.top - wrapperRect.top
```

Both the target element and the wrapper are in the same page flow, so this value is stable regardless of scroll position. No scroll listeners are needed.

`positionComposerAt` accepts either a CSS selector string (resolved inside `articleRef`) or a DOM `Element` directly. This is necessary because:
- **Source mode**: line elements have `data-line` attributes, so a selector like `[data-line="42"]` works
- **Rendered mode**: blocks don't have line-number attributes in the DOM, so `BlockCommentWrapper` passes `event.currentTarget` directly

### Dismiss behavior

Two `useEffect` hooks handle dismissal:

- **Escape key**: `keydown` listener on `document`, checks `e.key === "Escape"`
- **Click-outside**: `pointerdown` listener on `document`, ignores clicks inside the composer (`composerRef`) OR inside the article (`articleRef`). Only dismisses for clicks on the sidebar, toolbar, page background, etc.

No timing hacks, no `requestAnimationFrame`, no `stopPropagation`. The click-outside handler doesn't interfere with opening because the opening click is always inside the article — the article's own click handlers manage open/reposition.

### Entrance animation

```css
.floating-composer {
  animation: composer-slide-in 150ms ease-out;
}
@keyframes composer-slide-in {
  from { opacity: 0; transform: translateX(-8px); }
  to { opacity: 1; transform: translateX(0); }
}
```

## Rendered Mode: Block-Level Commenting

Every block element in rendered markdown (paragraphs, lists, blockquotes, code blocks, tables, h4-h6 headings) is wrapped in a `BlockCommentWrapper`. This provides:

- **Hover highlight**: subtle background tint on hover
- **Comment button**: appears at the right gutter on hover (absolutely positioned)
- **Click-to-comment**: clicking the block opens the floating composer anchored to it

### Covered elements

`markdownComponents` in `PlanDetailPage` maps these tags to `BlockCommentWrapper`:
- `p`, `ul`, `ol`, `blockquote`, `pre`, `table`, `hr`, `h4`, `h5`, `h6`

`h1`, `h2`, `h3` use `SectionHeading` instead (section-anchored comments with a different composer).

### Hover zone

Block wrappers extend into the article's right padding (`-ml-3 -mr-8 pl-3 pr-12`) so the hover/click target covers the full content width plus the right gutter. Without this, there's a dead zone between the text and the card edge where hovering shows nothing.

Section headings use the same gutter extension pattern (`-mr-8 pr-12` on the heading element, button absolutely positioned at `right-3`).

### Click handling

`BlockCommentWrapper` passes `event.currentTarget` (the wrapper div itself) to `handleLineSelect` as an anchor element. This is critical because in rendered mode there are no `[data-line]` attributes in the DOM — the position must be computed from the actual clicked element.

Clicks on interactive elements (`a`, `button`, `input`, etc.) and active text selections are ignored to avoid interfering with links and copy-paste.

## Self-Contained Composers

The floating panel renders one of two composer components:

- **`FloatingComposer`** — for line-anchored comments (source view blocks, rendered view blocks). Supports Comment/Suggest toggle, owns its own `draft`, `suggestion`, and `mode` state.
- **`SectionComposer`** — for section-anchored comments (h1-h3 heading clicks). Simpler, comment-only.

Both components own their local state so keystrokes don't re-render `PlanDetailPage`. The general comment composer remains in the sidebar (it has no spatial anchor point).

## Files

| File | Role |
|------|------|
| `PlanDetailPage.tsx` | Orchestration: wrapper ref, position calc, dismiss handlers, JSX structure |
| `FloatingComposer.tsx` | Line comment composer (self-contained state) |
| `SectionComposer.tsx` | Section comment composer (self-contained state) |
| `SectionCommentButton.tsx` | Gutter-positioned button on section headings |
| `LineNumberedContent.tsx` | Source view, line selection (fires `onLineSelect`) |
| `styles.css` | `.floating-composer` visual styling + slide-in animation |
