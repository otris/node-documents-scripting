const serverOperations = require('../out/src/serverOperations');
const config = require('../out/src/config');


// Initialise all required login information
let login = new config.ConnectionInformation();
login.server = '127.0.0.1';
login.port = 11000;
login.principal = 'relations';
login.username = 'admin';
login.password = '';


// Only the name of the script is required for download
let myScript = new serverOperations.scriptT('mySimpleScript');


/**
 * Asynchronous function to download the script
 */
async function download(paramLogin, paramScript){
    var retval = await serverOperations.serverSession(paramLogin, [paramScript], serverOperations.downloadScript);
    var script = retval[0];
    console.log('finished serverOperations.downloadScript');
    //console.log('code: ' + script.serverCode);
    console.log('mode: ' + script.mode);
}
download(login, myScript);
