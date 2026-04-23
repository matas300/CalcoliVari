## 2026-04-23 - Wrap existing text in tags to maintain structure for a11y labels
**Learning:** When adding `<label for>` to existing text inside a wrapper like `<p>`, keeping the original wrapper and placing the `<label>` inside it preserves existing CSS rules targeting the wrapper tag while achieving the accessibility goal.
**Action:** Use this pattern instead of replacing the tag entirely when CSS relies on the original tag.
