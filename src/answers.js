// Answer validation, and the roll-up that turns taps into findings.
//
// THE ONE IDEA WORTH KNOWING IN THIS FILE
//
// "Don't know" is a finding, not a gap.
//
// In a governance context it is often the most useful answer in the deck. A
// newsroom that answers "don't know" to whether source details have gone into
// an AI tool has told you something specific and actionable: nobody is tracking
// it. That is precisely what generates a control, and a section in their policy.
//
// So an unknown answer is never dropped, never counted as "unanswered", and
// never quietly averaged away. It produces its own finding, tagged with the
// layer the question informs, and it is reported separately from questions the
// respondent simply skipped.

import { findQuestion } from './deck.js';

/**
 * Validate a submitted answer set against a deck.
 * Returns { answers, skipped } or throws with a message a respondent could read.
 *
 * `answers` in: { [questionKey]: value | value[] }
 */
export function validateAnswers(deck, submitted) {
  if (!submitted || typeof submitted !== 'object' || Array.isArray(submitted)) {
    throw new Error('answers must be an object keyed by question');
  }

  const unknownKeys = Object.keys(submitted).filter((k) => !findQuestion(deck, k));
  if (unknownKeys.length) {
    throw new Error(`not questions in this deck: ${unknownKeys.join(', ')}`);
  }

  const answers = {};
  const skipped = [];

  for (const q of deck.questions) {
    const raw = submitted[q.key];
    const empty = raw == null || raw === '' || (Array.isArray(raw) && raw.length === 0);

    // Skipping is allowed. A pulse that refuses to submit until every question
    // is answered stops being rapid, and a forced answer is a false one.
    if (empty) { skipped.push(q.key); continue; }

    const values = q.kind === 'multi' ? (Array.isArray(raw) ? raw : [raw]) : [raw];
    if (q.kind === 'single' && Array.isArray(raw) && raw.length > 1) {
      throw new Error(`${q.key}: expects one answer, got ${raw.length}`);
    }

    const allowed = new Set(q.options.map((o) => o.value));
    for (const v of values) {
      if (typeof v !== 'string') throw new Error(`${q.key}: answers must be option values`);
      if (!allowed.has(v)) throw new Error(`${q.key}: "${v}" is not one of its options`);
    }
    if (new Set(values).size !== values.length) throw new Error(`${q.key}: repeated answer`);

    answers[q.key] = q.kind === 'multi' ? values : values[0];
  }

  return { answers, skipped };
}

/**
 * Turn one subject's answers into findings.
 *
 * Returns:
 *   findings   — what the answers imply, each with its layer and why
 *   unknowns   — questions the subject answered "don't know" (a finding in itself)
 *   skipped    — questions left blank (NOT the same as an unknown)
 *   byLayer    — counts per policy layer, for a summary line
 *   answered / total — honest counts
 */
export function summarise(deck, answers, { skipped = [] } = {}) {
  const findings = [];
  const unknowns = [];
  const byLayer = { ethics: 0, legal: 0, data_security: 0, unassigned: 0 };

  for (const q of deck.questions) {
    const given = answers[q.key];
    if (given == null) continue;
    const values = Array.isArray(given) ? given : [given];

    for (const v of values) {
      const opt = q.options.find((o) => o.value === v);
      if (!opt) continue;
      const layer = q.layer || 'unassigned';

      if (opt.unknown) {
        unknowns.push({ question: q.key, ask: q.ask, layer: q.layer || null });
        findings.push({
          question: q.key,
          layer: q.layer || null,
          kind: 'unknown',
          // Deliberately affirmative: this states what IS the case, rather than
          // reporting an absence of information.
          finding: `Nobody here can say: ${lowerFirst(q.ask)}`,
          why: 'An unknown is the finding. Until someone can answer this, the policy needs a rule and an owner for it, not a description of current practice.',
        });
        byLayer[layer]++;
        continue;
      }

      if (opt.finding) {
        findings.push({
          question: q.key,
          layer: q.layer || null,
          kind: 'reported',
          finding: opt.finding,
          why: `Reported by the newsroom: "${opt.label}".`,
        });
        byLayer[layer]++;
      }
    }
  }

  const answered = Object.keys(answers).length;
  return {
    findings,
    unknowns,
    skipped: skipped.map((k) => ({ question: k, ask: findQuestion(deck, k)?.ask || null })),
    byLayer,
    answered,
    total: deck.questions.length,
  };
}

/**
 * Combine EVERY response ONE subject has given into a single picture.
 *
 * `summarise` reads one response. This reads all of them, and it exists because
 * a newsroom is not one person. Asking four colleagues and then writing a policy
 * from whichever of them happened to answer last throws away three of the four —
 * and throws away the most valuable thing in the set, which is where they
 * disagree.
 *
 * DISAGREEMENT IS A FINDING, for the same reason an unknown is.
 *
 * If the editor says nobody here uses AI and two reporters between them list six
 * tools, that gap is not noise to be settled by majority vote. It means the
 * practice exists and is invisible to the person accountable for it. No
 * description of current practice fixes that; it needs a rule and an owner,
 * which is what a policy is for. So a conflict becomes its own finding and is
 * never averaged away.
 *
 * Every finding carries how many people said it out of how many answered that
 * question, so a consumer can tell "all four said this" from "one of four did"
 * instead of promoting a single voice to house practice.
 *
 * `responses` is this subject's responses in any order, each { answers, skipped }.
 *
 * Returns the same keys as `summarise` — so a consumer can move from one to the
 * other without reshaping anything — plus `conflicts` and `respondents`.
 * Findings come back with the disagreements first.
 */
export function consolidate(deck, responses = []) {
  const rs = (responses || []).filter((r) => r && r.answers && typeof r.answers === 'object');

  // No answers at all is an honest empty result, not a zeroed-out one. The
  // consumer needs to be able to say "nobody has answered yet" rather than
  // render a picture built from nothing.
  if (!rs.length) {
    return {
      respondents: 0, findings: [], unknowns: [], conflicts: [],
      skipped: deck.questions.map((q) => ({ question: q.key, ask: q.ask })),
      byLayer: { ethics: 0, legal: 0, data_security: 0, unassigned: 0 },
      answered: 0, total: deck.questions.length,
    };
  }

  const findings = [];
  const unknowns = [];
  const conflicts = [];
  const skipped = [];
  const byLayer = { ethics: 0, legal: 0, data_security: 0, unassigned: 0 };
  let answeredQuestions = 0;

  for (const q of deck.questions) {
    const layer = q.layer || 'unassigned';
    const add = (f) => { findings.push(f); byLayer[layer]++; };

    // Who engaged with this question at all, and what did each of them pick.
    const picks = [];
    for (const r of rs) {
      const given = r.answers[q.key];
      if (given == null) continue;
      const values = (Array.isArray(given) ? given : [given])
        .map((v) => q.options.find((o) => o.value === v))
        .filter(Boolean);
      if (values.length) picks.push(values);
    }

    // Every respondent left it blank. Reported as skipped, which is not the same
    // as an unknown: nobody declined to know, nobody was asked hard enough.
    if (!picks.length) { skipped.push({ question: q.key, ask: q.ask }); continue; }
    answeredQuestions++;

    const of = picks.length;
    const saidUnknown = picks.filter((opts) => opts.some((o) => o.unknown)).length;

    // Count each substantive option by how many people chose it.
    const reported = new Map();
    for (const opts of picks) {
      for (const o of opts) {
        if (o.unknown) continue;
        const seen = reported.get(o.value) || { opt: o, said: 0 };
        seen.said++;
        reported.set(o.value, seen);
      }
    }

    // 1. Nobody could answer it. Same finding `summarise` produces, now with the
    //    weight of everyone who could not say it rather than one person.
    if (saidUnknown && reported.size === 0) {
      unknowns.push({ question: q.key, ask: q.ask, layer: q.layer || null, said: saidUnknown, of });
      add({
        question: q.key, layer: q.layer || null, kind: 'unknown',
        finding: `Nobody here can say: ${lowerFirst(q.ask)}`,
        why: `All ${of === 1 ? 'the person who answered' : `${of} people who answered`} said they did not know. An unknown is the finding: until someone can answer this, the policy needs a rule and an owner for it, not a description of current practice.`,
        said: saidUnknown, of, agreed: true,
      });
      continue;
    }

    // 2. THE BLIND SPOT — the highest-value thing this function finds. Some
    //    people report the practice; others cannot see it. The practice is real
    //    and it is unevenly known, which is a different problem from either
    //    doing it or not knowing about it.
    if (saidUnknown && reported.size > 0) {
      const what = [...reported.values()].map((s) => s.opt.label.toLowerCase()).join(', ');
      const c = {
        question: q.key, ask: q.ask, layer: q.layer || null, kind: 'blind_spot',
        finding: `${saidUnknown} of ${of} people here could not say ${lowerFirst(q.ask)} — while others reported ${what}.`,
        why: 'The practice is happening and is invisible to some of the people answering for it. That gap is what the policy has to close: a rule, and a named owner who is expected to know.',
        said: saidUnknown, of, agreed: false,
      };
      conflicts.push(c);
      add(c);
    }

    // 3. A single-choice factual question answered two different ways. Both
    //    answers stand — whose account is correct is not the engine's call, and
    //    the fact that accounts differ is itself worth a policy section.
    if (q.kind !== 'multi' && reported.size > 1) {
      const accounts = [...reported.values()]
        .sort((a, b) => b.said - a.said)
        .map((s) => `${s.said} said "${s.opt.label}"`).join('; ');
      const c = {
        question: q.key, ask: q.ask, layer: q.layer || null, kind: 'conflict',
        finding: `People here do not agree on ${lowerFirst(q.ask)} — ${accounts}.`,
        why: 'Different accounts of the same arrangement means the arrangement is not written down or not known. The policy needs to state which it is.',
        said: of, of, agreed: false,
      };
      conflicts.push(c);
      add(c);
    }

    // 4. What was actually reported. For a multi-select the union is the truth:
    //    one person ticking transcription and another ticking images means both
    //    happen here. The count travels with it so a lone report is not mistaken
    //    for settled practice.
    for (const { opt, said } of reported.values()) {
      if (!opt.finding) continue;
      add({
        question: q.key, layer: q.layer || null, kind: 'reported',
        finding: opt.finding,
        why: said === of
          ? `Reported by everyone who answered (${said} of ${of}): "${opt.label}".`
          : `Reported by ${said} of ${of} people who answered: "${opt.label}".`,
        said, of, agreed: said === of,
      });
    }
  }

  // Disagreements first. A consumer that renders or prompts with this list in
  // order gets the things needing a decision before the things merely true.
  const rank = { blind_spot: 0, conflict: 1, unknown: 2, reported: 3 };
  findings.sort((a, b) => (rank[a.kind] ?? 9) - (rank[b.kind] ?? 9));

  const times = rs.map((r) => r.submittedAt).filter(Boolean).sort();
  return {
    respondents: rs.length,
    findings, unknowns, conflicts, skipped, byLayer,
    answered: answeredQuestions,
    total: deck.questions.length,
    first_answered_at: times[0] || null,
    last_answered_at: times[times.length - 1] || null,
  };
}

/**
 * Roll several subjects' responses up into a distribution per option.
 *
 * `minSubjects` refuses to report anything drawn from fewer than that many
 * subjects — the same k-anonymity discipline the corpus insights view uses, so
 * a small cohort cannot be de-anonymised from an aggregate. Returns an honest
 * empty result rather than a small-sample number.
 */
export function aggregate(deck, responses, { minSubjects = 5 } = {}) {
  const subjects = new Set(responses.map((r) => String(r.subjectId)));
  if (subjects.size < minSubjects) {
    return {
      reportable: false,
      subjects: subjects.size,
      min_subjects: minSubjects,
      message: `Fewer than ${minSubjects} subjects have answered, so there is nothing to report yet.`,
      questions: [],
    };
  }

  const questions = deck.questions.map((q) => {
    const counts = Object.fromEntries(q.options.map((o) => [o.value, 0]));
    let answeredBy = 0;
    for (const r of responses) {
      const given = r.answers?.[q.key];
      if (given == null) continue;
      answeredBy++;
      for (const v of (Array.isArray(given) ? given : [given])) {
        if (v in counts) counts[v]++;
      }
    }
    return {
      question: q.key,
      ask: q.ask,
      layer: q.layer,
      answered_by: answeredBy,
      options: q.options.map((o) => ({ value: o.value, label: o.label, unknown: o.unknown, count: counts[o.value] })),
    };
  });

  return { reportable: true, subjects: subjects.size, min_subjects: minSubjects, questions };
}

const lowerFirst = (s) => (s ? s.charAt(0).toLowerCase() + s.slice(1).replace(/\?$/, '') : s);
