// dashboard.js — builds docs/index.html, a self-contained interactive dashboard

const fs   = require('fs');
const path = require('path');

function safe(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function monthLabel(n) {
  if (n >= 6) return `${n}mo ✓`;
  if (n >= 3) return `${n}mo`;
  return `${n}mo`;
}

function adCard(ad, idx) {
  const duration  = monthLabel(ad.months);
  const proven    = ad.months >= 6;
  const mediaHtml = buildMedia(ad);

  return `
  <div class="ad-card${proven ? ' proven' : ''}">
    ${mediaHtml}
    <div class="ad-body">
      <div class="ad-meta">
        <span class="ad-duration${proven ? ' proven-badge' : ''}">${safe(duration)}</span>
        ${proven ? '<span class="star">proven performer</span>' : ''}
      </div>
      <div class="ad-copy">${safe(ad.copy).replace(/\n/g, '<br>')}</div>
    </div>
  </div>`;
}

function buildMedia(ad) {
  const type = ad.hasVideo ? 'VIDEO' : 'IMAGE';
  const url  = ad.adUrl || '';
  return `<a class="ad-preview-link" href="${safe(url)}" target="_blank" rel="noopener">
    <div class="ad-preview-box">
      <span class="preview-icon">${ad.hasVideo ? '▶' : '🖼'}</span>
      <span class="preview-label">View ${type} on Meta Ads Library</span>
      <span class="preview-arrow">↗</span>
    </div>
  </a>`;
}

function competitorSection(analysis, idx) {
  const adCards = (analysis.ads || []).map((ad, i) => adCard(ad, i)).join('');
  const proven  = (analysis.ads || []).filter(a => a.months >= 6).length;

  return `
  <div class="brand-section" id="brand-${idx}">
    <div class="brand-header" onclick="toggleBrand(${idx})">
      <div class="brand-title-row">
        <span class="brand-name">${safe(analysis.brand)}</span>
        <span class="brand-stats">${analysis.adsAnalysed || 0} ads · ${proven} proven</span>
      </div>
      <span class="chevron" id="chev-${idx}">▼</span>
    </div>

    <div class="brand-body" id="body-${idx}">
      ${analysis.error ? `<div class="error-note">Analysis unavailable for this brand.</div>` : `
      <div class="analysis-grid">
        <div class="analysis-card">
          <div class="analysis-label">What they're selling</div>
          <div class="analysis-value">${safe(analysis.whatTheyAreSelling)}</div>
        </div>
        <div class="analysis-card">
          <div class="analysis-label">Dominant hook</div>
          <div class="analysis-value">${safe(analysis.dominantHook)}</div>
        </div>
        <div class="analysis-card">
          <div class="analysis-label">What's working</div>
          <div class="analysis-value">${safe(analysis.whatIsWorking)}</div>
        </div>
        <div class="analysis-card weakness">
          <div class="analysis-label">Their weakness</div>
          <div class="analysis-value">${safe(analysis.weakness)}</div>
        </div>
      </div>

      <div class="patterns-row">
        <div class="patterns-label">Messaging patterns</div>
        <div class="patterns-list">
          ${(analysis.messagingPatterns || []).map(p => `<span class="pattern-tag">${safe(p)}</span>`).join('')}
        </div>
      </div>

      <div class="yaani-angle">
        <div class="yaani-angle-label">Yaani's angle against ${safe(analysis.brand)}</div>
        <div class="yaani-angle-body">${safe(analysis.yaaniAngle)}</div>
      </div>
      `}

      <div class="ads-label">Ads (sorted by impressions)</div>
      <div class="ads-grid">${adCards}</div>
    </div>
  </div>`;
}

function buildDashboard(analyses, strategy, generatedAt) {
  const totalAds    = analyses.reduce((s, a) => s + (a.ads || []).length, 0);
  const provenAds   = analyses.reduce((s, a) => s + (a.ads || []).filter(x => x.months >= 6).length, 0);
  const brandCount  = analyses.length;

  const sections = analyses.map((a, i) => competitorSection(a, i)).join('');

  const strategyHtml = strategy
    ? strategy.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')
    : 'Run the scraper to generate strategy.';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Yaani — Ad Radar</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
      background: #0d0d0d; color: #d4d4d4; min-height: 100vh;
    }

    /* ── Header ── */
    .header {
      background: #111; border-bottom: 1px solid #1e1e1e;
      padding: 20px 40px; display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap;
    }
    .brand { font-family: Georgia, serif; font-size: 24px; letter-spacing: 6px; color: #fff; font-weight: normal; }
    .brand-sub { font-size: 12px; color: #555; }
    .updated { font-size: 11px; color: #333; margin-left: auto; }

    /* ── Nav tabs ── */
    nav {
      background: #111; border-bottom: 1px solid #1e1e1e;
      padding: 0 40px; display: flex;
    }
    nav button {
      background: none; border: none; border-bottom: 2px solid transparent;
      color: #555; cursor: pointer; font-size: 13px; padding: 14px 18px;
      white-space: nowrap; transition: color 0.15s, border-color 0.15s;
    }
    nav button:hover { color: #aaa; }
    nav button.active { color: #e8b84b; border-bottom-color: #e8b84b; }

    /* ── Layout ── */
    .container { max-width: 1300px; margin: 0 auto; padding: 36px 40px; }
    .tab { display: none; }
    .tab.active { display: block; }

    /* ── Stats bar ── */
    .stats { display: flex; gap: 14px; margin-bottom: 32px; flex-wrap: wrap; }
    .stat {
      background: #141414; border: 1px solid #1e1e1e; border-radius: 8px;
      padding: 14px 20px; flex: 1; min-width: 110px;
    }
    .stat-value { font-size: 28px; font-weight: 700; color: #fff; }
    .stat-label { font-size: 10px; color: #555; margin-top: 2px; letter-spacing: 1px; text-transform: uppercase; }

    /* ── Brand section ── */
    .brand-section {
      background: #111; border: 1px solid #1e1e1e;
      border-radius: 10px; margin-bottom: 14px; overflow: hidden;
    }
    .brand-header {
      display: flex; justify-content: space-between; align-items: center;
      padding: 18px 24px; cursor: pointer; user-select: none;
      transition: background 0.15s;
    }
    .brand-header:hover { background: #161616; }
    .brand-title-row { display: flex; align-items: baseline; gap: 14px; }
    .brand-name  { font-size: 17px; font-weight: 700; color: #fff; }
    .brand-stats { font-size: 12px; color: #555; }
    .chevron { font-size: 12px; color: #444; transition: transform 0.2s; }
    .chevron.open { transform: rotate(180deg); }

    .brand-body { padding: 0 24px 24px; display: none; }
    .brand-body.open { display: block; }

    /* ── Analysis grid ── */
    .analysis-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 12px; margin-bottom: 16px;
    }
    .analysis-card {
      background: #0d0d0d; border: 1px solid #1e1e1e; border-radius: 8px; padding: 14px 16px;
    }
    .analysis-card.weakness { border-color: #2a1a1a; }
    .analysis-label {
      font-size: 9px; letter-spacing: 2px; text-transform: uppercase;
      color: #444; margin-bottom: 6px;
    }
    .analysis-value { font-size: 13px; color: #bbb; line-height: 1.6; }

    /* ── Patterns ── */
    .patterns-row { margin-bottom: 16px; }
    .patterns-label { font-size: 9px; letter-spacing: 2px; text-transform: uppercase; color: #444; margin-bottom: 8px; }
    .patterns-list { display: flex; flex-wrap: wrap; gap: 8px; }
    .pattern-tag {
      background: #1a1a1a; border: 1px solid #252525; border-radius: 20px;
      font-size: 12px; color: #888; padding: 4px 12px;
    }

    /* ── Yaani angle ── */
    .yaani-angle {
      background: #0a1a0c; border: 1px solid rgba(90,158,111,0.25);
      border-radius: 8px; padding: 16px 18px; margin-bottom: 20px;
    }
    .yaani-angle-label {
      font-size: 9px; letter-spacing: 2px; text-transform: uppercase;
      color: #5a9e6f; margin-bottom: 8px;
    }
    .yaani-angle-body { font-size: 13px; color: #7dc893; line-height: 1.7; }

    /* ── Ads grid ── */
    .ads-label { font-size: 9px; letter-spacing: 2px; text-transform: uppercase; color: #333; margin-bottom: 12px; }
    .ads-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px; }

    .ad-card {
      background: #0d0d0d; border: 1px solid #1e1e1e; border-radius: 8px;
      overflow: hidden; transition: border-color 0.15s;
    }
    .ad-card:hover { border-color: #2a2a2a; }
    .ad-card.proven { border-color: #1a2e1a; }
    .ad-card.proven:hover { border-color: #2a4a2a; }

    .ad-preview-link { text-decoration: none; display: block; }
    .ad-preview-box {
      background: #0a0a0a; border-bottom: 1px solid #1e1e1e;
      padding: 16px 18px; display: flex; align-items: center; gap: 10px;
      transition: background 0.15s;
    }
    .ad-preview-link:hover .ad-preview-box { background: #141414; }
    .preview-icon  { font-size: 18px; }
    .preview-label { font-size: 12px; color: #666; flex: 1; }
    .preview-arrow { font-size: 14px; color: #e8b84b; }

    .ad-body { padding: 14px 16px; }
    .ad-meta { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
    .ad-duration {
      font-size: 10px; letter-spacing: 1px; text-transform: uppercase; color: #555;
    }
    .ad-duration.proven-badge { color: #5a9e6f; }
    .star {
      font-size: 10px; color: #5a9e6f; background: #0f200f;
      padding: 2px 8px; border-radius: 20px;
    }
    .ad-copy {
      font-size: 12px; color: #888; line-height: 1.65;
    }
    .ad-link {
      display: inline-block; margin-top: 10px; font-size: 11px; color: #444;
      text-decoration: none; border-bottom: 1px solid #222;
      transition: color 0.15s, border-color 0.15s;
    }
    .ad-link:hover { color: #aaa; border-color: #555; }

    /* ── Strategy tab ── */
    .strategy-box {
      background: #111; border: 1px solid #1e1e1e; border-radius: 10px;
      padding: 32px 36px; max-width: 860px;
    }
    .strategy-box p { font-size: 14px; color: #999; line-height: 1.8; margin: 12px 0; }
    .strategy-box strong { color: #ddd; }
    .strategy-box h2, .strategy-box h3 {
      color: #e8b84b; font-size: 16px; margin: 24px 0 10px;
    }

    .error-note { font-size: 13px; color: #555; padding: 12px 0; }

    @media (max-width: 640px) {
      .header, nav, .container { padding-left: 16px; padding-right: 16px; }
      .updated { margin-left: 0; width: 100%; }
    }
  </style>
</head>
<body>

<header class="header">
  <span class="brand">YAANI</span>
  <span class="brand-sub">Ad Radar</span>
  <span class="updated">Updated ${safe(generatedAt)}</span>
</header>

<nav>
  <button class="active" onclick="showTab('competitors', this)">Competitors</button>
  <button onclick="showTab('strategy', this)">Yaani Strategy</button>
</nav>

<div class="container">

  <!-- Competitors tab -->
  <div id="tab-competitors" class="tab active">
    <div class="stats">
      <div class="stat">
        <div class="stat-value">${brandCount}</div>
        <div class="stat-label">Brands tracked</div>
      </div>
      <div class="stat">
        <div class="stat-value">${totalAds}</div>
        <div class="stat-label">Ads collected</div>
      </div>
      <div class="stat">
        <div class="stat-value">${provenAds}</div>
        <div class="stat-label">Proven 6+ months</div>
      </div>
    </div>
    ${sections}
  </div>

  <!-- Strategy tab -->
  <div id="tab-strategy" class="tab">
    <div class="strategy-box">
      <p><em>Based on ${totalAds} active Meta ads from ${brandCount} direct competitors.</em></p>
      <p>${strategyHtml}</p>
    </div>
  </div>

</div>

<script>
  function showTab(name, btn) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
    document.getElementById('tab-' + name).classList.add('active');
    btn.classList.add('active');
  }

  function toggleBrand(idx) {
    const body = document.getElementById('body-' + idx);
    const chev = document.getElementById('chev-' + idx);
    const open = body.classList.toggle('open');
    chev.classList.toggle('open', open);
  }

  // Open first brand by default
  toggleBrand(0);
</script>

</body>
</html>`;
}

function writeDashboard(analyses, strategy) {
  const generatedAt = new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const html = buildDashboard(analyses, strategy, generatedAt + ' IST');

  const docsDir = path.join(__dirname, 'docs');
  if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });

  const outPath = path.join(docsDir, 'index.html');
  fs.writeFileSync(outPath, html, 'utf8');
  return outPath;
}

module.exports = { writeDashboard };
