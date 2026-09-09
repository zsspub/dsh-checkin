---
name: DSH Check-ins
description: A compact habit calendar within the DSH conversation shell.
---

# DSH Check-ins UI

## Overview

The interface inherits the host font and semantic tokens from DeepSeek Harness `0.1.5-alpha.1` (`ui-theme`, `ui-sidebar`, and `ui-layout`). The personal-todo plugin supplies the sidebar action geometry. Use restrained contrast, compact controls, and Lucide outline icons; the conversation remains reachable beside the non-modal drawer.

## Colors

The host owns light and dark palettes. The drawer uses `--dsw-alias-bg-layer-1`; text uses `--dsw-alias-label-primary` and `--dsw-alias-label-secondary`; separators use `--dsw-alias-border-l2`. Controls and completed dates use `--dsw-alias-interactive-bg-hover`, with `--dsw-alias-interactive-bg-active` for hover or selected emphasis. Primary actions and checked toggles invert primary text and drawer background. Errors and destructive actions use `--dsw-alias-state-error-primary`.

## Typography

Inherit the host font. Body text is 14px with 1.5 line height; the drawer title is 22px/600, month heading 19px/600, and date detail heading 15px/600. Supporting copy is 13px, weekday labels 12px, hints and footer 11px, and calendar counts 10px. Calendar dates and month headings use tabular numerals. Topic names wrap without widening the drawer.

## Layout

The right drawer is 560px wide with 12px outer spacing and a viewport-width cap. At 600px and below it fills the viewport. A fixed header and footer frame an independently scrolling body; desktop horizontal padding is 24px, with 12px body and 16px header/footer padding on narrow screens.

Reading order is title and close → topic filter and create → month navigation → Monday-first seven-column calendar → selected-date topic list. Inline forms and deletion confirmation sit below the toolbar. Calendar cells are 56px tall, or 50px on narrow screens, with 4px spacing. Toolbars and detail headings wrap when needed.

## Elevation & Depth

The drawer has a thin semantic border without a shadow or backdrop. Internal sections use separators and spacing. Entrance motion lasts 200ms, translating 16px from the right while fading in; reduced-motion preferences disable it.

## Shapes

The desktop drawer has a 20px radius; the full-screen drawer has square corners. Controls use 9px corners, inputs 8px, and calendar dates 10px. Completion toggles are 28px circles. The sidebar action is 28px high with a 14px radius and a 16px icon.

## Components

Calendar dates distinguish selection with a border, today with a bold underlined number, and completion with a count or a check when one topic is filtered. Future dates use secondary text and omit completion marks; their completion toggles are disabled. Topic rows pair a toggle with a wrapping name and rename/delete icons.

Controls show visible keyboard focus. Opening focuses close; closing or Escape restores the opening element. Forms focus the name input. Delete confirmation focuses cancel, and cancellation restores the initiating delete button. Month navigation restores its initiating control after loading. Calendar arrows move by day/week, Home/End move to month endpoints, and focus follows the selected date across months.

Loading and mutation states have status copy; busy controls are disabled. Empty state offers topic creation. Errors appear inline with retry, and failed submissions preserve input. The footer provides the timezone/backfill hint or mutation status.

## Do's and Don'ts

- Preserve the host palette, font, compact outline icons, and visible focus indicators.
- Keep topic management inline and calendar/detail structure consistent across widths.
- Use text, borders, and checkmarks alongside tonal state changes.
- Do not introduce a separate accent palette, decorative cards, a modal backdrop, or motion that ignores reduced-motion preferences.
