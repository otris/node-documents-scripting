const serverOperations = require('../out/src/serverOperations');
const config = require('../out/src/config');
const sds = require('../node_modules/node-sds/out/src/sds');


// Create script to upload
// a simple source code is added and the conflict mode
// is set to false, because it is true on default
let myScript = new serverOperations.scriptT('mySimpleScript');
myScript.localCode = "return 'My simple script!';\n";
myScript.conflictMode = false;


/**
 * Asynchronous function to upload the script
 */
async function upload(paramLogin, paramScript, expected) {
    try {
        await serverOperations.serverSession(paramLogin, [paramScript], serverOperations.uploadScript);
        console.log('Expected error not thrown');
    } catch(err) {
        if (err.message) {
            if (err.message.startsWith(expected)) {
                //
            } else {
                console.log("Expected error: " + expected + " - actual error: " + err.message);
            }
        } else {
            if (err.startsWith(expected)) {
                //
            } else {
                console.log("Expected error: " + expected + " - actual error: " + err);
            }
        }
    }
}

async function executeAll() {

    console.log("\ncheck undefined login");
    let login;
    await upload(login, myScript, "login data missing");

    console.log("\ncheck empty login data");
    login = new config.ConnectionInformation();
    await upload(login, myScript, "Login information missing");

    console.log("\ncheck invalid server");
    login.server = 'bla';
    await upload(login, myScript, `Cannot connect to "bla" - check server in ".vscode/launch.json"`);

    console.log("\ncheck only server set");
    login.server = '127.0.0.1';
    await upload(login, myScript, `Cannot connect to server: 127.0.0.1 port: 0 - check server and port in ".vscode/launch.json"`);

    console.log("\ncheck invalid port / server not running");
    login.port = 12000;
    await upload(login, myScript, `Cannot connect to server: 127.0.0.1 port: 12000 - check if server is running`);
    
    console.log("\ncheck only server and port set");
    login.port = 11000;
    await upload(login, myScript, 'username or password incorrect - check ".vscode/launch.json"');

    console.log("\ncheck invalid password");
    login.username = 'admin';
    login.password = sds.getJanusPassword('bla');
    await upload(login, myScript, 'username or password incorrect - check ".vscode/launch.json"');

    console.log("\ncheck no principal");
    login.password = '';
    await upload(login, myScript, 'Principal is missing - check ".vscode/launch.json"');

    console.log("\ncheck wrong principal");
    login.principal = 'bla';
    await upload(login, myScript, 'unable to change principle to bla - check ".vscode/launch.json"');
}
executeAll();
