const serverOperations = require('../out/src/serverOperations');
const config = require('../out/src/config');


// Initialise all required login information
var login = new config.ConnectionInformation();
login.server = '127.0.0.1';
login.port = 11000;
login.principal = 'relations';
login.username = 'admin';
login.password = '';



async function uploadAndCheck(paramLogin, paramScript){
    var retval;
    var codeBeforeUpload = paramScript.localCode;

    try {
        // upload
        await serverOperations.serverSession(paramLogin, [paramScript], serverOperations.uploadScript);

        // download
        retval = await serverOperations.serverSession(paramLogin, [paramScript], serverOperations.downloadScript);
    } catch (reason) {
        console.log('-> ' + reason);
        return;
    }

    // check
    if (retval && retval[0] && retval[0].serverCode === codeBeforeUpload) {
        console.log('-> ok');
    } else {
        console.log('-> Something went wrong');
    }
}

async function download(paramLogin, paramScript){
    var retval;
    try {
        retval = await serverOperations.serverSession(paramLogin, [paramScript], serverOperations.downloadScript);
    } catch (reason) {
        console.log('-> ' + reason);
        return;
    }
    // console.log('Downloaded script: ' + retval[0].serverCode);
}

async function upload(paramLogin, paramScript){
    try {
        await serverOperations.serverSession(paramLogin, [paramScript], serverOperations.uploadScript);
    } catch (reason) {
        console.log('-> ' + reason);
        return;
    }
    console.log('-> ok');
}


async function executeAll() {
    // The source code is the simple test value
    var myTestCode = "return 'My simple script!';\n";

    // Create the script
    var myScript = new serverOperations.scriptT('mySimpleScript');
    myScript.localCode = myTestCode;
    myScript.conflictMode = false;

    // script is unencrypted local and on server
    console.log("check create unencrypted...");
    await uploadAndCheck(login, myScript);

    // server should encrypt script
    console.log("check encrypt...");
    myScript.encrypted = 'decrypted';
    await uploadAndCheck(login, myScript);

    // now the script is encrypted on server
    // it should be uploaded, even if  member encrypted is undefined
    // on all versions!
    console.log("check encryption flag undefined...");
    myScript.encrypted = undefined;
    await upload(login, myScript);

    // script should still be encrypted on server
    console.log('check script encrypted on server...');
    myScript.encrypted = undefined;
    await download(login, myScript);
    if (myScript.encrypted === 'decrypted' || myScript.encrypted === 'true') {
        console.log('-> ok');
    } else {
        console.log('-> Unexpected encryption flag: ' + myScript.encrypted);
    }

    // false is default, script should be kept encrypted
    console.log("check false...");
    myScript.encrypted = 'false';
    await uploadAndCheck(login, myScript);

    // script should be encrypted
    console.log('check script still encrypted on server...');
    myScript.encrypted = undefined;
    await download(login, myScript);
    if (myScript.encrypted === 'decrypted' || myScript.encrypted === 'true') {
        console.log('-> ok');
    } else {
        console.log('-> Unexpected encryption flag: ' + myScript.encrypted);
    }

    // check forceFalse, server should not encrypt script
    console.log("check forceFalse...");
    myScript.encrypted = 'forceFalse';
    await uploadAndCheck(login, myScript);

    // script should be unencrypted
    console.log('check script unencrypted on server...');
    myScript.encrypted = undefined;
    await download(login, myScript);
    if (myScript.encrypted === 'false') {
        console.log('-> ok');
    } else {
        console.log('-> Unexpected encryption flag: ' + myScript.encrypted);
    }

    // add // #crypt to source code
    console.log('check // #crypt');
    var myTestCodeCrypt = "// #crypt\r\nreturn 'My simple script!';\r\n";
    myScript.localCode = myTestCodeCrypt;
    await uploadAndCheck(login, myScript);

    // script should be encrypted
    console.log('check script encrypted again on server...');
    myScript.encrypted = undefined;
    await download(login, myScript);
    if (myScript.encrypted === 'decrypted' || myScript.encrypted === 'true') {
        console.log('-> ok');
    } else {
        console.log('-> Unexpected encryption flag: ' + myScript.encrypted);
    }
}
executeAll();
