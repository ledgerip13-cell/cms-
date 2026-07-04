# Backlog

## HLS clean freshness

- Add background refresh for expired clean results later.
- Flow: fetch source m3u8, compare `m3u8Hash`, renew `checkedAt` when unchanged, rerun HLS cleaning only when the source playlist content changed.
- Keep this out of the playback request path to avoid adding source latency and pressure during user playback.

## Playback access model

- Rework category access as a hierarchical model, not two independent selects.
- Hidden/disabled display must always imply not watchable, including direct `/api/resolve` requests.
- Watch access must be evaluated as `display allowed AND watch allowed`, or be configured as "follow display / stricter than display" in admin UI.
- Admin UI must not allow contradictory settings such as hidden display plus public watch.
- Add a shared server-side helper for display filters and watchable filters instead of reusing display-based `enabledTypeNames()` in user history/follows/recommendations.
- Delay client watch-history writes until playback resolve succeeds, so denied playback does not create history records.
