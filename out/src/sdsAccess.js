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
        resolve('');
    });
};
let serverOperationBackup = serverOperation;
// todo param of sdsSession()
function setServerOperation(func) {
    serverOperation = func;
    serverOperationBackup = func;
}
exports.setServerOperation = setServerOperation;
function sdsSession(loginData, param, serverOperationParam) {
    return __awaiter(this, void 0, void 0, function* () {
        if (serverOperationParam) {
            serverOperation = serverOperationParam;
        }
        else {
            serverOperation = serverOperationBackup;
        }
        return new Promise((resolve, reject) => {
            if (!loginData) {
                reject('no login data');
            }
            if (loginData.ensureLoginData()) {
                console.log('ensureLoginData successful');
                // create socket
                let sdsSocket = net_1.connect(loginData.port, loginData.server);
                // implement callback functions for the socket
                // actual function (serverOperation) is in callback function on-connect
                // callback on-connect
                sdsSocket.on('connect', () => {
                    console.log('callback socket.on(connect)');
                    doLogin(loginData, sdsSocket).then((sdsConnection) => {
                        // call serverOperation and then close the connection in any case
                        serverOperation(sdsConnection, param).then((value) => {
                            closeConnection(sdsConnection).then(() => {
                                resolve(value);
                            }).catch((reason) => {
                                reject('close connection failed ' + reason);
                            });
                        }).catch((reason) => {
                            console.log('serverOperation -> catch: ' + reason);
                            closeConnection(sdsConnection).then(() => {
                                // reject because serverOperation went wrong
                                reject(reason);
                            }).catch((reason2) => {
                                // only show reason from catch-serverOperation!
                                reject(reason);
                            });
                        });
                    }).catch((reason) => {
                        console.log('doLogin -> catch');
                        reject(reason);
                    });
                });
                // callback on-close
                sdsSocket.on('close', (hadError) => {
                    console.log('callback socket.on(close)');
                    if (hadError) {
                        console.log('remote closed SDS connection due to error');
                    }
                    else {
                        console.log('remote closed SDS connection');
                    }
                });
                // callback on-error
                sdsSocket.on('error', (err) => {
                    console.log('callback socket.on(error)');
                    console.log(err);
                    reject('failed to connect to host: ' + loginData.server + ' and port: ' + loginData.port);
                });
            }
            else {
                console.log('ensureLoginData failed');
                reject('ensureLoginData failed');
            }
        });
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
                reject("closeConnection failed: " + reason);
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
            // todo check with fs.stat because if file looks relative readFileSync
            // tries to read it from C:\Program Files (x86)\Microsoft VS Code\file
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
function downloadScript(sdsConnection, params) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve, reject) => {
            sdsConnection.callClassOperation("PortalScript.downloadScript", [params[0]]).then((retval) => {
                let scriptSource = retval[0];
                if (!params[1]) {
                    reject('path missing');
                }
                else if (!scriptSource) {
                    reject('could not find ' + params[0] + ' on server');
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
                    let scriptPath = path.join(params[1], params[0] + ".js");
                    fs.writeFile(scriptPath, scriptSource, { encoding: 'utf8' }, function (error) {
                        if (error) {
                            if (error.code === "ENOENT") {
                                fs.mkdir(params[1], function (error) {
                                    if (error) {
                                        reject(error);
                                    }
                                    else {
                                        console.log("created path: " + params[1]);
                                        fs.writeFile(scriptPath, scriptSource, { encoding: 'utf8' }, function (error) {
                                            if (error) {
                                                reject(error);
                                            }
                                            else {
                                                console.log("downloaded script: " + scriptPath);
                                                resolve(params[0]);
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
                            resolve(params[0]);
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
                resolve(shortName);
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