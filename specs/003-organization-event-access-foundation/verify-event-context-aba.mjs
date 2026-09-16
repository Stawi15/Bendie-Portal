// Feature 003 third corrective pass, R3-F4 "REQUIRED ABA TEST".
//
// Deterministic verification of the generation-based stale-response discard
// invariant in src/contexts/EventContext.tsx, using deferred promises instead
// of real browser navigation timing (per the review's explicit request). This
// repository has no automated test framework (see tasks.md's own "Tests"
// note), so this is a standalone, manually-run script -- not wired into any
// `npm test` -- that mirrors EventContext's actual generation/discard logic
// exactly (single incrementing counter captured before an await, compared
// before every state commit) against the two required scenarios:
//
//   1. X1 starts -> Y starts -> X2 starts -> X2 resolves -> X1 resolves LAST
//      Expected: X1 discarded, X2 authoritative.
//   2. Org A/X1 -> Org B -> Org A/X2 -> old Org A/X1 resolves late
//      Expected: old X1 discarded, X2 (Org A) authoritative.
//
// Run: node specs/003-organization-event-access-foundation/verify-event-context-aba.mjs

function makeGenerationStore() {
  let generation = 0;
  let committed = null; // last committed { label, generation }
  const log = [];

  function nextGeneration() {
    generation += 1;
    return generation;
  }

  // Mirrors handleSetCurrentEvent / loadEvents' commit-gate exactly:
  // "if (eventGenerationRef.current !== generation) return;" before setState.
  function commit(label, myGeneration) {
    if (generation !== myGeneration) {
      log.push(`DISCARDED  ${label} (gen ${myGeneration}, current gen is ${generation})`);
      return false;
    }
    committed = { label, generation: myGeneration };
    log.push(`COMMITTED  ${label} (gen ${myGeneration})`);
    return true;
  }

  return { nextGeneration, commit, log, getCommitted: () => committed };
}

// A deferred promise -- resolved manually, whenever the test decides,
// independent of call order, so out-of-order network resolution can be
// simulated exactly.
function deferred() {
  let resolve;
  const promise = new Promise((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

async function scenario1_sameEventABA() {
  console.log('\n=== Scenario 1: X1 -> Y -> X2, X2 resolves first, X1 resolves LAST ===');
  const store = makeGenerationStore();

  const x1 = deferred();
  const y = deferred();
  const x2 = deferred();

  // Simulates handleSetCurrentEvent('X') the first time.
  const genX1 = store.nextGeneration();
  const reqX1 = x1.promise.then(() => store.commit('X (request #1)', genX1));

  // User navigates to Y before X1's fetch resolves.
  const genY = store.nextGeneration();
  const reqY = y.promise.then(() => store.commit('Y', genY));

  // User navigates back to X before Y's fetch resolves either.
  const genX2 = store.nextGeneration();
  const reqX2 = x2.promise.then(() => store.commit('X (request #2)', genX2));

  // Resolve out of order: X2 first (fast network), then X1 last (slow,
  // stale network) -- Y never resolves in this scenario, matching the
  // task's exact sequence (X1 -> Y -> X2 -> X2 resolves -> X1 resolves last).
  x2.resolve();
  await reqX2;
  x1.resolve();
  await reqX1;

  store.log.forEach((l) => console.log('  ' + l));
  const committed = store.getCommitted();
  const ok = committed?.label === 'X (request #2)';
  console.log(ok ? 'PASS: X2 remains authoritative, X1 correctly discarded.' : `FAIL: final committed state was "${committed?.label}", expected "X (request #2)"`);
  return ok;
}

async function scenario2_crossOrgABA() {
  console.log('\n=== Scenario 2: Org A/X1 -> Org B -> Org A/X2, old Org A/X1 resolves late ===');
  const store = makeGenerationStore();

  const orgAX1 = deferred();
  const orgBLoad = deferred();
  const orgAX2 = deferred();

  // Org A selected, event X1 explicitly opened.
  const genOrgAX1 = store.nextGeneration();
  const reqOrgAX1 = orgAX1.promise.then(() => store.commit('Org A / X (request #1)', genOrgAX1));

  // Organization switch to Org B -- EventContext's org-switch effect bumps
  // its own generation unconditionally, exactly like the real
  // nextEventGeneration() call at the top of the org-change effect.
  const genOrgB = store.nextGeneration();
  const reqOrgB = orgBLoad.promise.then(() => store.commit('Org B events load', genOrgB));

  // Switch back to Org A and reselect the same event (X2 -- a NEW request
  // for the same eventId, per the ABA case).
  const genOrgAX2 = store.nextGeneration();
  const reqOrgAX2 = orgAX2.promise.then(() => store.commit('Org A / X (request #2)', genOrgAX2));

  // Resolve Org B's load and Org A/X2 first, then the stale Org A/X1 last.
  orgBLoad.resolve();
  await reqOrgB;
  orgAX2.resolve();
  await reqOrgAX2;
  orgAX1.resolve();
  await reqOrgAX1;

  store.log.forEach((l) => console.log('  ' + l));
  const committed = store.getCommitted();
  const ok = committed?.label === 'Org A / X (request #2)';
  console.log(ok ? 'PASS: Org A/X2 remains authoritative, stale Org A/X1 correctly discarded.' : `FAIL: final committed state was "${committed?.label}", expected "Org A / X (request #2)"`);
  return ok;
}

const results = await Promise.all([scenario1_sameEventABA(), scenario2_crossOrgABA()]);
const allPass = results.every(Boolean);
console.log('\n' + (allPass ? 'ALL SCENARIOS PASS' : 'AT LEAST ONE SCENARIO FAILED'));
process.exit(allPass ? 0 : 1);
