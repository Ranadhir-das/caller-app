# Direct Dialer and due follow-ups — October 12, 2026

## Root causes and behavior

- Unknown Direct Dialer numbers were intentionally saved as calls without a Lead.
  The existing interested-points service requires a lead and its original course
  preference; counselor forwarding also requires a saved, caller-owned lead.
  The user approved converting an unknown Interested contact into an external
  lead assigned to the caller, treating the selected course as its own course.
- The call API now creates that Lead with source `EXTERNAL` and assignment history
  in the same transaction as the call and existing points award. The phone number
  is used as its initial name because Direct Dialer does not collect a name.
  Existing matched leads keep their original preferences and ownership. Other
  outcomes remain call-only for unknown numbers. No historical calls are converted.
- Existing course/year validation, own/other-course points, daily call limits,
  ledger keys, authentication, and counselor assignment service remain authoritative.
  Retries reuse the existing client event ID. PostgreSQL phone locks serialize
  country-code aliases before creating an external lead, and share the website
  intake lock namespace. Imports and manual assignment are unchanged.
- Counselor forwarding uses the lead ID returned by the saved call. A synchronous
  UI lock prevents repeated taps; errors keep the modal open. Success only follows
  the persisted API assignment.
- Home previously displayed all pending appointments, including future ones.
  Completing one changed the Lead instead of the FollowUp. Saved calls did not
  resolve due reminders. Refreshes requested during an existing load were dropped.
- Home now requests `/mobile/follow-ups/?due=true`, scoped to the caller and current
  lead ownership. Only pending reminders due at or before server time are returned.
  The all-pending feed and history endpoints remain available for other screens.
- Manual completion PATCHes `/followups/<id>/update/` with `COMPLETED`. Saving a
  call completes matching due reminders, including an earlier external reminder
  for a newly converted lead. Future appointments and reminders created after an
  old draft's call are retained. A new callback is created after completion, so it
  remains pending. Failures roll back the entire call transaction.
- Call-create responses add `completed_followup_ids` for immediate Home removal.
  Existing response fields are unchanged. Refreshes are queued when a load is
  already running; Home also refreshes on focus and once per minute while active.
- The number display was a `Text` element. It is now a native `TextInput` with
  Android selection/paste and the existing keypad. Keypad edits respect selection.
  Automatic suffix-based lead selection was removed: a typed/pasted number goes
  to the existing server resolver; explicitly selecting an assigned lead still
  sends its ID. No clipboard permissions, automatic reads, or new dependencies.

## Files changed for this task

Backend (`aspiring-crm/`):

| File | Purpose |
| --- | --- |
| `apps/calls/api/views.py` | Transactional external Interested conversion; resolve due reminders |
| `apps/calls/phone.py` | Reuse phone variants for matching and creation locks; reminder phone identity |
| `apps/leads/test_website_outcomes.py` | Preserve website ownership/future appointments while checking due completion |
| `apps/calls/test_external_calls.py` | Keep call-only history tests on non-converting outcomes |
| `apps/calls/test_direct_workflow.py` | Points, conversion, forwarding, ownership, rollback, due filtering and concurrency tests |
| `apps/followups/services.py` | Complete matching due reminders after a persisted outcome |
| `apps/followups/api/mobile_views.py` | Optional due filter and caller/lead ownership scope |
| `apps/followups/api/views.py` | Atomic completion with consistent lock order and ownership |

Mobile (`caller-app/`):

| File | Purpose |
| --- | --- |
| `src/app/direct-dialer.tsx` | Native number editing/paste and authoritative phone resolution |
| `src/app/call-outcome.tsx` | Remove server-confirmed resolved reminders after save |
| `src/app/(tabs)/index.tsx` | Due-only Home list, refresh on focus, reminder IDs in detail links |
| `src/app/follow-up-details.tsx` | Persist actual reminder completion; support external reminders |
| `src/components/ForwardCounselorModal.tsx` | Duplicate-tap lock and safer pending/error handling |
| `src/context/LeadContext.tsx` | Separate due feed, successful completion, immediate removal and queued refresh |
| `src/services/followUps.ts` | Due feed/filter and authenticated completion request |
| `scripts/test-direct-workflow.cjs` | Real screen handlers with native/API test doubles |
| `scripts/test-dashboard-followups.cjs` | Provider/API/Home flow, failure and refresh-race regression |
| `scripts/test-followups.cjs` | Due pagination and filtering regression |
| `scripts/test-call-outcome-flow.cjs` | Converted lead history and forwarding integration |
| `docs/direct-dialer-followups-fix.md` | This report and manual verification guide |

No migrations, production data edits, dependency changes, native Android changes,
APK generation, deployment, or commits are part of this task. Existing unrelated
mobile edits were preserved.

## Physical Android verification still required

1. Use the updated backend and mobile JavaScript in a development/test environment.
   Copy `+91 (98765) 43210` (substitute a test contact you control), long-press the
   number field, and paste. Select/replace digits, move the cursor, use backspace,
   and confirm the dialed number. A partial suffix must not select another lead.
2. Call an unknown test contact. Save Interested with course, admission year and
   the existing required follow-up information. Confirm one caller-owned EXTERNAL
   lead, one call, the existing own-course award, and updated points/activity.
3. Forward to an active counselor. Confirm success and that counselor's access.
   Retry the same forward and call submission: no duplicate lead award/assignment.
   Test another caller's number: resolution/submission must fail without reassigning it.
4. Test an assigned lead with its own and a different course using fresh test leads.
   The normal rules still apply. Unknown Not Interested and No Answer contacts must
   not receive Interested points or become leads.
5. Set up overdue, currently due, future, completed and cancelled reminders in test
   data. Home must show only overdue/due pending reminders owned by the caller.
   Complete one manually; verify immediate removal and retained history after reload.
6. Call a due reminder and save an outcome. Confirm its completion and immediate
   removal. For Call Back, confirm the replacement appointment remains pending and
   is excluded from Home until due. Repeat with an external contact.
7. Disable connectivity during completion/forwarding/outcome submission. Confirm a
   useful error, no false success, and safe retry when connectivity returns.

Automated native/API doubles verify handler behavior; they do not prove Android's
system clipboard menu, telephony, or real-device rendering. No phone test is claimed.

## Completed automated verification

- Full Django suite: 686 tests passed, no failures/errors.
- Targeted call/course/counselor/follow-up tests: 94 passed, including PostgreSQL
  concurrent conversion with two callers and country-code aliases.
- All 17 mobile test scripts: 179 tests passed, no failures.
- TypeScript (`npx tsc --noEmit`): passed.
- Android Hermes JavaScript export: passed after allowing the compiler process
  outside the sandbox. No APK was produced by that export.
- Django check, migration drift check, and both repositories' whitespace checks passed.
- ESLint is not configured or installed; Expo lint would bootstrap dependencies and
  create configuration, so it was not used as a passing check.

Subsequent release audit and deployment preparation are recorded separately.
