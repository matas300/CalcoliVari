## 2024-06-25 - Login Button Async Feedback
**Learning:** Found that an important async action (login involving crypto operations and Firebase loading) had no visual feedback, making it seem unresponsive. This is a common pattern in vanilla JS apps where operations take variable amounts of time.
**Action:** Always wrap the button text in a span, include a hidden spinner, and disable the button while the `async` function is awaiting, to provide immediate feedback and prevent multiple clicks. Added aria labels to the password input for screen readers.
