import * as os from 'os';
import * as path from 'path';
import { connect, Socket } from 'net';
// let lastSyncHash = crypto.createHash('md5').update(data).digest("hex");
import * as crypto from 'crypto';
import { SDSConnection, Hash, crypt_md5, getJanusPassword } from 'node-sds';
import * as config from './config';
import { Logger } from 'node-file-log';

const reduce = require('reduce-for-promises');
const fs = require('fs-extra');


const logger = Logger.create('node-documents-scripting');

const VERSION_MIN = '8034';
const VERSION_CATEGORIES = '8041';
const VERSION_FIELD_TYPES = '8044';

const SDS_DEFAULT_TIMEOUT: number = 60 * 1000;

const ERROR_DECRYPT_PERMISSION = 'Only unencrypted or decrypted scripts can be downloaded';


export type scriptParameter = {
    name: string,
    type: string,
    value: string
}

export class scriptT  {
    /**
     * Name of the script without extension.
     * A script is always a javascript file.
     */
    name: string;
    /**
     * If this value is set, the script is renamed after download.
     * For now only used for 'compare-script'.
     */
    rename?: string;
    path?: string;
    /**
     * Source code of script.
     */
    sourceCode?: string;
    /**
     * Output of run script.
     */
    output?: string;
    /**
     * Encryption state.
     * true: script is encrypted on server and in VS Code
     * false: script is not encrypted on server and not encrypted in VS Code
     * decrypted: script is encrypted on server and not encrypted in VS Code
     */
    encrypted?: string;

    /**
     * Internal flag.
     */
    allowDownloadEncrypted = false;

    /**
     * If a script in conflict mode is uploaded, the hash value is used to
     * check, if the script (the source code of the script) on server has
     * changed since last up- or download.
     * If the script in conflict mode has been changed on server, it won't
     * be uploaded, instead 'conflict' will be set to true.
     */
    conflictMode = true;
    /**
     * Hash value of the source code at the time of last synchronisation,
     * meaning at the time of last up- or download.
     * This value is only set if the script is in conflict mode.
     */
    lastSyncHash?: string;
    /**
     * Source code of the script on server.
     * Only set, if code on server has been changed after last synchronisation.
     */
    serverCode?: string;
    /**
     * conflict is set to true, if the user tried to upload a script, but
     * the source code of the script on server has been changed since last
     * up- or download.
     */
    conflict?: boolean;
    /**
     * forceUpload is set to true if conflict is true and the user decided
     * to upload and overwrite the script on server anyway.
     */
    forceUpload?: boolean;

    /**
     * The category of the script on server.
     */
    category?: string;
    /**
     * The root folder where to add the category when script is downloaded.
     * Meaning script ist stored in path.join(categoryRoot, category) on download.
     */
    categoryRoot?: string;

    parameters?: scriptParameter[];

    constructor(name: string, path?: string, sourceCode?: string, rename?: string) {
        this.name = name;
        if (path) {
            this.path = path;
        }
        if (sourceCode) {
            this.sourceCode = sourceCode;
        }
        if (rename) {
            this.rename = rename;
        }
    }
}






export type serverOperationT = (sdsConn: SDSConnection, param: any[], connInfo?: config.ConnectionInformation) => Promise<any[]>;


/**
 * This function establishes a connection to the server, calls the given operation
 * and closes the connection.
 * The operations that can be called on server using this function are implemented
 * below.
 * 
 * @param loginData 
 * @param param input parameter of the operation
 * @param serverOperation the operation to be called on server, should be one of the
 * functions that are implemented below
 */
export async function serverSession(loginData: config.ConnectionInformation, param: any[], serverOperation: serverOperationT): Promise<any[]> {
    return new Promise<any[]>((resolve, reject) => {

        if(!loginData) {
            return reject('login data missing');
        }

        // first try to get the login data
        if (loginData.checkLoginData()) {
            console.log('ensureLoginData successful');

            let onConnect: boolean = false;

            // create socket
            let sdsSocket = connect(loginData.port, loginData.server);

            // the callback functions for the socket are implemented below
            // actual function (serverOperation) is executed in connect callback

            // callback on connect
            // function that is called on connect event
            sdsSocket.on('connect', () => {
                onConnect = true;
                console.log('callback socket.on(connect)');

                doLogin(loginData, sdsSocket).then((sdsConnection) => {
                    
                    // call serverOperation and then close the connection in any case
                    serverOperation(sdsConnection, param, loginData).then((value) => {
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


            // callback on close
            // function that is called on close event
            sdsSocket.on('close', (hadError: boolean) => {
                console.log('callback socket.on(close)');
                if (hadError) {
                    console.log('remote closed SDS connection due to error');
                } else {
                    console.log('remote closed SDS connection');
                }
            });

            // callback on error
            // function that is called on error event
            sdsSocket.on('error', (err: any) => {
                console.log('callback socket.on(error)');
                console.log(err);
                // only reject here if on-connect couldn't start
                if(onConnect) {
                    // reject is executed in on('connect') callback 
                } else {
                    // on('connect') is not executed, so we must reject here
                    reject(err);
                }
            });

        } else {
            reject(`Login information missing`);
        }
    });
}


/**
 * Connect to server.
 * This function is called in function sdsSession before the operation is called.
 * 
 * @param loginData 
 * @param sdsSocket 
 */
async function doLogin(loginData: config.ConnectionInformation, sdsSocket: Socket): Promise<SDSConnection> {
    return new Promise<SDSConnection>((resolve, reject) => {
        let sdsConnection = new SDSConnection(sdsSocket);
        sdsConnection.timeout = loginData.sdsTimeout? loginData.sdsTimeout: SDS_DEFAULT_TIMEOUT;

        sdsConnection.connect('node-documents-scripting').then(() => {
            console.log('connect successful');
            let username = loginData.username;
            let password: '' | Hash = loginData.password? loginData.password : '';
            return sdsConnection.changeUser(username, password);
            
        }).then(userId => {
            loginData.userId = userId;
            console.log('changeUser successful');
            if (loginData.principal.length > 0) {
                return sdsConnection.changePrincipal(loginData.principal);
            } else {
                reject('please set principal');
            }

        }).then(() => {
            console.log('changePrincipal successful');
            return sdsConnection.callClassOperation('PartnerNet.getVersionNo', []);

        }).then((value) => {
            let docVersion = value[0];
            loginData.documentsVersion = docVersion;
            console.log(`Current version: ${docVersion} Required verson: ${VERSION_MIN}`);
            if(!docVersion) {
                reject(`This command is only available on DOCUMENTS`);
            } else if(Number(VERSION_MIN) > Number(docVersion)) {
                reject(`Current version: ${docVersion} Required verson: ${VERSION_MIN}`);
            } else {
                resolve(sdsConnection);
            }

        }).catch((reason) => {
            reject(reason + ` - check ".vscode/launch.json"`);
            closeConnection(sdsConnection).catch((reason) => {
                console.log(reason);
            });
        });
    });
}


/**
 * Close the connection to the server.
 * This function is called in function sdsSession after the operation
 * has been called.
 * 
 * @param sdsConnection 
 */
async function closeConnection(sdsConnection: SDSConnection): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        sdsConnection.disconnect().then(() => {
            resolve();
        }).catch((reason) => {
            reject('closeConnection failed: ' + reason);
        });
    });
}






/**
 * The following functions are the operations that can be called
 * on server using the function sdsSession.
 */




/**
 * Returns the current build version that is used with the given login data.
 * This function is called in sdsSession.
 * 
 * @param sdsConnection Set by function sdsSession
 * @param params empty
 */
export async function getDocumentsVersion(sdsConnection: SDSConnection, params: any[], connInfo: config.ConnectionInformation): Promise<any[]> {
    return new Promise<any[]>((resolve, reject) => {
        sdsConnection.callClassOperation('PartnerNet.getVersionNo', []).then((value) => {
            connInfo.documentsVersion = value[0];
            console.log('getDocumentsVersion: ' + connInfo.documentsVersion);
            resolve();
        }).catch((reason) => {
            reject('getDocumentsVersion failed: ' + reason);
        });
    });
}

export async function checkDecryptionPermission(sdsConnection: SDSConnection, params: any[], connInfo: config.ConnectionInformation): Promise<any[]> {
    return new Promise<any[]>((resolve, reject) => {
        sdsConnection.callClassOperation('PartnerNet.getProperty', ['allowDecryption']).then((value) => {
            let perm = false;
            if('1' === value[1]) {
                perm = true;
            }
            connInfo.decryptionPermission = perm;
            console.log('checkDecryptionPermission: ' + connInfo.decryptionPermission);
            resolve();
        }).catch((reason) => {
            reject('checkDecryptionPermission failed: ' + reason);
        });
    });
}

/**
 * Get names of all scripts on server.
 * 
 * @param sdsConnection 
 * @param params 
 */
export async function getScriptsFromServer(sdsConnection: SDSConnection, params: scriptT[]): Promise<scriptT[]> {
    return new Promise<scriptT[]>((resolve, reject) => {
        sdsConnection.callClassOperation('PortalScript.getScriptNames', []).then((scriptNames) => {
            let scripts: scriptT[] = [];
            scriptNames.forEach(function(scriptname) {
                let script: scriptT = new scriptT(scriptname);
                scripts.push(script);
            });
            resolve(scripts);
        }).catch((reason) => {
            reject('getScriptNamesFromServer failed: ' + reason);
        });
    });
}


/**
 * Get names of all scripts on server.
 * 
 * @param sdsConnection 
 * @param params 
 */
export async function getScriptNamesFromServer(sdsConnection: SDSConnection, params: scriptT[]): Promise<string[]> {
    return new Promise<string[]>((resolve, reject) => {
        sdsConnection.callClassOperation('PortalScript.getScriptNames', []).then((scriptNames) => {
            let scripts: string[] = [];
            scriptNames.forEach(function(scriptname) {
                scripts.push(scriptname);
            });
            resolve(scripts);
        }).catch((reason) => {
            reject('getScriptNamesFromServer failed: ' + reason);
        });
    });
}


/**
 * Set script parameters
 * 
 * @param sdsConnection 
 * @param params 
 */
function setScriptParameters(sdsConnection: SDSConnection, params: string[]): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        sdsConnection.callClassOperation('PortalScript.setScriptParameters', params).then(() => {
            resolve();
        }).catch((reason) => {
            reject('setScriptParameters failed: ' + reason);
        });
    });
}
    


function convertDocumentsFieldType(documentsType: string): string {
    switch (documentsType) {
        case 'Checkbox':
        case 'Bool':
            return 'boolean';
        case 'Numeric':
            return 'number';
        case 'Date':
        case 'Timestamp':
            return 'Date';
        case 'String':
        case 'Text':
        case 'Text (Fixed Font)':
        case 'Filing plan':
        case 'E-Mail':
        case 'URL':
        case 'HTML':
            return 'string';
        default:
            return 'any';
    }
}


/**
 * Get fieldnames of a filetype and create
 * interface declaration for TypeScript
 * definition file.
 * 
 * @param sdsConnection 
 * @param params the file type
 *
 * @return string containing the interface declaration for the file type
 */
export async function getFileTypeInterface(sdsConnection: SDSConnection, params: string[], connInfo: config.ConnectionInformation): Promise<string[]> {
    return new Promise<string[]>((resolve, reject) => {
        
        // check parameter
        if (!params || 0 >= params.length || 0 >= params[0].length) {
            return reject('wrong parameter in getFileTypeInterface');
        }

        // name of file type
        const fileTypeName = params[0];

        // operation
        let operation = 'getFieldNames';

        // check version, later documents version have
        // function that also returns the types
        const fieldTypesVersion = checkVersion(connInfo, VERSION_FIELD_TYPES);

        if (fieldTypesVersion) {
            operation = 'getFieldNamesAndTypes';
        }


        // get the field names
        sdsConnection.callClassOperation('IDlcFileType.' + operation, [fileTypeName]).then((fieldInfo) => {
            let fieldName = '';
            let fieldType = '';
            let output = `declare interface ${fileTypeName} extends DocFile {` + os.EOL;
            let fieldParams = '';
            const steps = fieldTypesVersion? 2 : 1;
            const length = fieldTypesVersion? fieldInfo.length-1 : fieldInfo.length;
            
            // fieldNames[0] contains error message, that is read in node-sds
            for (let i = 1; i < length; i += steps) {
                fieldName = fieldInfo[i];
                fieldType = fieldTypesVersion ? convertDocumentsFieldType(fieldInfo[i+1]) : 'any';
                output += `\t${fieldName}?: ${fieldType};` + os.EOL;
                fieldParams += `'${fieldName}' | `;
            }

            if (fieldParams.length > 0) {
                // remove last ' |' in parameters for get/setFieldValues
                fieldParams = fieldParams.substr(0, fieldParams.length - 3);

                // add functions getFieldValue and setFieldValue
                output += `\tsetFieldValue(fieldName: ${fieldParams}, value: any): boolean;` + os.EOL;
                output += `\tgetFieldValue(fieldName: ${fieldParams}): any;` + os.EOL;
            }

            output += `}` + os.EOL;
            output += os.EOL;

            resolve([output]);
        }).catch((reason) => {
            reject('IDlcFileType.getFieldNames failed: ' + reason);
        });
    });
}

/**
 * Get fieldnames of all file types and create a string that contains the
 * TypeScript definition file content for all file types
 * 
 * @param sdsConnection 
 * @param params empty
 */
export async function getFileTypesTSD(sdsConnection: SDSConnection, params: string[], connInfo: config.ConnectionInformation): Promise<string[]> {
    return new Promise<string[]>((resolve, reject) => {
        let output = '';
        let fileTypeMappings = '';
        sdsConnection.callClassOperation('IDlcFileType.getFileTypeNames', []).then((fileTypeNames) => {

            // some checks
            if (!fileTypeNames || fileTypeNames.length <= 0) {
                return reject('IDlcFileType.getFileTypeNames returned empty result');
            }

            // first entry contains the error message that is read in node-sds
            fileTypeNames.splice(0,1);

            // iterate over file types and get the interface with the field names
            return reduce(fileTypeNames, function(numFileTypes: number, fileTypeName: string) {

                // get interface for file type 'fileTypeName'
                return getFileTypeInterface(sdsConnection, [fileTypeName], connInfo).then((ftInterface) => {

                    // add interface of file type 'fileTypeName'
                    output += ftInterface;

                    // add 'fileTypeName' to file type mappings
                    if (fileTypeName.length > 0) {
                        fileTypeMappings += `\t"${fileTypeName}": ${fileTypeName};` + os.EOL;
                    }

                    // count the file types, not really needed for now
                    return numFileTypes + 1;
                });
            }, 0).then((numFileTypes: number) => {
                // iteration finished, all available file types inserted

                // add the file type mapper
                // but only if file types have been inserted
                if (output.length > 0 && fileTypeMappings.length > 0) {
                    let fileTypeMapper = 'interface FileTypeMapper {' + os.EOL;
                    fileTypeMapper += fileTypeMappings;
                    fileTypeMapper += `}` + os.EOL;
                    fileTypeMapper += os.EOL;
                    output += fileTypeMapper;
                }

                // output contains the whole d.ts string now
                resolve([output]);
            }).catch((error: any) => {
                reject(error);
            });
        }).catch((reason) => {
            reject('getFieldNames failed: ' + reason);
        });
    });
}




export async function getScriptParameters(sdsConnection: SDSConnection, params: scriptT[]): Promise<string[]> {
    return new Promise<any[]>((resolve, reject) => {
        const scriptname: string = params[0].name;
        sdsConnection.callClassOperation('PortalScript.getScriptInfoAsJSON', [scriptname]).then((param) => {
            const err = param[0];
            if(0 < err.length) {
                reject(err);
            } else if(1 < param.length) {
                let json = param[1];
                resolve([json]);
            }
        }).catch((error) => {
            reject(error);
        });
    });
}



export async function getAllParameters(sdsConnection: SDSConnection, params: scriptT[]): Promise<string[]> {
    return new Promise<string[]>((resolve, reject) => {
        let jsonOut: string[] = [];

        // see description of reduce in uploadAll
        return reduce(params, function(numScripts: number, _script: scriptT) {
            return getScriptParameters(sdsConnection, [_script]).then((value) => {
                const jsonScript: string = value[0];
                jsonOut.push(_script.name);
                jsonOut.push(jsonScript);
                return numScripts + 1;
            });
        }, 0).then((numScripts: number) => {
            resolve(jsonOut);
        }).catch((error: any) => {
            reject(error);
        });
    });
}




export async function getSystemUser(sdsConnection: SDSConnection, params: any[]): Promise<any[]> {
    return new Promise<any[]>((resolve, reject) => {
        sdsConnection.callClassOperation('Systemuser.get', ['test']).then((param) => {
            resolve([]);
        }).catch((reason) => {
            reject('getSystemUser failed: ' + reason);
        });
    });
}



/**
 * Upload all scripts from given list.
 * 
 * @return Array containing all uploaded scripts, should be equal to params.
 * @param sdsConnection 
 * @param params Array containing all scripts to upload.
 */
export async function uploadAll(sdsConnection: SDSConnection, params: scriptT[], connInfo: config.ConnectionInformation): Promise<scriptT[]> {
    return new Promise<scriptT[]>((resolve, reject) => {
        let scripts: scriptT[] = [];

        if(0 === params.length) {
            resolve(scripts);
        } else {
            // reduce calls _uploadScript for every name in scriptNames,
            // in doing so every call of _uploadScript is started after
            // the previous call is finished
            return reduce(params, function(numscripts: number, _script: scriptT) {
                return uploadScript(sdsConnection, [_script], connInfo).then((value) => {
                    // this section is executed after every single _uploadScript call
                    if(0 <= value.length) {
                        let uscript = value[0];
                        scripts.push(uscript);
                    }
                    return numscripts + 1;
                });
            }, 0).then((numscripts: number) => {
                // this section is exectuted once after all _uploadScript calls are finished
                resolve(scripts);
            }).catch((error: any) => {
                reject(error);
            });
        }
    });
}



/**
 * Download all scripts from given list.
 * 
 * @return Array containing all downloaded scripts, including the source-code.
 * @param sdsConnection 
 * @param params Array containing all scripts to download.
 */
export async function downloadAll(sdsConnection: SDSConnection, scripts: scriptT[], connInfo: config.ConnectionInformation): Promise<scriptT[]> {
    return new Promise<scriptT[]>((resolve, reject) => {
        let returnScripts: scriptT[] = [];

        if(0 === scripts.length) {
            resolve(returnScripts);

        } else {
            // see description of reduce in uploadAll
            return reduce(scripts, function(numScripts: number, script: scriptT) {
                return downloadScript(sdsConnection, [script], connInfo).then((retval) => {
                    const currentScript: scriptT = retval[0];
                    returnScripts.push(currentScript);
                    return numScripts + 1;
                }).catch((error: Error) => {
                    console.log('downloadScript -> catch ' + error.message);
                    return numScripts;
                });
            }, 0).then((numScripts: number) => {
                resolve(returnScripts);
            }).catch((error: any) => {
                reject(error);
            });
        }
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
        return reduce(params, function(numScripts: number, _script: scriptT) {
            return runScript(sdsConnection, [_script]).then((value) => {
                let script: scriptT = value[0];
                scripts.push(script);
                return numScripts + 1;
            });
        }, 0).then((numScripts: number) => {
            resolve(scripts);
        }).catch((error: any) => {
            reject(error);
        });
    });
}






/**
 * Download script.
 * 
 * @param sdsConnection 
 * @param params 
 */
export async function downloadScript(sdsConnection: SDSConnection, params: scriptT[], connInfo: config.ConnectionInformation): Promise<scriptT[]> {
    return new Promise<scriptT[]>((resolve, reject) => {
        if(0 === params.length) {
            resolve([]);

        } else {
            let script: scriptT = params[0];
            if(!script.path) {
                return reject('path missing');
            }

            sdsConnection.callClassOperation('PortalScript.downloadScript', [script.name]).then((retval) => {
                if(!retval[0] || typeof(retval[0]) != 'string') {
                    return reject('could not find ' + script.name + ' on server');
                }

                if('false' === retval[1] || 'decrypted' === retval[1] || ('true' === retval[1] && script.allowDownloadEncrypted)) {
                    script.serverCode = ensureNoBOM(retval[0]);
                    script.encrypted = retval[1];

                    let scriptPath;
                    if(script.rename) {
                        // rename script on download, only used for compare by now
                        scriptPath = path.join(script.path? script.path: '', script.rename + ".js");
                    } else {
                        // category as folder
                        if(script.categoryRoot && 0 < script.categoryRoot.length && checkVersion(connInfo, VERSION_CATEGORIES) && retval[2] && 0 < retval[2].length) {
                            script.category = retval[2];
                            scriptPath = path.join(script.categoryRoot, script.category, script.name + ".js");
                        } else {
                            scriptPath = path.join(script.path? script.path: '', script.name + ".js");
                        }
                    }

                    // TODO
                    // script.path = scriptPath;
                    // resolve([script]);
                    // // call saveScript() from vscode-janus-debug
                    saveScript(script, scriptPath).then(() => {
                        resolve([script]);
                    }).catch((reason) => {
                        reject(reason);
                    });
                } else {
                    reject(new Error(ERROR_DECRYPT_PERMISSION));
                }
            }).catch((reason) => {
                reject(reason);
            });
        }
    });
}


export function saveScript(script: scriptT, scriptPath: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        writeFile(script.serverCode, scriptPath).then(() => {
            script.sourceCode = script.serverCode;
            if(script.conflictMode) {
                script.lastSyncHash = crypto.createHash('md5').update(script.sourceCode || '').digest('hex');
            }
            resolve();
        }).catch((reason) => {
            reject(reason);
        });
    });
}

/**
 * If the given script can be uploaded, an empty list is returned.
 * If not, a script containing the server source code and the server
 * encrypt state is returned.
 * Both cases are resolved. Reject only in case of error.
 * 
 * @param sdsConnection 
 * @param params 
 */
export function checkForConflict(sdsConnection: SDSConnection, params: scriptT[]): Promise<scriptT[]> {
    return new Promise<scriptT[]>((resolve, reject) => {

        if(0 === params.length) {
            return resolve([]);
        }

        let script: scriptT = params[0];

        if(!script.conflictMode || script.forceUpload) {
            return resolve([script]);
        }

        sdsConnection.callClassOperation('PortalScript.downloadScript', [script.name]).then((value) => {

            if(!value || value.length < 2 || typeof(value[0]) !== 'string') {
                // probably script deleted on server
                script.conflict = true;
                return resolve([script]);
            }

            if(value && value.length >= 2 && 'true' === value[1]) {
                // script encrypted on server and no decryption pem available
                script.conflict = true;
                script.encrypted = value[1];
                return resolve([script]);
            }

            // get hash value from server script code
            const serverCode = ensureNoBOM(value[0]);
            let serverHash = crypto.createHash('md5').update(serverCode || '').digest('hex');
            
            // compare hash value
            if(script.lastSyncHash !== serverHash) {
                // server code has been changed
                script.serverCode = serverCode;
                script.conflict = true;
                return resolve([script]);
            }

            // script has not changed on server
            return resolve([script]);
            
        }).catch((reason) => {
            reject(reason);
        });
    });
}




/**
 * Upload Script.
 * 
 * @param sdsConnection 
 * @param params 
 */
export async function uploadScript(sdsConnection: SDSConnection, params: scriptT[], loginData: config.ConnectionInformation): Promise<scriptT[]> {
    return new Promise<scriptT[]>((resolve, reject) => {

        // check parameters
        if(0 === params.length) {
            return resolve([]);
        }

        let script: scriptT = params[0];
        script.sourceCode = ensureNoBOM(script.sourceCode);
        
        checkForConflict(sdsConnection, [script]).then((value) => {

            // return if conflict
            const retscript: scriptT = value[0];
            if (retscript.conflict) {
                return resolve([retscript]);
            }

            // do some checks
            if(!script.sourceCode) {
                return reject('Source code missing in parameter in uploadScript()');
            }
            if(!script.encrypted) {
                script.encrypted = 'false';
            }

            // check version for category
            let paramCategory = '';
            if(script.category) {
                if(checkVersion(loginData, VERSION_CATEGORIES)) {
                    paramCategory = script.category;
                }
            }

            // create parameters for uploadScript call
            let params = [script.name, script.sourceCode, script.encrypted, paramCategory];

            // call uploadScript
            return sdsConnection.callClassOperation("PortalScript.uploadScript", params).then((value) => {

                // set hash value
                if(script.conflictMode && script.sourceCode) {
                    script.lastSyncHash = crypto.createHash('md5').update(script.sourceCode).digest("hex");
                }

                // check for parameters
                if (!script.parameters || script.parameters.length <= 0) {
                    return resolve([script]);
                }

                // set parameters

                let scriptParameters: string[] = [script.name];
                script.parameters.forEach((sparam) => {
                    scriptParameters.push(sparam.name);
                    scriptParameters.push(sparam.type);
                    scriptParameters.push(sparam.value);
                });

                // call setScriptParameters
                setScriptParameters(sdsConnection, scriptParameters).then(() => {
                    console.log(`${script.name} uploaded and parameters set`);
                    resolve([script]);
                }).catch((reason) => {
                    console.log(`${script.name} uploaded but parameters not set`);
                    // todo warning
                    resolve([script]);
                });
            });

        }).catch((reason) => {
            reject(reason);
        });
    });
}

/**
 * Run script.
 * 
 * @param sdsConnection 
 * @param params 
 */
export async function runScript(sdsConnection: SDSConnection, params: scriptT[]): Promise<scriptT[]> {
    return new Promise<scriptT[]>((resolve, reject) => {
        if(0 === params.length) {
            resolve([]);
        } else {
            
            let script: scriptT = params[0];
            sdsConnection.callClassOperation('PortalScript.runScript', [script.name]).then((value) => {
                if(!value || 0 === value.length) {
                    reject('could not find ' + params[0] + ' on server');
                } else {
                    script.output = value.join(os.EOL);
                    resolve([script]);
                }
            }).catch((reason) => {
                reject(reason);
            });
        }
    });
}





/**
 * Some additional helper functions.
 */






/**
 * 
 * @param data 
 * @param filename 
 * @param allowSubFolder 
 */
export async function writeFile(data: any, filename: string): Promise<void> {
    console.log('writeFile');

    return new Promise<void>((resolve, reject) => {
        const folder = path.dirname(filename);

        if (folder) {
            fs.ensureDir(folder, function(error: any) {
                if (error) {
                    reject(error);
                } else {
                    fs.writeFile(filename, data, {encoding: 'utf8'}, function(error: any) {
                        if (error) {
                            reject(error);
                        } else {
                            console.log(`wrote file ${filename}`);
                            resolve();
                        }
                    });
                }
            });
        } else {
            reject(`Error in filename ${filename}`);
        }
    });
}


/**
 * Returns a list of files inside a directory
 * @param dir - directory path
 * @param [rec=true] - Specifies wether to read the directory recursive
 * @returns List of files
 */
export function readDirSync(dir: string, rec: boolean = true): string[] {
    let results: string[] = [];
    let list = fs.readdirSync(dir);

    list.forEach(function (elem: any) {
        elem = path.join(dir, elem);

        if (fs.statSync(elem).isFile()) {
            results.push(elem);
        } else if (rec) {
            results = results.concat(readDirSync(elem, rec));
        }
    });

    return results;
}


/**
 * Returns a list of scripts inside a directory
 * @param dir - directory path
 * @param [subfolders=true] - Specifies wether to read the directory recursive
 * @returns List of scripts
 */
export function getScriptsFromFolderSync(dir: string, subfolders: boolean = true): scriptT[] {
    let scripts: scriptT[] = [];
    const filepaths = readDirSync(dir, subfolders);
    
    // resolve file paths to scriptT-objects
    filepaths.forEach((file) => {
        if (fs.existsSync(file) && '.js' === path.extname(file)) {
            scripts.push(
                new scriptT(path.parse(file).name, file, fs.readFileSync(file).toString())
            );
        }
    });

    return scripts;
}





/**
 * Create script-type with name and sourceCode from file.
 * 
 * @param file Scriptname, full path.
 */
export function getScript(file: string): scriptT | string {
    if(file && '.js' === path.extname(file)) {
        try {
            // todo check with fs.stat because if file looks relative readFileSync
            // tries to read it from C:\Program Files (x86)\Microsoft VS Code\file
            let sourceCode = fs.readFileSync(file, 'utf8');
            let name = path.basename(file, '.js');
            return new scriptT(name, '', sourceCode);
        } catch(err) {
            return err;
        }
    } else {
        return 'only javascript files allowed';
    }
}


function checkVersion(loginData: config.ConnectionInformation, version: string): boolean {
    if(Number(loginData.documentsVersion) >= Number(version)) {
        return true;
    } else {
        if(VERSION_CATEGORIES == version) {
            loginData.lastWarning = `For using category features DOCUMENTS ${VERSION_CATEGORIES} is required`;
        }
        return false;
    }
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
function ensureNoBOM(sourceCode: string | undefined): string | undefined {
    if (!sourceCode) {
        return undefined;
    }
    return sourceCode.replace(/^\ufeff/, '');
}
