# EMS Feature Audit: EMS-F-001 through EMS-F-016

## Prior audit findings

The prior audit reported the following aggregate results:

| Result | Count |
|---|---:|
| PASS | 10 |
| PARTIAL | 4 |
| FAIL | 0 |
| NOT VERIFIED | 2 |

The audited scope was EMS-F-001 through EMS-F-016. The feature-by-feature status mapping and supporting notes from the other working copy were not included with the findings available for this reproduction, so this report preserves the supplied totals without assigning statuses to individual feature IDs.

## Limitations

- The 4 PARTIAL and 2 NOT VERIFIED results remain open findings; the supplied aggregate results do not identify which requirements they correspond to.
- This checkout has no live MySQL verification recorded. The migration 005 regression test checks that each column addition is guarded by an `information_schema` existence check and that the migration contains no data-changing or table-removal statements; it does not execute the migration against a database or prove a second execution against MySQL.
- The project does not have a configured payment gateway or email provider. Payment processing and email delivery are therefore outside the behavior verified here.
- A production deployment and browser-level acceptance test were not performed for this reproduction.

## Reproduction validation

These are results from the current checkout and are separate from the prior audit totals:

| Check | Result |
|---|---|
| `node --test test/registration.test.js test/tickets.test.js` | Passed: 32 tests, 0 failures |
| Backend application import (`node -e "require('./backend/src/app')"` from the repository root) | Passed |
| Frontend production build (`npm --prefix frontend run build`) | Passed |
| Full backend test script (`npm --prefix backend test`) | Not completed: execution stopped at the interactive `Admin email:` prompt emitted by the EMS-F-016 catalog test. No full-suite pass is claimed. |

The focused registration and ticket tests include checks for rerunnable migration 005 and the migration 008 dynamic-SQL quoting expectation. No database migration was run, and the external registration link was build-validated but not browser-tested.
