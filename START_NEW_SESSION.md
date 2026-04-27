# How to Start a New Claude Conversation for Constrai

> **The whole system is ONE command.** Save it once, paste it any time.

---

## The Command (copy-paste verbatim)

```
هاي محادثة استكمال لمشروع Constrai الموجود — مش مشروع جديد. الريبو مرفّق محلياً (مجلد mep-fixed). قبل أي رد:
1. اقرأ CLAUDE.md من المجلد المحلي (مش من GitHub).
2. اتبع تعليمات Section 0 (Bootstrap) فيها بالحرف، خصوصاً قراءة MASTER_README + DECISIONS + RECOVERY محلياً.
3. ابدأ ردك بـ "(محادثة استكمال — قرأت Section X)" حتى أتأكد إنك خلصت Bootstrap.
ما تشتغل أي task قبل ما تخلص الـ Bootstrap.
```

That's it. One block. Paste at the start of every new conversation.

---

## Why this version (vs the older shorter command)

The older command (`اقرأ https://raw.githubusercontent.com/.../CLAUDE.md ...`) had two weaknesses:

1. **Pulled docs from GitHub instead of the local mounted folder.** GitHub lags behind the local repo by however long since the last `git push`. If the previous session ended without pushing the doc updates, the new session sees stale state.
2. **Didn't tell Claude this was an existing project.** Fresh Claude could misread it as "the user wants me to start a new project from this CLAUDE.md template".

The new command fixes both: explicit "this is a continuation", explicit "read locally", and a verification echo (`Section X`) so the user can confirm Bootstrap actually ran.

---

## Optional: Specify the Task Upfront

If you already know what you want to work on, add it after the bootstrap block:

```
هاي محادثة استكمال لمشروع Constrai الموجود — مش مشروع جديد. الريبو مرفّق محلياً (مجلد mep-fixed). قبل أي رد:
1. اقرأ CLAUDE.md من المجلد المحلي (مش من GitHub).
2. اتبع تعليمات Section 0 (Bootstrap) فيها بالحرف، خصوصاً قراءة MASTER_README + DECISIONS + RECOVERY محلياً.
3. ابدأ ردك بـ "(محادثة استكمال — قرأت Section X)" حتى أتأكد إنك خلصت Bootstrap.
ما تشتغل أي task قبل ما تخلص الـ Bootstrap.

اليوم نكمل: <اكتب المهمة هنا>
```

**Examples for the task line:**
- `اليوم نبلش Engineering Quality Program — Week 1` (per DECISIONS.md Section 18)
- `اليوم نكمل Tenant Lifecycle (Section 17 pending)`
- `اليوم في bug في الموبايل: <وصف>`
- `اليوم نشتغل على web frontend i18n`

Claude reads the bootstrap, then sees your specified task, and pulls in any extra reference files needed (SCHEMA.md for DB work, API.md for backend, etc.) automatically.

---

## What If Claude Doesn't Echo "محادثة استكمال — قرأت Section X"?

That means Bootstrap was skipped. Reply:

```
انت ما عملت Bootstrap. ارجع لـ Section 0 بـ CLAUDE.md ونفذ الخطوات بالترتيب: اقرأ المحلي MASTER_README + DECISIONS + RECOVERY، ابدأ ردك بـ "(محادثة استكمال — قرأت Section X)".
```

That should reset it.

---

## Why This Works

- **One thing to remember.** No template selection. No fill-in-the-blanks.
- **Local-first.** New session sees the latest committed state from your laptop, not whatever GitHub had hours ago.
- **Explicit continuation framing.** "محادثة استكمال" + "مش مشروع جديد" leaves no room for Claude to misinterpret.
- **Verification echo.** `Section X` is your proof Bootstrap was completed. If you don't see it, you know to retry.
- **Self-updating.** When the bootstrap procedure evolves, we update CLAUDE.md Section 0 once. The command you save rarely changes.

---

## Prerequisite: Cowork Mode with Folder Mounted

For the local-first workflow:

1. The Claude session must be in **Cowork mode** with the `mep-fixed` folder mounted (it should auto-mount if you've done it before).
2. If the folder isn't mounted, the bootstrap will fall back to GitHub URLs (still works, just slower / can be stale).
3. To verify the folder is mounted, you can ask Claude: "هل تشوف مجلد mep-fixed؟" — it should answer yes and list a few files.

**For non-Cowork sessions** (claude.ai web, mobile app, etc.) where there's no local folder, the bootstrap automatically falls back to GitHub. The command works in both scenarios.

---

## Where to Save the Command

Pick whichever is easiest for you to access from any new conversation:

1. **Sticky note on desktop** (low-tech, always visible)
2. **Saved snippet in your text expander** (TextBlaze, PhraseExpress) — type `;constrai` and it expands
3. **Pinned in your browser bookmarks** as a note
4. **At the top of your password manager** as a "Quick Note"
5. **Pinned message in your own Slack/Discord/notes app**

The Password Manager option is recommended — you'll already be opening it for credentials anyway.

---

## Maintenance

This file rarely changes. The bootstrap procedure lives in [`CLAUDE.md`](./CLAUDE.md) Section 0 — update there if the workflow needs to evolve. The one-line command in this doc stays the same.
