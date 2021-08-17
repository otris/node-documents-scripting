const serverOperations = require('../out/src/serverOperations');
const config = require('../out/src/config');
const fs = require("fs-extra");

// Initialise all required login information
let login = new config.ConnectionInformation();
login.server = "my.example.otris.de";
login.port = 11000;
login.principal = 'relations';
login.username = 'admin';
login.password = '';
login.language = config.Language.English;
login.startTls = true;
// login.trustedCas = fs.readFileSync("path\\to\\my-ca\\cacert.pem", "utf8");


// Create script to upload
// a simple source code is added and the conflict mode
// is set to false, because it is true on default
let myScript = new serverOperations.scriptT('mySimpleScript');
myScript.localCode = "return 'My simple script!';\n";
myScript.conflictMode = false;


/**
 * Asynchronous function to upload the script
 */
async function upload(paramLogin, paramScript){
    try {
        await serverOperations.serverSession(paramLogin, [paramScript], serverOperations.uploadScript);
        console.log('finished serverOperations.uploadScript');
    } catch(err) {
        console.log(err);
    }
}
upload(login, myScript);
