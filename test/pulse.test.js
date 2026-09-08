import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  defineDeck, deckForRespondent, validateAnswers, summarise, consolidate, aggregate,
  createMemoryHost, openCycle, getCycle, submitCycle, governanceDeck,
} from '../src/index.js';

const decks = { governance: governanceDeck };

test('the governance deck is valid and covers all three layers, four each', () => {
  const byLayer = {};
  for (const q of governanceDeck.questions) byLayer[q.layer] = (byLayer[q.layer] || 0) + 1;
  assert.deepEqual(byLayer, { ethics: 4, legal: 4, data_security: 4 });
  assert.equal(governanceDeck.questions.length, 12);
});

test('every single-choice question offers a way to say "I do not know"', () => {
  for (const q of governanceDeck.questions) {
    if (q.kind !== 'single') continue;
    assert.ok(q.options.some((o) => o.unknown), `${q.key} has no unknown option`);
  }
});

test('a deck cannot be defined without an unknown option on a factual question', () => {
  assert.throws(() => defineDeck({
    key: 'bad', title: 'Bad',
    questions: [{ key: 'q', ask: 'Do you?', kind: 'single', options: [
      { value: 'y', label: 'Yes' }, { value: 'n', label: 'No' },
    ] }],
  }), /unknown:true/);
});

test('the respondent payload carries no findings — nothing leads the answer', () => {
  const wire = JSON.stringify(deckForRespondent(governanceDeck));
  // No findings, and no `unknown: true` flag — a respondent must not be able to
  // see which answer we treat as the problem one. The option VALUE "unknown" is
  // fine and has to survive: it is what the screen submits for "Don't know".
  assert.ok(!wire.includes('finding'), 'findings leaked to the respondent');
  assert.ok(!wire.includes('"unknown":true'), 'the unknown flag leaked to the respondent');
  assert.ok(!wire.includes('layer'), 'the policy layer leaked to the respondent');
  assert.ok(wire.includes('Have source details ever gone into an AI tool?'));
  assert.ok(wire.includes('"value":"unknown"'), 'the Don\'t know option must still be answerable');
});

test('answers are validated against the options, and skipping is allowed', () => {
  assert.throws(() => validateAnswers(governanceDeck, { disclosure: 'maybe' }), /not one of its options/);
  assert.throws(() => validateAnswers(governanceDeck, { nope: 'x' }), /not questions in this deck/);
  assert.throws(() => validateAnswers(governanceDeck, { disclosure: ['always', 'never'] }), /expects one answer/);

  const { answers, skipped } = validateAnswers(governanceDeck, { disclosure: 'never' });
  assert.equal(answers.disclosure, 'never');
  assert.equal(skipped.length, 11);
});

test('multi-choice takes several values and rejects repeats', () => {
  const { answers } = validateAnswers(governanceDeck, { ai_uses: ['transcription', 'drafting'] });
  assert.deepEqual(answers.ai_uses, ['transcription', 'drafting']);
  assert.throws(() => validateAnswers(governanceDeck, { ai_uses: ['drafting', 'drafting'] }), /repeated answer/);
});

test('an unknown answer becomes a finding, not a gap — the point of the engine', () => {
  const { answers, skipped } = validateAnswers(governanceDeck, { source_details: 'unknown' });
  const s = summarise(governanceDeck, answers, { skipped });

  assert.equal(s.unknowns.length, 1);
  assert.equal(s.unknowns[0].question, 'source_details');
  assert.equal(s.unknowns[0].layer, 'data_security');

  const f = s.findings.find((x) => x.question === 'source_details');
  assert.equal(f.kind, 'unknown');
  assert.equal(f.layer, 'data_security');
  assert.match(f.finding, /Nobody here can say/);
  assert.equal(s.byLayer.data_security, 1);

  // and it is NOT counted as skipped
  assert.ok(!s.skipped.some((x) => x.question === 'source_details'));
});

test('a skipped question is reported separately from an unknown one', () => {
  const { answers, skipped } = validateAnswers(governanceDeck, { source_details: 'unknown' });
  const s = summarise(governanceDeck, answers, { skipped });
  assert.equal(s.answered, 1);
  assert.equal(s.total, 12);
  assert.equal(s.skipped.length, 11);
  assert.ok(s.skipped.every((x) => x.ask));   // each carries the question it was
});

test('reported answers carry the finding the deck defined, with its layer', () => {
  const { answers } = validateAnswers(governanceDeck, {
    source_details: 'yes', accountable_person: 'no', jurisdiction: 'ZA',
  });
  const s = summarise(governanceDeck, answers);
  const byQ = Object.fromEntries(s.findings.map((f) => [f.question, f]));

  assert.match(byQ.source_details.finding, /most serious finding/);
  assert.equal(byQ.source_details.layer, 'data_security');
  assert.match(byQ.accountable_person.finding, /Nobody is accountable/);
  assert.equal(byQ.accountable_person.layer, 'legal');
  assert.match(byQ.jurisdiction.finding, /POPIA/);
  assert.match(byQ.jurisdiction.finding, /72 hours/);
});

test('an answer with no finding produces none', () => {
  const { answers } = validateAnswers(governanceDeck, { ai_scam: 'no' });
  assert.equal(summarise(governanceDeck, answers).findings.length, 0);
});

test('the full round trip over the handlers, through a host', async () => {
  const host = createMemoryHost();

  const opened = await openCycle({ host, decks, deckKey: 'governance', subjectId: 'newsroom-1', token: 'tok_1' });
  assert.equal(opened.status, 200);

  const fetched = await getCycle({ host, decks, token: 'tok_1' });
  assert.equal(fetched.status, 200);
  assert.equal(fetched.body.already_answered, false);
  assert.equal(fetched.body.deck.questions.length, 12);

  const sent = await submitCycle({ host, decks, token: 'tok_1', answers: {
    ai_uses: ['transcription', 'drafting'], disclosure: 'never',
    jurisdiction: 'ZA', accountable_person: 'no',
    source_details: 'unknown', two_factor: 'none',
  } });
  assert.equal(sent.status, 200);
  assert.equal(sent.body.saved, true);
  assert.equal(sent.body.summary.answered, 6);
  assert.equal(sent.body.summary.unknowns.length, 1);
  assert.ok(sent.body.summary.findings.length >= 6);

  // answering twice is refused rather than silently overwriting
  const again = await submitCycle({ host, decks, token: 'tok_1', answers: { disclosure: 'always' } });
  assert.equal(again.status, 400);
  const reopened = await getCycle({ host, decks, token: 'tok_1' });
  assert.equal(reopened.body.already_answered, true);
});

test('a bad or expired token is refused, and a bad answer never reaches the host', async () => {
  const host = createMemoryHost();
  assert.equal((await getCycle({ host, decks, token: 'nope' })).status, 404);

  await openCycle({ host, decks, deckKey: 'governance', subjectId: 's', token: 'tok_old', expiresAt: '2020-01-01' });
  assert.equal((await getCycle({ host, decks, token: 'tok_old' })).status, 410);

  await openCycle({ host, decks, deckKey: 'governance', subjectId: 's2', token: 'tok_2' });
  const bad = await submitCycle({ host, decks, token: 'tok_2', answers: { disclosure: 'nonsense' } });
  assert.equal(bad.status, 400);
  assert.equal((await host.listResponses({})).length, 0);
});

test('aggregate refuses to report below the subject threshold', async () => {
  const host = createMemoryHost();
  for (const n of [1, 2, 3, 4]) {
    await openCycle({ host, decks, deckKey: 'governance', subjectId: `n${n}`, token: `t${n}` });
    await submitCycle({ host, decks, token: `t${n}`, answers: { two_factor: 'none' } });
  }
  const four = aggregate(governanceDeck, await host.listResponses({ deckKey: 'governance' }));
  assert.equal(four.reportable, false);
  assert.equal(four.subjects, 4);
  assert.match(four.message, /Fewer than 5/);

  await openCycle({ host, decks, deckKey: 'governance', subjectId: 'n5', token: 't5' });
  await submitCycle({ host, decks, token: 't5', answers: { two_factor: 'all' } });
  const five = aggregate(governanceDeck, await host.listResponses({ deckKey: 'governance' }));
  assert.equal(five.reportable, true);
  const tf = five.questions.find((q) => q.question === 'two_factor');
  assert.equal(tf.options.find((o) => o.value === 'none').count, 4);
  assert.equal(tf.options.find((o) => o.value === 'all').count, 1);
});

test('the engine refuses a host that does not meet the contract', async () => {
  await assert.rejects(() => getCycle({ host: {}, decks, token: 't' }), /host is missing/);
});

/* ── consolidate: every response for one subject, not just the last ──────── */

// A newsroom is not one person. These cases are the reason consolidate exists:
// writing a policy from whichever colleague answered last discards the rest and
// discards the disagreements, which are the most useful part of the set.

const r = (answers, submittedAt = '2026-09-08T10:00:00Z') => ({ answers, skipped: [], submittedAt });

test('consolidate with nothing answered is an honest empty result', () => {
  const out = consolidate(governanceDeck, []);
  assert.equal(out.respondents, 0);
  assert.equal(out.answered, 0);
  assert.deepEqual(out.findings, []);
  assert.equal(out.skipped.length, 12, 'every question should read as unanswered');
});

test('consolidate reads every respondent, not only the most recent', () => {
  const out = consolidate(governanceDeck, [
    r({ ai_uses: ['transcription'] }, '2026-09-01T00:00:00Z'),
    r({ ai_uses: ['images'] },        '2026-09-08T00:00:00Z'),
  ]);
  assert.equal(out.respondents, 2);
  const text = out.findings.map((f) => f.finding).join(' | ');
  assert.match(text, /transcription/i, 'the earlier respondent was dropped');
  assert.match(text, /images/i, 'the later respondent was dropped');
});

test('a multi-select union is the truth: what anyone reports, happens here', () => {
  const out = consolidate(governanceDeck, [
    r({ ai_uses: ['transcription', 'drafting'] }),
    r({ ai_uses: ['drafting', 'images'] }),
  ]);
  const reported = out.findings.filter((f) => f.kind === 'reported');
  assert.equal(reported.length, 3, 'transcription, drafting and images should all stand');
  const drafting = reported.find((f) => /drafting/i.test(f.finding));
  assert.equal(drafting.said, 2);
  assert.equal(drafting.of, 2);
  assert.equal(drafting.agreed, true);
});

test('a lone report is not promoted to house practice — the count travels with it', () => {
  const out = consolidate(governanceDeck, [
    r({ ai_uses: ['transcription'] }), r({ ai_uses: ['drafting'] }),
    r({ ai_uses: ['drafting'] }),      r({ ai_uses: ['drafting'] }),
  ]);
  const lone = out.findings.find((f) => /transcription/i.test(f.finding));
  assert.equal(lone.said, 1);
  assert.equal(lone.of, 4);
  assert.equal(lone.agreed, false);
  assert.match(lone.why, /1 of 4/);
});

test('nobody able to answer is one weighted unknown, not one per person', () => {
  const out = consolidate(governanceDeck, [
    r({ source_details: 'unknown' }), r({ source_details: 'unknown' }), r({ source_details: 'unknown' }),
  ]);
  const u = out.findings.filter((f) => f.kind === 'unknown');
  assert.equal(u.length, 1);
  assert.equal(u[0].said, 3);
  assert.equal(u[0].of, 3);
  assert.match(u[0].why, /3 people/);
  assert.equal(out.unknowns.length, 1);
});

test('THE BLIND SPOT: some report the practice, others cannot see it', () => {
  // The editor says nobody uses AI; two reporters list tools. The practice is
  // real and unevenly known — a different problem from either doing it or not
  // knowing about it, and the one a policy has to close.
  const out = consolidate(governanceDeck, [
    r({ ai_uses: ['none'] }),
    r({ ai_uses: ['transcription'] }),
    r({ ai_uses: ['drafting'] }),
  ]);
  const blind = out.conflicts.find((c) => c.kind === 'blind_spot');
  assert.ok(blind, 'a blind spot should have been found');
  assert.equal(blind.said, 1);
  assert.equal(blind.of, 3);
  assert.equal(blind.agreed, false);
  assert.match(blind.finding, /1 of 3/);
  assert.match(blind.why, /owner/i, 'it must ask for a rule and an owner');
  // And it must not be swallowed: the reports still stand alongside it.
  assert.ok(out.findings.some((f) => f.kind === 'reported' && /transcription/i.test(f.finding)));
});

test('two accounts of the same arrangement is a conflict, not a majority vote', () => {
  const out = consolidate(governanceDeck, [
    r({ who_decides: 'editor' }), r({ who_decides: 'nobody' }), r({ who_decides: 'nobody' }),
  ]);
  const c = out.conflicts.find((x) => x.kind === 'conflict');
  assert.ok(c, 'a conflict should have been found');
  assert.match(c.finding, /do not agree/i);
  assert.match(c.finding, /2 said "Nobody decides"/);
  assert.match(c.finding, /1 said "An editor"/);
  assert.equal(c.agreed, false);
  // Both accounts survive as findings; the engine does not pick a winner.
  const reported = out.findings.filter((f) => f.kind === 'reported' && f.question === 'who_decides');
  assert.equal(reported.length, 2);
});

test('agreement is not reported as a conflict', () => {
  const out = consolidate(governanceDeck, [
    r({ who_decides: 'editor' }), r({ who_decides: 'editor' }),
  ]);
  assert.deepEqual(out.conflicts, []);
  const f = out.findings.find((x) => x.question === 'who_decides');
  assert.equal(f.agreed, true);
  assert.equal(f.said, 2);
});

test('disagreements come first, so what needs deciding is read first', () => {
  const out = consolidate(governanceDeck, [
    r({ ai_uses: ['transcription'], who_decides: 'editor',  source_details: 'unknown' }),
    r({ ai_uses: ['none'],          who_decides: 'nobody',  source_details: 'unknown' }),
  ]);
  const kinds = out.findings.map((f) => f.kind);
  const firstReported = kinds.indexOf('reported');
  for (const k of ['blind_spot', 'conflict']) {
    const at = kinds.indexOf(k);
    assert.ok(at > -1 && at < firstReported, `${k} should sort above plain reports`);
  }
});

test('a question everyone left blank is skipped, never an unknown', () => {
  const out = consolidate(governanceDeck, [r({ ai_uses: ['drafting'] }), r({ ai_uses: ['drafting'] })]);
  assert.ok(out.skipped.some((s) => s.question === 'source_details'));
  assert.ok(!out.unknowns.some((u) => u.question === 'source_details'));
  assert.equal(out.answered, 1);
  assert.equal(out.total, 12);
});

test('consolidate returns the same keys as summarise, so a consumer can swap', () => {
  const one = summarise(governanceDeck, { ai_uses: ['drafting'] }, { skipped: [] });
  const many = consolidate(governanceDeck, [r({ ai_uses: ['drafting'] })]);
  for (const k of Object.keys(one)) assert.ok(k in many, `consolidate is missing ${k}`);
  assert.equal(many.first_answered_at, '2026-09-08T10:00:00Z');
  assert.equal(many.last_answered_at, '2026-09-08T10:00:00Z');
});
