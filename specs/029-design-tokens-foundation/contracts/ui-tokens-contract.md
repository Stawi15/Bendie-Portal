# UI Contract: tokens and global behaviours (029)

This is what later features (app shell, data table, inspector, readiness) **may rely on**. Changing any item below is a breaking change and needs its own spec.

## Class names (stable)

- Radius: `rounded-ui-sm`, `rounded-ui-md`, `rounded-ui-lg`
- Elevation: `shadow-elev-0` … `shadow-elev-3`
- Status: `{text,bg,border}-status-{blocking,warning,done,info,neutral}-{fg,bg,border}` (as defined in data-model.md)
- Product: `{text,bg}-product-{bendie,planner}-{fg,bg,dot}`
- Density: `h-row`, `min-h-row`, `h-row-compact`, `h-control`, `h-control-touch`
- Motion: `duration-motion-{fast,base,panel}`, `ease-motion-{standard,panel}`
- Focus: `focus-ring`

## Global behaviours (guaranteed)

1. **Keyboard focus** is visible on every link, button, tab, menu item, option, summary and tabbable element that doesn't define its own focus style; it never appears after a mouse click; form fields keep their own focus style.
2. **Reduced motion:** when the OS requests it, **all** transitions and animations complete immediately (0.01ms; components can't opt out in this feature), press-scale is disabled, and smooth scrolling is off. `animate-spin` and `animate-pulse` keep running. Transition **delays** are unchanged.
3. **No status by colour alone:** every status token is documented with an icon and text label. Components using status tokens must render both.
4. **Product accents are never used for actions** (buttons, links). Actions use `primary`.
