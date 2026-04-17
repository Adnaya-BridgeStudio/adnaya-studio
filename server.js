const express = require('express');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const { google } = require('googleapis');

/* 🔥 AJOUT (sans toucher au reste) */
const multer = require('multer');
const upload = multer({ dest: '/tmp/' });

const app = express();
app.use(express.json());

const TOKEN_PATH = '/tmp/token.json';

// 🔐 OAuth2
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// 🔁 Charger token si existe
if (fs.existsSync(TOKEN_PATH)) {
  const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH));
  oauth2Client.setCredentials(tokens);
  console.log("✅ Token chargé");
}

// 🔗 Login Google
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

  console.log("✅ CONNECTÉ À GOOGLE DRIVE");

  res.send("Google Drive connecté ✅");
});

// 📤 Upload Drive (DOSSIER FIXE 🔥)
async function uploadToDrive(filePath, fileName) {
  const drive = google.drive({ version: 'v3', auth: oauth2Client });

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

// 🟢 Test
app.get('/', (req, res) => {
  res.send("✅ ADNAYA SERVER IS RUNNING");
});

// =======================
// 📄 Génération PDF + upload
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
      try {
        const link = await uploadToDrive(filePath, fileName);

        res.json({
          success: true,
          pdf_url: link
        });

      } catch (err) {
        console.error("❌ Upload Drive erreur:", err);

        res.status(500).json({
          success: false,
          error: err.message
        });
      }
    });

  } catch (err) {
    console.error("❌ Erreur serveur:", err);

    res.status(500).json({
      success: false,
      error: "Erreur serveur"
    });
  }
});


// =======================
// 🔥 AJOUT UNIQUEMENT : REQUETE CLIENT
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

    const date = new Date().toISOString().split('T')[0];

    const content = `
===== ADNAYA CLIENT REQUEST =====

Date: ${date}
Contact: ${contact}

Demande:
${text}
`;

    const fileNameTxt = `REQUEST_${date}_${Date.now()}.txt`;
    const filePathTxt = `/tmp/${fileNameTxt}`;

    fs.writeFileSync(filePathTxt, content);

    // ⚠️ utilise TA fonction existante (inchangée)
    await uploadToDrive(filePathTxt, fileNameTxt);

    if (file) {
      const fileName = `FILE_${date}_${file.originalname}`;
      await uploadToDrive(file.path, fileName);
    }

    return res.json({
      success: true
    });

  } catch (err) {
    console.error("❌ ERREUR REQUETE:", err);

    return res.json({
      success: false,
      error: err.message
    });
  }
});


const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
