// index.js — Yaani Ad Radar
// Scrapes Meta Ads Library → analyses with Claude → builds dashboard
//
// Run: node index.js

require('dotenv').config({ override: true });

const { runScraper }              = require('./scraper');
const { analyzeAds, generateOverallStrategy } = require('./analyzer');
const { writeDashboard }          = require('./dashboard');
const fs   = require('fs');
const path = require('path');

const required = ['ANTHROPIC_API_KEY'];
const missing  = required.filter(k => !process.env[k]);
if (missing.length) {
  console.error('\n  ERROR: Missing env vars:', missing.join(', '));
  console.error('  Copy .env.example to .env and add your Anthropic API key.\n');
  process.exit(1);
}

async function run() {
  console.log('');
  console.log('╔══════════════════════════════════════╗');
  console.log('║      YAANI — Ad Radar                ║');
  console.log('╚══════════════════════════════════════╝');
  console.log('');

  // ── 1. Scrape ──────────────────────────────────────────────────────────────
  console.log('[1/3] Scraping Meta Ads Library...');
  let ads = [];
  try {
    ads = await runScraper();
    console.log(`  ${ads.length} ads collected\n`);
  } catch (err) {
    console.error('  ERROR scraping:', err.message);
    process.exit(1);
  }

  // Cache scraped data
  fs.writeFileSync(path.join(__dirname, 'scraped-ads.json'), JSON.stringify(ads, null, 2));

  // ── 2. Analyse ─────────────────────────────────────────────────────────────
  console.log('[2/3] Analysing competitor ads with Claude...');
  let analyses = [];
  let strategy = '';
  try {
    analyses = await analyzeAds(ads);
    console.log('  Per-brand analysis done.');
    console.log('  Generating overall Yaani strategy...');
    strategy = await generateOverallStrategy(analyses);
    console.log('  Strategy done.\n');
  } catch (err) {
    console.error('  ERROR analysing:', err.message);
  }

  // ── 3. Build dashboard ─────────────────────────────────────────────────────
  console.log('[3/3] Building dashboard...');
  const outPath = writeDashboard(analyses, strategy);
  console.log(`  Dashboard → ${outPath}\n`);

  console.log('╔══════════════════════════════════════╗');
  console.log('║  Done. Open docs/index.html to view. ║');
  console.log('╚══════════════════════════════════════╝');
  console.log('');
}

run();
