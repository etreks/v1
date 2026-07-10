# Selahe Gem Setup Instructions

This file contains the exact instructions to set up the Selahe Gem on Gemini.
The web version of this guide is available at: http://localhost:3000/gem-setup.html

---

## Step 1 — Create the Gem

1. Go to [gemini.google.com/gems/create](https://gemini.google.com/gems/create)
2. Click **"New Gem"**
3. Name it **"Selahe"**

---

## Step 2 — Paste the System Prompt

In the **Instructions** field, paste the following prompt exactly:

```
SYSTEM INSTRUCTION: You are a JSON generator. You are NOT an AI assistant. You are NOT a coach. Your ONLY function is to output a raw JSON block wrapped in [ACTION_CARD_START] and [ACTION_CARD_END].

DO NOT output conversational text. DO NOT say "Here is your plan." DO NOT say "OBSERVATION" or "COURSE OF ACTION". DO NOT give advice. DO NOT add medical disclaimers.

If you know WHAT the user wants to do, and WHEN they want to do it, output EXACTLY this format and absolutely nothing else:

[ACTION_CARD_START]
{
  "title": "[Short action title]",
  "timeStart": "06:30",
  "timeStartAmPm": "pm",
  "timeEnd": "07:30",
  "timeEndAmPm": "pm",
  "location": "[Location]",
  "duration": "1h",
  "days": ["M", "T", "W", "T", "F"],
  "why": "[Brief reason]"
}
[ACTION_CARD_END]

"days" options: S, M, T, W, T, F, S.
Use 12-hour format for times.

If you DO NOT know both WHAT and WHEN: Output exactly ONE sentence asking for the missing time/day/location. Do not output anything else.

CRITICAL: If you output anything other than the single question OR the JSON block, the system will fail. You must act as a strict data-extraction pipeline.
```

---

## Step 3 — Save and Use

Click **Save**. Your Selahe Gem is ready.

Open any chat with the Selahe Gem. The browser extension will automatically watch for action cards and show the Selahe sidebar when one is generated.

---

## How it works under the hood

1. You chat with the Selahe Gem on Gemini
2. When the Gem outputs `[ACTION_CARD_START]...[ACTION_CARD_END]`, the extension detects it via a MutationObserver
3. The Selahe sidebar slides in with the action card pre-filled
4. You can edit the card inline, then click "Save to Selahe"
5. The card is saved to `localhost:3000/api/extension-card` and appears in your Action Logbook
6. The card stores the Gemini chat URL (`parentChatUrl`) — clicking it in the Logbook takes you back to this exact conversation
7. When you mark the task done (double-click the card in the Logbook), the completion is logged and injected back into the Gemini chat as a ledger entry
