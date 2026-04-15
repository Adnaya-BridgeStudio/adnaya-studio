const express = require('express');
const PDFDocument = require('pdfkit');
const fs = require('fs');

const app = express();
app.use(express.json());

// Test serveur
app.get('/', (req, res) => {
  res.send("✅ ADNAYA SERVER IS RUNNING");
});

// Endpoint PDF
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

    // 🔥 solution fiable
    stream.on('finish', () => {
      res.json({
        success: true,
        message: "PDF généré avec succès",
        file: fileName
      });
    });

    stream.on('error', (err) => {
      console.error("Stream error:", err);
      res.status(500).json({
        success: false,
        error: "Erreur lors de la génération PDF"
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
