# Apple HIG — web-relevant excerpts

Verbatim from daft2/apple-hig-skill @ d7fb453 (MIT), PATTERNS.md and COMPONENTS.md, with watchOS/tvOS/visionOS/haptics lines removed. Source of truth: https://developer.apple.com/design/human-interface-guidelines

## Onboarding

- Ideally people understand the app by using it. If onboarding is necessary, make it **fast, fun, and optional**.
- **Teach through interactivity.** People retain what they do, not what they read.
- **Prefer context-specific tips** over one upfront flow. A tip lets someone concentrate on one action while making progress. Display instructions near the UI they refer to. (TipKit.)
- If you need a prerequisite flow, keep it brief and enjoyable, with nothing to memorize.
- A separate tutorial should be skippable — and once skipped, never shown again on launch, but easy to find in help, account, or settings.
- Keep content focused on your app. People don't need to learn the system or the device from you.
- **Splash screens** should be brief — long enough to absorb at a glance, not long enough to feel like a delay.
- **Don't let downloads block onboarding.** Ship enough content to start immediately.
- Don't put licensing details in onboarding. Let the App Store show agreements. If you must include them, integrate them without disrupting the flow.
- **Postpone nonessential setup.** Provide good defaults so people can start immediately.
- If the app can't function without private data, integrate that permission request into onboarding — you get to show why and what the benefit is. Otherwise, ask at the moment the feature is used.
- Let people experience the app before you ask for ratings or purchases.

---

## Loading

The best loading experience finishes before anyone notices it.

- **Show something as soon as possible.** An empty screen reads as a bug. Use placeholder text, graphics, or animation and replace them as content arrives.
- Let people do other things while content loads in the background.
- If loading is unavoidably long, give people something worth looking at — gameplay hints, tips, new features. Gauge the remaining time so the filler neither flashes by nor repeats.
- Download large assets in the background (Background Assets framework) right after installation, during updates, or at other nondisruptive times.
- Communicate that loading is happening and roughly how long: determinate when you know, indeterminate when you don't. See Progress indicators in COMPONENTS.md.
- Games can justify a custom loading view matching the game's style.

---

## Feedback

Feedback tells people what's happening, what's next, what an action produced, and how to avoid mistakes. **Match the delivery to the significance**: passive display for status, interruption for possible data loss.

- **Integrate status feedback into the interface** so people get it without leaving their context (Mail shows the last-update time and unread count in the mailbox toolbar).
- Use **alerts** only for critical, ideally actionable information. Alerts lose impact through overuse.
- **Warn about unexpected, irreversible data loss** — and *don't* warn when data loss is the expected result (the Finder doesn't warn every time you throw away a file).
- Confirm a significant action's completion when it matters (a successful Apple Pay transaction). People expect success, so mostly they only need to hear about failure.
- When a command can't be carried out, say so and say why.

---

## Modality

Modality presents content in a dedicated mode that blocks the parent view and requires an explicit dismissal. It can ensure critical information is received, offer options that confirm or modify a recent action, support a narrowly scoped task without losing context, or create immersion.

- **Only when there's a clear benefit.** Modality removes people from their context.
- **Keep modal tasks simple, short, and streamlined.** A complicated modal task makes people lose track of what they suspended.
- **Don't build an app within your app.** A hierarchy of views inside a modal task makes retracing steps impossible. If subviews are required, provide a single path through them and avoid buttons that could be mistaken for the dismissal.
- **Confirm before closing** if dismissal would lose user-generated content — regardless of whether people used a gesture or a button. On iOS an action sheet with a save option works well.
- **Title the modal view** with its task, or add descriptive text. People may not return right away.
- **One at a time.** Multiple visible modal views create clutter and cognitive load. Dismiss one before presenting another. An alert may appear above anything — but never two alerts.

---

## Searching

- If search is important, **give it a primary position** — a bottom toolbar item alongside other important actions, or a dedicated tab.
- Aim for a **single search location** covering all of your content. Apps with genuinely distinct sections can add local search that filters the current view.
- **Display the scope clearly** — descriptive placeholder text, a scope bar, or a title. Mail always shows which mailbox you're searching.
- **Provide suggestions**: recent searches before typing, predictive suggestions while typing.
- **Start searching as people type** — continuously refined results feel responsive.
- **Take privacy into account** before showing search history, and give people a way to clear it.
- Consider letting people filter results with a scope bar.

**Systemwide search (Spotlight).** Index your content with descriptive metadata so people find it without opening the app. Define metadata for custom file types (`CSImportExtension`). Offer advanced file search inside your app via Spotlight — a button that initiates a Spotlight search on the current selection, with results in a custom or filtered view. Prefer system open and save views (they include search that filters the whole system). Implement a Quick Look generator for custom file types so Spotlight and other apps can preview them.

---

## Settings

- **Aim for defaults that give the best experience to the most people** — detect the device, the accessory, the appearance, and configure accordingly. Ideally nobody has to adjust anything.
- **Minimize the number of settings.** Too many make an app feel unapproachable and make any one setting hard to find.
- Make settings available where people expect: Command-Comma on Mac and with a hardware keyboard; Esc in games.
- **Don't use settings to ask for information you can get another way.**
- **Respect systemwide settings and never duplicate them.** A custom version of a global option implies system settings might not apply to you, and that yours might affect other apps.
- **General settings** — infrequently changed, app-wide (window configuration, game-save behavior, keyboard mappings, account options) — belong in your settings area.
- **Task-specific options** belong in the screen they affect: showing/hiding parts of a view, reordering, filtering. Putting them in a settings area disconnects them from context and hides the result.
- Add only the most rarely changed options to the system Settings app; if you do, provide a button that opens it directly.
- **macOS**: settings open from the App menu (or File for document-level options). Never a toolbar button. Dim the minimize and maximize buttons. Use a noncustomizable toolbar that always shows the active pane. Update the window title to the current pane (or "App Name Settings" for a single pane). Restore the most recently viewed pane.

---

## Entering data

- **Get information from the system whenever possible** — settings, or with permission, location and calendar.
- **Be clear about what you need**: a placeholder like "username@company.com" or an introductory label like "Email." Prefill reasonable defaults.
- **Never prepopulate a password field.**
- **Offer choices instead of text entry** where you can — pickers, menus, selection components are faster than typing even with a keyboard at hand.
- Support **drag and drop** and **paste**.
- **Validate dynamically** and give feedback immediately, so nobody discovers ten errors after filling a long form. For numeric data, use a number formatter (it restricts input and formats output as decimals, percentages, or currency).
- If data is required to proceed, make that visible — keep the Next/Continue button unavailable until the required fields are filled.
- macOS: expansion tooltips reveal clipped or truncated field text on hover.

---

## Undo and redo

People will try undo repeatedly until something changes — often without remembering what they're undoing.

- **Help people predict the result.** On iPhone, describe it in the shake alert. In menu items, label the target: "Undo Typing", "Redo Bold".
- **Show the result.** If the affected content has scrolled offscreen, scroll it back — otherwise people think nothing happened and undo again.
- **Let people undo multiple times.** Don't cap it arbitrarily; people expect to undo everything since opening a document or saving.
- Consider reverting a *batch* of related changes at once (incremental adjustments to one property), or offering a way to undo everything since the last save.
- **Provide undo/redo buttons only when necessary.** People use the Edit menu, keyboard shortcuts, or shake. If you do need buttons, use the standard symbols in a toolbar.
- iOS/iPadOS: don't redefine the standard three-finger swipe or shake gestures. Alert titles automatically get an "Undo "/"Redo " prefix — supply a word or two after it ("Undo Name", "Redo Address Change").
- macOS: Edit menu, Command-Z and Shift-Command-Z.

---

## Offering help

- **Let the task determine the help.** A one- or two-step task needs an inline view; a complex multistep task may warrant a tutorial. Relate help to what's happening right now, and make it easy to dismiss or avoid.
- Make all help content inclusive.
- **Don't explain standard components.** Describe what the standard element does *in your app*. If you introduce a genuinely unique control or nonstandard input use, orient people quickly with animation or graphics, not prose.

**Tips (TipKit).** A tip is a small, transient view describing how to use a feature.
- Types: **popover** (preserves content flow) · **inline** (keeps surrounding information visible) — as an **annotation** pointing to a specific element, or a **hint** when it isn't tied to one.
- Use tips for simple features. More than three actions is too complex for a tip.
- Short, actionable, engaging: one or two sentences, direct action-oriented language, no promotion, nothing off-topic.
- **Define eligibility rules** — parameter- or event-based — so people who already use a feature never see its tip. Set a display frequency (e.g. once every 24 hours) when you have more than one.
- Include an associated symbol or image, preferring the filled variant — but don't repeat an image that the tip already points at.
- Add a button to reach settings or more resources.

- Describe **only** the control the person indicated interest in.
- Explain the action, usually starting with a verb: "Restore default settings", "Add or remove a language from the list."
- Don't repeat the control's name — it wastes space.
- **60–75 characters maximum** (localization will lengthen it). Sentence fragments and omitted articles are fine. If you need a lot of text, simplify the interface instead.
- Sentence case. Omit ending punctuation on complete sentences unless your style requires it.
- Context-sensitive tooltips per control state are worth considering.

---

## Drag and drop

Content moves from a **source** to a **destination**. General rule: dropping within the same container **moves**; dropping in a different container **copies**. Between apps it's always a copy.

- **Support it broadly.** People try it everywhere. System components (text fields, text views) get it for free.
- **Always offer an alternative** — menu commands to copy and move. In iOS/iPadOS, expose sources and destinations to accessibility APIs (`accessibilityDragSourceDescriptors`, `accessibilityDropPointDescriptors`).
- Decide move vs. copy deliberately, favoring what people expect and what's least likely to cause frustration or data loss.
- **Support multi-item drags.** iPadOS lets people add items to a drag in progress; macOS lets people gather items from several apps.
- **Prefer letting people undo** a drop. Ask for confirmation before an irreversible one (the Finder does this for write-only folders). Where undo isn't possible, offer a way to reverse the result (Photos lets people cancel sharing after the drop).
- **Offer multiple representations**, highest to lowest fidelity, so the destination takes the best it can handle (native chart object → PDF → lossless PNG → JPEG).
- Consider **spring loading** — activating a control by dragging content over it (force-click on a Magic Trackpad, hover on iPad) without dropping.

**Feedback**
- Show a **drag image** as soon as the selection moves ~3 points. Make it translucent so it reads as a representation and lets destinations show through. Keep it until the drop.
- Modify the drag image when it clarifies the result (expanding to the photo's default size in a document). Use **drag flocking** to group multiple items visually and ungroup them on drop. Don't make it change constantly.
- **Show whether a destination accepts the content** — insertion point or highlight when it does, nothing or an explicit `circle.slash` when it doesn't. Only while the content is over the destination. With multiple candidates, indicate one at a time.
- On an invalid drop or a failure, animate: return to source if visible, or scale up and fade out to "evaporate."

**Accepting drops**
- Auto-scroll a scrolling destination while an item hovers over it; stop when the drag leaves.
- Take the richest representation you can use.
- Extract only the relevant portion (Mail takes name and address from a dragged contact, not the postal address).
- With a keyboard attached, check the **Option** key at drop time — holding it forces a copy within the same container.
- Show progress for transfers that take time; place a placeholder at the drop location in collections, lists, and tables. Show progress when a drop initiates a task like printing.
- **Styling**: preserve the original font, size, and attributes when both sides support them; otherwise apply the destination's style.
- **Selection**: keep dropped content selected in the destination. On a move, it disappears from the source. On a same-container copy, deselect the original. On a cross-container drag, deselect in the source.


---

## Charting data

Charts communicate complex information without a wall of text — and give you room for personality. Use them for analyzing trends, visualizing a changing state, and comparing across categories. **Not every dataset needs a chart** — if you just need to present data, a scrollable, searchable, sortable list or table may serve better.

- Use a chart when you want to **highlight** something about a dataset. Charts are visually prominent; be clear about what people can learn.
- **Keep it simple**, with progressive disclosure for depth. Too much data obscures the very relationship you're showing. Offer levels of detail or subsets; consider several versions of increasing capability to teach the interaction.
- **Make every chart accessible.** Accessibility labels that describe values and components, plus accessibility elements for interaction.
- **Prefer common chart types** — bar and line charts carry built-in reading skills.
- If you must invent a representation, teach it (Activity introduces its rings by animating them individually during Watch pairing).
- **Examine the data from multiple levels**: macro (totals, averages), mid (useful subsets), individual (outliers, notable values). Surfacing several perspectives invites engagement.
- **Add descriptive text** — titles, subtitles, annotations, and a headline summary. Weather's "Chance of light rain in the next hour" above the hourly forecast is the model. A headline helps but does **not** replace accessibility labels.
- **Match size to function.** Big enough for the labels and interaction you support; small enough to serve as a glanceable preview when that's the role.
- **Prefer consistency** across charts serving similar purposes; deviate only to highlight a real difference. Multiple views of one dataset should share type, colors, annotations, layout, and descriptive text (Health Trends → expanded view).

See **Charts** in COMPONENTS.md for marks, axes, color, and accessibility mechanics.

---

## Toolbars

A toolbar provides frequently used commands, controls, navigation, and search along the top or bottom edge, holding three kinds of content: the current view's **title**, **navigation controls** and search, and **actions** (bar items).

- **Choose items deliberately.** Define which items move to the overflow menu as the view narrows. The system adds an overflow menu automatically in macOS and iPadOS — don't add one manually, and don't design a layout that overflows by default.
- Add a **More** menu for less important extra actions, and only if you really need it.
- In iPadOS and macOS, consider letting people **customize** the toolbar — especially valuable in apps with many items, advanced functionality, or long sessions.
- **Reduce toolbar backgrounds and tinted controls.** Custom backgrounds interfere with system background effects. Let the content layer inform the toolbar's appearance and use a `ScrollEdgeEffectStyle` to distinguish the bar from the content.
- Avoid label colors similar to your content backgrounds; over colorful content prefer the monochromatic appearance.
- Prefer standard components — their corner radii are concentric with the bar's. Custom components must match.
- Consider hiding toolbars for a distraction-free experience, contextually and reversibly.

**Titles.** Give each window a useful title so people can confirm location and distinguish windows. Leave it empty if it's redundant (a single Notes window doesn't title the note; multiple windows get titled by first line). **Never use your app name as a title.** Keep it under ~15 characters.

**Navigation.** A navigation toolbar sits at the top (in iOS, sometimes called a navigation bar). **Use the standard Back and Close buttons** with the standard symbols — not text labels reading "Back" or "Close." Custom versions must look the same, behave the same, and be used consistently.

**Actions.** Prioritize what people are most likely to want — usually the most frequent commands, sometimes the ones mapping to the most important objects. Make every control's meaning clear; prefer simple recognizable symbols over text, except for actions like *edit* that symbols represent poorly. **Prefer system symbols without borders** — the section already provides a container, and the system defines hover and selection appearances. Use the `.prominent` style for one key action (Done, Submit), placed on the trailing side.

**Item groupings** — three positions:
- **Leading** — return-to-previous-document and sidebar toggle at the far edge, then the view title, then optionally a document menu (Duplicate, Rename, Move, Export). **Not customizable**, so these stay available.
- **Center** — common useful controls, and the title if it isn't leading. Customizable in macOS and iPadOS; collapses into the system overflow menu as the window narrows.
- **Trailing** — items that must remain available, inspector buttons, an optional search field, the More menu, and the primary action (Done). **Always visible at every size.**

Group by function and frequency. Put navigation and critical actions (Done, Close, Save) in dedicated, visually distinct sections. Keep groupings and placement consistent across platforms. **Aim for a maximum of three groups.** Keep text-labeled actions separate — a text button beside a symbol button reads as one combined control, and adjacent text buttons run together; insert fixed space between them.


## Context menus


- **Prioritize relevance.** Not for advanced or rare items — for what people most likely need right now. Mail's inbox context menu has reply and move, not message editing or mailbox management.
- **Keep it short.** A long context menu is hard to scan and scroll.
- **Be consistent throughout the app.** Partial support makes people think something's broken.
- **Always duplicate context menu items in the main interface.** In macOS, every command belongs in the menu bar.
- Submenus: **one level maximum**, with an intuitive title.
- **Hide unavailable items — don't dim them.** (macOS Cut/Copy/Paste are the exception.)
- Place frequent items where people will encounter them first. Menus open above or below the content depending on space, so consider reversing the order to match.
- **Don't show keyboard shortcuts** — the context menu *is* the shortcut.
- Use separators; aim for no more than about three groups.
- **Title**: usually none. Include one only when it clarifies scope (Mail shows the number of selected messages).
- Represent actions with the standard system icons.


## Pull-down buttons

Displays a menu of items or **actions** directly related to the button's purpose; the menu closes and the action runs.

- Use for commands related to the button's own action — an Add button that specifies what to add, a Sort button that picks an attribute, a Back button that picks a destination. If you need mutually exclusive non-command choices, use a pop-up button.
- **Don't hide a view's primary actions in one.** They must be discoverable.
- **Balance length**: **at least three items** makes the interaction worthwhile; one or two are better served by buttons or toggles. Too many slows people down.
- Show a menu title only if it adds meaning — usually the button's content plus descriptive items is enough.
- Mark destructive items and confirm intent. Menus color them red; on selection the system shows an action sheet (iOS) or popover (iPadOS) for confirmation, in a different location requiring deliberate dismissal.
- Include a symbol with an item when it adds value; SF Symbols stay aligned with the text at every scale.
- iOS/iPadOS: a specific gesture can reveal a pull-down menu (touch-and-hold on Safari's Tabs button). A **More** button offers range in constrained space but hurts discoverability — the ellipsis doesn't predict its contents. Weigh convenience against discoverability.

## Sidebars

A sidebar on the leading side lets people navigate between areas or top-level collections. It needs substantial vertical and horizontal space — a tab bar may serve better when space is tight or content deserves the room.

- **Extend visually rich content beneath the sidebar** — let it scroll horizontally, or apply a **background extension effect** that mirrors adjacent content under the sidebar (`backgroundExtensionEffect()`).
- **Let people customize the contents** where possible.
- Group hierarchy with **disclosure controls** when there's a lot of content.
- Use familiar symbols; prefer a custom SF Symbol to a bitmap.
- **Show no more than two levels of hierarchy.** Deeper structures want a split view with a content list between the sidebar and the detail view.
- With two levels, title each group succinctly.
- **Sidebar icon colors serve a purpose.** They use your accent color by default; in macOS people can change the system accent and expect all sidebar icons to follow. A **fixed** color is for meaning or emphasis, used sparingly (Mail's yellow VIP icon).


## Search fields

An editable text field with a Search icon, a Clear button, and placeholder text, optionally with a scope bar and tokens.

- **Use placeholder text** to communicate what people can search for and reinforce the scope.
- **Start searching as people type** where possible — continuously refined results feel responsive.
- **Show suggested terms**: recent searches before typing, predictive suggestions during.
- **Simplify results**: most relevant first, categorized when that helps.
- Consider letting people filter results with a scope bar in the results area.

**Scope bars and tokens.** A **scope bar** filters and adjusts search scope — use it to move from a broad scope to a narrower one (Mail on iPhone narrows from the whole mailbox to the current one). **Default to a broader scope**; the full result set gives people the context to narrow usefully. A **token** is a selectable, editable visual representation of a search term acting as a filter for the remaining terms — a specific contact in Mail, photos in Messages. **Pair tokens with search suggestions**, since people may not know which tokens exist. (macOS has a related standalone **token field**.)

**iOS placements**
- **As a tab.** Always visible as people switch sections. Two styles: **standard tab** (uniform with the rest of the bar; opens a search landing page with the field at the top) and **button appearance** (a separate button; focuses the field and shows the keyboard immediately). Choose the standard tab to provide suggestions, promote discovery, and encourage exploration — good for rich, browsable content (Apple TV shows genres and categories first). Choose the button appearance for a transient experience that resolves quickly and returns people to their previous tab.
- **In a toolbar.** At the bottom as an expanded field or a button (animating into a field above the keyboard), or at the top as a button (animating into a field above the keyboard, or at the top if there's no room). **Place search at the bottom if there's room** — it's easy to reach (Settings uses a bottom toolbar for search alone; Mail and Notes fit it alongside other controls). Place it at the top when the bottom of the screen matters (Wallet's pass stack) or when there's no bottom toolbar.
- **Inline.** When search's position next to the content strengthens the relationship — filtering within a single view, or a second search field where location matters (Music's library filter). At the top, position it above the list it searches, and consider pinning it to the top toolbar on scroll.

**iPadOS and macOS.** Keep the experience consistent across both if you ship on both.
- **Trailing side of the toolbar** for many common uses, especially split-view apps searching across columns (Mail, Notes, Voice Memos) — people can navigate results while keeping their selection visible. Also good when results appear in the detail view (Freeform).
- **Top of the sidebar** when search filters the sidebar or navigation (Settings exposes sections several levels deep) — useful when the detail view is rich and needs separation from the filtered sidebar.
- **As a sidebar or tab bar item** when you want a dedicated discovery area with rich suggestions, categories, and content (Music, TV).
- In a dedicated area, consider focusing the field on arrival — except on iPad with only a virtual keyboard, where the keyboard would unexpectedly cover the view.
- **Account for window resizing.** On iPad the field resizes fluidly like Mac; in compact views, put search where it's contextually useful (Notes and Mail place it above the content-list column).


## Split views

Manages multiple adjacent panes, typically to show several levels of hierarchy at once. Selecting in the primary pane fills the secondary; a tertiary pane can follow. The common form is a sidebar for navigation plus content and detail. Rarely, a split view supplements a main view with functional groups (Keynote's slide navigator, presenter notes, and inspector around the canvas).

- **Persistently highlight the current selection** in each pane that leads to the detail view — it clarifies the relationship between panes and keeps people oriented.
- Consider letting people **drag and drop between panes**.


## Lists and tables

Data in one or more columns of rows, representing groups or hierarchies and supporting selection, addition, deletion, and reordering.

- **Prefer lists and tables for text.** The row format makes text scannable. Use a collection for widely varying item sizes or lots of images.
- **Let people edit** when it makes sense; reordering is appreciated even without add/remove. iOS and iPadOS require entering an edit mode first.
- **Give appropriate selection feedback.** Navigation tables persistently highlight the selected row; option lists highlight briefly then show a checkmark.
- **Keep item text succinct** to minimize truncation and wrapping. For long content, list titles only and show the content in a detail view.
- Consider a **middle ellipsis** to preserve both the beginning and end of clipped text.
- **Descriptive column headings** in multicolumn tables: nouns or short noun phrases, title case, no ending punctuation. A single-column table without a heading needs a label or header for context.


## Disclosure controls

- **Hide details until they're relevant.** Put the controls people are most likely to use at the top, always visible, with advanced functionality hidden by default.

**Disclosure triangles** show and hide information associated with a view or list of items (Keynote's advanced export options; the Finder's list view). The triangle points inward from the leading edge when collapsed and down when expanded. **Provide a descriptive label** indicating what's disclosed ("Advanced Options"). (`NSButton.BezelStyle.disclosure`)

**Disclosure buttons** show and hide functionality associated with a specific control (the macOS Save sheet's button next to Save As). The button points down when collapsed and up when expanded. **Place it near the content it controls**, and use **no more than one per view**. (`NSButton.BezelStyle.pushDisclosure`)


## Alerts

An alert gives people critical information they need right away.

- **Use alerts sparingly.** They interrupt. Each one should carry essential information and useful actions, or people stop reading them.
- **Never use an alert merely to inform.** People don't appreciate an interruption they can't act on. Find a contextual way to communicate (Mail shows an indicator when a server connection is unavailable).
- **Don't alert for common, undoable destructive actions.** Deleting an email is intentional and reversible. **Do** alert for an uncommon destructive action that can't be undone, in case it was accidental.
- **Don't show an alert at launch.** If people need to know something the moment they open your app, make it discoverable in the interface. For a startup problem like no network, show cached or placeholder data with a nonintrusive label.

- **Direct, neutral, approachable tone.** Alerts describe problems — don't be oblique, accusatory, or evasive about severity.
- **Write a title that describes the situation** clearly and succinctly: what happened, in what context, and why. Not "Error" or "Error 329347 occurred." Not so long it wraps past two lines. A complete sentence gets sentence case and ending punctuation; a fragment gets title case and none.
- **Include informative text only if it adds value** — short, complete sentences, sentence case, proper punctuation.
- **Don't explain the buttons.** If the text and titles are clear, you don't need to. Where you must reference a button, use "choose" (not tap or click) and the exact title without quotes.
- Add a text field only when input is needed to resolve the situation.

**Buttons**
- **Succinct, logical titles** — one or two words describing the result. Verbs and verb phrases tied to the alert text: "View All", "Reply", "Ignore". Title case, no ending punctuation.
- **Avoid "OK" as the default title** except in a purely informational alert. Does "OK" mean "OK, do it" or "OK, I understand what I almost did"? "Erase", "Convert", "Clear", "Delete" are unambiguous. Avoid "Yes" and "No" entirely.
- **Place buttons where people expect**: the most likely choice on the trailing side of a row or at the top of a stack; the default button always trailing or top; Cancel leading or bottom.
- **Use the destructive style** for a destructive action people **didn't** deliberately choose. When the destructive action *is* their stated intent (Empty Trash), don't style it destructively — the convenience of pressing Return outweighs restating the obvious.
- **Include a Cancel button whenever there's a destructive action**, always titled "Cancel", and never as the default. If you want people to actually read the alert, make no button the default. A single-button alert that is also the default should say **Done**, not Cancel.


## Sheets

A sheet helps people perform a scoped task closely related to their current context — supplying information needed to complete an action, attaching a file, choosing a save location.


**Buttons.** **Cancel** (or Close) dismisses without saving — common in most sheets. **Done** dismisses after completing or explicitly saving. **Back** moves to a previous step or parent view — it does *not* dismiss.

- **One sheet at a time from the main interface.** If something in a sheet produces another sheet, close the first one first, and re-present it afterward if needed.
- **Always pair Done with Cancel** (or Back). Done alone implies completing the task is the only way out.
- **Never show Cancel, Done, and Back together.**

**iOS/iPadOS.** Single-view sheets: Cancel on the leading edge of the top toolbar, Done on the trailing edge. Multi-step flows: first step has Cancel leading and (if present) an inactive Done trailing; later steps introduce Back. **Detents** define the heights a resizable sheet rests at — `large` (fully expanded) and `medium` (about half), plus custom values. Sheets support `large` automatically. Adding `medium` allows both; specifying only `medium` prevents full expansion. Support `medium` for progressive disclosure (a share sheet shows the most relevant items without resizing); skip it when content is more useful at full height (Messages and Mail compose sheets). **Include a grabber** in a resizable sheet — it shows resizability, cycles detents on tap, and works with VoiceOver. **Support swipe-to-dismiss**, and use an action sheet to confirm if there are unsaved changes. In iPadOS prefer the page or form sheet presentation styles.

**macOS.** A cardlike view with rounded corners floating over its parent, which dims. Use a **reasonable default size** — people don't expect to resize sheets, though supporting resizing is a good idea. **Let people interact with other app windows** without dismissing the sheet: bring the parent (and its modeless document panels) forward when the sheet opens, but keep other windows reachable. Use a **panel** instead when people need to provide input and observe results repeatedly (find and replace).



## Popovers

A transient view above other content, shown when people click or tap a control or interactive area.

- Use it for **a small amount** of information or functionality. It disappears after interaction, so limit it to a few related tasks (a calendar event popover changes the date, time, or calendar and then dismisses).
- **Consider popovers when you want more room** — sidebars and panels are expensive; a temporary popover streamlines the interface.
- **Position them so the arrow points as directly as possible** at the element that revealed it, and so the popover covers neither that element nor essential content.
- **Use a Close button only for confirmation and guidance** (exiting with or without saving). Otherwise a popover closes on an outside click/tap or on selection. For multiple selections, keep it open until explicit dismissal or an outside tap.
- **Always save work** when a nonmodal popover closes automatically — people dismiss them accidentally. Discard only on an explicit Cancel.
- **One at a time.** Never cascade or nest popovers. Close the open one before showing a new one.
- **Nothing displays over a popover** except an alert.
- Where possible, let one click or tap close one popover and open another — especially when several bar buttons each open one.
- **Don't make it too big.** Just big enough for its contents. The system may adjust the size to fit.
- Animate size changes so it doesn't look like a new popover replaced the old.
- **Don't use the word "popover" in help documentation** — refer to the task or the control.
- **Don't use a popover for a warning.** People miss or accidentally close them; use an alert.

## Panels (macOS only)

A panel floats above other windows providing supplementary controls, options, or information related to the active window or selection. It has a less prominent appearance than a main window, and can adopt a dark translucent HUD style.

- Use a panel for **quick access to important controls or information** related to the content people are working with.
- Consider one for **inspector** functionality — details of the current selection, updating as the selection changes. An **Info window** (unchanging contents regardless of selection) should be a regular window, not a panel. A split view pane is another option.
- **Prefer simple adjustment controls** — sliders and steppers give direct control; text entry and item selection require multiple steps.
- **Write a brief title** describing the purpose — a noun or noun phrase in title case ("Fonts", "Colors", "Inspector"). The title bar is what lets people position it.
- **Show and hide appropriately**: bring all open panels forward when your app becomes active, regardless of which window was active; hide them all when your app is inactive.
- **Don't list panels in the Window menu's document list.** Show/hide commands are fine.
- **Generally disable the minimize button** — a panel appears when needed and disappears when the app is inactive.
- **Refer to panels by title.** In menus, omit "panel": "Show Fonts", "Show Colors", "Show Inspector". In help documentation, use the title, appending "window" when it adds clarity ("Fonts window" reads better than "Fonts").

**HUD-style panels.** Same function, darker and translucent. They suit apps with highly visual content or immersive experiences — media editing, full-screen slideshows (QuickTime Player's inspector). **Prefer standard panels.** A HUD without a logical reason distracts and may not match the current appearance setting. Use a HUD only in a media-oriented app, when a standard panel would obscure essential content, or when you don't need controls (most system controls don't match a HUD's appearance; the disclosure triangle is an exception). **Maintain one panel style** across mode changes. **Use color sparingly** — small amounts of high-contrast color for important information. **Keep HUDs small**; they must not obscure the content they adjust or compete for attention.

