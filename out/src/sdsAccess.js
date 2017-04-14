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
const SDS_DEFAULT_TIMEOUT = 60 * 1000;
function sdsSession(loginData, param, serverOperation) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve, reject) => {
            if (!loginData) {
                reject('no login data');
            }
            loginData.ensureLoginData().then(() => {
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
                    // only reject here if on-connect couldn't start
                    // reject('failed to connect to host: ' + loginData.server + ' and port: ' + loginData.port);
                });
            }).catch((reason) => {
                console.log('Login data missing');
                reject('Login data missing');
            });
        });
    });
}
exports.sdsSession = sdsSession;
function doLogin(loginData, sdsSocket) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve, reject) => {
            let sdsConnection = new node_sds_1.SDSConnection(sdsSocket);
            sdsConnection.timeout = loginData.sdsTimeout ? loginData.sdsTimeout : SDS_DEFAULT_TIMEOUT;
            sdsConnection.connect('vscode-documents-scripting').then(() => {
                console.log('connect successful');
                let username = loginData.username;
                if ('admin' !== loginData.username) {
                    username += "." + loginData.principal;
                }
                return sdsConnection.changeUser(username, node_sds_1.getJanusPassword(loginData.password));
            }).then(userId => {
                loginData.userId = userId;
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
function getScriptsFromFolder(_path, nameprefix) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve, reject) => {
            let scripts = [];
            fs.readdir(_path, function (err, files) {
                if (err) {
                    reject(err.message);
                }
                else if (!files) {
                    reject('unexpexted error in readdir: files is empty');
                }
                else {
                    files.map(function (file) {
                        return path.join(_path, file);
                    }).filter(function (file) {
                        return fs.statSync(file).isFile();
                    }).forEach(function (file) {
                        let basename = path.basename(file);
                        if ('.js' === path.extname(file) && (!nameprefix || basename.startsWith(nameprefix))) {
                            let s = getScript(file);
                            if (typeof s !== 'string') {
                                scripts.push(s);
                            }
                            // else ...reject(s)
                        }
                    });
                    resolve(scripts);
                }
            });
        });
    });
}
exports.getScriptsFromFolder = getScriptsFromFolder;
// params[0]: folder-name
// params[1]: name-prefix, if set, only scripts that start with that prefix are uploaded
function uploadAll(sdsConnection, params) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve, reject) => {
            return getScriptsFromFolder(params[0], params[1]).then((scripts) => {
                // reduce calls _uploadScript for every name in scriptNames,
                // in doing so every call of _uploadScript is started after
                // the previous call is finished
                return reduce(scripts, function (numscripts, _script) {
                    return uploadScript(sdsConnection, [_script.name, _script.sourceCode, _script.encryptState]).then(() => {
                        // this section is executed after every single _uploadScript call
                        return numscripts + 1;
                    });
                }, 0).then((numscripts) => {
                    // this section is exectuted once after all _uploadScript calls are finished
                    resolve(['' + numscripts]);
                });
            });
        });
    });
}
exports.uploadAll = uploadAll;
// params[0]: folder-name
function dwonloadAll(sdsConnection, params) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve, reject) => {
            let scripts = [];
            return getScriptNamesFromServer(sdsConnection).then((scriptNames) => {
                // see description of reduce in uploadAll
                return reduce(scriptNames, function (numScripts, name) {
                    return downloadScript(sdsConnection, [name, params[0]]).then((retval) => {
                        let encryptState = retval[0];
                        let currScript = { name: params[0], encryptState: encryptState };
                        scripts.push(currScript);
                        return numScripts + 1;
                    });
                }, 0).then((numScripts) => {
                    resolve(['' + numScripts]);
                });
            });
        });
    });
}
exports.dwonloadAll = dwonloadAll;
function runAll(sdsConnection, params) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve, reject) => {
            let allOutputs = [];
            return getScriptsFromFolder(params[0], params[1]).then((scripts) => {
                // see description of reduce in uploadAll
                return reduce(scripts, function (numScripts, _script) {
                    return runScript(sdsConnection, [_script.name]).then((value) => {
                        let scriptOutput = value.join(os.EOL);
                        allOutputs.push(scriptOutput);
                        return numScripts;
                    });
                }, 0).then((numScripts) => {
                    resolve(allOutputs);
                });
            });
        });
    });
}
exports.runAll = runAll;
const NODEJS_UTF8_BOM = '\ufeff';
// not used for now...
// actually it's only required for DOCUMENTS 4 support, in that case
// we shouldn't send UTF 8 without BOM
function ensureBOM(sourceCode) {
    if (sourceCode.length >= 3 && sourceCode.startsWith(NODEJS_UTF8_BOM)) {
        return sourceCode;
    }
    else {
        return NODEJS_UTF8_BOM + sourceCode;
    }
}
function ensureNoBOM(sourceCode) {
    return sourceCode.replace(/^\ufeff/, '');
}
function intellisenseHelper(sourceCode) {
    let lines = sourceCode.split('\n');
    if (lines.length > 1) {
        // toggle comment first line
        if (lines[0].startsWith("var context = require(") || lines[0].startsWith("var util = require(")) {
            lines[0] = '// ' + lines[0];
        }
        else if (lines[0].startsWith("// var context = require(") || lines[0].startsWith("// var util = require(")) {
            lines[0] = lines[0].replace('// ', '');
        }
        // toggle comment second line
        if (lines[1].startsWith("var context = require(") || lines[1].startsWith("var util = require(")) {
            lines[1] = '// ' + lines[1];
        }
        else if (lines[1].startsWith("// var context = require(") || lines[1].startsWith("// var util = require(")) {
            lines[1] = lines[1].replace('// ', '');
        }
    }
    return lines.join('\n');
}
function downloadScript(sdsConnection, params) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve, reject) => {
            sdsConnection.callClassOperation("PortalScript.downloadScript", [params[0]]).then((retval) => {
                if (!params[1]) {
                    reject('path missing');
                }
                else if (!retval[0]) {
                    reject('could not find ' + params[0] + ' on server');
                }
                else {
                    let scriptSource = intellisenseHelper(retval[0]);
                    let encryptState = retval[1];
                    console.log('encryptState: ' + encryptState);
                    let scriptPath;
                    if (params[2]) {
                        // rename script on download, used e.g. for compare
                        scriptPath = path.join(params[1], params[2] + ".js");
                    }
                    else {
                        scriptPath = path.join(params[1], params[0] + ".js");
                    }
                    writeFile(scriptSource, scriptPath, true).then(() => {
                        resolve([retval[1]]);
                    }).catch((reason) => {
                        reject(reason);
                    });
                }
            }).catch((reason) => {
                reject(reason);
            });
        });
    });
}
exports.downloadScript = downloadScript;
function uploadScript(sdsConnection, params) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve, reject) => {
            if (params.length >= 2) {
                let iSourceCode = intellisenseHelper(params[1]);
                let sourceCode = ensureNoBOM(iSourceCode);
                let encryptState = "false";
                sdsConnection.callClassOperation("PortalScript.uploadScript", [params[0], sourceCode, encryptState]).then((value) => {
                    console.log('uploaded: ', params[0]);
                    resolve([params[0]]);
                }).catch((reason) => {
                    reject(reason);
                });
            }
            else {
                reject('scriptname or sourcecode missing in uploadScript');
            }
        });
    });
}
exports.uploadScript = uploadScript;
function runScript(sdsConnection, params) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve, reject) => {
            sdsConnection.callClassOperation("PortalScript.runScript", [params[0]]).then((value) => {
                if (!value || 0 === value.length) {
                    reject('could not find ' + params[0] + ' on server');
                }
                else {
                    resolve(value);
                }
            }).catch((reason) => {
                reject(reason);
            });
        });
    });
}
exports.runScript = runScript;
function writeFile(data, filename, allowSubFolder = false) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('writeConfigFile');
        return new Promise((resolve, reject) => {
            if (path.extname(filename)) {
                let folder = path.dirname(filename);
                fs.writeFile(filename, data, { encoding: 'utf8' }, function (error) {
                    if (error) {
                        if (error.code === 'ENOENT' && allowSubFolder) {
                            fs.mkdir(folder, function (error) {
                                if (error) {
                                    reject(error);
                                }
                                else {
                                    console.log('created path: ' + folder);
                                    fs.writeFile(filename, data, { encoding: 'utf8' }, function (error) {
                                        if (error) {
                                            reject(error);
                                        }
                                        else {
                                            console.log('wrote file: ' + filename);
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
                        console.log('wrote file: ' + filename);
                        resolve();
                    }
                });
            }
        });
    });
}
exports.writeFile = writeFile;
//# sourceMappingURL=sdsAccess.js.map