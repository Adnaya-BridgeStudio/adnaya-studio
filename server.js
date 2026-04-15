const express = require('express');
const fs = require('fs');
const chromium = require('chrome-aws-lambda');
const { google } = require('googleapis');

const app = express();
app.use(express.json());

const TOKEN_PATH = '/tmp/token.json';

// ======================
// 🔐 OAUTH GOOGLE
// ======================

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Charger token si existe
if (fs.existsSync(TOKEN_PATH)) {
  const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH));
  oauth2Client.setCredentials(tokens);
  console.log("✅ Token chargé");
}

// ======================
// 🔗 AUTH ROUTES
// ======================

app.get('/auth', (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/drive.file']
  });

  res.redirect(url);
});

app.get('/auth/callback', async (req, res) => {
  try {
    const { code } = req.query;

    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));

    console.log("✅ CONNECTÉ À GOOGLE DRIVE");

    res.send("Google Drive connecté ✅");
  } catch (error) {
    console.error("❌ OAuth erreur:", error);
    res.send("Erreur OAuth");
  }
});

// ======================
// 🎨 TEMPLATE HTML PREMIUM
// ======================

function generateHTML(content) {
  return `
  <html>
  <head>
    <style>
      body { font-family: Arial; padding: 40px; color: #222; }
      h1 { color: #0A66C2; font-size: 28px; border-bottom: 2px solid #eee; }
      p { font-size: 14px; line-height: 1.8; }
      .cover { text-align: center; margin-bottom: 60px; }
      .cover h1 { font-size: 42px; border: none; }
      .section { margin-top: 30px; }
    </style>
  </head>
  <body>
    <div class="cover">
      <h1>ADNAYA MEDIA</h1>
      <p>Document professionnel 🚀</p>
    </div>
    <div class="section">
      <h1>Contenu</h1>
      <p>${content}</p>
    </div>
  </body>
  </html>
  `;
}

// ======================
// 📄 PDF PREMIUM (FIX CHROME CLOUD)
// ======================

async function createPDF(text, filePath) {
  const browser = await chromium.puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath,
    headless: true
  });

  const page = await browser.newPage();

  await page.setContent(generateHTML(text), {
    waitUntil: 'networkidle0'
  });

  await page.pdf({
    path: filePath,
    format: 'A4',
    printBackground: true
  });

  await browser.close();
}

// ======================
// 📤 UPLOAD DRIVE (DOSSIER FIXE)
// ======================

async function uploadToDrive(filePath, fileName) {
  const drive = google.drive({
    version: 'v3',
    auth: oauth2Client
  });

  const response = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: ["1CtSfuBQCGqF7fgNFRSRlYUt7RLK8Aey8"],
      mimeType: 'application/pdf'
    },
    media: {
      mimeType: 'application/pdf',
      body: fs.createReadStream(filePath)
    }
  });

  const fileId = response.data.id;

  await drive.permissions.create({
    fileId,
    requestBody: {
      role: 'reader',
      type: 'anyone'
    }
  });

  return `https://drive.google.com/file/d/${fileId}/view`;
}

// ======================
// ROUTES
// ======================

app.get('/', (req, res) => {
  res.send("✅ ADNAYA SERVER IS RUNNING");
});

// ======================
// 🚀 API PRINCIPALE
// ======================

app.post('/generate-pdf', async (req, res) => {
  try {
    const { text } = req.body;

    const fileName = `file_${Date.now()}.pdf`;
    const filePath = `/tmp/${fileName}`;

    console.log("📄 Génération PDF...");

    await createPDF(text, filePath);

    console.log("✅ PDF créé");

    const link = await uploadToDrive(filePath, fileName);

    console.log("✅ Upload Drive OK");

    res.json({
      success: true,
      pdf_url: link
    });

  } catch (error) {
    console.error("❌ ERREUR:", error);

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
