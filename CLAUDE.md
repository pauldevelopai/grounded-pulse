# Pulse — the question engine

> Auto-loaded by Claude Code. Read before changing anything here.

`@developai/grounded-pulse` asks a subject a short set of **fixed-choice** questions and
keeps the answers. One tap per question, no typing. It is not a survey tool and not a form
builder: the moment a question needs a paragraph, a number or a ranking, it belongs
somewhere else.

## Why it is its own directory

Two half-versions of this already existed and neither was reusable.

**The `paulbrief` skill** has the right interaction — rapid fixed choices per item
(Done / Keep / Dismiss / Delete), a live tally, one screen. It has no store: persistence is
Paul pressing "Copy triage" and pasting the result back into chat, which then edits a
preferences block in the skill. That works because there is one respondent and he is
technical.

**The tracker's Pulse** (`grounded2026/server/pulse/*`, `routes/pulse*.js`, ~1,100 lines)
has the right delivery — a cycle, a token link that reaches someone who is not logged in, a
respondent page, a follow-up plan — stored entirely in **Airtable**. Its questions are
AI-generated free text, capped at three, with a vetting stage. Nothing in it asks a
multiple-choice question, and as of 2026-09 it had **never been used**: zero cycles, zero
questions, zero responses in all three Airtable tables. That is why this is a fresh build
and not a migration.

This engine is the first half's interaction on the second half's delivery, with a real
store — and it lives at GROUNDED level because governance is not its only consumer.

## The three rules that shape the code

**1. "Don't know" is a finding, not a gap.** In governance it is often the most useful
answer in the deck. A newsroom that answers "don't know" to whether source details have
reached an AI tool has said something specific: nobody is tracking it. That is exactly what
generates a control and a policy section. So an unknown answer is never dropped, never
counted as "unanswered", and reported separately from a question that was simply skipped.
`defineDeck` **refuses** a single-choice factual question that offers no way to say it —
pass `requireUnknownOption: false` only when the question is a preference rather than a fact.

**2. Disagreement is a finding too, and a subject is not one person.** `summarise` reads
ONE response; `consolidate` (v0.2.0) reads all of a subject's responses together, and it is
the one a real consumer should call. Reading only the latest response is a bug, not a
simplification: it silently discards everyone who answered earlier, and with them the
disagreements. If the editor says nobody here uses AI and two reporters between them list
six tools, that gap means the practice exists and is invisible to the person accountable for
it — which needs a rule and an owner, not a description of current practice. So conflicts
are never settled by majority: both accounts stand, the disagreement becomes its own
finding, and every finding carries `said`/`of` counts so a lone report is not mistaken for
house practice. Findings come back with `blind_spot` and `conflict` sorted above plain
reports. **The tracker read `latestFindings` (one response, `LIMIT 1`) until 2026-09-08 —
that is exactly the bug this rule exists to prevent.**

**3. The engine owns the logic; the consumer owns the store.** `src/host.js` is the whole
storage contract, and it is an argument. The engine never touches a database. This is the
node runtime's arrangement (`host.store`, `host.db`) and it exists because an engine that
owns its own tables can only be reused by services willing to adopt its tenancy — which is
how a shared engine ends up with one consumer.

Note the vocabulary: **subject**, not newsroom. A subject is whoever is being asked — a
newsroom, a business, a cohort, one person. Naming it `newsroomId` would have quietly
limited the engine to one product.

## Shape

```
src/deck.js       question + deck shape, and the validation that keeps a deck honest
src/answers.js    answer validation; summarise (one response), consolidate (all of one
                  subject's, with conflicts), aggregate (many subjects, k-anonymous)
src/host.js       the storage contract + createMemoryHost (also the spec a real host is written against)
src/handlers.js   the HTTP face, as plain functions
decks/governance.js  the first real deck — 12 questions, 4 per policy layer
test/             node --test, 25 cases; `npm test`
```

**No dependencies, and no Express.** Two kinds of consumer need these questions and they
cannot share a framework: a server can import a library, a Claude skill or a published
artifact cannot — it renders a page and needs an endpoint to post to. So `handlers.js`
exports functions taking plain input and returning `{ status, body }`. The tracker wraps
them in Express in about ten lines; a test calls them directly. Same reason the opportunity
engine has no dependencies.

## Deliberately absent

- **Branching.** No question in the governance deck needs it — they are all fixed-option
  single or multi select. It would go in `deck.js` as a `showIf` on a question, evaluated in
  `handlers.getCycle` against answers so far. Do not add the field until a deck needs it; an
  unused field invites a consumer to rely on it.
- **Free text, numbers, rankings.** See the top of this file.
- **Authorisation.** A token is a bearer credential. Whether that is enough is the
  consumer's decision, not this engine's.
- **Scheduling and sending.** The engine opens a cycle and takes a token the caller minted.
  Who gets emailed, and when, belongs to whatever is using it.

## Consuming it

A consumer supplies a deck and a host:

```js
import { getCycle, submitCycle, openCycle, governanceDeck } from '@developai/grounded-pulse';
const decks = { governance: governanceDeck };
// then four thin Express routes over getCycle / submitCycle / openCycle
```

**The tracker consumes no shared package today** — not even `@developai/grounded-node-runtime`
(`routes/corpus.js` carries a private copy of a validator rather than importing the
runtime's). So the tracker importing this is a first, and it is the point: the one engine
extracted this way before, `grounded-opportunity-engine`, sat unconsumed for a stretch.
**Wiring a consumer is part of shipping this, not a follow-up.**

## Where the answers should end up

Findings carry the policy layer they inform (`ethics` | `legal` | `data_security`), matching
`knowledge_entries.layers` in the tracker (migration 187) and `POLICY_LAYERS` in
`routes/policy-builder.js`. The intent is that a newsroom's answers reach its policy: an
unknown about source details becomes a data-security rule, "nobody decides" becomes an
ethics decision point. The engine produces the findings; the tracker decides what to do
with them.
