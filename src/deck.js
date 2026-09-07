// Deck + question shape, and the validation that keeps a deck honest.
//
// A DECK is an ordered set of questions asked of one subject in one sitting.
// A QUESTION is answered in a single tap: one choice, or several from a fixed
// list. There is no free-text field and no numeric input, on purpose — the
// mechanic this engine exists to serve is "rapid, no typing", and the moment a
// question needs a paragraph it belongs in a form, not in a pulse.
//
// A deck is DATA, not code. It carries the questions, the option labels, the
// policy layer each question informs, and the finding an answer implies. That
// is what lets a new deck be added, or an existing one tuned, without touching
// the engine — the same reason the opportunity engine keeps scoring criteria as
// tenant-owned config.

export const QUESTION_KINDS = ['single', 'multi'];

/** Layers a question can inform. null = it informs nothing in particular. */
export const LAYERS = ['ethics', 'legal', 'data_security'];

/**
 * Validate and normalise a deck. Throws on anything that would produce a
 * question a person cannot answer, or an answer nobody can interpret.
 */
export function defineDeck(deck) {
  const { key, title, subjectKind = 'newsroom', questions } = deck || {};
  if (!key || typeof key !== 'string') throw new Error('deck: key is required');
  if (!title) throw new Error(`deck ${key}: title is required`);
  if (!Array.isArray(questions) || questions.length === 0) {
    throw new Error(`deck ${key}: at least one question is required`);
  }

  const seen = new Set();
  const normalised = questions.map((q, i) => {
    const where = `deck ${key}, question ${i + 1}`;
    if (!q.key) throw new Error(`${where}: key is required`);
    if (seen.has(q.key)) throw new Error(`${where}: duplicate key "${q.key}"`);
    seen.add(q.key);
    if (!q.ask) throw new Error(`${where} (${q.key}): ask is required`);
    if (!QUESTION_KINDS.includes(q.kind)) {
      throw new Error(`${where} (${q.key}): kind must be one of ${QUESTION_KINDS.join(', ')}`);
    }
    if (q.layer != null && !LAYERS.includes(q.layer)) {
      throw new Error(`${where} (${q.key}): layer must be one of ${LAYERS.join(', ')} or null`);
    }
    if (!Array.isArray(q.options) || q.options.length < 2) {
      throw new Error(`${where} (${q.key}): at least two options are required`);
    }

    const values = new Set();
    const options = q.options.map((o, j) => {
      const ow = `${where} (${q.key}), option ${j + 1}`;
      if (!o.value) throw new Error(`${ow}: value is required`);
      if (values.has(o.value)) throw new Error(`${ow}: duplicate value "${o.value}"`);
      values.add(o.value);
      if (!o.label) throw new Error(`${ow}: label is required`);
      return {
        value: o.value,
        label: o.label,
        // "Don't know" is a real answer, not a refusal to answer. See answers.js.
        unknown: o.unknown === true,
        // The plain-language observation this answer implies, recorded against
        // the question's layer. Optional: many answers imply nothing.
        finding: o.finding || null,
      };
    });

    // A question with no way to say "I don't know" forces a guess, and a guess
    // recorded as fact is worse than an admitted gap. Single-choice questions
    // about the subject's own practice must offer one.
    if (q.kind === 'single' && q.requireUnknownOption !== false && !options.some((o) => o.unknown)) {
      throw new Error(
        `${where} (${q.key}): needs an option marked unknown:true, or requireUnknownOption:false ` +
        `if the question genuinely has no unknown (e.g. asking a preference rather than a fact)`
      );
    }

    return { key: q.key, ask: q.ask, kind: q.kind, layer: q.layer ?? null, help: q.help || null, options };
  });

  return { key, title, subjectKind, questions: normalised };
}

/** The wire shape sent to a respondent — no findings, so nothing leads them. */
export function deckForRespondent(deck) {
  return {
    key: deck.key,
    title: deck.title,
    questions: deck.questions.map((q) => ({
      key: q.key,
      ask: q.ask,
      kind: q.kind,
      help: q.help,
      options: q.options.map((o) => ({ value: o.value, label: o.label })),
    })),
  };
}

export function findQuestion(deck, key) {
  return deck.questions.find((q) => q.key === key) || null;
}
