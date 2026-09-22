# Job documents + record retention — decisions (2026-09-21)

Agreed with Jordan in conversation. Not yet specced for build; this is the
decision record so the reasoning isn't lost. Driven by Alpha Auto Body
going live as the first real provider.

## What a "job" is

`care_plans` is the member↔provider job: member posts, providers bid
(`plan_bids`), one is accepted, `care_plan_completions` records the outcome
(amounts, payment method, status incl. `disputed` / `resolved`).

`concierge_jobs` is a separate product (tiers, pickup/dropoff, drivers,
legs). Gets the same treatment later if it matures — not now.

Not jobs: `job_listings` (hangs off `customer_profiles`, pre-signup lead
capture) and `shop_booking_requests` (name/phone as plain text — the public
"book this shop" form).

## 1. Deletion cascade — fix FIRST (live data-loss bug)

`care_plans.member_id` and `care_plan_completions.member_id` both reference
`auth.users` **ON DELETE CASCADE**. A member deleting their account today
destroys their care plans and completion records — which are also the
provider's invoice, agreed price, and dispute history.

**Decision:** account deletion anonymizes the member on completed jobs
instead of cascading them away. Scrub name, email, phone, and identifying
vehicle details; keep the job, the amounts, and the documents. Touches
`account-deletion-core.js` and the FKs. Do this BEFORE building the
document store — retrofitting is worse.

## 2. Job document store

One table `job_documents`, keyed to `care_plan_id`, with a nullable
`concierge_job_id` and a CHECK that exactly one is set — so the second job
type is a column addition, not a second system.

Private bucket, files under `{care_plan_id}/`. Reuse the
`provider-documents.js` pattern verbatim: service-role client, ownership
verified server-side before any URL is issued, short-TTL signed URLs, never
a public URL. That file is the best-built thing in this area; don't invent
a second approach.

Both parties upload; both parties read.

## 3. Visibility — APPROVED by Jordan

- Default: shared (member and provider both see it).
- Providers may mark a document **provider-only** (teardown shots, internal
  estimates, insurer photos). Rationale: without this they keep a second
  set of records off-platform and the record is incomplete where it matters.
- Money documents (invoice, receipt, estimate) are **forced shared** and
  cannot be flagged private.
- Members get upload but no private option — nothing to hide from the
  provider on their own job.

## 4. Immutability

Supersede, never edit or delete. A corrected invoice becomes version 2;
version 1 stays visible, marked superseded, with a timestamp. No hard
delete for anyone including admins — hide at most. This is what makes the
store usable as dispute evidence.

## 5. Receipt snapshot

`receipt-pdf.js` currently regenerates the PDF from live data on every
request, so the "receipt" silently changes if underlying data changes. At
completion, render once and file it as a `receipt` document (system-
uploaded, shared, immutable). Hook: `care_plan_completions`.

## 6. Practical gotchas

- iPhone photos arrive as HEIC. Safari renders it, Chrome doesn't —
  convert to JPEG on upload rather than storing what's handed over.
- Body shop photos are large. Compress client-side or Alpha hits storage
  limits on his first real job and concludes the feature is broken.

## Order of work

1. Deletion cascade fix (data-loss bug, blocks the rest)
2. `job_documents` store + upload/read endpoints
3. Receipt snapshot at completion

Car club QR check-in is a **separate track** — a visit, not a job.

## Loose end spotted

A stray `storage.from('my-bucket')` callsite exists somewhere in the
codebase — looks like leftover scaffolding. Worth identifying.
