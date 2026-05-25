// notifier.js — sends weekly ad intel email summary

const nodemailer = require('nodemailer');

async function sendIntelEmail(analyses, strategy) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
  });

  const now = new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const dashboardUrl = 'https://yaani-fashion.github.io/yaani-ad-radar/';

  const competitorRows = analyses.filter(a => !a.error).map(a => `
    <div style="border-left:3px solid #e8b84b;padding:14px 18px;margin-bottom:16px;background:#fffdf5;border-radius:0 6px 6px 0;">
      <div style="font-size:15px;font-weight:bold;color:#111;margin-bottom:6px;">${a.brand}</div>
      <div style="font-size:12px;color:#777;margin-bottom:4px;">
        <strong>Hook:</strong> ${a.dominantHook || '—'}
      </div>
      <div style="font-size:12px;color:#777;margin-bottom:4px;">
        <strong>What's working:</strong> ${a.whatIsWorking || '—'}
      </div>
      <div style="font-size:12px;color:#1a6e3c;background:#f0fff4;padding:8px 10px;border-radius:4px;margin-top:8px;">
        <strong>Yaani angle:</strong> ${a.yaaniAngle || '—'}
      </div>
    </div>
  `).join('');

  const strategyHtml = (strategy || '')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');

  const totalAds   = analyses.reduce((s, a) => s + (a.ads || []).length, 0);
  const provenAds  = analyses.reduce((s, a) => s + (a.ads || []).filter(x => x.months >= 6).length, 0);

  const html = `
    <div style="max-width:640px;margin:0 auto;font-family:Arial,sans-serif;">

      <div style="background:#111;color:#fff;padding:24px 28px;border-radius:10px 10px 0 0;">
        <h1 style="margin:0;font-size:22px;letter-spacing:4px;font-family:Georgia,serif;">YAANI</h1>
        <p style="margin:6px 0 0;font-size:13px;color:#e8b84b;letter-spacing:1px;">
          Weekly Ad Radar · ${now} IST
        </p>
      </div>

      <div style="padding:24px 28px;background:#fff;border:1px solid #eee;border-top:none;border-radius:0 0 10px 10px;">

        <p style="font-size:13px;color:#555;margin:0 0 6px;">
          <strong>${totalAds} ads</strong> scraped across ${analyses.length} competitors · <strong>${provenAds} proven</strong> (6+ months running)
        </p>
        <a href="${dashboardUrl}" style="display:inline-block;margin-bottom:24px;font-size:12px;color:#e8b84b;text-decoration:none;border-bottom:1px solid #e8b84b;">
          View full dashboard with ad visuals →
        </a>

        <h2 style="font-size:14px;letter-spacing:2px;text-transform:uppercase;color:#333;margin:0 0 14px;">Competitor breakdown</h2>
        ${competitorRows}

        <h2 style="font-size:14px;letter-spacing:2px;text-transform:uppercase;color:#333;margin:24px 0 14px;">Yaani's opening this week</h2>
        <div style="background:#f9f9f9;border-radius:8px;padding:18px 20px;font-size:13px;color:#444;line-height:1.7;">
          <p style="margin:0;">${strategyHtml}</p>
        </div>

        <p style="margin:28px 0 0;font-size:11px;color:#bbb;text-align:center;">
          Yaani Ad Radar · Automated weekly intelligence<br>
          <em>Wear it. Own it.</em>
        </p>
      </div>
    </div>
  `;

  await transporter.sendMail({
    from:    `"Yaani Ad Radar" <${process.env.GMAIL_USER}>`,
    to:      process.env.NOTIFY_EMAIL,
    subject: `Yaani Ad Radar — ${now} IST`,
    html,
  });
}

module.exports = { sendIntelEmail };
