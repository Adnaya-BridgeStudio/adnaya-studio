const express = require('express');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const multer = require('multer');
const { google } = require('googleapis');

const app = express();
app.use(express.json());

const upload = multer({ dest: '/tmp/' });

const TOKEN_PATH = '/tmp/token.json';

// 🔐 OAuth2
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// 🔁 Charger token
if (fs.existsSync(TOKEN_PATH)) {
  const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH));
  oauth2Client.setCredentials(tokens);
  console.log("✅ Token chargé");
}

// 🔗 Auth
app.get('/auth', (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/drive.file']
  });
  res.redirect(url);
});

// 🔁 Callback
app.get('/auth/callback', async (req, res) => {
  const { code } = req.query;

  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);

  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));

  res.send("Google Drive connecté ✅");
});

// 📤 Upload Drive
async function uploadToDrive(filePath, fileName, mimeType) {
  const drive = google.drive({ version: 'v3', auth: oauth2Client });

  const response = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: ["1CtSfuBQCGqF7fgNFRSRlYUt7RLK8Aey8"]
    },
    media: {
      mimeType: mimeType,
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

// 🟢 Test
app.get('/', (req, res) => {
  res.send("✅ ADNAYA SERVER IS RUNNING");
});


// =======================
// 📄 PDF
// =======================
app.post('/generate-pdf', async (req, res) => {
  try {
    const { text } = req.body;

    const fileName = `file_${Date.now()}.pdf`;
    const filePath = `/tmp/${fileName}`;

    const doc = new PDFDocument();
    const stream = fs.createWriteStream(filePath);

    doc.pipe(stream);
    doc.text(text);
    doc.end();

    stream.on('finish', async () => {
      const link = await uploadToDrive(filePath, fileName, 'application/pdf');

      return res.json({
        success: true,
        pdf_url: link
      });
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: err.message });
  }
});


// =======================
// 🖼️ UPLOAD MULTI FORMAT
// =======================
app.post('/upload-image', upload.single('image'), async (req, res) => {
  try {
    console.log("📥 Fichier reçu");

    const file = req.file;

    if (!file) {
      return res.status(400).json({
        success: false,
        error: "Aucun fichier"
      });
    }

    const fileName = `file_${Date.now()}_${file.originalname}`;

    const link = await uploadToDrive(
      file.path,
      fileName,
      file.mimetype
    );

    console.log("✅ Upload OK:", link);

    return res.json({
      success: true,
      image_url: link
    });

  } catch (err) {
    console.error("❌ ERREUR:", err);

    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
