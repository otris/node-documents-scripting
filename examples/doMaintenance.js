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

async function doMaintenance(paramLogin, op){
    try {
        var retVal = await serverOperations.serverSession(paramLogin, [op], serverOperations.doMaintenance);
        console.log(retVal[0].toString());
    } catch(err) {
        console.log(err);
    }
}


doMaintenance(login, "list");
// var idFile = "relations_fi20190000001234";
// doMaintenance(login, `getFileInfo:${idFile}`);
