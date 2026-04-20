const express = require('express');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const { google } = require('googleapis');

const multer = require('multer');
const upload = multer({ dest: '/tmp/' });

const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json());

const TOKEN_PATH = '/tmp/token.json';

const oauth2Client = new google.auth.OAuth2(
 process.env.GOOGLE_CLIENT_ID,
 process.env.GOOGLE_CLIENT_SECRET,
 process.env.GOOGLE_REDIRECT_URI
);


// =======================
// TOKEN
// =======================

if (fs.existsSync(TOKEN_PATH)) {

 const tokens = JSON.parse(
   fs.readFileSync(TOKEN_PATH)
 );

 oauth2Client.setCredentials(tokens);

 console.log("✅ Token chargé");

}


// =======================
// AUTH
// =======================

app.get('/auth',(req,res)=>{

 const url=
 oauth2Client.generateAuthUrl({

   access_type:'offline',

   scope:[
    'https://www.googleapis.com/auth/drive.file'
   ]

 });

 res.redirect(url);

});


app.get('/auth/callback',async(req,res)=>{

 const { code } = req.query;

 const { tokens }=
 await oauth2Client.getToken(code);

 oauth2Client.setCredentials(tokens);

 fs.writeFileSync(
  TOKEN_PATH,
  JSON.stringify(tokens)
 );

 console.log("✅ CONNECTÉ À GOOGLE DRIVE");

 res.send("Google Drive connecté ✅");

});


// =======================
// UPLOAD DRIVE
// =======================

async function uploadToDrive(
 filePath,
 fileName,
 mimeType='application/pdf'
){

 const drive=google.drive({

  version:'v3',
  auth:oauth2Client

 });


 const response=
 await drive.files.create({

   requestBody:{

      name:fileName,

      parents:[
      "1CtSfuBQCGqF7fgNFRSRlYUt7RLK8Aey8"
      ]

   },

   media:{

      mimeType:mimeType,

      body:fs.createReadStream(
       filePath
      )

   }

 });


 const fileId=response.data.id;


 await drive.permissions.create({

   fileId,

   requestBody:{

      role:'reader',

      type:'anyone'

   }

 });


 return
 `https://drive.google.com/file/d/${fileId}/view`;

}



// =======================
// TEST
// =======================

app.get('/',(req,res)=>{

res.send(
"✅ ADNAYA SERVER IS RUNNING"
);

});




// =======================
// PDF PRO ENGINE
// =======================

app.post('/generate-pdf',async(req,res)=>{

try{

const { text } = req.body;

const fileName=
`file_${Date.now()}.pdf`;

const filePath=
`/tmp/${fileName}`;


const doc=
new PDFDocument({

size:'A4',
margin:50

});


const stream=
fs.createWriteStream(filePath);

doc.pipe(stream);


// =========================
// CLEAN INPUT
// =========================

let cleanText=(text||"")

.replace(/\r\n/g,"\n")

.replace(
/[^\x09\x0A\x0D\x20-\x7EÀ-ÿ•]/g,
''
)

.replace(/\n{3,}/g,"\n\n")

.trim();


const lines=
cleanText.split('\n');


// =========================
// HEADER
// =========================

doc

.fillColor('#0A66C2')

.fontSize(20)

.font('Helvetica-Bold')

.text(
'ADNAYA Studio Document',
{
align:'center'
}
);


doc.moveDown(0.5);


doc

.strokeColor('#cccccc')

.lineWidth(1)

.moveTo(50,doc.y)

.lineTo(545,doc.y)

.stroke();


doc.moveDown(1.5);


// =========================
// SMART FORMATTER
// =========================

lines.forEach(line=>{

const l=line.trim();

if(!l){

doc.moveDown(0.5);

return;

}


// ===== TITRES

if(

l===l.toUpperCase()

||

l.endsWith(':')

){

doc.moveDown(0.8);

doc

.fillColor('#0A66C2')

.fontSize(15)

.font('Helvetica-Bold')

.text(
l,
{
align:'left'
}
);

doc.moveDown(0.4);

return;

}


// ===== LISTES

if(

l.startsWith('- ')

||

l.startsWith('• ')

||

/^[0-9]+\./.test(l)

){

doc

.fillColor('#111111')

.fontSize(11)

.font('Helvetica')

.text(

'• '+

l.replace(
/^[-•]\s?/,''
),

{

indent:20,

align:'left',

lineGap:4

}

);

return;

}


// ===== PARAGRAPHES

doc

.fillColor('#222222')

.fontSize(11.5)

.font('Helvetica')

.text(

l,

{

align:'justify',

lineGap:5

}

);

doc.moveDown(0.4);


});


// =========================
// FOOTER
// =========================

doc.moveDown(2);


doc

.strokeColor('#dddddd')

.moveTo(50,doc.y)

.lineTo(545,doc.y)

.stroke();


doc.moveDown(0.5);


doc

.fillColor('#666666')

.fontSize(9)

.text(

'Generated via ADNAYA PDF Engine',

{

align:'center'

}

);


doc.end();


// =========================
// UPLOAD
// =========================

stream.on(
'finish',
async()=>{

try{

const link=

await uploadToDrive(

filePath,

fileName,

'application/pdf'

);


res.json({

success:true,

pdf_url:link

});


}

catch(err){

console.error(err);

res.status(500).json({

success:false,

error:err.message

});

}

});

}

catch(err){

console.error(err);

res.status(500).json({

success:false,

error:"Erreur serveur"

});

}

});



// =======================
// REQUETE CLIENT
// =======================

app.post(
'/submit-request',
upload.single('file'),
async(req,res)=>{

try{

const { text, contact }=
req.body;

const file=req.file;


if(
!text || !contact
){

return res.json({

success:false,

error:
"Texte ou contact manquant"

});

}


// CLEAN

const cleanText=text

.replace(/\r\n/g,"\n")

.replace(
/\n{3,}/g,
"\n\n"
)

.trim();


const date=
new Date()
.toISOString()
.split('T')[0];



const content=
`===== ADNAYA CLIENT REQUEST =====

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


const fileNameTxt=
`REQUEST_${date}_${Date.now()}.txt`;

const filePathTxt=
`/tmp/${fileNameTxt}`;


fs.writeFileSync(
filePathTxt,
content,
'utf8'
);


// upload txt

await uploadToDrive(

filePathTxt,

fileNameTxt,

'text/plain'

);


if(file){

const fileName=
`FILE_${date}_${file.originalname}`;


await uploadToDrive(

file.path,

fileName,

file.mimetype

);

}


return res.json({

success:true

});


}

catch(err){

console.error(
"❌ ERREUR REQUETE:",
err
);

return res.json({

success:false,

error:err.message

});

}

});




// =======================

const PORT=
process.env.PORT||10000;


app.listen(PORT,()=>{

console.log(
`🚀 Server running on port ${PORT}`
);

});
