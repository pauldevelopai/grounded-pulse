// @developai/grounded-pulse — public surface.
//
// One engine for asking a subject a short set of fixed-choice questions and
// keeping the answers. Rapid: one tap per question, no typing. Reusable: the
// engine owns the question shape, the validation and the roll-up, while whoever
// uses it owns the storage and decides who a subject is.
//
// Consumers are thin: a deck of questions plus a host. The governance deck is
// bundled because it is the first real one, not because the engine is about
// governance.

export { defineDeck, deckForRespondent, findQuestion, QUESTION_KINDS, LAYERS } from './deck.js';
export { validateAnswers, summarise, aggregate } from './answers.js';
export { assertHost, createMemoryHost } from './host.js';
export { openCycle, getCycle, submitCycle } from './handlers.js';
export { governanceDeck } from '../decks/governance.js';
