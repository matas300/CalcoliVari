## 2025-02-23 - Year Display Live Region
**Learning:** When using navigation buttons that increment/decrement a dynamically displayed value without triggering a page reload (such as a year or date selector), screen readers must be explicitly told to announce the updated value so that visually impaired users are aware of the change. Adding `aria-label` to the next/prev buttons is not enough.
**Action:** Always add `aria-live="polite"` (or `"assertive"` if urgent) to the text element displaying the dynamic value alongside ensuring the increment/decrement controls have proper `aria-label`s.
