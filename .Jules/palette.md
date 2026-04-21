## 2026-04-21 - Added for attributes and semantic labels for forms
**Learning:** Wrapping text within `<label for="...">` or adding `for` attributes explicitly on settings form labels improves screen reader and clickable area accessibility without breaking existing UI layout or relying on new custom CSS classes.
**Action:** When making form labels accessible, bind them securely to the corresponding input elements using the `for` attribute matching the input `id`.
