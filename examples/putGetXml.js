const serverOperations = require("../out/src/serverOperations");
const config = require("../out/src/config");
const fs = require("fs-extra");

let login = new config.ConnectionInformation();
login.server = '127.0.0.1';
login.port = 11000;
login.principal = 'relations';
login.username = 'admin';
login.password = '';
login.language = config.Language.English;

const crmNote = "examples/myfiletype.xml";

async function importXML(paramLogin, fileName){
    try {
        const xml = fs.readFileSync(fileName, "utf8");
        const retval = await serverOperations.serverSession(paramLogin, [xml], serverOperations.importXML);
        // retval = [json, msg, file1:oid, file1:register, file1:rel-path, file2:oid, ...]
        console.log(`import done: ${JSON.stringify(retval)}`);
    } catch(err) {
        console.log(err);
    }
}

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

importXML(login, crmNote);

// exportXML(login);
// getFileTypeNames(login);
// exportXMLSeperateFiles(login);
