// scraper.js
// Scrapes Meta Ads Library for competitor ads running 6+ months (proven performers).
// Downloads creative (image / video) to docs/assets/ads/{competitor}/
// Returns structured ad objects for the analyzer and dashboard.
//
// Run standalone:  node scraper.js
// Called by index.js as step 0.

require('dotenv').config({ override: true });

const { chromium } = require('playwright');
const fs   = require('fs');
const path = require('path');

const ASSETS_DIR    = path.join(__dirname, 'docs', 'assets', 'ads');
const SIX_MONTHS_MS = 6 * 30 * 24 * 60 * 60 * 1000;

const BASE = 'https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=IN&is_targeted_country=false&media_type=all&search_type=page&sort_data[direction]=desc&sort_data[mode]=total_impressions&view_all_page_id=';

const COMPETITORS = [
  { name: 'The Drip Project',      url: BASE + '109064811511966' },
  { name: 'Black Mamba Jewellery', url: BASE + '109490614709737' },
  { name: 'Miso by Sonia',         url: BASE + '106675518140145' },
  { name: 'Sic Sense',             url: BASE + '380068741852433' },
  { name: 'Zach Official',         url: BASE + '1915089295383823' },
  { name: 'Palmonas',              url: BASE + '104818178629041' },
  { name: 'Cosa Nostraa',          url: BASE + '537734920069514' },
  { name: 'Swasha',                url: BASE + '107461408257681' },
];

function slug(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const MONTHS = { jan:0, feb:1, mar:2, apr:3, may:4, jun:5, jul:6, aug:7, sep:8, oct:9, nov:10, dec:11 };

function parseAdDate(text) {
  // Format 1: "Started running on 22 Apr 2026"  (DD Mon YYYY)
  const m1 = text.match(/started running on\s+(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})/i);
  if (m1) {
    const mon = MONTHS[m1[2].toLowerCase().slice(0, 3)];
    if (mon !== undefined) {
      const d = new Date(parseInt(m1[3]), mon, parseInt(m1[1]));
      if (!isNaN(d.getTime())) return d;
    }
  }
  // Format 2: "Started running on April 22, 2026"  (Month DD, YYYY)
  const m2 = text.match(/started running on\s+([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/i);
  if (m2) {
    const mon = MONTHS[m2[1].toLowerCase().slice(0, 3)];
    if (mon !== undefined) {
      const d = new Date(parseInt(m2[3]), mon, parseInt(m2[2]));
      if (!isNaN(d.getTime())) return d;
    }
  }
  // Format 3: bare "DD Mon YYYY" anywhere
  const m3 = text.match(/\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{4})\b/i);
  if (m3) {
    const mon = MONTHS[m3[2].toLowerCase().slice(0, 3)];
    if (mon !== undefined) {
      const d = new Date(parseInt(m3[3]), mon, parseInt(m3[1]));
      if (!isNaN(d.getTime())) return d;
    }
  }
  return null;
}

function monthsRunning(startDate) {
  return Math.floor((Date.now() - startDate.getTime()) / (30 * 24 * 60 * 60 * 1000));
}

async function downloadFile(url, destPath) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
    });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    fs.writeFileSync(destPath, Buffer.from(buf));
    return destPath;
  } catch {
    return null;
  }
}

async function scrapeCompetitor(page, competitor) {
  const url = competitor.url;
  console.log(`    → ${competitor.name}`);

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  } catch (err) {
    console.error(`      navigation failed: ${err.message}`);
    return [];
  }

  await page.waitForTimeout(3000); // extra wait for results to render

  // Dismiss cookie / GDPR consent if it appears
  try {
    for (const sel of [
      '[data-cookiebanner="accept_button"]',
      'button[title="Allow all cookies"]',
      'button:has-text("Accept all")',
      'button:has-text("Allow all")',
    ]) {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 2000 })) {
        await btn.click();
        await page.waitForTimeout(1000);
        break;
      }
    }
  } catch {}

  // Wait for ad cards — look for "Started running on" (English) or a date pattern
  try {
    await page.waitForFunction(
      () => {
        const t = document.body.innerText.toLowerCase();
        return t.includes('started running on') || /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},\s+\d{4}/i.test(document.body.innerText);
      },
      { timeout: 20000 }
    );
  } catch {
    console.log(`      no ads found for "${competitor.name}"`);
    return [];
  }

  // Scroll to load more ads (4 passes × ~2 s each)
  for (let i = 0; i < 4; i++) {
    await page.evaluate(() => window.scrollBy(0, 2400));
    await page.waitForTimeout(2200);
  }

  // ── Extract raw ad data from the page ─────────────────────────────────────
  const rawAds = await page.evaluate(() => {
    const results  = [];
    const seen     = new WeakSet();

    // TreeWalker to find date nodes — "Started running on" or bare month/year dates
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    const dateNodes = [];
    let node;
    while ((node = walker.nextNode())) {
      const t = node.textContent;
      if (
        /started running on/i.test(t) ||
        /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},\s+\d{4}/i.test(t)
      ) dateNodes.push(node);
    }

    for (const textNode of dateNodes) {
      // Walk up DOM to find the ad-card container.
      // Stop when the parent's height jumps significantly (feed wrapper boundary).
      let card = textNode.parentElement;
      for (let i = 0; i < 15; i++) {
        if (!card || !card.parentElement) break;
        const r  = card.getBoundingClientRect();
        const pr = card.parentElement.getBoundingClientRect();
        if (r.height > 250 && pr.height > r.height * 2) break;
        card = card.parentElement;
      }

      if (!card || seen.has(card)) continue;
      seen.add(card);

      // Images — prefer fbcdn (Meta CDN), avoid icons / 1×1 tracking pixels
      const images = [...card.querySelectorAll('img')]
        .map(i => i.src)
        .filter(s =>
          s && s.startsWith('http') &&
          (s.includes('fbcdn') || s.includes('cdninstagram')) &&
          !s.includes('1x1') && !s.includes('emoji') &&
          (s.includes('.jpg') || s.includes('.png') || s.includes('.webp') || s.includes('scontent'))
        );

      // Videos
      const videoEls  = [...card.querySelectorAll('video')];
      const videoUrls = videoEls
        .flatMap(v => [v.src, v.querySelector('source')?.src])
        .filter(s => s && s.startsWith('http'));
      const posters = videoEls.map(v => v.poster).filter(p => p && p.startsWith('http'));

      // Ad library deep-link
      const adLink = card.querySelector('a[href*="ads/library"]');
      const adUrl  = adLink ? adLink.href : '';

      const text = (card.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 2500);

      if (text.length > 40) {
        results.push({
          dateText: textNode.textContent.trim(),
          text,
          images:      [...new Set(images)].slice(0, 3),
          videoUrls:   [...new Set(videoUrls)].slice(0, 1),
          posters:     [...new Set(posters)].slice(0, 1),
          adUrl,
        });
      }
    }

    return results;
  });

  // ── Filter 6+ months and download media ───────────────────────────────────
  const cutoff      = new Date(Date.now() - SIX_MONTHS_MS);
  const compDir     = path.join(ASSETS_DIR, slug(competitor.name));
  if (!fs.existsSync(compDir)) fs.mkdirSync(compDir, { recursive: true });

  const allParsed = [];

  for (let i = 0; i < rawAds.length; i++) {
    const raw = rawAds[i];
    const startDate = parseAdDate(raw.dateText);
    if (!startDate) continue;
    allParsed.push({ raw, i, startDate, months: monthsRunning(startDate), proven: startDate <= cutoff });
  }

  // Prefer 6+ month ads; if none, fall back to top 5 longest-running
  const provenAds = allParsed.filter(a => a.proven);
  const toProcess = provenAds.length > 0
    ? provenAds
    : allParsed.sort((a, b) => b.months - a.months).slice(0, 5);

  if (provenAds.length === 0 && allParsed.length > 0) {
    console.log(`      no 6+ month ads — showing top ${toProcess.length} longest-running instead`);
  }

  const filtered = [];

  for (const { raw, i, startDate, months } of toProcess) {
    const startDateUnused = startDate; // already parsed above
    if (false) continue;   // not old enough

    const hasVideo  = raw.videoUrls.length > 0;

    // Download the best available image
    let localImage  = null;
    const imgUrl    = raw.images[0] || raw.posters[0] || null;
    if (imgUrl) {
      const ext      = imgUrl.includes('.png') ? 'png' : imgUrl.includes('.webp') ? 'webp' : 'jpg';
      const destPath = path.join(compDir, `ad-${i}.${ext}`);
      const ok       = await downloadFile(imgUrl, destPath);
      if (ok) localImage = `assets/ads/${slug(competitor.name)}/ad-${i}.${ext}`;
    }

    // For video ads download the poster separately if we don't already have it
    let localPoster = localImage;
    if (hasVideo && !localPoster && raw.posters[0]) {
      const destPath = path.join(compDir, `ad-${i}-poster.jpg`);
      const ok       = await downloadFile(raw.posters[0], destPath);
      if (ok) localPoster = `assets/ads/${slug(competitor.name)}/ad-${i}-poster.jpg`;
    }

    // Pull the copy: strip the date line and page-name header noise
    const copy = raw.text
      .replace(/started running on .{5,30}/gi, '')
      .replace(/\bactive\b/gi, '')
      .trim()
      .slice(0, 600);

    filtered.push({
      competitor:   competitor.name,
      copy,
      startDate:    startDate.toISOString().split('T')[0],
      months,
      hasVideo,
      videoUrl:     raw.videoUrls[0] || null,
      localImage,
      localPoster,
      adUrl:        raw.adUrl,
    });
  }

  console.log(`      ${filtered.length} ad(s) collected (${provenAds.length} proven 6+ months)`);
  return filtered;
}

async function runScraper() {
  if (!fs.existsSync(ASSETS_DIR)) fs.mkdirSync(ASSETS_DIR, { recursive: true });

  const browser = await chromium.launch({
    headless: false,   // visible browser — avoids Meta bot detection
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
    ],
  });

  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
    locale:   'en-US',
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });

  // Mask webdriver flag — key signal Meta checks
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'plugins',   { get: () => [1, 2, 3] });
    Object.defineProperty(navigator, 'languages', { get: () => ['en-IN', 'en'] });
    window.chrome = { runtime: {} };
  });

  const page    = await context.newPage();
  const allAds  = [];

  const competitorList = COMPETITORS;
  for (const competitor of competitorList) {
    const ads = await scrapeCompetitor(page, competitor);
    allAds.push(...ads);
    try { await page.waitForTimeout(3500); } catch {} // polite gap between competitors
  }

  await browser.close();

  const provenCount = allAds.filter(a => a.months >= 6).length;
  console.log(`  Total ads collected: ${allAds.length} (${provenCount} proven 6+ months)`);
  return allAds;
}

// ── Standalone run ────────────────────────────────────────────────────────────
if (require.main === module) {
  (async () => {
    console.log('\n  [Scraper] Starting Meta Ads Library scrape...\n');
    try {
      const ads = await runScraper();
      const out = path.join(__dirname, 'scraped-ads.json');
      fs.writeFileSync(out, JSON.stringify(ads, null, 2));
      console.log(`\n  Saved ${ads.length} ads → ${out}\n`);
    } catch (err) {
      console.error('  ERROR:', err.message);
      process.exit(1);
    }
  })();
}

module.exports = { runScraper, COMPETITORS };
