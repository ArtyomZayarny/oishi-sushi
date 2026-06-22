**Purpose:** Live 5-query acceptance demo of the Sommelier (Kenji) MVP on staging — the DoD §12 manual demo, run against the shipping config.
Created: 2026-06-22 — release acceptance demo (Sonnet 4.6 + temperature=0)

# Sommelier MVP — Live 5-Query Demo (2026-06-22)

- **Target:** https://web-production-f62b1.up.railway.app/ (real staging site, behind the access gate)
- **Model:** `claude-sonnet-4-6`, `SOMMELIER_TEMPERATURE=0` (set on the Railway `api` service)
- **Method:** `POST /api/sommelier` via the web proxy; verdicts cross-checked against the live `/api/menu` allergen + createdAt data.
- **Menu under test:** 6 meals; shellfish = Chef’s Omakase, Sashimi Moriawase, Couple’s Set; non-shellfish = Otoro Selection, Toro Truffle Roll, Ikura Don.

| Query                          | Confidence | Cards | Verdict | Detail                                                                                   |
| ------------------------------ | ---------- | ----- | ------- | ---------------------------------------------------------------------------------------- | --------------------------------------------- |
| Q1 "something spicy with tuna" | low        | 2     | ✅ PASS | tuna: Toro Truffle Roll, Otoro Selection                                                 |
| Q2 "without shellfish" +chip   | high       | 3     | ✅ PASS | ZERO shellfish                                                                           | Toro Truffle Roll, Otoro Selection, Ikura Don |
| Q3 "what's new?"               | high       | 5     | ✅ PASS | recs∩top5: Toro Truffle Roll, Chef’s Omakase, Sashimi Moriawase, Ikura Don, Couple’s Set |
| Q4 "any deals or discounts?"   | abstain    | 0     | ✅ PASS | cards=0 (must abstain)                                                                   |
| Q5 "do you have pizza?"        | abstain    | 0     | ✅ PASS | cards=0 (must abstain)                                                                   |

**Overall: ✅ ALL 5 PASS**

Notes: Q1 now reliably recommends the tuna dishes with an honest “nothing is spicy” caveat (the partial-match fix), instead of the pre-fix coin-flip abstain. Q2 enforces the hard allergen gate (zero shellfish). Q4/Q5 honestly abstain with zero cards (offers descoped; off-menu). The API answer keeps `[n]` citation markers (F1-AC4); the UI strips them for display. Raw responses: `q1.json`–`q5.json`; menu snapshot: `menu.json`.
