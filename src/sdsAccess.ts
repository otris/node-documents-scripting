import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { connect, Socket } from 'net';
import * as reduce from 'reduce-for-promises';

import { SDSConnection, Hash, crypt_md5, getJanusPassword } from 'node-sds';
import * as config from './config';


export type script = {name: string, sourceCode: string};

const SDS_TIMEOUT: number = 60 * 1000;


let serverOperation = (sdsConnection: SDSConnection, param: any[]) => {
    return new Promise<string>((resolve, reject) => {
        resolve('');
    });
};
let serverOperationBackup = serverOperation;

// todo param of sdsSession()
export function setServerOperation(func) {
    serverOperation = func;
    serverOperationBackup = func;
}


export async function sdsSession(loginData: config.LoginData,
                                 param: any[],
                                 serverOperationParam?: (sds, param: any[]) => Promise<string>): Promise<string> {

    if(serverOperationParam) {
        serverOperation = serverOperationParam;
    } else {
        serverOperation = serverOperationBackup;
    }

    return new Promise<string>((resolve, reject) => {
        if(!loginData) {
            reject('no login data');
        }


        if(loginData.ensureLoginData()) {
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
                reject('failed to connect to host: ' + loginData.server + ' and port: ' + loginData.port);
            });

        } else {
            console.log('ensureLoginData failed');
            reject('ensureLoginData failed');
        }


    });
}


async function doLogin(loginData: config.LoginData, sdsSocket: Socket): Promise<SDSConnection> {
    return new Promise<SDSConnection>((resolve, reject) => {
        let sdsConnection = new SDSConnection(sdsSocket);
        sdsConnection.timeout = SDS_TIMEOUT;

        sdsConnection.connect('vscode-documents-scripting').then(() => {
            console.log('connect successful');
            let username = loginData.username;
            if('admin' !== loginData.username) {
                username += "." + loginData.principal;
            }

            return sdsConnection.changeUser(username, getJanusPassword(loginData.password));

        }).then(userId => {
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






export async function getScriptNamesFromServer(sdsConnection: SDSConnection): Promise<string[]> {
    return new Promise<string[]>((resolve, reject) => {
        sdsConnection.callClassOperation("PortalScript.getScriptNames", []).then((scriptNames) => {
            resolve(scriptNames);
        }).catch((reason) => {
            reject("getScriptNames() failed: " + reason);
        });
    });
}

export function getScript(file: string): script | string {
    let s: script;
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


export async function getScriptsFromFolder(_path: string): Promise<script[]> {
    return new Promise<script[]>((resolve, reject) => {
    
        let scripts : script[] = [];

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
                if('.js' === path.extname(file)) {
                    let s = getScript(file);
                    if(typeof s !== 'string') {
                        scripts.push(s);
                    }
                }
            });

            resolve(scripts);
        });
    });
}

export async function uploadAll(sdsConnection: SDSConnection, folder: string): Promise<number> {
    return new Promise<number>((resolve, reject) => {
        return getScriptsFromFolder(folder).then((scripts) => {
            return reduce(scripts, function(numscripts, _script) {
                return uploadScript(sdsConnection, _script.name, _script.sourceCode).then(() => {
                    return numscripts + 1;
                });
            }, 0).then((numscripts) => {
                resolve(numscripts);
            });
        });
    });
}



export async function runAll(sdsConnection: SDSConnection, folder: string): Promise<string[]> {
    return new Promise<string[]>((resolve, reject) => {
        let retarray: string[] = [];
        return getScriptsFromFolder(folder).then((scripts) => {
            return reduce(scripts, function(acc, _script) {
                return runScript(sdsConnection, _script.name).then((value) => {
                    let retval: string = value.join(os.EOL);
                    retarray.push(retval);
                    return acc;
                });
            }, 0).then((acc) => {
                resolve(retarray);
            });
        });
    });
}


export async function downloadScript(sdsConnection: SDSConnection, params: string[]): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        sdsConnection.callClassOperation("PortalScript.downloadScript", [params[0]]).then((retval) => {
            let scriptSource: string = retval[0];
            if(!params[1]) {
                reject('path missing');
            } else if(!scriptSource) {
                reject('could not find ' + params[0] + ' on server');
            } else {
                let lines = scriptSource.split('\n');
                if(lines.length > 1) {
                    if(lines[0].startsWith("// var context = require(") || lines[0].startsWith("// var util = require(") ) {
                        lines[0] = lines[0].replace('// ', '');
                    }
                    if(lines[1].startsWith("// var context = require(") || lines[1].startsWith("// var util = require(") ) {
                        lines[1] = lines[1].replace('// ', '');
                    }
                }
                scriptSource = lines.join('\n');



                let scriptPath = path.join(params[1], params[0] + ".js");
                fs.writeFile(scriptPath, scriptSource, {encoding: 'utf8'}, function(error) {
                    if(error) {
                        if(error.code === "ENOENT") {
                            fs.mkdir(params[1], function(error) {
                                if(error) {
                                    reject(error);
                                } else {
                                    console.log("created path: " + params[1]);
                                    fs.writeFile(scriptPath, scriptSource, {encoding: 'utf8'}, function(error) {
                                        if(error) {
                                            reject(error);
                                        } else {
                                            console.log("downloaded script: " +  scriptPath);
                                            resolve(params[0]);
                                        }
                                    });
                                }
                            });
                        } else {
                            reject(error);
                        }
                    } else {
                        console.log("downloaded script: " +  scriptPath);
                        resolve(params[0]);
                    }
                });
            }
        }).catch((reason) => {
            reject(reason);
        });
    });
}

export async function uploadScript(sdsConnection: SDSConnection, shortName: string, scriptSource: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        let lines = scriptSource.split('\n');
        if(lines.length > 1) {
            if(lines[0].startsWith("var context = require(") || lines[0].startsWith("var util = require(") ) {
                lines[0] = '// ' + lines[0];
            }
            if(lines[1].startsWith("var context = require(") || lines[1].startsWith("var util = require(") ) {
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
}

export async function runScript(sdsConnection: SDSConnection, shortName: string): Promise<string[]> {
    return new Promise<string[]>((resolve, reject) => {
        sdsConnection.callClassOperation("PortalScript.runScript", [shortName]).then((value) => {
            if(!value || 0 === value.length) {
                reject('could not find ' + shortName + ' on server');
            } else {
                resolve(value);
            }
        }).catch((reason) => {
            reject("runScript failed: " + reason);
        });
    });
}

