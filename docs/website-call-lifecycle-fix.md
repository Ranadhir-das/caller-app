# Website call lifecycle regression

OFFHOOK sets the local started flag and captures started_at before dispatching
call-started acknowledgement. Network/408/429/5xx failures retry after 500, 1500
and 3000 ms (each request has a five-second timeout). Other 4xx, including 409,
stop acknowledgement retries but never release the claim or navigate home.
Retries stop when IDLE records the end or the component unmounts. No Call record
is created by acknowledgement; only existing outcome submission creates it.

An early IDLE without OFFHOOK is deferred for 1500 ms and rechecked against the
local started flag, foreground app state and native IDLE state. Returning to the
app performs the same check. This prevents initial Android IDLE snapshots from
immediately releasing an outgoing call's temporary claim. OFFHOOK cancels that
pending check. A confirmed unstarted call releases and returns home; a started
call records its end/duration once and opens the existing outcome/draft flow.

Backend reaping now locks each Lead and its availability transactionally and
rechecks call_started_at, age and ownership. Claims whose manual assignment no
longer matches the temporary claim are not reaped. The existing timeout includes
an extra 30-second acknowledgement grace, overridable through Django setting
WEBSITE_LEAD_CLAIM_GRACE_SECONDS. No schema change or heartbeat is introduced.

The server cannot observe OFFHOOK while the device is offline. A grace period
reduces delayed-acknowledgement races, but cannot guarantee preservation during an
outage extending beyond the claim timeout plus grace. A genuinely lost claim is
not stolen back: the outcome UI remains available, while normal server ownership
checks still govern saving.

Automated checks: scripts/test-call-lifecycle.cjs exercises retry behavior and the
actual dialer native-state callback with mocked React/native/API dependencies,
plus source guardrails. These do not replace a physical-device test. Re-test one
invalid-number cancellation and one valid call, including a delayed/failed
call-started request, then save the outcome and check that only one Call exists.
