import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { connect, Socket } from 'net';
import * as reduce from 'reduce-for-promises';

import { SDSConnection, Hash, crypt_md5, getJanusPassword } from 'node-sds';
import * as config from './config';

const SDS_DEFAULT_TIMEOUT: number = 60 * 1000;


export type scriptT = {
    name: string,
    sourceCode?: string,
    encryptState?: string
};

export type scriptSettingsT = {
    encrypted: scriptT[],
    decrypted: scriptT[]
};

export type serverOperationT = (sdsConn: SDSConnection, param: string[], scriptSettings?: scriptSettingsT) => Promise<string[]>;

export async function sdsSession(loginData: config.LoginData,
                                 param: string[],
                                 serverOperation: serverOperationT): Promise<string[]> {

    return new Promise<string[]>((resolve, reject) => {
        if(!loginData) {
            reject('no login data');
        }


        loginData.ensureLoginData().then(() => {
            console.log('ensureLoginData successful');

            // create socket
            let sdsSocket = connect(loginData.port, loginData.server);

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

                // only reject here if on-connect couldn't start
                // reject('failed to connect to host: ' + loginData.server + ' and port: ' + loginData.port);
            });



        }).catch((reason) => {
            console.log('Login data missing');
            reject('Login data missing');
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






async function getScriptNamesFromServer(sdsConnection: SDSConnection): Promise<string[]> {
    return new Promise<string[]>((resolve, reject) => {
        sdsConnection.callClassOperation("PortalScript.getScriptNames", []).then((scriptNames) => {
            resolve(scriptNames);
        }).catch((reason) => {
            reject("getScriptNames() failed: " + reason);
        });
    });
}

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







// params[0]: folder-name
// params[1]: name-prefix, if set, only scripts that start with that prefix are uploaded
export async function uploadAll(sdsConnection: SDSConnection, params: string[]): Promise<string[]> {
    return new Promise<string[]>((resolve, reject) => {
        return getScriptsFromFolder(params[0], params[1]).then((scripts) => {
            
            // reduce calls _uploadScript for every name in scriptNames,
            // in doing so every call of _uploadScript is started after
            // the previous call is finished
             return reduce(scripts, function(numscripts, _script) {
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
}

// params[0]: folder-name
export async function dwonloadAll(sdsConnection: SDSConnection, params: string[]): Promise<string[]> {
    return new Promise<string[]>((resolve, reject) => {
        let scripts: scriptT[] = [];
        return getScriptNamesFromServer(sdsConnection).then((scriptNames) => {

            // see description of reduce in uploadAll
            return reduce(scriptNames, function(numScripts, name) {
                return downloadScript(sdsConnection, [name, params[0]]).then((retval) => {
                    let encryptState = retval[0];
                    let currScript: scriptT = {name: params[0], encryptState: encryptState};
                    scripts.push(currScript);
                    return numScripts + 1;
                });
            }, 0).then((numScripts) => {
                resolve(['' + numScripts]);
            });
        });
    });
}

export async function runAll(sdsConnection: SDSConnection, params: string[]): Promise<string[]> {
    return new Promise<string[]>((resolve, reject) => {
        let allOutputs: string[] = [];
        return getScriptsFromFolder(params[0], params[1]).then((scripts) => {

            // see description of reduce in uploadAll
            return reduce(scripts, function(numScripts, _script) {
                return runScript(sdsConnection, [_script.name]).then((value) => {
                    let scriptOutput: string = value.join(os.EOL);
                    allOutputs.push(scriptOutput);
                    return numScripts;
                });
            }, 0).then((numScripts) => {
                resolve(allOutputs);
            });
        });
    });
}



const NODEJS_UTF8_BOM = '\ufeff';
// not used for now...
// actually it's only required for DOCUMENTS 4 support, in that case
// we shouldn't send UTF 8 without BOM
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


function intellisenseHelper(sourceCode: string): string {
    let lines = sourceCode.split('\n');
    if(lines.length > 1) {
        
        // toggle comment first line
        if(lines[0].startsWith("var context = require(") || lines[0].startsWith("var util = require(") ) {
            lines[0] = '// ' + lines[0];
        } else if(lines[0].startsWith("// var context = require(") || lines[0].startsWith("// var util = require(") ) {
            lines[0] = lines[0].replace('// ', '');
        }

        // toggle comment second line
        if(lines[1].startsWith("var context = require(") || lines[1].startsWith("var util = require(") ) {
            lines[1] = '// ' + lines[1];
        } else if(lines[1].startsWith("// var context = require(") || lines[1].startsWith("// var util = require(") ) {
            lines[1] = lines[1].replace('// ', '');
        }
    }
    return lines.join('\n');
}




export async function downloadScript(sdsConnection: SDSConnection, params: string[]): Promise<string[]> {
    return new Promise<string[]>((resolve, reject) => {
        sdsConnection.callClassOperation("PortalScript.downloadScript", [params[0]]).then((retval) => {
            if(!params[1]) {
                reject('path missing');
            } else if(!retval[0]) {
                reject('could not find ' + params[0] + ' on server');
            } else {
                let scriptSource = intellisenseHelper(retval[0]);
                let encryptState = retval[1];
                console.log('encryptState: ' + encryptState);

                let scriptPath;
                if(params[2]) {
                    // rename script on download, used e.g. for compare
                    scriptPath = path.join(params[1], params[2] + ".js");
                } else {
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
}



export async function uploadScript(sdsConnection: SDSConnection, params: string[]): Promise<string[]> {
    return new Promise<string[]>((resolve, reject) => {
        if(params.length >= 2) {

            let iSourceCode = intellisenseHelper(params[1]);
            let sourceCode = ensureNoBOM(iSourceCode);
            let encryptState = "false";

            sdsConnection.callClassOperation("PortalScript.uploadScript", [params[0], sourceCode, encryptState]).then((value) => {
                console.log('uploaded: ', params[0]);
                resolve([params[0]]);
            }).catch((reason) => {
                reject(reason);
            });
        } else  {
            reject('scriptname or sourcecode missing in uploadScript');
        }
    });
}

export async function runScript(sdsConnection: SDSConnection, params: string[]): Promise<string[]> {
    return new Promise<string[]>((resolve, reject) => {
        sdsConnection.callClassOperation("PortalScript.runScript", [params[0]]).then((value) => {
            if(!value || 0 === value.length) {
                reject('could not find ' + params[0] + ' on server');
            } else {
                resolve(value);
            }
        }).catch((reason) => {
            reject(reason);
        });
    });
}



export async function writeFile(data, filename, allowSubFolder = false): Promise<void> {
    console.log('writeConfigFile');

    return new Promise<void>((resolve, reject) => {

        if(path.extname(filename)) {
            let folder = path.dirname(filename);
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
            
        }

    });
}

