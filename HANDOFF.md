# Handoff: Floating Comment Composer & shadcn Cleanup

## What was done

### 1. Source view scrollbar fix
- **File**: `src/styles.css` (.line-source class)
- Changed `white-space: pre` + `overflow-x: auto` to `white-space: pre-wrap` + `overflow-wrap: anywhere`
- Each line no longer gets its own horizontal scrollbar

### 2. Layout stability fix
- **File**: `src/routes/plan/$planId/-components/LineNumberedContent.tsx`
- The "add comment" button is now always in the DOM (`invisible pointer-events-none` when inactive) so its 28px width doesn't cause reflow when selecting lines

### 3. Floating comment composer (Radix Popover)
- **Files**: `PlanDetailPage.tsx`, `FloatingComposer.tsx`, `SectionComposer.tsx`, `LineNumberedContent.tsx`
- Line-level comment composer moved from the sidebar to a Radix `Popover` (shadcn `PopoverContent`) that floats next to the selected content
- `FloatingComposer.tsx` — owns its own `draft`, `suggestion`, and `mode` state so typing doesn't re-render PlanDetailPage
- `SectionComposer.tsx` — same pattern for section-level comments in rendered view
- Old sidebar section composer removed; old sidebar line composer was removed earlier
- General comment composer remains in sidebar (it has no anchor point)

### 4. shadcn component replacements (via parallel agents)
- **Alert**: 12 hand-rolled alert divs replaced with `<Alert>` across 7 files. Uses `variant="destructive"` for errors, `className` overrides for success/warning/info colors.
- **ToggleGroup**: 4 pill-style toggle patterns replaced with `<ToggleGroup>` + `<ToggleGroupItem>` in NewPlanPage, RevisionEditor, FloatingComposer, SessionsPage.
- **Accordion**: 3 manual collapse/expand patterns replaced with `<Accordion>` in SessionWorkspace, SessionsPage.
- **Popover**: Added for floating composer.
- All components are stock shadcn — no custom variants, just `className` overrides.

### 5. New shadcn components added
- `src/common/components/ui/popover.tsx`
- `src/common/components/ui/alert.tsx`
- `src/common/components/ui/accordion.tsx`
- `src/common/components/ui/toggle.tsx`
- `src/common/components/ui/toggle-group.tsx`

## Known issue: Popover positioning

### The problem
The floating comment popover uses a `PopoverAnchor` (a zero-size div inside the `<article>`) that gets repositioned via a `moveAnchorTo()` helper called from event handlers. The anchor is moved **imperatively before React state changes** so Radix reads the correct position.

**This works for JS `.click()` calls but NOT for real browser clicks (pointerdown → click sequence).** Tested with `agent-browser`: Playwright-style clicks don't open the popover, while `eval("btn.click()")` does.

### Root cause (suspected)
Radix Popover's click-outside detection uses `pointerdown` events. Even though the Popover is controlled (`open={composerOpen}`) and starts closed, the `pointerdown` event from clicking the section comment button may interfere with the subsequent state change. The exact mechanism needs investigation.

### Possible fixes to try
1. **Stop using Popover for this entirely** — use `createPortal` + manual fixed positioning. Calculate position from the target element's `getBoundingClientRect()` on each click. Handle escape/click-outside manually. This avoids all Radix event interference.
2. **Add `pointerdown` handler with `stopPropagation`** on the section comment buttons and line gutter buttons to prevent Radix from seeing them as outside clicks.
3. **Use `Popover.Trigger` properly** — restructure so the section buttons and line gutters ARE Popover triggers (complex given they're scattered across components).
4. **Delay the Popover open** — use `requestAnimationFrame` or `setTimeout(0)` to set state after Radix's pointerdown handler has finished.

### Files involved
- `src/routes/plan/$planId/-components/PlanDetailPage.tsx` — main orchestration, anchor ref, `moveAnchorTo()`, Popover open/close
- `src/routes/plan/$planId/-components/FloatingComposer.tsx` — line comment composer (self-contained state)
- `src/routes/plan/$planId/-components/SectionComposer.tsx` — section comment composer (self-contained state)
- `src/routes/plan/$planId/-components/LineNumberedContent.tsx` — source view, line selection
- `src/routes/plan/$planId/-components/SectionCommentButton.tsx` — section heading comment buttons
- `src/common/components/ui/popover.tsx` — shadcn Popover wrapper
- `src/styles.css` — `.floating-composer` visual overrides

### How to reproduce
1. `pnpm dev`
2. Open any plan with content
3. In **Rendered** view, hover a section heading to reveal the comment button, click it
4. The popover should appear to the right of the heading — currently it may not open at all or appear mispositioned
5. In **Source** view, click a line number — this should work better since the click target is inside the Popover root

### What works
- Source view line comments (mostly — may have same pointerdown issue)
- JS-triggered clicks (`.click()`) open the popover correctly in both views
- Typing in the composer is fast (state is local to FloatingComposer/SectionComposer)
- Escape and click-outside dismissal work when the popover IS open
- All shadcn replacements (Alert, ToggleGroup, Accordion) compile and render correctly
