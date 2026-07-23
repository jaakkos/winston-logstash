# Bug and Missing-Test Audit Findings

Date: 2026-07-23  
Scope: `src/connection.ts`, `src/manager.ts`, Winston 2/3 transports, unit tests  
Method: coverage baseline, path-to-test matrix, characterization + `test.failing` guards

## Coverage baseline (after audit tests)

| File | Lines | Remaining gaps |
|------|-------|----------------|
| `connection.ts` | 98.86% | L73 — `socketOnClose` Closing branch (listeners removed before socket `close`) |
| `manager.ts` | 99.02% | L104 — `shouldTryToReconnect` false branch (dead while `isRetryableError` always true) |
| `winston-logstash-latest.ts` | 100% | Branch: `ssl_enable` constructor path |
| `winston-logstash.ts` | 100% | Branch: default `node_name = process.title` |

Root suite: **74 tests passing** (includes 2 expected `test.failing` guards for confirmed bugs).

---

## Path-to-test matrix

| Path | Status | Notes |
|------|--------|-------|
| **Connection** | | |
| Plain connect / send / close | Covered | `connection.test.ts` |
| Drain / Timeout emit | Covered | Timeout only via manual `socket.emit` |
| `socket.setTimeout` | Covered (dead) | New test: connect never calls `setTimeout` |
| ClosedByServer | Covered | |
| Secure SSL load / rejectUnauthorized / CA warn | Covered | |
| `ssl_passphrase` | Covered | New test |
| Missing cert file throw | Missing | Constructor `readFileSync` failure |
| **Manager** | | |
| Enqueue / flush / success callback | Covered | |
| Send error → re-queue | Covered | |
| Backpressure (`send` false + Drain) | Covered | New test |
| `readyToSend` false → no-op flush | Covered | New test |
| Retry fixedDelay → `start()` | Covered | New test |
| Retry exponentialBackoff delay | Covered | New test |
| Max retries → OFFLINE emit | Covered | New test |
| `close()` during pending retry | Bug confirmed | Characterization + `test.failing` |
| Queue survive disconnect/reconnect | Partial | Flush on Connected exists; no end-to-end buffer assert |
| `isRetryableError` always true | Documented debt | Existing test + TODO in source |
| **Winston 2** | | |
| TCP/SSL/JSON/reconnect/silent/OFFLINE | Covered | `winston-logstash.test.ts` |
| **Winston 3** | | |
| safeStringify / ANSI | Covered | |
| onError / close / logged | Covered | New tests |
| silent gate after OFFLINE | Bug confirmed | Characterization + `test.failing` |
| TCP/SSL integration parity | Missing (unit) | Only test-bench smoke |
| **Test-bench** | | |
| Smoke + on_error (2.x / 3.x) | Separate | Needs Docker Logstash |

---

## Confirmed bugs

### Critical — fixed

1. **Winston 3 ignores `silent` after OFFLINE** — **FIXED**  
   - `log()` now early-returns when `this.silent` (parity with Winston 2).  
   - Test: `does not enqueue logs when transport is silent after OFFLINE`

2. **`Manager.close()` does not clear `retryTimeout`** — **FIXED**  
   - `close()` clears and nulls `retryTimeout` before teardown.  
   - Test: `close() during pending retry must not call start() when timer fires`

### Important

3. **Socket Timeout path is dead**  
   - `socket.once('timeout')` is registered; nothing calls `socket.setTimeout(...)`.  
   - **Evidence:** `connect does not call socket.setTimeout (Timeout path never fires in practice)`.  
   - **Fix options:** Call `setTimeout` with a documented option, or remove Timeout wiring (API-sensitive — prefer additive option).

4. **Flush can reorder / drop under write races**  
   - Entry is `shift()`ed before write callback; failed writes `unshift` while later in-flight writes may have succeeded.  
   - No new repro test (needs carefully sequenced multi-callback mock). Still a real race.  
   - **Recommendation:** Follow-up PR with ordered flush or in-flight tracking.

5. **All errors treated as retryable**  
   - Known TODO: `isRetryableError` always returns `true`.  
   - Changing this is a **behavior change** — do not fix without an opt-in (e.g. new retry strategy flag).

### Nice-to-have

6. Winston 3 unit suite lacks live TCP/SSL parity (rely on test-bench).  
7. No test for missing SSL key/cert file constructor failures.  
8. No max queue size when `max_connect_retries: -1` (documented infinite retry → unbounded buffer).  
9. `node_name` in Winston 3 docs/examples is a no-op.  
10. Connection `socketOnClose` Closing branch (L73) unreachable after `removeAllListeners` in `close()`.

---

## Explicit non-issues (intentional / legacy)

- `isRetryableError` always `true` — original implementation bug preserved for compatibility.  
- Winston 2 vs 3 formatting differences (`common.log` vs `safeStringify`) — by design.  
- Default host/port `127.0.0.1:28777` — public contract.

---

## Follow-up PR recommendations

| Priority | PR | Scope |
|----------|-----|--------|
| ~~1~~ | ~~Fix Winston 3 silent gate~~ | Done |
| ~~2~~ | ~~Clear `retryTimeout` on `Manager.close()`~~ | Done |
| 3 | Optional `socket_timeout_ms` (or document dead Timeout) | Additive; default preserves current behavior |
| 4 | Flush ordering / in-flight write safety | Tests first, then minimal fix |
| 5 | Winston 3 TCP/SSL unit parity (optional) | Mirror subset of Winston 2 integration tests |

Do **not** change `isRetryableError` or default retry counts without an explicit compatibility decision.
