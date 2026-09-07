// The host contract — the engine's one dependency, and it is an argument.
//
// The engine never touches a database. Whatever uses it supplies a host that
// knows where things go: the tracker passes a Postgres host, a Node passes
// whatever it already has, a test passes the in-memory one below.
//
// This is the same arrangement the node runtime uses (`host.store`, `host.db`)
// and it exists for a specific reason: an engine that owns its own tables can
// only be reused by services willing to adopt its tenancy model, which is how
// a shared engine ends up with one consumer.
//
// SUBJECT, not newsroom. A subject is whoever is being asked — a newsroom, a
// business, a cohort, one person. The host decides what a subject id means; the
// engine only ever compares them for equality. Naming it `newsroomId` here
// would have quietly limited the engine to one product.
//
// A host provides:
//
//   createCycle({ deckKey, subjectId, token, expiresAt })  -> cycle
//   getCycleByToken(token)                                  -> cycle | null
//   saveResponse({ cycleId, subjectId, deckKey, answers, skipped })
//                                                           -> response
//   listResponses({ deckKey, subjectId? })                  -> response[]
//
// A cycle is { id, deckKey, subjectId, token, expiresAt, respondedAt }.
// A response is { id, cycleId, subjectId, deckKey, answers, skipped, submittedAt }.

const REQUIRED = ['createCycle', 'getCycleByToken', 'saveResponse', 'listResponses'];

export function assertHost(host) {
  if (!host) throw new Error('pulse: a host is required');
  const missing = REQUIRED.filter((m) => typeof host[m] !== 'function');
  if (missing.length) throw new Error(`pulse: host is missing ${missing.join(', ')}`);
  return host;
}

/**
 * Reference host, in memory. Used by the tests, and usable for a local run.
 * Deliberately the simplest thing that satisfies the contract, so it doubles as
 * the specification a real host is written against.
 */
export function createMemoryHost() {
  const cycles = new Map();     // token -> cycle
  const byId = new Map();       // id -> cycle
  const responses = [];
  let n = 0;
  const id = () => `mem_${++n}`;

  return {
    async createCycle({ deckKey, subjectId, token, expiresAt = null }) {
      const cycle = {
        id: id(), deckKey, subjectId: String(subjectId), token,
        expiresAt, respondedAt: null, createdAt: new Date().toISOString(),
      };
      cycles.set(token, cycle);
      byId.set(cycle.id, cycle);
      return cycle;
    },
    async getCycleByToken(token) {
      return cycles.get(token) || null;
    },
    async saveResponse({ cycleId, subjectId, deckKey, answers, skipped = [] }) {
      const response = {
        id: id(), cycleId, subjectId: String(subjectId), deckKey,
        answers, skipped, submittedAt: new Date().toISOString(),
      };
      responses.push(response);
      const cycle = byId.get(cycleId);
      if (cycle) cycle.respondedAt = response.submittedAt;
      return response;
    },
    async listResponses({ deckKey, subjectId } = {}) {
      return responses.filter((r) =>
        (!deckKey || r.deckKey === deckKey) &&
        (!subjectId || r.subjectId === String(subjectId)));
    },
  };
}
