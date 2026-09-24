# Bug Report: Home timeline hides valid activities

**Date:** 2026-09-23  
**Status:** Fixed

## Observed

An active trip rendered “Nothing scheduled today” even though itinerary activities existed.

## Root Cause

Two filters removed valid activities before rendering:

- Home treated the absence of the current user from an activity participant snapshot as a decline. Some valid rosters contain only explicitly selected travelers and do not include the trip owner/current profile.
- Active-trip timelines discarded every activity on an earlier trip day, even though Home supports ended cards and revealing older activities above the current window.

## Expected Behavior and Invariant

Home hides an activity only when its participant snapshot contains an explicit `declined` or `pending` entry for the current user. An absent current-user entry remains visible; absence must never be interpreted as a decline. Active-trip timeline input retains past, current, and future itinerary days; the timeline window controls presentation without deleting historical items from the feed.

## Verification

- Participation helper regression test.
- Home timeline builder regression test.
- Home timeline component tests, lint, typecheck, and production build.
