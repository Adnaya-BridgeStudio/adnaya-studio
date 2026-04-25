// =======================
// IMPORTS
// =======================

const express = require('express');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const { google } = require('googleapis');
const multer = require('multer');
const cors = require('cors');

// =======================
// APP INIT
// =======================

const app = express();
const upload = multer({ dest: '/tmp/' });

app.use(cors());
app.use(express.json());

// =======================
// GOOGLE AUTH
// =======================

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

oauth2Client.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN
});

console.log("🔑 TOKEN CHARGÉ:", process.env.GOOGLE_REFRESH_TOKEN);
console.log("CREDENTIALS:", oauth2Client.credentials);

// =======================
// AUTH ROUTES
// =======================

app.get('/auth', (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/drive.file']
  });

  res.redirect(url);
});

app.get('/auth/callback', async (req, res) => {
  try {
    const { code } = req.query;

    if (!code) {
      return res.status(400).send("Code OAuth manquant");
    }

    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    console.log("Refresh token si présent:");
    console.log(tokens.refresh_token || "Aucun nouveau");

    return res.send("Google Drive connecté ✅");

  } catch (err) {
    console.error("AUTH CALLBACK ERROR:", err.message);
    return res.status(500).send("Erreur OAuth (mais serveur vivant)");
  }
});

// =======================
// DRIVE UPLOAD
// =======================

async function uploadToDrive(filePath, fileName, mimeType = 'application/pdf') {

  const drive = google.drive({
    version: 'v3',
    auth: oauth2Client
  });

  const response = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: ["1CtSfuBQCGqF7fgNFRSRlYUt7RLK8Aey8"]
    },
    media: {
      mimeType,
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

// =======================
// HEALTH CHECK
// =======================

app.get('/', (req, res) => {
  res.send("✅ ADNAYA SERVER IS RUNNING");
});

// =======================
// PDF GENERATOR
// =======================

app.post('/generate-pdf', async (req, res) => {
  try {
    const { text } = req.body;

    const now = new Date();

    const stamp =
      now.toISOString().slice(0, 10) + '_' +
      String(now.getHours()).padStart(2, '0') +
      String(now.getMinutes()).padStart(2, '0');

    const firstLine = (text || '').split('\n').find(x => x.trim());

    let slug = 'Document';

    if (firstLine) {
      slug = firstLine
        .replace(/[^a-zA-Z0-9À-ÿ ]/g, '')
        .trim()
        .split(' ')
        .slice(0, 4)
        .join('_') || 'Document';
    }

    const fileName = `ADNAYA_${slug}_${stamp}.pdf`;
    const filePath = `/tmp/${fileName}`;

    const doc = new PDFDocument({ size: 'A4', margin: 55 });
    const stream = fs.createWriteStream(filePath);

    doc.pipe(stream);

    const cleanText = (text || "")
      .replace(/\r\n/g, "\n")
      .replace(/[^\x09\x0A\x0D\x20-\x7EÀ-ÿ•]/g, '')
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    const paragraphs = cleanText.split('\n');

    paragraphs.forEach(p => {
      const line = p.trim();

      if (!line) {
        doc.moveDown(0.7);
        return;
      }

      if (
        line.startsWith('- ') ||
        line.startsWith('• ') ||
        /^[0-9]+\./.test(line)
      ) {
        doc.fillColor('#111').fontSize(11.5).text(line, { indent: 18, lineGap: 4 });
        doc.moveDown(0.3);
        return;
      }

      if (
        line.length < 65 &&
        (line === line.toUpperCase() || line.endsWith(':'))
      ) {
        doc.moveDown(0.6);
        doc.fillColor('#0A66C2').font('Helvetica-Bold').fontSize(13.5).text(line);
        doc.moveDown(0.4);
        return;
      }

      doc.fillColor('#222').font('Helvetica').fontSize(11.5)
        .text(line, { align: 'justify', lineGap: 5 });

      doc.moveDown(0.5);
    });

    doc.moveDown(2);
    doc.strokeColor('#ddd').moveTo(55, doc.y).lineTo(540, doc.y).stroke();

    doc.moveDown(0.6);
    doc.fillColor('#666').fontSize(9)
      .text('Generated via ADNAYA PDF Engine', { align: 'center' });

    doc.end();

    stream.on('finish', async () => {
      try {
        const link = await uploadToDrive(filePath, fileName);
        res.json({ success: true, pdf_url: link });
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    });

  } catch (err) {
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// =======================
// CLIENT REQUEST
// =======================

app.post('/submit-request', upload.single('file'), async (req, res) => {
  try {
    const { text, contact } = req.body;
    const file = req.file;

    if (!text || !contact) {
      return res.json({ success: false, error: "Texte ou contact manquant" });
    }

    const cleanText = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

    const date = new Date().toISOString().split('T')[0];

    const content = `===== ADNAYA CLIENT REQUEST =====

Date: ${date}
Contact: ${contact}

-------------------------
DEMANDE CLIENT
-------------------------

${cleanText}

-------------------------
END REQUEST
-------------------------
`;

    const fileNameTxt = `REQUEST_${date}.txt`;
    const filePathTxt = `/tmp/${fileNameTxt}`;

    fs.writeFileSync(filePathTxt, content, 'utf8');

    await uploadToDrive(filePathTxt, fileNameTxt, 'text/plain');

    if (file) {
      await uploadToDrive(file.path, file.originalname, file.mimetype);
    }

    res.json({ success: true });

  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// =======================
// IMAGE UPLOAD
// =======================

app.post('/upload-image', upload.single('image'), async (req, res) => {
  try {
    const file = req.file;

    if (!file) {
      return res.json({ success: false, error: 'Aucun fichier reçu' });
    }

    const date = new Date().toISOString().split('T')[0];
    const fileName = `UPLOAD_${date}_${file.originalname}`;

    const link = await uploadToDrive(file.path, fileName, file.mimetype);

    res.json({ success: true, image_url: link });

  } catch (err) {
    console.error('❌ UPLOAD IMAGE:', err);
    res.json({ success: false, error: err.message });
  }
});

// =======================
// DEBUG
// =======================

app.get('/debug-token', (req, res) => {
  res.json(oauth2Client.credentials);
});

// =======================
// SERVER
// =======================

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
