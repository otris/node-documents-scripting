import * as os from 'os';
import * as path from 'path';
import { connect, Socket } from 'net';
// let lastSyncHash = crypto.createHash('md5').update(data).digest("hex");
import * as crypto from 'crypto';
import { SDSConnection, Hash, crypt_md5, getJanusPassword } from 'node-sds';
import * as config from './config';

const reduce = require('reduce-for-promises');
const fs = require('fs-extra');


export const VERSION_MIN = '8034';
export const VERSION_PARAMS_GET = '8036';
export const VERSION_ENCRYPTION = '8040';
export const VERSION_CATEGORIES = '8041';
export const VERSION_FIELD_TYPES = '8044';
export const VERSION_PARAMS_SET = '8067';
export const VERSION_SHOW_IMPORTS = '8047';

export const CONFLICT_SOURCE_CODE = 0x1;
export const CONFLICT_CATEGORY = 0x2;


const SDS_DEFAULT_TIMEOUT: number = 60 * 1000;

const ERROR_DECRYPT_PERMISSION = 'For downloading encrypted scripts the decryption PEM file is required';


export class scriptT  {
    /**
     * Name of the script without extension.
     * A script is always a javascript file.
     */
    name: string;
    path?: string;
    /**
     * The source code of the script.
     *
     * If serverCode is set after calling uploadScript, localCode contains the
     * local code of the script and serverCode the code on server.
     */
    localCode?: string;
    /**
     * Source code of the script on server.
     * Only set, if code on server has been changed after last synchronisation.
     */
    serverCode?: string;
    /**
     * Output of run script.
     */
    output?: string;
    /**
     * Encryption state of local and server script on upload/download.
     * Value can be true, decrypted, false or forceFalse
     *
     * true:
     * upload/download: local script and server script encrypted, not allowed
     *
     * decrypted:
     * upload: local script not encrypted, script encrypted on upload
     * download: server script encrypted, script decrypted on download
     *
     * false:
     * download: server script not encrypted, local script not encrypted
     * upload: local script not encrypted, script encrypted on upload, if
     * + server script is encrypted or
     * + local script contains // #crypt
     *
     * forceFalse:
     * upload: local script unencrypted, server script unencrypted
     */
    encrypted?: string;

    /**
     * Internal flag.
     */
    allowDownloadEncrypted = false;

    /**
     * Default: true
     *
     * If the function 'uploadScript' is called with a script in conflict
     * mode, the hash value is used to check, if the source code of the
     * script on server has changed since last up- or download.
     *
     * If a script in conflict mode was changed on server, it won't
     * be uploaded, instead the member 'conflict' will be set to true.
     */
    conflictMode = true;
    /**
     * Hash value of the source code at the time of last synchronisation,
     * meaning at the time of last up- or download.
     * This value is only set if the script is in conflict mode.
     */
    lastSyncHash?: string;
    /**
     * Bit pattern.
     *
     * CONFLICT_SOURCE_CODE is set, if uploadScript was called for this script,
     * but the source code of the script on server has been changed since
     * last up- or download.
     *
     * CONFLICT_CATEGORY is set, if uploadScript was called for this script,
     * but the category is different on server.
     */
    conflict = 0x0;
    /**
     * If this member is set to true, the script will be uploaded, even if
     * it's in conflict mode and the source code was changed on server.
     */
    forceUpload?: boolean;

    /**
     * The category of the script on server.
     */
    category?: string;
    /**
     * Set to true, if the category member should be set after the script is downloaded.
     * Only for version check. If this is set to true, and the version is to old, a
     * warning is set.
     */
    getCategories?: boolean;

    /**
     * json string describing the parameters
     */
    parameters?: string;
    /**
     * Set to true, if the user wants to download the parameters
     * when a script is downloaded.
     */
    downloadParameters?: boolean;

    duplicate?: boolean;

    constructor(name: string, path?: string, localCode?: string) {
        this.name = name;
        if (path) {
            this.path = path;
        }
        if (localCode) {
            this.localCode = localCode;
        }
    }
}


export class xmlExport {
    constructor(public className: string, public filter: string, public fileName: string, public content?: string, public files?: string[]) {}
}




export type serverOperationT = (sdsConn: SDSConnection, param: any[], connInfo: config.ConnectionInformation) => Promise<any[]>;


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

        // save name in local variable, so the correct name is set in error message in on('close')
        // loginData.server might change when on('close') is called after reject() in on('error')
        const server = loginData.server;

        // first try to get the login data
        if (loginData.checkAnyLoginData()) {

            let onConnect: boolean = false;

            // create socket
            let sdsSocket = connect(loginData.port, loginData.server);

            // the callback functions for the socket are implemented below
            // actual function (serverOperation) is executed in connect callback

            // callback on connect
            // function that is called on connect event
            sdsSocket.on('connect', () => {
                onConnect = true;

                doLogin(loginData, sdsSocket).then((sdsConnection) => {

                    // call serverOperation and then close the connection in any case
                    serverOperation(sdsConnection, param, loginData).then((value) => {
                        closeConnection(sdsConnection).then(() => {
                            resolve(value);
                        }).catch((reason) => {
                            reject('close connection failed ' + reason);
                        });
                    }).catch((reason) => {
                        closeConnection(sdsConnection).then(() => {
                            // reject because serverOperation went wrong
                            reject(reason);
                        }).catch((reason2) => {
                            // only show reason from catch-serverOperation!
                            reject(reason);
                        });
                    });

                }).catch((reason) => {
                    reject(reason);
                });
            });


            // callback on close
            // function that is called on close event
            sdsSocket.on('close', (hadError: boolean) => {
                if (hadError) {
                    // When an error occurred, the callbacks on('error') and on('close')
                    // are called, but on('close') is called much later than on('error').
                    //
                    // TODO:
                    // so would it be better to reject here and not in on('error')?
                    // but we do not have the error information here...
                    console.log(`SDS connection ${server} closed due to error`);
                } else {
                    //
                }
            });

            // callback on error
            // function that is called on error event
            sdsSocket.on('error', (err: any) => {
                console.log(`Error in SDS connection ${loginData.server}`);
                // console.log(err);

                // only reject here if on-connect couldn't start
                if(onConnect) {
                    // reject is executed in on('connect') callback
                } else {
                    // on('connect') is not executed, so we must reject here
                    if (err.code === "ENOTFOUND") {
                        reject(new Error(`Cannot connect to "${loginData.server}" - check server in ".vscode/launch.json"`));
                    } else if (err.code === "EADDRNOTAVAIL") {
                        reject(new Error(`Cannot connect to server: ${loginData.server} port: ${loginData.port} - check server and port in ".vscode/launch.json"`));
                    } else if (err.code === "ECONNREFUSED") {
                        reject(new Error(`Cannot connect to server: ${loginData.server} port: ${loginData.port} - check if server is running`));
                    } else {
                        reject(err);
                    }
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
            let username = loginData.username;
            let password: '' | Hash = loginData.password? loginData.password : '';
            return sdsConnection.changeUser(username, password);

        }).then(userId => {
            loginData.userId = userId;
            if (loginData.principal.length > 0) {
                return sdsConnection.changePrincipal(loginData.principal);
            } else {
                return Promise.reject('Principal is missing');
            }
        }).then(() => {
            if (loginData.language !== 0) {
                return sdsConnection.setLanguage(loginData.language);
            }
        }).then(() => {
            return sdsConnection.callClassOperation('PartnerNet.getVersionNo', []);

        }).then((value) => {
            let docVersion = value[0];
            loginData.documentsVersion = docVersion;
            if(!docVersion) {
                reject(`This command is only available on DOCUMENTS`);
            } else if(Number(VERSION_MIN) > Number(docVersion)) {
                reject(`Current version: ${docVersion} Required version: ${VERSION_MIN}`);
            } else {
                resolve(sdsConnection);
            }

        }).catch((reason) => {
            console.log("doLogin(): reject and close connection");
            if (reason.message) {
                reject(reason.message + ` - check ".vscode/launch.json"`);
            } else {
                reject(reason + ` - check ".vscode/launch.json"`);
            }
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
 * Server Operations
 *
 *
 * The following functions are the operations that can be called
 * on server using the function sdsSession.
 */


export async function getSourceCodeForEditor(sdsConnection: SDSConnection, params: string[], connInfo: config.ConnectionInformation): Promise<string[]> {
    return new Promise<string[]>((resolve, reject) => {
        if (!checkVersion(connInfo, VERSION_SHOW_IMPORTS, "VERSION_SHOW_IMPORTS")) {
            // warning message inside connInfo
            return reject();
        }
        sdsConnection.callClassOperation('PortalScript.getSourceCodeForEditor', params).then((value) => {
            const sourceCode = value[0];
            resolve([sourceCode]);
        }).catch((reason) => {
            reject(reason);
        });
    });
}


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

/**
 * Check if user has the permission to decrypt scripts.
 *
 * @param sdsConnection
 * @param params
 * @param connInfo
 */
export async function checkDecryptionPermission(sdsConnection: SDSConnection, params: any[], connInfo: config.ConnectionInformation): Promise<any[]> {
    return new Promise<any[]>((resolve, reject) => {
        sdsConnection.callClassOperation('PartnerNet.getProperty', ['allowDecryption']).then((value) => {
            let perm = false;
            if('1' === value[1]) {
                perm = true;
            }
            connInfo.decryptionPermission = perm;
            resolve();
        }).catch((reason) => {
            reject('checkDecryptionPermission failed: ' + reason);
        });
    });
}

/**
 * Get all scriptnames on server as scripts.
 *
 * @param sdsConnection
 * @param params category If set, scriptsnames from this category are returned.
 * @returns {scriptT[]} List of scripts created from all scriptnames in category or all scriptnames on server.
 */
export async function getScriptsFromServer(sdsConnection: SDSConnection, params: string[], connInfo: config.ConnectionInformation): Promise<scriptT[]> {
    return new Promise<scriptT[]>((resolve, reject) => {
        sdsConnection.callClassOperation('PortalScript.getScriptNames', params).then((scriptNames) => {
            let scripts: scriptT[] = [];
            scriptNames.forEach(function(scriptname) {
                let script: scriptT = new scriptT(scriptname, '');
                scripts.push(script);
            });
            resolve(scripts);
        }).catch((reason) => {
            reject('getScriptsFromServer failed: ' + reason);
        });
    });
}


/**
 * Get names of all scripts on server.
 *
 * @param sdsConnection
 * @param params category If set, scriptsnames from this category are returned.
 * @returns {string[]} List of all scriptnames in category or all scriptnames on server.
 */
export async function getScriptNamesFromServer(sdsConnection: SDSConnection, params: string[], connInfo: config.ConnectionInformation): Promise<string[]> {
    return new Promise<string[]>((resolve, reject) => {
        sdsConnection.callClassOperation('PortalScript.getScriptNames', params).then((scriptNames) => {
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
 * Generate xml for filetypes or portal scripts
 *
 * @param params Simply a string-array with two entries.
 * We could use xmlExport-type, but actually only a class-name and a filter is required.
 * Some examples:
 * ["DlcFileType", "Title='crmNote'"],
 * ["PortalScript", "Name='myScript'"],
 * ["DlcFileType", ""],
 * ["PortalScript", ""]
 * ["DlcFileType", "(Title='crmNote'||Title='crmCase')"]
 *
 * @return string array, first element is the xml as string
 */
export async function exportXML(sdsConnection: SDSConnection, params: string[]): Promise<string[]> {
    return new Promise<string[]>((resolve, reject) => {
        sdsConnection.callClassOperation('Global.exportXML', params).then((xml) => {
            resolve(xml);
        }).catch((reason) => {
            reject('exportXML failed: ' + reason);
        });
    });
}

export async function doMaintenance(sdsConnection: SDSConnection, params: string[]): Promise<string[]> {
    return new Promise<string[]>((resolve, reject) => {
        sdsConnection.callClassOperation('Global.doMaintenance', params).then((returnValue) => {
            resolve(returnValue);
        }).catch((reason) => {
            reject('doMaintenance failed: ' + reason);
        });
    });
}

export async function exportXMLSeperateFiles(sdsConnection: SDSConnection, params: xmlExport[]): Promise<any[]> {
    return new Promise<any[]>(async (resolve, reject) => {
        try {
            // don't use forEach here, because await won't
            // work as required with forEach
            for (const current of params) {
                const returnValue = await exportXML(sdsConnection, [current.className, current.filter]);
                // first value contains the xml
                current.content = returnValue[0];
                // paths to the blobs
                current.files = returnValue.slice(1);
            }
        } catch (reason) {
            return reject(reason);
        }
        // return empty array
        // because serverOperationT requires an array return value
        return resolve([]);
    });
}




/**
 * @param params empty for now, later: the categories
 * @return string array containing all filetypenames
 */
export async function getFileTypeNames(sdsConnection: SDSConnection, params: string[], connInfo: config.ConnectionInformation): Promise<string[]> {
    return new Promise<string[]>((resolve, reject) => {
        sdsConnection.callClassOperation('IDlcFileType.getFileTypeNames', []).then((fileTypeNames) => {
            // first entry contains the error message that is read in node-sds
            fileTypeNames.splice(0, 1);
            resolve(fileTypeNames);
        }).catch((reason) => {
            reject('getFileTypeNames failed: ' + reason);
        });
    });
}



/**
 * Get fieldnames of a filetype and create interface declaration for TypeScript
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

        // check version, later documents versions include a
        // function that also returns the types
        const fieldTypesVersion = checkVersion(connInfo, VERSION_FIELD_TYPES, "VERSION_FIELD_TYPES");

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
        let fileTypesDisj = '';
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
                        fileTypesDisj += ` ${fileTypeName} |`;
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
                    output += fileTypeMapper + os.EOL;
                    // remove the last ' |' from fileTypesDisj
                    let fileTypesType = 'declare type FileTypes =' + fileTypesDisj.slice(0, fileTypesDisj.length - 2) + ';';
                    output += fileTypesType + os.EOL;
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






/**
 * Set script parameters
 *
 * @param sdsConnection
 * @param params
 */
function setScriptInfoFromJSON(sdsConnection: SDSConnection, params: string[]): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        sdsConnection.callClassOperation('PortalScript.setScriptInfoFromJSON', params).then(() => {
            resolve();
        }).catch((reason) => {
            reject('setScriptParameters failed: ' + reason);
        });
    });
}



function getScriptInfoAsJSON(sdsConnection: SDSConnection, scripts: scriptT[]): Promise<string[]> {
    return new Promise<any[]>((resolve, reject) => {
        const script = scripts[0];
        sdsConnection.callClassOperation('PortalScript.getScriptInfoAsJSON', [script.name]).then((param) => {
            const err = param[0];
            if(0 < err.length) {
                reject(err);
            } else if(1 < param.length) {
                let json = param[1];
                script.parameters = json;
                resolve([json]);
            }
        }).catch((error) => {
            reject(error);
        });
    });
}



export async function getScriptInfoAsJSONAll(sdsConnection: SDSConnection, params: scriptT[]): Promise<string[]> {
    return new Promise<string[]>((resolve, reject) => {
        let jsonOut: string[] = [];

        // see description of reduce in uploadAll
        return reduce(params, function(numScripts: number, _script: scriptT) {
            return getScriptInfoAsJSON(sdsConnection, [_script]).then((value) => {
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

            sdsConnection.callClassOperation('PortalScript.downloadScript', [script.name]).then((retval) => {
                if(!retval[0] || typeof(retval[0]) !== 'string') {
                    return reject('could not find ' + script.name + ' on server');
                }

                if('false' === retval[1] || 'decrypted' === retval[1] || ('true' === retval[1] && script.allowDownloadEncrypted)) {
                    script.serverCode = ensureNoBOM(retval[0]);
                    script.encrypted = retval[1];

                    let scriptPath;

                    // get category for category as folder
                    // if (script.getCategories && checkVersion(connInfo, VERSION_CATEGORIES, "VERSION_CATEGORIES"))
                    if(retval[2] && 0 < retval[2].length && checkVersion(connInfo, VERSION_CATEGORIES, "VERSION_CATEGORIES")) {
                        script.category = retval[2];
                    }

                    // script parameters

                    if (!script.downloadParameters) {
                        return resolve([script]);
                    }

                    if (!checkVersion(connInfo, VERSION_PARAMS_GET, "VERSION_PARAMS_DOWN")) {
                        return resolve([script]);
                    }

                    // get parameters as JSON
                    getScriptInfoAsJSON(sdsConnection, [script]).then(() => {
                        console.log(`${script.name} uploaded and parameters set`);
                        resolve([script]);
                    }).catch((reason) => {
                        console.log(`${script.name} uploaded but parameters not set`);
                        // todo warning
                        resolve([script]);
                    });


                } else if ('true' === retval[1]) {
                    reject(new Error(ERROR_DECRYPT_PERMISSION));
                } else {
                    reject('Unexpected error in downloadScript');
                }
            }).catch((reason) => {
                reject(reason);
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
 * To upload a script correctly to a version lower than 8040, 'script.encrypted' must be set.
 * And then the behaviour of the versions 8040 and higher should be imitated, depending on
 * script.encrypted (see documentation of that member).
 * The script is downloaded to get information of the state of the server script.
 */
function encryptionWorkaround(sdsConnection: SDSConnection, params: scriptT[], connInfo: config.ConnectionInformation): Promise<void> {
    return new Promise<void>((resolve, reject) => {

        if (connInfo && checkVersion(connInfo, VERSION_ENCRYPTION)) {
            return resolve();
        }

        if(0 === params.length) {
            return reject('Empty paramter in checkVersionEncryption');
        }

        let script: scriptT = params[0];

        if (script.encrypted === 'decrypted') {
            return resolve();
        }
        if (script.encrypted === 'forceFalse') {
            script.encrypted = 'false';
            return resolve();
        }

        // script.encrypted === 'false' is default:
        // script must be encrypted, if it's encrypted on server or contains // #crypt

        sdsConnection.callClassOperation('PortalScript.downloadScript', [script.name]).then((value) => {
            if (!value || value.length === 0) {
                // script not on server
                return resolve();
            }
            if (value.length < 2) {
                return reject(`Unexptected return value length (${value.length}) in checkVersionEncryption on DOCUMENTS #${connInfo.documentsVersion}`);
            }
            if (value[1] === 'true' || value[1] === 'decrypted') {
                script.encrypted = 'decrypted';
                return resolve();
            }
            if (value[1] === 'false') {
                if(script.localCode && script.localCode.indexOf('// #crypt') >= 0) {
                    script.encrypted = 'decrypted';
                } else {
                    script.encrypted = 'false';
                }
                return resolve();
            }
            return reject(`Unexptected return value (${value}) in checkVersionEncryption on DOCUMENTS #${connInfo.documentsVersion}`);

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
function checkForConflict(sdsConnection: SDSConnection, params: scriptT[]): Promise<scriptT[]> {
    return new Promise<scriptT[]>((resolve, reject) => {

        if(0 === params.length) {
            return resolve([]);
        }

        let script: scriptT = params[0];

        if(!script.conflictMode || script.forceUpload) {
            return resolve([script]);
        }

        sdsConnection.callClassOperation('PortalScript.downloadScript', [script.name]).then((value) => {

            if(!value || value.length === 0) {
                // script not on server
                script.conflict |= CONFLICT_SOURCE_CODE;
                return resolve([script]);
            }

            if(value.length < 2) {
                return reject('Unexpected error in checkForConflict');
            }

            if(value && 'true' === value[1]) {
                // script encrypted on server and no decryption pem available
                script.conflict |= CONFLICT_SOURCE_CODE;
                script.encrypted = value[1];
            } else {
                // get hash value from server script code
                const serverCode = ensureNoBOM(value[0]);
                let serverHash = crypto.createHash('md5').update(serverCode || '').digest('hex');

                // compare hash value
                if(script.lastSyncHash !== serverHash) {
                    // server code has been changed
                    script.conflict |= CONFLICT_SOURCE_CODE;
                    script.serverCode = serverCode;
                }
            }

            // compare category
            if(value[2] && value[2] !== script.category) {
                script.conflict |= CONFLICT_CATEGORY;
            }

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
export async function uploadScript(sdsConnection: SDSConnection, params: scriptT[], connInfo: config.ConnectionInformation): Promise<scriptT[]> {
    return new Promise<scriptT[]>(async (resolve, reject) => {

        // check parameters
        if(0 === params.length) {
            return resolve([]);
        }
        let script: scriptT = params[0];


        // there are problems with encryption on versions lower than 8040
        try {
            await encryptionWorkaround(sdsConnection, [script], connInfo);
        } catch (reason) {
            return reject(reason);
        }

        script.localCode = ensureNoBOM(script.localCode);

        checkForConflict(sdsConnection, [script]).then((value) => {

            // return if conflict
            const retscript: scriptT = value[0];
            if (retscript.conflict) {
                return resolve([retscript]);
            }

            // do some checks
            if(!script.localCode) {
                return reject('Source code missing in parameter in uploadScript()');
            }
            if(!script.encrypted) {
                script.encrypted = 'false';
            }

            // check version for category
            let paramCategory = '';
            if(script.category && checkVersion(connInfo, VERSION_CATEGORIES, "VERSION_CATEGORIES")) {
                paramCategory = script.category;
            }

            // create parameters for uploadScript call
            let params = [script.name, script.localCode, script.encrypted, paramCategory];

            // call uploadScript
            return sdsConnection.callClassOperation("PortalScript.uploadScript", params).then((value) => {

                // set hash value
                if(script.conflictMode && script.localCode) {
                    script.lastSyncHash = crypto.createHash('md5').update(script.localCode).digest("hex");
                }

                // check for parameters
                if (!script.parameters || script.parameters.length <= 0) {
                    return resolve([script]);
                }
                if (!checkVersion(connInfo, VERSION_PARAMS_SET, "VERSION_PARAMS_UP")) {
                    return resolve([script]);
                }

                // set parameters

                let scriptParameters: string[] = [script.name, script.parameters];

                // call setScriptParameters
                setScriptInfoFromJSON(sdsConnection, scriptParameters).then(() => {
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
 * Upload all scripts from given list.
 *
 * @return Array containing all uploaded scripts, should be equal to params.
 * @param sdsConnection
 * @param params Array containing all scripts to upload.
 */
export async function uploadAll(sdsConnection: SDSConnection, params: scriptT[], connInfo: config.ConnectionInformation | undefined): Promise<scriptT[]> {
    return new Promise<scriptT[]>((resolve, reject) => {
        let scripts: scriptT[] = [];

        if(!connInfo) {
            return reject('login information missing');
        }

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
 * Run script.
 *
 * @param sdsConnection
 * @param params
 */
export async function runScript(sdsConnection: SDSConnection, params: scriptT[], connInfo: config.ConnectionInformation): Promise<scriptT[]> {
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
 * Run script.
 *
 * @param sdsConnection
 * @param params
 */
export async function debugScript(sdsConnection: SDSConnection, params: scriptT[], connInfo: config.ConnectionInformation): Promise<scriptT[]> {
    return new Promise<scriptT[]>((resolve, reject) => {
        if(0 === params.length) {
            resolve([]);
        } else {

            let script: scriptT = params[0];
            sdsConnection.callClassOperation('PortalScript.debugScript', [script.name]).then((value) => {
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
 * Execute all scripts in given list on server.
 *
 * @return Array containing all executed scripts, including the output.
 * @param sdsConnection
 * @param params Array containing all scripts to execute.
 */
export async function runAll(sdsConnection: SDSConnection, params: scriptT[], connInfo: config.ConnectionInformation): Promise<scriptT[]> {
    return new Promise<scriptT[]>((resolve, reject) => {
        let scripts: scriptT[] = [];

        // see description of reduce in uploadAll
        return reduce(params, function(numScripts: number, _script: scriptT) {
            return runScript(sdsConnection, [_script], connInfo).then((value) => {
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
 * Helper functions - no server call
 *
 *
 * The following functions are only some additional helper functions.
 * They don't do any call on server.
 */




/**
 *
 * @param data
 * @param filename
 * @param allowSubFolder
 */
export async function writeFileEnsureDir(data: any, filename: string | undefined): Promise<boolean> {
    console.log('writeFile');

    return new Promise<boolean>((resolve, reject) => {
        if (!filename || filename.length === 0) {
            return resolve(false);
        }
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
                            resolve(true);
                        }
                    });
                }
            });
        } else {
            reject(`Error in filename ${filename}`);
        }
    });
}


export function saveScriptUpdateSyncHash(scripts: scriptT[]): Promise<number> {
    return new Promise<number>((resolve, reject) => {
        return reduce(scripts, function(numscripts: number, script: scriptT) {
            // if script.path is not set, script will not be saved in writeFileEnsureDir(),
            // so the path member can be used to prevent single scripts of the scripts-array
            // from beeing saved
            return writeFileEnsureDir(script.serverCode, script.path).then((saved) => {
                script.localCode = script.serverCode;
                if(script.conflictMode) {
                    script.lastSyncHash = crypto.createHash('md5').update(script.localCode || '').digest('hex');
                }
                return numscripts + (saved? 1 : 0);
            });
        }, 0).then((numscripts: number) => {
            // this section is exectuted once after all writeFileEnsureDir calls are finished
            resolve(numscripts);
        }).catch((error: any) => {
            reject(error);
        });
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

    for (let elem of list) { // for-of loops are easier to debug
        elem = path.join(dir, elem);

        if (fs.existsSync(elem)) { // handle broken symlinks
            if (fs.statSync(elem).isFile()) {
                results.push(elem);
            } else if (rec) {
                results = results.concat(readDirSync(elem, rec));
            }
        }
    }

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
            const scriptName = path.parse(file).name;
            const duplicate = scripts.find(s => s.name === scriptName);
            const newScript = new scriptT(scriptName, file, fs.readFileSync(file).toString());
            if (duplicate) {
                duplicate.duplicate = true;
                newScript.duplicate = true;
            }
            scripts.push(newScript);
        }
    });

    return scripts;
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



function checkVersion(loginData: config.ConnectionInformation, version: string, warning?: string): boolean {
    if(Number(loginData.documentsVersion) >= Number(version)) {
        return true;
    } else {
        if("VERSION_CATEGORIES" === warning) {
            loginData.lastWarning = `For using category features DOCUMENTS ${VERSION_CATEGORIES} is required`;
        } else if("VERSION_PARAMS_SET" === warning) {
            loginData.lastWarning = `For uploading parameter DOCUMENTS ${VERSION_PARAMS_SET} is required`;
        } else if("VERSION_PARAMS_GET" === warning) {
            loginData.lastWarning = `For downloading parameter DOCUMENTS ${VERSION_PARAMS_GET} is required`;
        } else if("VERSION_SHOW_IMPORTS" === warning) {
            loginData.lastWarning = `For showing imports DOCUMENTS ${VERSION_SHOW_IMPORTS} is required`;
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
