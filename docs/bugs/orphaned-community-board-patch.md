# Bug: Orphaned Community Board showSection Patch

**File:** `www/members-core.js`
**Introduced:** commit `a1c8b08` ("Document team ID prerequisite in build script")
**Status:** Not blocking — separate cleanup task

## What's there

```javascript
// Reset community board when switching away from it
function patchShowSectionForCommunityBoard(fn) {
  return function(sectionId) {
    if (sectionId !== 'packages') {
      communityBoardLoaded = false;
    }
    return fn.apply(this, arguments);
  };
}
```

## The problem

`patchShowSectionForCommunityBoard` is defined but never called anywhere in the codebase.
The intended behavior — resetting `communityBoardLoaded = false` whenever the user navigates
away from the packages section — is therefore silently not happening. The community board
will not re-fetch on re-entry; it only loads once per session.

## How it should work (when wired up)

The function is a higher-order wrapper: it takes the existing `showSection` implementation
and returns a patched version. To activate it, somewhere after `showSection` is defined,
you'd call:

```javascript
window.showSection = patchShowSectionForCommunityBoard(window.showSection);
```

## Related

The `const _origShowSection` that previously appeared two lines above this function
(also introduced in `a1c8b08`) was removed in commit `<fix-commit-sha>` because it
was dead code that caused a fatal `SyntaxError: Identifier '_origShowSection' has already been
declared` conflict with the white-label `showSection` hook added later in `b187552`
(Task #87, White-label Platform).

## Fix options

1. **Wire it up:** Add `window.showSection = patchShowSectionForCommunityBoard(window.showSection);`
   after `showSection` is defined in `members-core.js`. Verify the community board section
   reloads correctly on re-entry.

2. **Delete it:** If the reset behavior is no longer needed (community board always fetches
   fresh), remove `patchShowSectionForCommunityBoard` entirely.

Neither option is urgent — the community board works (minus the stale-state reset) and this
does not block custody chain work.
