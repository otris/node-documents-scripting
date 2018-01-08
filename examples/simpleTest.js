const serverOperations = require('../out/src/serverOperations');
const config = require('../out/src/config');


// Initialise all required login information
var login = new config.ConnectionInformation();
login.server = '127.0.0.1';
login.port = 11000;
login.principal = 'dopaag';
login.username = 'admin';
login.password = '';

// The source code is the simple test value
var myTestCode = "return 'My simple script!';\n";

// Create the script
var myScript = new serverOperations.scriptT('mySimpleScript');
myScript.localCode = myTestCode;
myScript.conflictMode = false;


// upload
async function uploadAndCheck(paramLogin, paramScript){
    await serverOperations.serverSession(paramLogin, [paramScript], serverOperations.uploadScript);
    var retval = await serverOperations.serverSession(paramLogin, [paramScript], serverOperations.downloadScript);
    if (retval && retval[0] && retval[0].serverCode === myTestCode) {
        console.log('Everything ok :)\n');
    } else {
        console.log('Something went wrong :(\n');
    }
}
uploadAndCheck(login, myScript);
