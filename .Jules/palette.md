## 2026-04-05 - Missing ARIA attributes on custom tab navigation
**Learning:** Custom tab navigation implemented via `data-tab` attributes often lacks screen reader context. Without `role="tablist"`, `role="tab"`, `aria-selected`, and `role="tabpanel"`, screen reader users have no semantic context of the relationship between tabs and their content panes.
**Action:** Always verify that custom tab controls receive proper WAI-ARIA tab pattern markup (`tablist`, `tab`, `tabpanel`, `aria-controls`, `aria-labelledby`, and dynamic `aria-selected` toggling).
