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

async function exportXML(paramLogin){
    try {
        var myXML = await serverOperations.serverSession(paramLogin, ["DlcFileType", "(Title='crmNote'||Title='crmCase')"], serverOperations.exportXML);
        console.log(myXML[0].toString());
    } catch(err) {
        console.log(err);
    }
}
async function getFileTypeNames(paramLogin){
    try {
        var names = await serverOperations.serverSession(paramLogin, [], serverOperations.getFileTypeNames);
        console.log(names.join("\n"));
    } catch(err) {
        console.log(err);
    }
}

async function exportXMLSeperateFiles(paramLogin) {
    try {
        var names = await serverOperations.serverSession(paramLogin, [], serverOperations.getFileTypeNames);
        var className = "DlcFileType";
        var input = names.map((name, i) => {
            return new serverOperations.xmlExport(className, `Title='${names[i]}'`, names[i]);
        });
        await serverOperations.serverSession(paramLogin, input, serverOperations.exportXMLSeperateFiles);
        console.log(`Filename: ${input[0].fileName}`);
        console.log(`Content:\n${input[0].content.slice(0, 500)} ...\n ...\n ...`);
        console.log(`Attachments:\n${input[0].files.toString()}`);
    } catch(err) {
        console.log(err);
    }
}


// exportXML(login);
// getFileTypeNames(login);
exportXMLSeperateFiles(login);
