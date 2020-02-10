const serverOperations = require("../out/src/serverOperations");
const config = require("../out/src/config");
const path = require("path");

var login = new config.ConnectionInformation();
login.server = "127.0.0.1";
login.port = 11000;
login.principal = "relations";
login.username = "admin";
login.password = "";

// serverOperations.serverSession(login, [], serverOperations.clearPortalScriptCache);

const scriptName = "myscript.js";
const localPath = path.join(__dirname, scriptName);
const defaultLinux = "/usr/lib/documents5/server/scriptlibs"
const defaultWindows = "C:/Program Files/Documents5/server/scriptlibs";
const subDir = "myTest";
const serverPath = path.join(defaultWindows, subDir, scriptName);
const paths = [serverPath, localPath];

async function updateScriptLibs() {
	try {
		await serverOperations.serverSession(login, paths, serverOperations.updateScriptLibs);
	} catch (err) {
		console.log(err);
	}
}
updateScriptLibs();
