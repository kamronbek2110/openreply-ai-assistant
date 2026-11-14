# Instagram AI setup notes

## What is in this branch

The `feat/ai-assistant` branch adds an optional Gemini assistant to OpenReply.
It replies to unmatched inbound DMs and comments through OpenReply's existing
Instagram API connection. Keyword campaigns take priority. AI replies are off
by default and can be enabled per Instagram account in Settings.

The assistant uses Uzbek Latin, adds an automated-assistant notice to its first
DM, marks public replies as automated, stops after the configured daily limit,
pauses for 12 hours after an owner replies through the OpenReply inbox, and
deletes AI message history after 30 days. Owner instructions are required for
account-specific facts; without them the assistant is told not to invent facts.

## Hosting variables

Add `GEMINI_API_KEY` to the web and worker secret settings. `GEMINI_MODEL` is
optional and defaults to `gemini-3.8-flash`. Never put the real key in this
file, `.env.example`, source control, or chat.

## Remaining setup

- Apply the `20261114120000_ai_assistant` Prisma migration during deployment.
- Set up the existing OpenReply web app, worker, Postgres, Redis, email sign-in,
  and direct Meta app using the current `docs/setup.md` instructions.
- Connect an Instagram Business or Creator account and configure its Meta
  webhook before enabling AI.
- Add the account's business facts and response boundaries in Settings.
- Create or borrow a separate Instagram account for end-to-end testing before
  turning on replies to real users.

No live services or Instagram accounts have been connected from this branch.
