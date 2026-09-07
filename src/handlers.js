// The HTTP face — as plain functions, not an Express router.
//
// WHY NOT A ROUTER
//
// Two kinds of thing need to ask these questions, and they cannot share a
// framework. A server (the tracker, a Node) can import a library. A Claude
// skill or a published artifact cannot — it renders a page and needs an
// endpoint to post to.
//
// So the engine exposes handlers that take plain input and return
// { status, body }. The tracker wraps them in Express in about ten lines; a
// Node wraps them in whatever it uses; a test calls them directly. The package
// keeps zero dependencies, which is also how the opportunity engine is built.
//
// The engine does NOT decide who may open a cycle. Authorisation belongs to the
// host: a token is a bearer credential, and whether that is enough depends on
// the product, not on this file.

import { deckForRespondent } from './deck.js';
import { validateAnswers, summarise } from './answers.js';
import { assertHost } from './host.js';

const ok = (body) => ({ status: 200, body });
const bad = (message) => ({ status: 400, body: { error: message } });
const gone = (message) => ({ status: 410, body: { error: message } });

/**
 * GET a cycle for the person answering it.
 * Returns the deck WITHOUT findings — nothing in the payload should hint at
 * which answer we consider a problem, or the answers stop being honest.
 */
export async function getCycle({ host, decks, token }) {
  assertHost(host);
  const cycle = await host.getCycleByToken(String(token || ''));
  if (!cycle) return { status: 404, body: { error: 'No such pulse. The link may be wrong.' } };

  const deck = decks[cycle.deckKey];
  if (!deck) return { status: 500, body: { error: `Deck "${cycle.deckKey}" is not loaded on this server.` } };

  if (cycle.expiresAt && new Date(cycle.expiresAt) < new Date()) {
    return gone('This pulse has closed.');
  }
  if (cycle.respondedAt) {
    // Answered already. Say so rather than letting someone answer twice and
    // wonder which one counted.
    return ok({
      already_answered: true,
      answered_at: cycle.respondedAt,
      deck: { key: deck.key, title: deck.title },
    });
  }

  return ok({ already_answered: false, cycle_id: cycle.id, deck: deckForRespondent(deck) });
}

/**
 * POST the answers.
 * Validates, stores through the host, and returns what the answers imply so the
 * caller can show it back immediately — the respondent sees the value of having
 * answered, which is most of why anyone answers a second time.
 */
export async function submitCycle({ host, decks, token, answers }) {
  assertHost(host);
  const cycle = await host.getCycleByToken(String(token || ''));
  if (!cycle) return { status: 404, body: { error: 'No such pulse. The link may be wrong.' } };

  const deck = decks[cycle.deckKey];
  if (!deck) return { status: 500, body: { error: `Deck "${cycle.deckKey}" is not loaded on this server.` } };

  if (cycle.expiresAt && new Date(cycle.expiresAt) < new Date()) return gone('This pulse has closed.');
  if (cycle.respondedAt) return bad('This pulse has already been answered.');

  let validated;
  try {
    validated = validateAnswers(deck, answers);
  } catch (err) {
    return bad(err.message);
  }

  const response = await host.saveResponse({
    cycleId: cycle.id,
    subjectId: cycle.subjectId,
    deckKey: cycle.deckKey,
    answers: validated.answers,
    skipped: validated.skipped,
  });

  return ok({
    saved: true,
    response_id: response.id,
    summary: summarise(deck, validated.answers, { skipped: validated.skipped }),
  });
}

/** Open a cycle for a subject. The caller supplies the token it will send out. */
export async function openCycle({ host, decks, deckKey, subjectId, token, expiresAt = null }) {
  assertHost(host);
  if (!decks[deckKey]) return bad(`Unknown deck "${deckKey}".`);
  if (!subjectId) return bad('subjectId is required.');
  if (!token) return bad('token is required — the caller mints it, so it can also send it.');
  const cycle = await host.createCycle({ deckKey, subjectId: String(subjectId), token, expiresAt });
  return ok({ cycle_id: cycle.id, deck_key: deckKey, token });
}
