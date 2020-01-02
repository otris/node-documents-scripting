const serverOperations = require("../out/src/serverOperations");
const config = require("../out/src/config");
const fs = require("fs-extra");
const path = require("path");

let login = new config.ConnectionInformation();
login.server = "127.0.0.1";
login.port = 11000;
login.principal = "relations";
login.username = "admin";
login.password = "";
login.language = config.Language.English;
login.sdsTimeout = 10000000;

const xmlFile = path.join(__dirname, "myfiletype.xml");

function makeAbsolutePaths(output, dir) {
    return output.map(v => {
        if (path.dirname(v) !== ".") {
            return path.join(dir, v);
        } else {
            return v;
        }
    });
}

async function importXML(paramLogin, paramXml){
    try {
        if(!path.isAbsolute(paramXml)) {
            throw new Error(`xml file path must be absolute`);
        }

        const sdsConnection = await serverOperations.connectLogin(undefined, paramLogin);

        // import filetype
        const xmlContent = fs.readFileSync(paramXml, "utf8");
        const output = await serverOperations.importXML(sdsConnection, [xmlContent]);
        if (output[1].length > 0) {
            throw new Error(output[1]);
        }

        // import documents
        const files = makeAbsolutePaths(output.slice(2), path.dirname(paramXml));
        await serverOperations.updateDocuments(sdsConnection, files);

        serverOperations.disconnect(sdsConnection);
    } catch(err) {
        console.log(err);
    }
}

async function exportXML(paramLogin, xmlFile, filetype){
    try {

        // create filter
        const filter = `Title='${filetype}'`;
        // filter = `Title='${filetype[0]}'||Title='${filetype[1]}'`

        // export xml
        const myExp = new serverOperations.xmlExport("DlcFileType", filter, "");
        await serverOperations.serverSession(paramLogin, [myExp], serverOperations.exportXML);
        fs.writeFileSync(xmlFile, myExp.content);

        // receive documents
        const local = path.join("examples", myExp.files[0]);
        const remote = myExp.files[1];
        fs.ensureDirSync(path.dirname(local));
        await serverOperations.serverSession(paramLogin, [local, remote], serverOperations.receiveFiles);
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

async function exportXMLSeparateFiles(paramLogin) {
    try {
        var names = await serverOperations.serverSession(paramLogin, [], serverOperations.getFileTypeNames);
        var className = "DlcFileType";
        var input = names.map((name, i) => {
            return new serverOperations.xmlExport(className, `Title='${names[i]}'`, names[i]);
        });
        await serverOperations.serverSession(paramLogin, input, serverOperations.exportXML);
        console.log(`Filename: ${input[0].fileName}`);
        console.log(`Content:\n${input[0].content.slice(0, 500)} ...\n ...\n ...`);
        console.log(`Attachments:\n${input[0].files.toString()}`);
    } catch(err) {
        console.log(err);
    }
}


// getFileTypeNames(login);
// exportXMLSeparateFiles(login);
exportXML(login, xmlFile, "myfiletype");
importXML(login, xmlFile);
