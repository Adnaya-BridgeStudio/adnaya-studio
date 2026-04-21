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

const TOKEN_PATH='/tmp/token.json';

const oauth2Client=
new google.auth.OAuth2(
process.env.GOOGLE_CLIENT_ID,
process.env.GOOGLE_CLIENT_SECRET,
process.env.GOOGLE_REDIRECT_URI
);

oauth2Client.setCredentials({
refresh_token:
process.env.GOOGLE_REFRESH_TOKEN
});

// =======================
// TOKEN
// =======================

if(fs.existsSync(TOKEN_PATH)){

const tokens=
JSON.parse(
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



app.get(
'/auth/callback',
async(req,res)=>{

const {code}=req.query;

const {tokens}=
await oauth2Client.getToken(code);

oauth2Client.setCredentials(tokens);

fs.writeFileSync(
TOKEN_PATH,
JSON.stringify(tokens)
);

res.send(
"Google Drive connecté ✅"
);

});




// =======================
// DRIVE
// =======================

async function uploadToDrive(
filePath,
fileName,
mimeType='application/pdf'
){

const drive=
google.drive({

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

body:
fs.createReadStream(
filePath
)

}

});


const fileId=
response.data.id;


await drive.permissions.create({

fileId,

requestBody:{

role:'reader',

type:'anyone'

}

});


return `https://drive.google.com/file/d/${fileId}/view`;

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
// PDF ENGINE
// =======================

app.post(
'/generate-pdf',
async(req,res)=>{

try{

const {text}=req.body;


// NOMMAGE PDF

const now=
new Date();

const stamp=

now.toISOString().slice(0,10)

+'_'

+

String(
now.getHours()
).padStart(2,'0')

+

String(
now.getMinutes()
).padStart(2,'0');


const firstLine=

(text||'')

.split('\n')

.find(
x=>x.trim()
);


let slug='Document';


if(firstLine){

slug=

firstLine

.replace(
/[^a-zA-Z0-9À-ÿ ]/g,
''
)

.trim()

.split(' ')

.slice(0,4)

.join('_');


if(!slug){
slug='Document';
}

}


const fileName=
`ADNAYA_${slug}_${stamp}.pdf`;


const filePath=
`/tmp/${fileName}`;


const doc=
new PDFDocument({

size:'A4',
margin:55

});


const stream=
fs.createWriteStream(
filePath
);

doc.pipe(stream);


// CLEAN

let cleanText=
(text||"")

.replace(/\r\n/g,"\n")

.replace(
/[^\x09\x0A\x0D\x20-\x7EÀ-ÿ•]/g,
''
)

.replace(
/\n{3,}/g,
"\n\n"
)

.trim();


const paragraphs=
cleanText.split('\n');


// FORMAT

paragraphs.forEach(p=>{

const line=p.trim();

if(!line){

doc.moveDown(.7);

return;

}


// LISTES

if(

line.startsWith('- ')

||

line.startsWith('• ')

||

/^[0-9]+\./
.test(line)

){

doc
.fillColor('#111111')
.font('Helvetica')
.fontSize(11.5)

.text(
line,
{
indent:18,
lineGap:4,
align:'left'
}
);

doc.moveDown(.3);

return;

}



// TITRES

if(

line.length<65

&&

(
line===line.toUpperCase()
||
line.endsWith(':')
)

){

doc.moveDown(.6);

doc
.fillColor('#0A66C2')
.font('Helvetica-Bold')
.fontSize(13.5)

.text(
line,
{
align:'left'
}
);

doc.moveDown(.4);

return;

}



// PARAGRAPHES

doc
.fillColor('#222222')
.font('Helvetica')
.fontSize(11.5)

.text(
line,
{
align:'justify',
lineGap:5
}
);

doc.moveDown(.5);


});




// SIGNATURE

doc.moveDown(2);

doc
.strokeColor('#dddddd')
.moveTo(55,doc.y)
.lineTo(540,doc.y)
.stroke();

doc.moveDown(.6);

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



// UPLOAD

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

return res.json({
success:true,
pdf_url:link
});

}

catch(err){

return res.status(500).json({
success:false,
error:err.message
});

}

});


}

catch(err){

return res.status(500).json({
success:false,
error:'Erreur serveur'
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

const {
text,
contact
}=req.body;

const file=req.file;


if(
!text
||
!contact
){

return res.json({

success:false,

error:
"Texte ou contact manquant"

});

}



const cleanText=
text
.replace(/\r\n/g,"\n")
.replace(/\n{3,}/g,"\n\n")
.trim();


const date=
new Date()
.toISOString()
.split('T')[0];



const firstRequestLine=

cleanText
.split('\n')
.find(
x=>x.trim()
);


let requestSlug='Request';


if(firstRequestLine){

requestSlug=

firstRequestLine

.replace(
/[^a-zA-Z0-9À-ÿ ]/g,
''
)

.trim()

.split(' ')

.slice(0,5)

.join('_');


if(!requestSlug){

requestSlug='Request';

}

}



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

`REQUEST_${requestSlug}_${date}.txt`;


const filePathTxt=

`/tmp/${fileNameTxt}`;



fs.writeFileSync(
filePathTxt,
content,
'utf8'
);




await uploadToDrive(
filePathTxt,
fileNameTxt,
'text/plain'
);




if(file){

const fileName=

`ATTACH_${requestSlug}_${file.originalname}`;


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

return res.json({

success:false,

error:err.message

});

}

});





// =======================
// UPLOADER FICHIER
// =======================

app.post(
'/upload-image',
upload.single('image'),
async(req,res)=>{

try{

const file=req.file;

if(!file){

return res.json({

success:false,

error:'Aucun fichier reçu'

});

}


const date=
new Date()
.toISOString()
.split('T')[0];


const fileName=

`UPLOAD_${date}_${file.originalname}`;


const link=
await uploadToDrive(

file.path,

fileName,

file.mimetype

);


return res.json({

success:true,

image_url:link

});


}

catch(err){

console.error(
'❌ UPLOAD IMAGE:',
err
);

return res.json({

success:false,

error:err.message

});

}

});


app.get('/debug-token',(req,res)=>{
res.json(oauth2Client.credentials);
});


const PORT=
process.env.PORT||10000;

app.listen(PORT,()=>{

console.log(
`🚀 Server running on port ${PORT}`
);

});
