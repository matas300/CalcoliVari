## 2026-04-10 - Add aria-labelledby to QuickPay Modal
**Learning:** Found a modal in the application (`#quickPayModal`) missing an `aria-labelledby` attribute, meaning screen readers wouldn't announce the modal's title correctly when it opened.
**Action:** Always verify that every element with `role="dialog"` has either `aria-labelledby` pointing to its title or an `aria-label`.
