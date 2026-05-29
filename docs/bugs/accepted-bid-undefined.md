# Bug: `acceptedBid` is undefined in `viewPackage` logistics dashboard

**Status:** Documented (not yet fixed — see Phase 1 of Option B migration work)  
**File:** `www/members.js`  
**Discovered:** 2026-05-29

---

## 1. What variable *should* populate `acceptedBid`?

`acceptedBid` is referenced in the `viewPackage` function template at three points:

| Line  | Usage |
|-------|-------|
| 6966  | `onclick="openScheduleModal('${packageId}', '${pkg.member_id}', '${acceptedBid?.provider_id || ''}')"` |
| 6979  | `onclick="openTransferModal('${packageId}', '${pkg.member_id}', '${acceptedBid?.provider_id || ''}')"` |
| 6992  | `onclick="shareMyLocation('${packageId}', '${acceptedBid?.provider_id || ''}')"` |

`acceptedBid` is **never declared** anywhere inside `viewPackage` (lines 6763–7073). It is a free variable that always resolves to `undefined` at the point these template literals are evaluated. The optional chaining (`?.`) silently swallows the TypeError; the `|| ''` fallback ensures the string `''` is interpolated.

The correct value should come from the `bids` array already loaded inside `viewPackage` (lines 6772–6796):

```javascript
const acceptedBid = bids?.find(b => b.status === 'accepted') ?? null;
```

Alternatively, since `pkg.accepted_bid_id` is available on the package object (set during `acceptBid` — see below), it could also be:

```javascript
const acceptedBid = bids?.find(b => b.id === pkg.accepted_bid_id) ?? null;
```

The second form is safer: it prefers the authoritative DB field (`accepted_bid_id`) over a client-side status string that could theoretically lag.

There is also a separate `pkg?._acceptedBid?.amount` at line 931, inside `declineUpsell`. That is a different access pattern — `_acceptedBid` is a property manually stitched onto a pkg object somewhere in the upsell flow and is unrelated to the `acceptedBid` free variable bug in `viewPackage`.

---

## 2. What is currently failing because of this?

### Hard failure (user-visible)
**`shareMyLocation` (line 6992):** The function explicitly guards `if (!providerId)` at line 10179 and returns early with `showToast('No provider assigned yet', 'error')`. Since `providerId` is always `''` (falsy), **location sharing is completely broken** for any accepted/in-progress package. The button renders but always shows an error.

### Silent/partial failures
**`openScheduleModal` (line 6966):** The empty `providerId` is written into the hidden `#schedule-provider-id` input (line 9947) and stored in `currentLogisticsContext` (line 9944). The scheduling flow likely works without a valid provider ID (it records a proposal against the package), but provider-targeted notifications sent from `submitScheduleProposal` would target an empty string — effectively dropped or failing silently.

**`openTransferModal` (line 6979):** Same pattern — `transfer-provider-id` hidden input gets `''`. Transfer setup may not send the correct party notification.

---

## 3. Does `acceptBid` store the accepted bid in a queryable location?

Yes — two locations:

**a) `maintenance_packages.accepted_bid_id`** (line 7097–7100):
```javascript
await supabaseClient.from('maintenance_packages').update({ 
  status: 'accepted', 
  accepted_bid_id: bidId   // ← stored here
}).eq('id', packageId);
```
`loadPackages()` uses `select('*')` (line 992), so `accepted_bid_id` **is present** on every `pkg` object in the `packages` array.

**b) `bids.status = 'accepted'`** (line 7091):
```javascript
await supabaseClient.from('bids').update({ status: 'accepted' }).eq('id', bidId);
```
Inside `viewPackage`, `bids` is fetched fresh from the DB (lines 6772–6776), so `bids.find(b => b.status === 'accepted')` **will return the correct bid**.

---

## 4. Is bid-acceptance working today?

The acceptance writes succeed — `accepted_bid_id` is stored on the package, bids are rejected/accepted in the DB, payment escrow is created, and notifications are sent. The feature is **functionally working at the data layer**.

The UI rendering bug means the *buttons in the logistics dashboard* (Schedule, Transfer, Share Location) operate without knowing who the provider is. Scheduling and transfer flows likely continue (they record proposals against the package, not directly to the provider), but share-my-location is fully blocked for any accepted package.

---

## 5. Interaction with Option B (trigger fires on bid status = 'accepted')

The Option B trigger fires on `UPDATE` to `bids` where `NEW.status = 'accepted'`. That write happens at line 7091 in `acceptBid`. The trigger therefore fires on the **same database transaction** that also updates the package status and creates the payment row.

- The trigger reads `NEW.package_id` and `NEW.provider_id` from the `bids` row.
- It reads `member_id` from the corresponding `maintenance_packages` row.
- This is safe — `maintenance_packages` write (setting `status = 'accepted'`) happens *after* the bids write (line 7097 runs after 7091), but both are separate `await` calls, so the trigger fires before line 7097 executes. The package `member_id` is the same regardless — it was set at package creation and never changes.

**No interaction with the `acceptedBid` undefined bug:** The trigger sees the correct bid data directly from the `bids` row; it does not go through the JS template rendering path.

---

## Fix (NOT applied yet — deferred to after Option B migration)

Insert one line at the top of the logistics dashboard template block in `viewPackage`, just before the template literal (around line 6951):

```javascript
const acceptedBid = bids?.find(b => b.id === pkg.accepted_bid_id) ?? bids?.find(b => b.status === 'accepted') ?? null;
```

This prefers the authoritative `accepted_bid_id` foreign key, falls back to status string match, and falls back to null — all within the already-loaded `bids` array.
