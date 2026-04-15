const express = require('express');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const { google } = require('googleapis');

const app = express();
app.use(express.json());

// 🔐 Google Auth sécurisé
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS),
  scopes: ["https://www.googleapis.com/auth/drive.file"]
});

const drive = google.drive({ version: "v3", auth });

// 📤 Upload Drive sécurisé
async function uploadToDrive(filePath, fileName) {
  try {
    const response = await drive.files.create({
      requestBody: {
        name: fileName,
        mimeType: "application/pdf"
      },
      media: {
        mimeType: "application/pdf",
        body: fs.createReadStream(filePath)
      }
    });

    const fileId = response.data.id;

    // rendre public
    await drive.permissions.create({
      fileId,
      requestBody: {
        role: "reader",
        type: "anyone"
      }
    });

    return `https://drive.google.com/file/d/${fileId}/view`;

  } catch (error) {
    console.error("❌ ERREUR DRIVE:", error.message);
    throw new Error("Upload Drive échoué");
  }
}

// 🟢 Test serveur
app.get('/', (req, res) => {
  res.send("✅ ADNAYA SERVER IS RUNNING");
});

// 📄 Endpoint principal
app.post('/generate-pdf', async (req, res) => {
  try {
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({
        success: false,
        error: "Le champ 'text' est requis"
      });
    }

    const fileName = `file_${Date.now()}.pdf`;
    const filePath = `/tmp/${fileName}`;

    const doc = new PDFDocument();
    const stream = fs.createWriteStream(filePath);

    doc.pipe(stream);
    doc.fontSize(14).text(text);
    doc.end();

    stream.on('finish', async () => {
      try {
        const driveLink = await uploadToDrive(filePath, fileName);

        res.json({
          success: true,
          pdf_url: driveLink
        });

      } catch (err) {
        res.status(500).json({
          success: false,
          error: err.message
        });
      }
    });

    stream.on('error', (err) => {
      console.error("Stream error:", err);
      res.status(500).json({
        success: false,
        error: "Erreur génération PDF"
      });
    });

  } catch (error) {
    console.error("Erreur serveur:", error);
    res.status(500).json({
      success: false,
      error: "Erreur serveur"
    });
  }
});

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
