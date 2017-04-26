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
// let lastSyncHash = crypto.createHash('md5').update(data).digest("hex");
const crypto = require("crypto");
const node_sds_1 = require("node-sds");
const SDS_DEFAULT_TIMEOUT = 60 * 1000;
/**
 * encrypt states of scripts
 * default is false
 */
var encrypted;
(function (encrypted) {
    /**
     * server script and local script are both not encrypted
     */
    encrypted[encrypted["false"] = 0] = "false";
    /**
     * server script and local script are encrypted
     */
    encrypted[encrypted["true"] = 1] = "true";
    /**
     * server script is encrypted, local script is decrypted
     */
    encrypted[encrypted["decrypted"] = 2] = "decrypted";
})(encrypted = exports.encrypted || (exports.encrypted = {}));
function sdsSession(loginData, param, serverOperation) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve, reject) => {
            if (!loginData) {
                reject('no login data');
            }
            loginData.ensureLoginData().then(() => {
                let onConnect = false;
                console.log('ensureLoginData successful');
                // create socket
                let sdsSocket = net_1.connect(loginData.port, loginData.server);
                // implement callback functions for the socket
                // actual function (serverOperation) is in callback function on-connect
                // callback on-connect
                sdsSocket.on('connect', () => {
                    onConnect = true;
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
                    if (onConnect) {
                        // reject is executed in on('connect') callback 
                    }
                    else {
                        // on('connect') is not executed, so we must reject here
                        reject(err);
                    }
                    // only reject here if on-connect couldn't start
                    // reject('failed to connect to host: ' + loginData.server + ' and port: ' + loginData.port);
                });
            }).catch((reason) => {
                reject(reason);
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
function getDocumentsVersion(sdsConnection, params) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve, reject) => {
            sdsConnection.callClassOperation("PartnerNet.getVersionNo", []).then((value) => {
                let docVersion = value[0];
                let doc = { version: docVersion };
                console.log('getDocumentsVersion: ' + doc.version);
                resolve([doc]);
            }).catch((reason) => {
                reject("getDocumentsVersion failed: " + reason);
            });
        });
    });
}
exports.getDocumentsVersion = getDocumentsVersion;
function getScriptNamesFromServer(sdsConnection, params) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve, reject) => {
            sdsConnection.callClassOperation("PortalScript.getScriptNames", []).then((scriptNames) => {
                let scripts = [];
                scriptNames.forEach(function (scriptname) {
                    let script = { name: scriptname };
                    scripts.push(script);
                });
                resolve(scripts);
            }).catch((reason) => {
                reject("getScriptNamesFromServer failed: " + reason);
            });
        });
    });
}
exports.getScriptNamesFromServer = getScriptNamesFromServer;
/**
 * Create script-type with name and sourceCode from file.
 *
 * @param file Scriptname, full path.
 */
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
/**
 * Return a list of all names of all JavaScript files in the given folder.
 *
 * @param _path Foder
 * @param nameprefix
 */
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
/**
 * Upload all scripts in given list.
 *
 * @return Array containing all uploaded scripts, should be equal to params.
 * @param sdsConnection
 * @param params Array containing all scripts to upload.
 */
function uploadAll(sdsConnection, params) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve, reject) => {
            let scripts = [];
            // reduce calls _uploadScript for every name in scriptNames,
            // in doing so every call of _uploadScript is started after
            // the previous call is finished
            return reduce(params, function (numscripts, _script) {
                return uploadScript(sdsConnection, [_script]).then(() => {
                    // this section is executed after every single _uploadScript call
                    scripts.push(_script);
                    return numscripts + 1;
                });
            }, 0).then((numscripts) => {
                // this section is exectuted once after all _uploadScript calls are finished
                resolve(scripts);
            });
        });
    });
}
exports.uploadAll = uploadAll;
/**
 * Download all scripts from server.
 *
 * @return Array containing all downloaded scripts, including the source-code.
 * @param sdsConnection
 * @param params Array containing all scripts to download.
 */
function dwonloadAll(sdsConnection, params) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve, reject) => {
            let returnScripts = [];
            let scripts = params;
            // see description of reduce in uploadAll
            return reduce(scripts, function (numScripts, script) {
                return downloadScript(sdsConnection, [script]).then((retval) => {
                    let currentScript = retval[0];
                    returnScripts.push(currentScript);
                    return numScripts + 1;
                });
            }, 0).then((numScripts) => {
                resolve(returnScripts);
            });
        });
    });
}
exports.dwonloadAll = dwonloadAll;
/**
 * Execute all scripts in given list on server.
 *
 * @return Array containing all executed scripts, including the output.
 * @param sdsConnection
 * @param params Array containing all scripts to execute.
 */
function runAll(sdsConnection, params) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve, reject) => {
            let scripts = [];
            // see description of reduce in uploadAll
            return reduce(params, function (numScripts, _script) {
                return runScript(sdsConnection, [_script]).then((value) => {
                    let script = value[0];
                    scripts.push(script);
                    return numScripts;
                });
            }, 0).then((numScripts) => {
                resolve(scripts);
            });
        });
    });
}
exports.runAll = runAll;
const NODEJS_UTF8_BOM = '\ufeff';
// not used for now...
// actually it's only required for DOCUMENTS 4 support,
// in that case we shouldn't send UTF 8 without BOM
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
function intellisenseDownload(sourceCode) {
    let lines = sourceCode.split('\n');
    if (lines.length > 1) {
        // uncomment first line
        if (lines[0].startsWith("// var context = require(") || lines[0].startsWith("// var util = require(")) {
            lines[0] = lines[0].replace('// ', '');
        }
        // uncomment second line
        if (lines[1].startsWith("// var context = require(") || lines[1].startsWith("// var util = require(")) {
            lines[1] = lines[1].replace('// ', '');
        }
    }
    return lines.join('\n');
}
function intellisenseUpload(sourceCode) {
    let lines = sourceCode.split('\n');
    if (lines.length > 1) {
        // comment first line
        if (lines[0].startsWith("var context = require(") || lines[0].startsWith("var util = require(")) {
            lines[0] = '// ' + lines[0];
        }
        // comment second line
        if (lines[1].startsWith("var context = require(") || lines[1].startsWith("var util = require(")) {
            lines[1] = '// ' + lines[1];
        }
    }
    return lines.join('\n');
}
function downloadScript(sdsConnection, params) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve, reject) => {
            let script = params[0];
            sdsConnection.callClassOperation("PortalScript.downloadScript", [script.name]).then((retval) => {
                if (!script.path) {
                    reject('path missing');
                }
                else if (!retval[0]) {
                    reject('could not find ' + script.name + ' on server');
                }
                else {
                    let scriptSource = intellisenseDownload(retval[0]);
                    let _encryptState = retval[1];
                    let scriptPath;
                    if (script.rename) {
                        // rename script on download, only used for compare by now
                        scriptPath = path.join(script.path ? script.path : '', script.rename + ".js");
                    }
                    else {
                        scriptPath = path.join(script.path ? script.path : '', script.name + ".js");
                    }
                    writeFile(scriptSource, scriptPath, true).then(() => {
                        if (_encryptState === 'true') {
                            script.encrypted = encrypted.true;
                        }
                        else if (_encryptState === 'decrypted') {
                            script.encrypted = encrypted.decrypted;
                        }
                        else {
                            script.encrypted = encrypted.false;
                        }
                        if (script.conflictMode) {
                            script.lastSyncHash = crypto.createHash('md5').update(scriptSource).digest("hex");
                        }
                        resolve([script]);
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
/**
 * If the given script can be uploaded, an empty list is returned.
 * If not, a script containing the server source code is returned.
 * Both cases are resolved. Reject only in case of error.
 *
 * @param sdsConnection
 * @param params
 */
function checkForUpload(sdsConnection, params) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve, reject) => {
            let script = params[0];
            if (script.conflictMode) {
                sdsConnection.callClassOperation('PortalScript.downloadScript', [script.name]).then((value) => {
                    let scriptSource = intellisenseDownload(value[0]);
                    let serverScript = script;
                    serverScript.sourceCode = scriptSource;
                    let sourceCode = serverScript.sourceCode ? serverScript.sourceCode : '';
                    serverScript.lastSyncHash = crypto.createHash('md5').update(sourceCode).digest('hex');
                    if (script.lastSyncHash === serverScript.lastSyncHash) {
                        console.log('checkForUpload: no changes on server');
                        resolve([]);
                    }
                    else {
                        console.log('checkForUpload: script changed on server');
                        resolve([serverScript]);
                    }
                }).catch((reason) => {
                    reject(reason);
                });
            }
            else {
                console.log('checkForUpload: overwrite');
                resolve([]);
            }
        });
    });
}
exports.checkForUpload = checkForUpload;
function uploadScript(sdsConnection, params) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve, reject) => {
            let script = params[0];
            if (script.sourceCode) {
                let iSourceCode = intellisenseUpload(script.sourceCode);
                let sourceCode = ensureNoBOM(iSourceCode);
                let paramScript = [script.name, sourceCode];
                if (script.encrypted === encrypted.true) {
                    paramScript.push('true');
                }
                else if (script.encrypted === encrypted.decrypted) {
                    paramScript.push('decrypted');
                }
                else if (script.encrypted === encrypted.false) {
                    paramScript.push('false');
                }
                sdsConnection.callClassOperation("PortalScript.uploadScript", paramScript).then((value) => {
                    if (script.conflictMode) {
                        script.lastSyncHash = crypto.createHash('md5').update(sourceCode).digest("hex");
                    }
                    console.log('uploaded: ', script.name);
                    resolve([script]);
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
            let script = params[0];
            sdsConnection.callClassOperation("PortalScript.runScript", [script.name]).then((value) => {
                if (!value || 0 === value.length) {
                    reject('could not find ' + params[0] + ' on server');
                }
                else {
                    script.output = value.join(os.EOL);
                    resolve([script]);
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
        console.log('writeFile');
        return new Promise((resolve, reject) => {
            let folder = path.dirname(filename);
            if (folder && path.extname(filename)) {
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
            else {
                reject('error in filename');
            }
        });
    });
}
exports.writeFile = writeFile;
//# sourceMappingURL=sdsAccess.js.map