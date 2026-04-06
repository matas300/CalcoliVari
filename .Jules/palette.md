## 2025-04-06 - Form Label Associations
**Learning:** Found multiple form inputs (`<input>`, `<select>`) in `index.html` settings panel without explicit `<label for="...">` associations. Missing `for` attributes reduce the clickable area for users (clicking the label doesn't focus the input) and degrade screen reader accessibility.
**Action:** Always associate labels with inputs using the `for` attribute matching the input's `id`, improving both interaction ease and accessibility.
