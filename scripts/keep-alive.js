#!/usr/bin/env node

/**
 * DinkUp Keep-Alive Ping Script
 *
 * Usage:
 *   node scripts/keep-alive.js https://backend-dinkup.onrender.com
 *   or:
 *   APP_URL=https://backend-dinkup.onrender.com node scripts/keep-alive.js
 *
 * Keeps Render free-tier instances awake by sending an external HTTP ping
 * every 14 minutes.
 */

const targetArg =
  process.argv[2] || process.env.APP_URL || process.env.RENDER_EXTERNAL_URL;

if (!targetArg) {
  console.error('Usage: node scripts/keep-alive.js <URL>');
  console.error(
    'Example: node scripts/keep-alive.js https://backend-dinkup.onrender.com',
  );
  process.exit(1);
}

const healthUrl = `${targetArg.replace(/\/+$/, '')}/health`;
const INTERVAL_MS = 14 * 60 * 1000; // 14 minutes

async function ping() {
  const timestamp = new Date().toISOString();
  try {
    const start = Date.now();
    const res = await fetch(healthUrl, {
      headers: { 'User-Agent': 'DinkUp-KeepAlive-Script/1.0' },
    });
    const duration = Date.now() - start;
    if (res.ok) {
      console.log(
        `[${timestamp}] ✓ Ping OK: ${res.status} (${duration}ms) -> ${healthUrl}`,
      );
    } else {
      console.warn(
        `[${timestamp}] ⚠ Ping returned ${res.status} (${duration}ms) -> ${healthUrl}`,
      );
    }
  } catch (err) {
    console.error(
      `[${timestamp}] ✗ Ping failed: ${err.message} -> ${healthUrl}`,
    );
  }
}

console.log(`🚀 Starting Keep-Alive ping worker for: ${healthUrl}`);
console.log(`⏰ Pinging every 14 minutes. Press Ctrl+C to stop.`);

// Initial ping
void ping();

// Recurring interval
setInterval(() => {
  void ping();
}, INTERVAL_MS);
