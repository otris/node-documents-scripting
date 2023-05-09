const serverOperations = require('../out/src/serverOperations');
const config = require('../out/src/config');


// Initialise all required login information
let login = new config.ConnectionInformation();
login.server = '127.0.0.1';
login.port = 11000;
login.principal = 'relations';
login.username = 'admin';
login.password = '';
login.language = config.Language.English;

async function scriptNames(paramLogin){
    try {
        var params = [];
        // var params = ["otrTranslate"];
        const scripts = await serverOperations.serverSession(paramLogin, params, serverOperations.getScriptsFromServer);
        const myScript = scripts.find(script => script.name === "mySimpleScript");
        console.log('finished serverOperations.getScriptsFromServer');
        console.log('num scripts: ' + scripts.length);
        console.log('mode: ' + myScript.mode);
    } catch(err) {
        console.log(err);
    }
}
scriptNames(login);
