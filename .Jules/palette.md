## 2024-05-19 - Explicit Label Linking for Hit Area and A11y
**Learning:** Vanilla HTML inputs without explicit `for` attribute linking often miss the hit-area UX benefit. In custom panels without framework scaffolding, manually ensuring explicit associations significantly improves both screen reader accessibility and mobile tap targets.
**Action:** Always verify `for` attribute presence on custom `<label>` tags adjacent to inputs to provide larger hit areas on mobile and explicitly associate controls for screen readers.
