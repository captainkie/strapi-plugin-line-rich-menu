---
"strapi-plugin-line-rich-menu": minor
"strapi-plugin-line-rich-menu-v4": minor
---

Show one rich menu to members and another to everyone else. A new `LINE member`
collection holds per-channel LINE user IDs; the rich menu editor gains an **Audience**
field (Everyone or Members), and switching a members menu on links it to every member
in chunks of 500 through a resumable background job. A menu set to Members is never
made the account default, so it is never shown to non-members: publishing one leaves
LINE's default alone, and the operations that would break the link between a menu's
audience, its channel's member pointer and its rich menu on LINE are refused with a
message naming the fix rather than silently repaired. Additive: existing menus default
to `all` and behave exactly as before.
