# @developai/grounded-pulse

Ask a subject a short set of fixed-choice questions, keep the answers, turn them into
findings. One tap per question, no typing.

```js
import {
  openCycle, getCycle, submitCycle, summarise,
  createMemoryHost, governanceDeck,
} from '@developai/grounded-pulse';

const host  = createMemoryHost();          // or a Postgres host of your own
const decks = { governance: governanceDeck };

await openCycle({ host, decks, deckKey: 'governance', subjectId: 'newsroom-1', token: 'tok_abc' });

// the respondent opens the link
const { body } = await getCycle({ host, decks, token: 'tok_abc' });
// body.deck.questions -> 12 questions, options only, no findings

// they tap through it
const done = await submitCycle({ host, decks, token: 'tok_abc', answers: {
  ai_uses: ['transcription', 'drafting'],
  source_details: 'unknown',
  jurisdiction: 'ZA',
}});
done.body.summary.findings;   // what the answers imply, per policy layer
done.body.summary.unknowns;   // what nobody there could answer — findings in themselves
```

`npm test` — 14 cases, no dependencies.

Design notes, and why this is a separate package: [CLAUDE.md](CLAUDE.md).
