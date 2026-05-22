// analyzer.js — sends scraped competitor ads to Claude, returns per-brand analysis + Yaani opportunities

const Anthropic = require('@anthropic-ai/sdk');

const YAANI_BRIEF = `
Yaani is men's minimal brass jewellery in India targeting Gen Z men aged 19–26.
Positioning: premium feel, accessible price, honest about being brass (not pretending to be gold/silver).
Voice: quiet confidence, minimal, warm, real. Never preachy, never over-explained.
The guy who buys Yaani already wears jewellery — he doesn't need convincing.
Key USP: brass doesn't flake or tarnish like silver-plated alternatives. It ages well.
Tagline: "Wear it. Own it."
`.trim();

function parseJSON(raw) {
  const fence = raw.match(/```json\s*([\s\S]*?)```/i);
  if (fence) { try { return JSON.parse(fence[1].trim()); } catch {} }
  const start = Math.min(
    raw.indexOf('{') === -1 ? Infinity : raw.indexOf('{'),
    raw.indexOf('[') === -1 ? Infinity : raw.indexOf('[')
  );
  if (start !== Infinity) { try { return JSON.parse(raw.slice(start)); } catch {} }
  throw new Error('Claude returned invalid JSON');
}

async function analyzeAds(competitorAds) {
  if (!competitorAds || competitorAds.length === 0) return [];

  const client = new Anthropic({ apiKey: (process.env.ANTHROPIC_API_KEY || '').replace(/\s+/g, '') });

  // Group by competitor
  const grouped = {};
  for (const ad of competitorAds) {
    if (!grouped[ad.competitor]) grouped[ad.competitor] = [];
    grouped[ad.competitor].push(ad);
  }

  const results = [];

  for (const [brand, ads] of Object.entries(grouped)) {
    const adList = ads.map((a, i) =>
      `Ad ${i + 1} (running ${a.months} month${a.months !== 1 ? 's' : ''}${a.months >= 6 ? ' ✓ proven' : ''}):\n"${a.copy.slice(0, 400)}"`
    ).join('\n\n');

    const prompt = `You are a brand strategist for Yaani — a men's minimal brass jewellery brand in India.

YAANI CONTEXT:
${YAANI_BRIEF}

Analyse these Meta ads from ${brand} — a direct competitor:

${adList}

Return ONLY valid JSON:
{
  "brand": "${brand}",
  "adsAnalysed": ${ads.length},
  "whatTheyAreSelling": "one sentence — the core product/value prop they push",
  "dominantHook": "the hook formula they keep using across ads",
  "messagingPatterns": ["pattern 1", "pattern 2", "pattern 3"],
  "visualStyle": "describe the visual/creative direction based on any cues in the copy",
  "whatIsWorking": "why these ads have been running — what's resonating with the audience",
  "weakness": "the gap or blind spot in their advertising",
  "yaaniAngle": "specific, actionable way Yaani can counter-position against this brand in ads — be direct and concrete"
}`;

    console.log(`    Analysing ${brand}...`);

    const msg = await client.messages.create({
      model:      'claude-sonnet-4-5',
      max_tokens: 1500,
      messages:   [{ role: 'user', content: prompt }],
    });

    try {
      const analysis = parseJSON(msg.content[0].text.trim());
      results.push({ ...analysis, ads });
    } catch (err) {
      console.error(`    ERROR parsing analysis for ${brand}: ${err.message}`);
      results.push({ brand, ads, error: true });
    }

    // Small pause between Claude calls
    await new Promise(r => setTimeout(r, 2000));
  }

  return results;
}

async function generateOverallStrategy(analyses) {
  const client = new Anthropic({ apiKey: (process.env.ANTHROPIC_API_KEY || '').replace(/\s+/g, '') });

  const summary = analyses
    .filter(a => !a.error)
    .map(a => `${a.brand}: ${a.whatIsWorking} | Weakness: ${a.weakness}`)
    .join('\n');

  const prompt = `You are a senior brand strategist for Yaani — a men's minimal brass jewellery brand in India targeting Gen Z men aged 19–26.

YAANI:
${YAANI_BRIEF}

COMPETITOR LANDSCAPE (from live Meta ad data):
${summary}

Write a sharp, specific strategic summary for Yaani. Cover:
1. What the entire category is doing in ads (the commoditised territory to avoid)
2. The single clearest opening Yaani has that no competitor is owning
3. Three specific ad concepts Yaani should run — each with a hook line and the angle it exploits

Keep it tight. Write like a strategist, not a consultant. No filler.`;

  const msg = await client.messages.create({
    model:      'claude-sonnet-4-5',
    max_tokens: 1200,
    messages:   [{ role: 'user', content: prompt }],
  });

  return msg.content[0].text.trim();
}

module.exports = { analyzeAds, generateOverallStrategy };
