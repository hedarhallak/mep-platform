# How to Start a New Claude Conversation for Constrai

> **The whole system is ONE command.** Save it once, paste it any time.

---

## The Command (copy-paste verbatim)

```
اقرأ https://raw.githubusercontent.com/hedarhallak/mep-platform/main/CLAUDE.md واتبع تعليمات Bootstrap في أوله.
```

That's it. One line.

The receiving Claude will:
1. Fetch CLAUDE.md
2. Follow Section 0 (Bootstrap) which tells it to read MASTER_README, DECISIONS, RECOVERY in order
3. Find the latest Session Log to know where you left off
4. Ask you what to work on today

---

## Optional: Specify the Task Upfront

If you already know what you want to work on, add it as a second line:

```
اقرأ https://raw.githubusercontent.com/hedarhallak/mep-platform/main/CLAUDE.md واتبع تعليمات Bootstrap في أوله.

اليوم نكمل: <اكتب المهمة هنا>
```

**Examples for the second line:**
- `اليوم نكمل Layer 3 hardening (Password Manager + Emergency Access)`
- `اليوم نضيف endpoint جديد لـ X feature`
- `اليوم في bug في الموبايل: <وصف>`
- `اليوم نشتغل على web frontend i18n`

Claude reads the bootstrap, then sees your specified task, and pulls in any extra reference files needed (SCHEMA.md for DB work, API.md for backend, etc.) automatically.

---

## Why This Works

- **One thing to remember.** No template selection. No fill-in-the-blanks.
- **Intelligence on Claude's side, not yours.** CLAUDE.md tells fresh Claude exactly which files to read and in what order.
- **Self-updating.** When we add new files or change the bootstrap procedure, we update CLAUDE.md once. The command you save never changes.
- **Works from any device, any platform.** All the state lives in GitHub. Even if your laptop dies mid-session, you open Claude on another device, paste the command, continue.

---

## What If Claude Doesn't Follow the Bootstrap?

Very rare, but if a fresh Claude misreads or skips Bootstrap:
- Reply: "اقرأ Section 0 في CLAUDE.md من جديد ونفذ خطواتها بالترتيب"
- That should reset it.

---

## Prerequisite: Web Access Must Be Allowed

For the bootstrap to work, the Claude session needs permission to fetch URLs from `raw.githubusercontent.com`. If you see a warning like:

```
Access to this website is blocked by your network egress settings.
```

…then your Claude account / workspace has restrictive web access settings that may block the bootstrap from completing.

**Check + fix:**
1. **Claude desktop app / claude.ai:** Settings → Capabilities → Web Search/Fetch → make sure it's ON. If you're on a Team/Enterprise plan, an admin may need to enable it.
2. **Cowork mode:** by default WebFetch should work for `raw.githubusercontent.com`. If it doesn't, try: Settings → Network → allowlist `raw.githubusercontent.com`.
3. **Verify quickly:** in any Claude conversation, paste the bootstrap command. If Claude reads the files without warnings, you're good. If it shows the blocked-network message, fix the setting before relying on the workflow for important sessions.

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
