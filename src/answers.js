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
