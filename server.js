const express = require('express');
const PDFDocument = require('pdfkit');
const fs = require('fs');

const app = express();
app.use(express.json());

// 🔍 Route test simple
app.get('/', (req, res) => {
  res.send("✅ ADNAYA SERVER IS RUNNING");
});

// 📄 Génération PDF SANS Google Drive
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

    // écrire le PDF
    doc.pipe(fs.createWriteStream(filePath));
    doc.fontSize(14).text(text);
    doc.end();

    // attendre la fin
    doc.on('finish', () => {
      res.json({
        success: true,
        message: "PDF généré avec succès (sans Google Drive)",
        file: fileName
      });
    });

  } catch (error) {
    console.error("❌ ERREUR :", error);
    res.status(500).json({
      success: false,
      error: "Erreur serveur"
    });
  }
});

// 🔥 PORT (important pour Render)
const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
