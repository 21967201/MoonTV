# Playback & Network Tests

This repository now includes a simple Node-based test script to verify M3U8 parsing, segment discovery and basic network performance.

## Quick test (local)

Prerequisites:
- Node.js 18+ (for global fetch)

Run:

```bash
# example
node scripts/check_m3u8.js "https://example.com/path/to/playlist.m3u8"
```

Or set environment variable:

```bash
M3U8_URL="https://example.com/path/to/playlist.m3u8" node scripts/check_m3u8.js
```

Output:
- RESULT_JSON:{...} object printed to stdout with keys:
  - m3u8: provided playlist URL
  - segment: first discovered segment URL
  - ping_ms: measured ping in ms (HEAD or small GET)
  - first_chunk_time_ms: time to fetch first chunk (ms)
  - first_chunk_bytes: bytes downloaded for the chunk
  - measured_speed: human-readable KB/s or MB/s

## How to use the results

- `measured_speed` helps validate our in-browser fragment-based speed estimator.
- `ping_ms` is used to compare with in-page ping calculations.
- If the script fails to find a segment, try a different playlist or pass a variant playlist URL.

## CI integration

You can add a GitHub Actions job to run this script against a set of known public playlists.

Example job (not included):

```yaml
# .github/workflows/playback-test.yml
# Runs node script against a matrix of sample playlists
```
