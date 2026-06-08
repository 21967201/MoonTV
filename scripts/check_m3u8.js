#!/usr/bin/env node
// Simple playback/network test for M3U8
// Usage: node scripts/check_m3u8.js <m3u8_url>

const { performance } = require('perf_hooks');

async function fetchWithTimeout(url, opts = {}, timeout = 10000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (e) {
    clearTimeout(id);
    throw e;
  }
}

function resolveUrl(base, relative) {
  try {
    return new URL(relative, base).toString();
  } catch (e) {
    return relative;
  }
}

async function runTest(m3u8Url) {
  if (!m3u8Url) {
    console.error('Provide a M3U8 URL as the first argument');
    process.exit(2);
  }

  console.log('Testing M3U8:', m3u8Url);

  try {
    const start = performance.now();
    const m3u8Res = await fetchWithTimeout(m3u8Url, {}, 10000);
    const m3u8Text = await m3u8Res.text();
    const fetchM3u8Time = Math.round(performance.now() - start);

    // find first non-comment line that looks like a playlist or segment
    const lines = m3u8Text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    let candidate = null;
    for (const line of lines) {
      if (!line.startsWith('#')) {
        candidate = line;
        break;
      }
    }

    if (!candidate) {
      console.error('No segments or variant playlists found in m3u8');
      process.exit(3);
    }

    // If candidate ends with .m3u8, fetch it and parse segments
    let segmentUrl = null;
    if (candidate.toLowerCase().endsWith('.m3u8')) {
      const variantUrl = resolveUrl(m3u8Url, candidate);
      const vstart = performance.now();
      const vres = await fetchWithTimeout(variantUrl, {}, 10000);
      const vtext = await vres.text();
      const variantFetchTime = Math.round(performance.now() - vstart);
      const vlines = vtext.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      for (const l of vlines) {
        if (!l.startsWith('#')) {
          segmentUrl = resolveUrl(variantUrl, l);
          break;
        }
      }
      if (!segmentUrl) {
        console.error('No TS segment found in variant playlist');
        process.exit(4);
      }
      console.log('Found variant playlist. First segment:', segmentUrl);
      console.log('Times (ms): m3u8:', fetchM3u8Time, 'variant:', variantFetchTime);
    } else {
      // candidate likely a segment
      segmentUrl = resolveUrl(m3u8Url, candidate);
      console.log('Found segment directly:', segmentUrl);
      console.log('Times (ms): m3u8:', fetchM3u8Time);
    }

    // Measure ping using HEAD
    let ping = -1;
    try {
      const pstart = performance.now();
      await fetchWithTimeout(segmentUrl, { method: 'HEAD' }, 5000);
      ping = Math.round(performance.now() - pstart);
    } catch (e) {
      // fallback: try GET small range
      try {
        const pstart = performance.now();
        await fetchWithTimeout(segmentUrl, { method: 'GET', headers: { Range: 'bytes=0-0' } }, 5000);
        ping = Math.round(performance.now() - pstart);
      } catch (err) {
        ping = -1;
      }
    }

    // Fetch first chunk with Range
    const chunkStart = performance.now();
    const segRes = await fetchWithTimeout(segmentUrl, { method: 'GET', headers: { Range: 'bytes=0-200000' } }, 10000);
    const buffer = await segRes.arrayBuffer();
    const chunkTimeMs = Math.round(performance.now() - chunkStart);
    const bytes = buffer.byteLength;
    const kbPerSec = chunkTimeMs > 0 ? (bytes / 1024) / (chunkTimeMs / 1000) : 0;
    const speed = kbPerSec >= 1024 ? `${(kbPerSec / 1024).toFixed(2)} MB/s` : `${kbPerSec.toFixed(2)} KB/s`;

    const result = {
      m3u8: m3u8Url,
      segment: segmentUrl,
      ping_ms: ping,
      first_chunk_time_ms: chunkTimeMs,
      first_chunk_bytes: bytes,
      measured_speed: speed,
    };

    console.log('RESULT_JSON:' + JSON.stringify(result, null, 2));
    process.exit(0);
  } catch (err) {
    console.error('Test failed:', err.message || err);
    process.exit(1);
  }
}

runTest(process.argv[2] || process.env.M3U8_URL);
