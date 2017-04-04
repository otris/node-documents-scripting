"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const os = require("os");
const fs = require("fs");
const path = require("path");
const net_1 = require("net");
const reduce = require("reduce-for-promises");
const node_sds_1 = require("node-sds");
const SDS_TIMEOUT = 60 * 1000;
let serverOperation = (sdsConnection, param) => {
    return new Promise((resolve, reject) => {
        resolve();
    });
};
// todo param of sdsSession()
function setServerOperation(func) {
    serverOperation = func;
}
exports.setServerOperation = setServerOperation;
function sdsSession(loginData, param) {
    if (!loginData || param.length != 2 || typeof param[0] !== 'string' || typeof param[1] !== 'string') {
        console.log('sdsSession: invalid parameter');
        return;
    }
    loginData.ensureLoginData().then(() => {
        console.log('ensureLoginData successful');
        // create socket
        let sdsSocket = net_1.connect(loginData.port, loginData.server);
        // implement callback functions for the socket
        // actual function (callOperation) is in the callback function "socket.on(connect)"
        sdsSocket.on('connect', () => {
            console.log('callback socket.on(connect)...');
            doLogin(loginData, sdsSocket).then((sdsConnection) => {
                // switchOperation() and closeConnection() are both called inside doLogin.then()
                // because both need parameter sdsConnection
                // call switchOperation() and then close the connection in any case
                serverOperation(sdsConnection, param).then(() => {
                    closeConnection(sdsConnection).catch((reason) => {
                        console.log(reason);
                    });
                }).catch((reason) => {
                    console.log(reason);
                    closeConnection(sdsConnection); // => check socket-on-close
                });
            }).catch((reason) => {
                console.log(reason);
            });
        });
        sdsSocket.on('close', (hadError) => {
            console.log('callback socket.on(close)...');
            if (hadError) {
                console.log('remote closed SDS connection due to error');
            }
            else {
                console.log('remote closed SDS connection');
            }
        });
        sdsSocket.on('error', (err) => {
            console.log('callback socket.on(error)...');
            console.log(err);
            // todo move this somewhere else...
            //vscode.window.showErrorMessage('failed to connect to host: ' + loginData.server + ' and port: ' + loginData.port);
        });
    }).catch((reason) => {
        console.log('ensureLoginData failed: ' + reason);
    });
}
exports.sdsSession = sdsSession;
function doLogin(loginData, sdsSocket) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve, reject) => {
            let sdsConnection = new node_sds_1.SDSConnection(sdsSocket);
            sdsConnection.timeout = SDS_TIMEOUT;
            sdsConnection.connect('vscode-documents-scripting').then(() => {
                console.log('connect successful');
                let username = loginData.username;
                if ('admin' !== loginData.username) {
                    username += "." + loginData.principal;
                }
                return sdsConnection.changeUser(username, node_sds_1.getJanusPassword(loginData.password));
            }).then(userId => {
                console.log('changeUser successful');
                if (loginData.principal.length > 0) {
                    return sdsConnection.changePrincipal(loginData.principal);
                }
                else {
                    reject('doLogin(): please set principal');
                }
            }).then(() => {
                console.log('changePrincipal successful');
                resolve(sdsConnection);
            }).catch((reason) => {
                reject('doLogin() failed: ' + reason);
                closeConnection(sdsConnection).catch((reason) => {
                    console.log(reason);
                });
            });
        });
    });
}
function closeConnection(sdsConnection) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve, reject) => {
            sdsConnection.disconnect().then(() => {
                resolve();
            }).catch((reason) => {
                reject("closeConnection: " + reason);
            });
        });
    });
}
function getScriptNamesFromServer(sdsConnection) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve, reject) => {
            sdsConnection.callClassOperation("PortalScript.getScriptNames", []).then((scriptNames) => {
                resolve(scriptNames);
            }).catch((reason) => {
                reject("getScriptNames() failed: " + reason);
            });
        });
    });
}
exports.getScriptNamesFromServer = getScriptNamesFromServer;
function getScript(file) {
    let s;
    if (file && '.js' === path.extname(file)) {
        try {
            let sc = fs.readFileSync(file, 'utf8');
            let _name = path.basename(file, '.js');
            return { name: _name, sourceCode: sc };
        }
        catch (err) {
            return err.message;
        }
    }
    else {
        return 'only javascript files allowed';
    }
}
exports.getScript = getScript;
function getScriptsFromFolder(_path) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve, reject) => {
            let scripts = [];
            fs.readdir(_path, function (err, files) {
                if (err) {
                    console.log('err in readdir: ' + err);
                    reject();
                }
                if (!files) {
                    console.log('err in readdir: ' + err);
                    reject();
                }
                files.map(function (file) {
                    return path.join(_path, file);
                }).filter(function (file) {
                    return fs.statSync(file).isFile();
                }).forEach(function (file) {
                    if ('.js' === path.extname(file)) {
                        let s = getScript(file);
                        if (typeof s !== 'string') {
                            scripts.push(s);
                        }
                    }
                });
                resolve(scripts);
            });
        });
    });
}
exports.getScriptsFromFolder = getScriptsFromFolder;
function uploadAll(sdsConnection, folder) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve, reject) => {
            return getScriptsFromFolder(folder).then((scripts) => {
                return reduce(scripts, function (numscripts, _script) {
                    return uploadScript(sdsConnection, _script.name, _script.sourceCode).then(() => {
                        return numscripts + 1;
                    });
                }, 0).then((numscripts) => {
                    resolve(numscripts);
                });
            });
        });
    });
}
exports.uploadAll = uploadAll;
function runAll(sdsConnection, folder) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve, reject) => {
            let retarray = [];
            return getScriptsFromFolder(folder).then((scripts) => {
                return reduce(scripts, function (acc, _script) {
                    return runScript(sdsConnection, _script.name).then((value) => {
                        let retval = value.join(os.EOL);
                        retarray.push(retval);
                        return acc;
                    });
                }, 0).then((acc) => {
                    resolve(retarray);
                });
            });
        });
    });
}
exports.runAll = runAll;
function downloadScript(sdsConnection, scriptName, parampath) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve, reject) => {
            sdsConnection.callClassOperation("PortalScript.downloadScript", [scriptName]).then((retval) => {
                let scriptSource = retval[0];
                if (!parampath) {
                    reject('path missing');
                }
                else if (!scriptSource) {
                    reject('could not find ' + scriptName + ' on server');
                }
                else {
                    let lines = scriptSource.split('\n');
                    if (lines.length > 1) {
                        if (lines[0].startsWith("// var context = require(") || lines[0].startsWith("// var util = require(")) {
                            lines[0] = lines[0].replace('// ', '');
                        }
                        if (lines[1].startsWith("// var context = require(") || lines[1].startsWith("// var util = require(")) {
                            lines[1] = lines[1].replace('// ', '');
                        }
                    }
                    scriptSource = lines.join('\n');
                    let scriptPath = path.join(parampath, scriptName + ".js");
                    fs.writeFile(scriptPath, scriptSource, { encoding: 'utf8' }, function (error) {
                        if (error) {
                            if (error.code === "ENOENT") {
                                fs.mkdir(parampath, function (error) {
                                    if (error) {
                                        reject(error);
                                    }
                                    else {
                                        console.log("created path: " + parampath);
                                        fs.writeFile(scriptPath, scriptSource, { encoding: 'utf8' }, function (error) {
                                            if (error) {
                                                reject(error);
                                            }
                                            else {
                                                console.log("downloaded script: " + scriptPath);
                                                resolve();
                                            }
                                        });
                                    }
                                });
                            }
                            else {
                                reject(error);
                            }
                        }
                        else {
                            console.log("downloaded script: " + scriptPath);
                            resolve();
                        }
                    });
                }
            }).catch((reason) => {
                reject(reason);
            });
        });
    });
}
exports.downloadScript = downloadScript;
function uploadScript(sdsConnection, shortName, scriptSource) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve, reject) => {
            let lines = scriptSource.split('\n');
            if (lines.length > 1) {
                if (lines[0].startsWith("var context = require(") || lines[0].startsWith("var util = require(")) {
                    lines[0] = '// ' + lines[0];
                }
                if (lines[1].startsWith("var context = require(") || lines[1].startsWith("var util = require(")) {
                    lines[1] = '// ' + lines[1];
                }
            }
            scriptSource = lines.join('\n');
            sdsConnection.callClassOperation("PortalScript.uploadScript", [shortName, scriptSource], true).then((value) => {
                console.log('uploaded shortName: ', shortName);
                resolve();
            }).catch((reason) => {
                reject(reason);
            });
        });
    });
}
exports.uploadScript = uploadScript;
function runScript(sdsConnection, shortName) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve, reject) => {
            sdsConnection.callClassOperation("PortalScript.runScript", [shortName]).then((value) => {
                if (!value || 0 === value.length) {
                    reject('could not find ' + shortName + ' on server');
                }
                else {
                    resolve(value);
                }
            }).catch((reason) => {
                reject("runScript failed: " + reason);
            });
        });
    });
}
exports.runScript = runScript;
//# sourceMappingURL=sdsAccess.js.map