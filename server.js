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
// PDF ENGINE
// =======================

app.post('/generate-pdf', async (req, res) => {

  try {

    const { text } = req.body;

    // =======================
    // NORMALIZE EMOJIS
    // =======================

    function normalizeEmojis(input) {
      return input
        .replace(/🎯/g, '▶')
        .replace(/🧬/g, '◆')
        .replace(/🟢|🟠|🟡|🔴/g, '●')
        .replace(/🚀/g, '➤')
        .replace(/⚠️/g, '⚠')

        .replace(/💰/g, '$')

        .replace(/✅|✔️/g, '✔')
        .replace(/❌/g, '✖')
        .replace(/❗/g, '!')
        .replace(/❓/g, '?')

        .replace(/⭐|🌟/g, '★')

        .replace(/📌|📍/g, '•')
        .replace(/👉|➡️/g, '➤')

        .replace(/🔹|🔸/g, '•')

        .replace(/💡/g, '➤')
        .replace(/📊|📈/g, '▸')

        .replace(/🧾|📄/g, '▣')

        .replace(/🏆/g, '★')
        .replace(/🎓/g, '◆')

        .replace(/👤/g, '•')
        .replace(/📞/g, '☎')
        .replace(/📧/g, '✉')
        .replace(/🌐/g, '⌘');
    }

    // =======================
    // FILE NAME
    // =======================

    const now = new Date();

    const stamp =
      now.toISOString().slice(0, 10) + '_' +
      String(now.getHours()).padStart(2, '0') +
      String(now.getMinutes()).padStart(2, '0');

    const firstLine = (text || '')
      .split('\n')
      .find(x => x.trim());

    let slug = 'Document';

    if (firstLine) {
      slug = firstLine
        .replace(/[^a-zA-Z0-9À-ÿ ]/g, '')
        .trim()
        .split(' ')
        .slice(0, 4)
        .join('_');

      if (!slug) slug = 'Document';
    }

    const fileName = `ADNAYA_${slug}_${stamp}.pdf`;
    const filePath = `/tmp/${fileName}`;

    // =======================
    // PDF INIT
    // =======================

    const doc = new PDFDocument({
      size: 'A4',
      margin: 55
    });

    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    // =======================
    // FONT SAFE
    // =======================

    const FONT_REGULAR = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
    const FONT_BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';

    const fontRegular = fs.existsSync(FONT_REGULAR) ? FONT_REGULAR : 'Helvetica';
    const fontBold = fs.existsSync(FONT_BOLD) ? FONT_BOLD : 'Helvetica-Bold';

    // =======================
    // CLEAN TEXT (FIX GLOBAL)
    // =======================

    let cleanText = normalizeEmojis(text || "")
      .replace(/\r\n/g, "\n")

      // supprime caractères invisibles (□ etc.)
      .replace(/[^\x20-\x7EÀ-ÿ\n]/g, '')

      // corrige : • 1. → 1.
      .replace(/•\s*([0-9]+\.)/g, '$1 ')

      // espace propre après numérotation
      .replace(/([0-9]+\.)\s*/g, '$1 ')

      .replace(/\n{3,}/g, "\n\n")
      .trim();

    const paragraphs = cleanText.split('\n');

    // =======================
    // RENDER
    // =======================

    paragraphs.forEach(p => {

      const line = p.trim();

      if (!line) {
        doc.moveDown(0.7);
        return;
      }

      // LIST + NUMÉROTATION
      if (
        line.startsWith('- ') ||
        line.startsWith('• ') ||
        /^[0-9]{1,2}\./.test(line)
      ) {

        const content = line
          .replace(/^•\s*/, '')
          .replace(/^- /, '')
          .trim();

        doc
          .fillColor('#111111')
          .font(fontRegular)
          .fontSize(11.5)
          .text(content, {
            indent: 18,
            lineGap: 4,
            align: 'left'
          });

        doc.moveDown(0.3);
        return;
      }

      // TITLE
      if (
        line.length < 65 &&
        (line === line.toUpperCase() || line.endsWith(':'))
      ) {

        doc.moveDown(0.6);

        doc
          .fillColor('#0A66C2')
          .font(fontBold)
          .fontSize(13.5)
          .text(line, { align: 'left' });

        doc.moveDown(0.4);
        return;
      }

      // PARAGRAPH
      doc
        .fillColor('#222222')
        .font(fontRegular)
        .fontSize(11.5)
        .text(line, {
          align: 'justify',
          lineGap: 5
        });

      doc.moveDown(0.5);
    });

    // =======================
    // SIGNATURE
    // =======================

    doc.moveDown(2);

    doc
      .strokeColor('#dddddd')
      .moveTo(55, doc.y)
      .lineTo(540, doc.y)
      .stroke();

    doc.moveDown(0.6);

    doc
      .fillColor('#666666')
      .font(fontRegular)
      .fontSize(9)
      .text('Generated via ADNAYA PDF Engine', {
        align: 'center'
      });

    doc.end();

    // =======================
    // UPLOAD
    // =======================

    stream.on('finish', async () => {

      try {

        const link = await uploadToDrive(filePath, fileName);

        return res.json({
          success: true,
          pdf_url: link
        });

      } catch (err) {

        return res.status(500).json({
          success: false,
          error: err.message
        });

      }

    });

  } catch (err) {

    console.error("PDF ERROR:", err);

    return res.status(500).json({
      success: false,
      error: 'Erreur serveur PDF'
    });

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
      return res.json({
        success: false,
        error: "Texte ou contact manquant"
      });
    }

    const cleanText = text
      .replace(/\r\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    const date = new Date().toISOString().split('T')[0];

    const firstRequestLine =
      cleanText.split('\n').find(x => x.trim());

    let requestSlug = 'Request';

    if (firstRequestLine) {

      requestSlug = firstRequestLine
        .replace(/[^a-zA-Z0-9À-ÿ ]/g, '')
        .trim()
        .split(' ')
        .slice(0, 5)
        .join('_');

      if (!requestSlug) requestSlug = 'Request';
    }

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

    const fileNameTxt = `REQUEST_${requestSlug}_${date}.txt`;
    const filePathTxt = `/tmp/${fileNameTxt}`;

    fs.writeFileSync(filePathTxt, content, 'utf8');

    await uploadToDrive(filePathTxt, fileNameTxt, 'text/plain');

    if (file) {

      const fileName = `ATTACH_${requestSlug}_${file.originalname}`;

      await uploadToDrive(
        file.path,
        fileName,
        file.mimetype
      );
    }

    return res.json({ success: true });

  } catch (err) {

    return res.json({
      success: false,
      error: err.message
    });

  }

});

// =======================
// IMAGE UPLOAD
// =======================

app.post('/upload-image', upload.single('image'), async (req, res) => {

  try {

    const file = req.file;

    if (!file) {
      return res.json({
        success: false,
        error: 'Aucun fichier reçu'
      });
    }

    const date = new Date().toISOString().split('T')[0];

    const fileName = `UPLOAD_${date}_${file.originalname}`;

    const link = await uploadToDrive(
      file.path,
      fileName,
      file.mimetype
    );

    return res.json({
      success: true,
      image_url: link
    });

  } catch (err) {

    console.error('❌ UPLOAD IMAGE:', err);

    return res.json({
      success: false,
      error: err.message
    });

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
