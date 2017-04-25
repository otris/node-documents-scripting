import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { connect, Socket } from 'net';
import * as reduce from 'reduce-for-promises';
// let lastSyncHash = crypto.createHash('md5').update(data).digest("hex");
import * as crypto from 'crypto';

import { SDSConnection, Hash, crypt_md5, getJanusPassword } from 'node-sds';
import * as config from './config';

const SDS_DEFAULT_TIMEOUT: number = 60 * 1000;


/**
 * encrypt states of scripts
 * default is false
 */
export enum encrypted {
    /**
     * server script and local script are both not encrypted
     */
    false = 0,

    /**
     * server script and local script are encrypted
     */
    true = 1,

    /**
     * server script is encrypted, local script is decrypted
     */
    decrypted = 2
}



export type scriptT = {
    name: string,
    rename?: string,
    sourceCode?: string,
    lastSyncHash?: string,
    output?: string,
    encrypted?: encrypted,
    path?: string,
    overwrite?: boolean
};

export type documentsT = {
    version: string
}



export type serverOperationT = (sdsConn: SDSConnection, param: any[]) => Promise<any[]>;


export async function sdsSession(loginData: config.LoginData,
                                 param: any[],
                                 serverOperation: serverOperationT): Promise<any[]> {

    return new Promise<any[]>((resolve, reject) => {
        if(!loginData) {
            reject('no login data');
        }


        loginData.ensureLoginData().then(() => {
            let onConnect: boolean = false;
            console.log('ensureLoginData successful');

            // create socket
            let sdsSocket = connect(loginData.port, loginData.server);

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
            sdsSocket.on('close', (hadError: boolean) => {
                console.log('callback socket.on(close)');
                if (hadError) {
                    console.log('remote closed SDS connection due to error');
                } else {
                    console.log('remote closed SDS connection');
                }
            });

            // callback on-error
            sdsSocket.on('error', (err: any) => {
                console.log('callback socket.on(error)');
                console.log(err);
                if(onConnect) {
                    // reject is executed in on('connect') callback 
                } else {
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
}


async function doLogin(loginData: config.LoginData, sdsSocket: Socket): Promise<SDSConnection> {
    return new Promise<SDSConnection>((resolve, reject) => {
        let sdsConnection = new SDSConnection(sdsSocket);
        sdsConnection.timeout = loginData.sdsTimeout? loginData.sdsTimeout: SDS_DEFAULT_TIMEOUT;

        sdsConnection.connect('vscode-documents-scripting').then(() => {
            console.log('connect successful');
            let username = loginData.username;
            if('admin' !== loginData.username) {
                username += "." + loginData.principal;
            }

            return sdsConnection.changeUser(username, getJanusPassword(loginData.password));

        }).then(userId => {
            loginData.userId = userId;
            console.log('changeUser successful');
            if (loginData.principal.length > 0) {
                return sdsConnection.changePrincipal(loginData.principal);
            } else {
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
}


async function closeConnection(sdsConnection: SDSConnection): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        sdsConnection.disconnect().then(() => {
            resolve();
        }).catch((reason) => {
            reject("closeConnection failed: " + reason);
        });
    });
}




export async function getDocumentsVersion(sdsConnection: SDSConnection, params: any[]): Promise<documentsT[]> {
    return new Promise<documentsT[]>((resolve, reject) => {
        sdsConnection.callClassOperation("PartnerNet.getVersionNo", []).then((value) => {
            let docVersion = value[0];
            let doc: documentsT = {version: docVersion};
            console.log('getDocumentsVersion: ' + doc.version);
            resolve([doc]);
        }).catch((reason) => {
            reject("getDocumentsVersion failed: " + reason);
        });
    });
}



export async function getScriptNamesFromServer(sdsConnection: SDSConnection, params: scriptT[]): Promise<scriptT[]> {
    return new Promise<scriptT[]>((resolve, reject) => {
        sdsConnection.callClassOperation("PortalScript.getScriptNames", []).then((scriptNames) => {
            let scripts: scriptT[] = [];
            scriptNames.forEach(function(scriptname) {
                let script: scriptT = {name: scriptname};
                scripts.push(script);
            });
            resolve(scripts);
        }).catch((reason) => {
            reject("getScriptNamesFromServer failed: " + reason);
        });
    });
}


/**
 * Create script-type with name and sourceCode from file.
 * 
 * @param file Scriptname, full path.
 */
export function getScript(file: string): scriptT | string {
    let s: scriptT;
    if(file && '.js' === path.extname(file)) {
        try {
            // todo check with fs.stat because if file looks relative readFileSync
            // tries to read it from C:\Program Files (x86)\Microsoft VS Code\file
            let sc = fs.readFileSync(file, 'utf8');
            let _name = path.basename(file, '.js');
            return {name: _name, sourceCode: sc};
        } catch(err) {
            return err.message;
        }
    } else {
        return 'only javascript files allowed';
    }
}



/**
 * Return a list of all names of all JavaScript files in the given folder.
 * 
 * @param _path Foder
 * @param nameprefix 
 */
export async function getScriptsFromFolder(_path: string, nameprefix?: string): Promise<scriptT[]> {
    return new Promise<scriptT[]>((resolve, reject) => {
    
        let scripts : scriptT[] = [];

        fs.readdir(_path, function (err, files) {
            if (err) {
                reject(err.message);
            } else if (!files) {
                reject('unexpexted error in readdir: files is empty');
            } else {

                files.map(function (file) {
                    return path.join(_path, file);
                }).filter(function (file) {
                    return fs.statSync(file).isFile();
                }).forEach(function (file) {
                    let basename = path.basename(file);
                    if('.js' === path.extname(file) && (!nameprefix || basename.startsWith(nameprefix))) {
                        let s = getScript(file);
                        if(typeof s !== 'string') {
                            scripts.push(s);
                        }
                        // else ...reject(s)
                    }
                });

                resolve(scripts);
            }
        });
    });
}






/**
 * Upload all scripts in given list.
 * 
 * @return Array containing all uploaded scripts, should be equal to params.
 * @param sdsConnection 
 * @param params Array containing all scripts to upload.
 */
export async function uploadAll(sdsConnection: SDSConnection, params: scriptT[]): Promise<scriptT[]> {
    return new Promise<scriptT[]>((resolve, reject) => {
        let scripts: scriptT[] = [];
        
        // reduce calls _uploadScript for every name in scriptNames,
        // in doing so every call of _uploadScript is started after
        // the previous call is finished
            return reduce(params, function(numscripts, _script) {
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
}



/**
 * Download all scripts from server.
 * 
 * @return Array containing all downloaded scripts, including the source-code.
 * @param sdsConnection 
 * @param params Array containing all scripts to download.
 */
export async function dwonloadAll(sdsConnection: SDSConnection, params: scriptT[]): Promise<scriptT[]> {
    return new Promise<scriptT[]>((resolve, reject) => {
        let returnScripts: scriptT[] = [];
        let scripts: scriptT[] = params;

        // see description of reduce in uploadAll
        return reduce(scripts, function(numScripts, script) {
            return downloadScript(sdsConnection, [script]).then((retval) => {
                let currentScript: scriptT = retval[0];
                returnScripts.push(currentScript);
                return numScripts + 1;
            });
        }, 0).then((numScripts) => {
            resolve(returnScripts);
        });
    });
}

/**
 * Execute all scripts in given list on server.
 * 
 * @return Array containing all executed scripts, including the output.
 * @param sdsConnection 
 * @param params Array containing all scripts to execute.
 */
export async function runAll(sdsConnection: SDSConnection, params: scriptT[]): Promise<scriptT[]> {
    return new Promise<scriptT[]>((resolve, reject) => {
        let scripts: scriptT[] = [];

        // see description of reduce in uploadAll
        return reduce(params, function(numScripts, _script) {
            return runScript(sdsConnection, [_script]).then((value) => {
                let script: scriptT = value[0];
                scripts.push(script);
                return numScripts;
            });
        }, 0).then((numScripts) => {
            resolve(scripts);
        });
    });
}



const NODEJS_UTF8_BOM = '\ufeff';
// not used for now...
// actually it's only required for DOCUMENTS 4 support,
// in that case we shouldn't send UTF 8 without BOM
function ensureBOM(sourceCode: string): string {
    if(sourceCode.length >= 3 && sourceCode.startsWith(NODEJS_UTF8_BOM)) {
        return sourceCode;
    } else {
        return NODEJS_UTF8_BOM + sourceCode;
    }
}
function ensureNoBOM(sourceCode: string): string {
    return sourceCode.replace(/^\ufeff/, '');
}


function intellisenseDownload(sourceCode: string): string {
    let lines = sourceCode.split('\n');
    if(lines.length > 1) {
        
        // uncomment first line
        if(lines[0].startsWith("// var context = require(") || lines[0].startsWith("// var util = require(") ) {
            lines[0] = lines[0].replace('// ', '');
        }

        // uncomment second line
        if(lines[1].startsWith("// var context = require(") || lines[1].startsWith("// var util = require(") ) {
            lines[1] = lines[1].replace('// ', '');
        }
    }
    return lines.join('\n');
}

function intellisenseUpload(sourceCode: string): string {
    let lines = sourceCode.split('\n');
    if(lines.length > 1) {
        
        // comment first line
        if(lines[0].startsWith("var context = require(") || lines[0].startsWith("var util = require(") ) {
            lines[0] = '// ' + lines[0];
        }

        // comment second line
        if(lines[1].startsWith("var context = require(") || lines[1].startsWith("var util = require(") ) {
            lines[1] = '// ' + lines[1];
        }
    }
    return lines.join('\n');
}



export async function downloadScript(sdsConnection: SDSConnection, params: scriptT[]): Promise<scriptT[]> {
    return new Promise<scriptT[]>((resolve, reject) => {
        let script: scriptT = params[0];
        sdsConnection.callClassOperation("PortalScript.downloadScript", [script.name]).then((retval) => {
            if(!script.path) {
                reject('path missing');
            } else if(!retval[0]) {
                reject('could not find ' + script.name + ' on server');
            } else {
                let scriptSource = intellisenseDownload(retval[0]);
                let _encryptState = retval[1];

                let scriptPath;
                if(script.rename) {
                    // rename script on download, only used for compare by now
                    scriptPath = path.join(script.path? script.path: '', script.rename + ".js");
                } else {
                    scriptPath = path.join(script.path? script.path: '', script.name + ".js");
                }

                writeFile(scriptSource, scriptPath, true).then(() => {
                    if(_encryptState === 'true') {
                        script.encrypted = encrypted.true;
                    } else if(_encryptState === 'decrypted') {
                        script.encrypted = encrypted.decrypted;
                    } else {
                        script.encrypted = encrypted.false;
                    }
                    if(!script.overwrite) {
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
}

/**
 * If the given script can be uploaded, an empty list is returned.
 * If not, a script containing the server source code is returned.
 * Both cases are resolved. Reject only in case of error.
 * 
 * @param sdsConnection 
 * @param params 
 */
export async function checkForUpload(sdsConnection: SDSConnection, params: scriptT[]): Promise<scriptT[]> {
    return new Promise<scriptT[]>((resolve, reject) => {
        let script: scriptT = params[0];
        if(script.overwrite) {
            console.log('checkForUpload: overwrite');
            resolve([]);
        } else {
            sdsConnection.callClassOperation('PortalScript.downloadScript', [script.name]).then((value) => {
                let scriptSource = intellisenseDownload(value[0]);
                let serverScript = script;
                serverScript.sourceCode = scriptSource;
                let sourceCode: string = serverScript.sourceCode? serverScript.sourceCode : '';
                serverScript.lastSyncHash = crypto.createHash('md5').update(sourceCode).digest('hex');
                if(script.lastSyncHash === serverScript.lastSyncHash) {
                    console.log('checkForUpload: no changes on server');
                    resolve([]);
                } else {
                    console.log('checkForUpload: script changed on server');
                    resolve([serverScript]);
                }
            }).catch((reason) => {
                reject(reason);
            });
        }
    });
}


export async function uploadScript(sdsConnection: SDSConnection, params: scriptT[]): Promise<scriptT[]> {
    return new Promise<scriptT[]>((resolve, reject) => {
        let script: scriptT = params[0];
        if(script.sourceCode) {

            let iSourceCode = intellisenseUpload(script.sourceCode);
            let sourceCode = ensureNoBOM(iSourceCode);
            let paramScript = [script.name, sourceCode];
            if(script.encrypted === encrypted.true) {
                paramScript.push('true');
            } else if(script.encrypted === encrypted.decrypted) {
                paramScript.push('decrypted');
            } else if(script.encrypted === encrypted.false) {
                paramScript.push('false');
            }

            sdsConnection.callClassOperation("PortalScript.uploadScript", paramScript).then((value) => {
                if(!script.overwrite) {
                    script.lastSyncHash = crypto.createHash('md5').update(sourceCode).digest("hex");
                }
                console.log('uploaded: ', script.name);
                resolve([script]);
            }).catch((reason) => {
                reject(reason);
            });
        } else  {
            reject('scriptname or sourcecode missing in uploadScript');
        }
    });
}

export async function runScript(sdsConnection: SDSConnection, params: scriptT[]): Promise<scriptT[]> {
    return new Promise<scriptT[]>((resolve, reject) => {
        let script: scriptT = params[0];
        sdsConnection.callClassOperation("PortalScript.runScript", [script.name]).then((value) => {
            if(!value || 0 === value.length) {
                reject('could not find ' + params[0] + ' on server');
            } else {
                script.output = value.join(os.EOL);
                resolve([script]);
            }
        }).catch((reason) => {
            reject(reason);
        });
    });
}



export async function writeFile(data, filename, allowSubFolder = false): Promise<void> {
    console.log('writeFile');

    return new Promise<void>((resolve, reject) => {

        let folder = path.dirname(filename);
        if(folder && path.extname(filename)) {
            fs.writeFile(filename, data, {encoding: 'utf8'}, function(error) {
                if(error) {
                    if(error.code === 'ENOENT' && allowSubFolder) {
                        fs.mkdir(folder, function(error) {
                            if(error) {
                                reject(error);
                            } else {
                                console.log('created path: ' + folder);
                                fs.writeFile(filename, data, {encoding: 'utf8'}, function(error) {
                                    if(error) {
                                        reject(error);
                                    } else {
                                        console.log('wrote file: ' +  filename);
                                        resolve();
                                    }
                                });
                            }
                        });
                    } else {
                        reject(error);
                    }
                } else {
                    console.log('wrote file: ' +  filename);
                    resolve();
                }
            });
        } else {
            reject('error in filename');
        }
    });
}

