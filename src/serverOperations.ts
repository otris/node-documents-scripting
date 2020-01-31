import * as os from "os";
import * as path from "path";
import * as crypto from "crypto";
import * as config from "./config";
import * as sds from "@otris/node-sds";
import { SDSConnection, SDSResponse, ParameterNames } from "@otris/node-sds";
import { version } from "punycode";

const reduce = require("reduce-for-promises");
const fs = require("fs-extra");

// const sds = require("@otris/node-sds");
// const ParameterNames = sds.ParameterNames;
// export type SDSConnection = any;
// export type SDSResponse = any;

export const VERSION_MIN = "8034";
export const VERSION_PARAMS_GET = "8036";
export const VERSION_ENCRYPTION = "8040";
export const VERSION_CATEGORIES = "8041";
export const VERSION_FIELD_TYPES = "8044";
export const VERSION_PARAMS_SET = "8067";
export const VERSION_SHOW_IMPORTS = "8047";

export const CONFLICT_SOURCE_CODE = 0x1;
export const CONFLICT_CATEGORY = 0x2;

const SDS_DEFAULT_TIMEOUT: number = 60 * 1000;

const ERROR_DECRYPT_PERMISSION = "For downloading encrypted scripts the decryption PEM file is required";


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
     * upload: local script not encrypted, server script not encrypted
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
 * and closes the connection. All available operations are implemented below.
 *
 * @param loginData
 * @param param input parameter of the operation
 * @param serverOperation the operation to be called on server
 */
export async function serverSession(loginData: config.ConnectionInformation, param: any[], serverOperation?: serverOperationT): Promise<any[]> {
    return new Promise<any[]>(async (resolve, reject) => {

        // create connection
        let sdsConnection = new sds.SDSConnection();
        try {
            await connectLogin(sdsConnection, loginData);

            // get/check version
            const value = await getDocumentsVersion(sdsConnection, [VERSION_MIN]);
            loginData.documentsVersion = value[0];

            // set language
            if (loginData.language > 0) {
                await sdsConnection.PDMeta.setLanguage(loginData.language);
            }

            if (serverOperation === undefined) {
                return resolve([]);
            }

            // call function
            const result = await serverOperation(sdsConnection, param, loginData);

            return resolve(result);
        } catch (err) {
            return reject(err);
        } finally {
            disconnect(sdsConnection);
        }
    });
}

export async function connectLogin(sdsConnection: SDSConnection | undefined, conn: config.Connection): Promise<SDSConnection> {
    return new Promise<SDSConnection>(async (resolve, reject) => {
        let connection = sdsConnection;
        if (connection === undefined) {
            connection = new sds.SDSConnection();
        }
        if (connection.isConnected) {
            return resolve(connection);
        }
        if (conn.password === undefined) {
            return reject("Cannot login, password must be Hash or empty string");
        }

        try {
            // connect/login
            sds.SDSConnection.TIMEOUT = conn.sdsTimeout ? conn.sdsTimeout : sds.SDSConnection.TIMEOUT;
            // sds.SDSConnection.STREAMING_TIMEOUT = 10000000;
            await connection.connect(conn.clientName ? conn.clientName : "node-documents-scripting", conn.server, conn.port);
            await connection.PDClass.changeUser(conn.username, conn.password);
            await connection.PDClass.changePrincipal(conn.principal);
            return resolve(connection);
        } catch (err) {
            return reject(err);
        }
    });
}

export function disconnect(sdsConnection: SDSConnection) {
    sdsConnection.disconnect();
}

export async function callClassOperation(sdsConnection: SDSConnection, op: string, params: string[]): Promise<string[]> {
    return new Promise<string[]>(async (resolve, reject) => {
        try {
            const response = await sdsConnection.PDClass.callOperation(op, params) as SDSResponse;
            const errCode = response.getParameter(ParameterNames.RETURN_VALUE) as number;
            if (errCode < 0) {
                const value = response.getParameter(ParameterNames.PARAMETER) as string[];
                return reject(value[0]);
            }
            const value = response.getParameter(ParameterNames.PARAMETER) as string[];
            return resolve(value);
        } catch (err) {
            return reject(`${op} failed: ` + err);
        }
    });
}


export async function getSourceCodeForEditor(sdsConnection: SDSConnection, params: string[], connInfo: config.ConnectionInformation): Promise<string[]> {
    return new Promise<string[]>(async (resolve, reject) => {
        if(Number(connInfo.documentsVersion) < Number(VERSION_SHOW_IMPORTS)) {
            return reject(`For operation PortalScript.getSourceCodeForEditor at least DOCUMENTS ${VERSION_SHOW_IMPORTS} is required`);
        }
        try {
            const value = await callClassOperation(sdsConnection, "PortalScript.getSourceCodeForEditor", params);
            return resolve(value);
        } catch (err) {
            return reject(err);
        }
    });
}

export async function doMaintenance(sdsConnection: SDSConnection, params: string[]): Promise<string[]> {
    return await callClassOperation(sdsConnection, "Global.doMaintenance", params);
}

/**
 * @param params if params[0] contains a number (e.g. "8034"), the version is checked against this number
 */
export async function getDocumentsVersion(sdsConnection: SDSConnection, params: string[]): Promise<string[]> {
    return new Promise<string[]>(async (resolve, reject) => {
        const value = await callClassOperation(sdsConnection, "PartnerNet.getVersionNo", []);
        if (params.length > 0) {
            const version = value[0];
            if(!version) {
                // "PartnerNet.getVersionNo" is available on DOCUMENTS but most likely
                // not on other JANUS based applications
                return reject(`This command is only available on DOCUMENTS`);
            } else if(Number(version) < Number(params[0])) {
                return reject(`Current DOCUMENTS build no: ${version} Required DOCUMENTS build no: ${params[0]}`);
            }
        }
        return resolve(value);
    });
}

/**
 * @param params e.g. ["allowDecryption"] shows if user has permission to decrypt scripts (returns ["1"] for true)
 */
export async function getProperty(sdsConnection: SDSConnection, params: string[], connInfo: config.ConnectionInformation): Promise<string[]> {
    return await callClassOperation(sdsConnection, "PartnerNet.getProperty", params);
}

/**
 * Update scriptlibs
 */
export async function clearPortalScriptCache(sdsConnection: SDSConnection, params: string[], connInfo: config.ConnectionInformation): Promise<string[]> {
    return await callClassOperation(sdsConnection, "PartnerNet.*clearPortalScriptCache", []);
}

/**
 * @returns string[]: [json, msg, oid1, attr1, local1 (rel), oid2, ...]
 */
export async function importXML(sdsConnection: SDSConnection, params: string[]): Promise<string[]> {
    return await callClassOperation(sdsConnection, "Global.importXML2", params);
}


/**
 * Generate xml for filetypes or portal scripts
 * Some examples for params:
 * ["DlcFileType", "Title='crmNote'"],
 * ["PortalScript", "Name='myScript'"],
 * ["DlcFileType", ""],
 * ["PortalScript", ""]
 * ["DlcFileType", "(Title='crmNote'||Title='crmCase')"]
 *
 * @param params string array with two entries, class name and filter. See examples in description.
 * @return string array, first element is the xml as string, second to n-th value is the paths to the blobs
 */
export async function exportXML(sdsConnection: SDSConnection, params: xmlExport[]): Promise<string[]> {
    return new Promise<string[]>(async (resolve, reject) => {
        try {
            for (const current of params) {
                const returnValue = await callClassOperation(sdsConnection, "Global.exportXML", [current.className, current.filter]);
                current.content = returnValue[0];
                current.files = returnValue.slice(1);
            }
        } catch (reason) {
            return reject(reason);
        }
        return resolve([]);
    });
}


/**
 * @param files string array containing file paths, like [local1, remote1, ...]
 */
export async function receiveFiles(sdsConnection: SDSConnection, files: string[]): Promise<string[]> {
    return new Promise<string[]>(async (resolve, reject) => {
        if ((files.length % 2) !== 0) {
            return reject(`Unexpected length of file array ${files.length}`);
        }
        // tslint:disable-next-line: prefer-for-of
        for (let i = 0; i < files.length - 1; i += 2) {
            try {
                fs.ensureDirSync(path.dirname(files[i]));
                // receiveFile(remote, local)
                await sdsConnection.PDTools.receiveFile(files[i + 1], files[i]);
            } catch (err) {
                return reject(`Error in receiving file ${files[i + 1]}: ${err}`);
            }
        }
        return resolve([]);
    });
}

/**
 * @param param [oid1, attr1, local1 (abs), oid2, ...]
 */
export async function updateDocuments(sdsConnection: SDSConnection, param: string[]): Promise<string[]> {
    return new Promise<string[]>(async (resolve, reject) => {
        if ((param.length % 3) !== 0) {
            return reject(`Unexpected length of parameter array ${param.length}`);
        }
        try {
            for (let i = 0; (i + 2) < param.length; i = i + 3) {
                const pdo = await sdsConnection.PDClass.ptr(param[i + 0]);
                const remoteDir = await pdo.getAttribute(param[i + 1] + ".BaseDirOnServer");
                const remote = path.join(remoteDir, path.basename(param[i + 2]));
                const remoteNew = await sdsConnection.PDTools.sendFile(remote, param[i + 2], false);
                if (remoteNew !== remote) {
                    throw new Error(`server created new name in sendFile ${remoteNew}`);
                }
                await pdo.setAttribute(param[i + 1], path.basename(remoteNew));
                await pdo.sync();
            }
        } catch (err) {
            return reject(`Error in updateDocument: ${err}`);
        }
        return resolve([]);
    });
}


/**
 * Get all script names on server as scripts.
 *
 * @param sdsConnection
 * @param params category If set, script names from this category are returned.
 * @returns {scriptT[]} List of scripts created from all script names in category or all script names on server.
 */
export async function getScriptsFromServer(sdsConnection: SDSConnection, params: string[], connInfo: config.ConnectionInformation): Promise<scriptT[]> {
    return new Promise<scriptT[]>(async (resolve, reject) => {
        try {
            const scriptNames = await getScriptNamesFromServer(sdsConnection, params, connInfo);
            let scripts: scriptT[] = scriptNames.map(scriptName => new scriptT(scriptName, ""));
            return resolve(scripts);
        } catch (err) {
            return reject(err);
        }
    });
}


/**
 * Get names of all scripts on server.
 *
 * @param sdsConnection
 * @param params category If set, script names from this category are returned.
 * @returns {string[]} List of all script names in category or all script names on server.
 */
export async function getScriptNamesFromServer(sdsConnection: SDSConnection, params: string[], connInfo: config.ConnectionInformation): Promise<string[]> {
    return new Promise<string[]>((resolve, reject) => {
        sdsConnection.PDClass.callOperation('PortalScript.getScriptNames', params).then((returnValue) => {
            const response = returnValue as SDSResponse;
            const errCode = response.getParameter(ParameterNames.RETURN_VALUE) as number;
            if (errCode < 0) {
                const value = response.getParameter(ParameterNames.PARAMETER) as string[];
                return reject(value[0]);
            }
            const value = response.getParameter(ParameterNames.PARAMETER) as string[];
            resolve(value);
        }).catch((reason) => {
            reject('getScriptNamesFromServer failed: ' + reason);
        });
    });
}




/**
 * @param params empty for now, later: the categories
 * @return string array containing all filetype names
 */
export async function getFileTypeNames(sdsConnection: SDSConnection, params: string[], connInfo: config.ConnectionInformation): Promise<string[]> {
    return new Promise<string[]>((resolve, reject) => {
        sdsConnection.PDClass.callOperation('IDlcFileType.getFileTypeNames', []).then((returnValue) => {
            const response = returnValue as SDSResponse;
            const errCode = response.getParameter(ParameterNames.RETURN_VALUE) as number;
            if (errCode < 0) {
                const value = response.getParameter(ParameterNames.PARAMETER) as string[];
                return reject(value[0]);
            }
            const fileTypeNames = response.getParameter(ParameterNames.PARAMETER) as string[];
            // first entry contains the error message that is read in node-sds
            fileTypeNames.splice(0, 1);
            resolve(fileTypeNames);
        }).catch((reason) => {
            reject('getFileTypeNames failed: ' + reason);
        });
    });
}



/**
 * Get field names of a filetype and create interface declaration for TypeScript
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

        const fileTypeName = params[0];
        let operation = 'getFieldNames';

        // older documents versions include a
        // function that also returns the types
        const fieldTypesVersion = checkVersion(connInfo, VERSION_FIELD_TYPES, "VERSION_FIELD_TYPES");
        if (fieldTypesVersion) {
            operation = 'getFieldNamesAndTypes';
        }


        // get the field names
        sdsConnection.PDClass.callOperation('IDlcFileType.' + operation, [fileTypeName]).then((returnValue) => {
            const response = returnValue as SDSResponse;
            const errCode = response.getParameter(ParameterNames.RETURN_VALUE) as number;
            if (errCode < 0) {
                const value = response.getParameter(ParameterNames.PARAMETER) as string[];
                return reject(value[0]);
            }
            const fieldInfo = response.getParameter(ParameterNames.PARAMETER) as string[];
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
 * Get field names of all file types and create a string that contains the
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
        sdsConnection.PDClass.callOperation('IDlcFileType.getFileTypeNames', []).then((returnValue) => {
            const response = returnValue as SDSResponse;
            const errCode = response.getParameter(ParameterNames.RETURN_VALUE) as number;
            if (errCode < 0) {
                const value = response.getParameter(ParameterNames.PARAMETER) as string[];
                return reject(value[0]);
            }
            const fileTypeNames = response.getParameter(ParameterNames.PARAMETER) as string[];

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
        sdsConnection.PDClass.callOperation('PortalScript.setScriptInfoFromJSON', params).then((returnValue) => {
            const response = returnValue as SDSResponse;
            const errCode = response.getParameter(ParameterNames.RETURN_VALUE) as number;
            if (errCode < 0) {
                const value = response.getParameter(ParameterNames.PARAMETER) as string[];
                return reject(value[0]);
            }
            resolve();
        }).catch((reason) => {
            reject('setScriptParameters failed: ' + reason);
        });
    });
}



function getScriptInfoAsJSON(sdsConnection: SDSConnection, scripts: scriptT[]): Promise<string[]> {
    return new Promise<any[]>((resolve, reject) => {
        const script = scripts[0];
        sdsConnection.PDClass.callOperation('PortalScript.getScriptInfoAsJSON', [script.name]).then((returnValue) => {
            const response = returnValue as SDSResponse;
            const errCode = response.getParameter(ParameterNames.RETURN_VALUE) as number;
            if (errCode < 0) {
                const value = response.getParameter(ParameterNames.PARAMETER) as string[];
                return reject(value[0]);
            }
            const param = response.getParameter(ParameterNames.PARAMETER) as string[];
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
        sdsConnection.PDClass.callOperation('Systemuser.get', ['test']).then((returnValue) => {
            const response = returnValue as SDSResponse;
            const errCode = response.getParameter(ParameterNames.RETURN_VALUE) as number;
            if (errCode < 0) {
                const value = response.getParameter(ParameterNames.PARAMETER) as string[];
                return reject(value[0]);
            }
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

            sdsConnection.PDClass.callOperation('PortalScript.downloadScript', [script.name]).then((returnValue) => {
                const response = returnValue as SDSResponse;
                const errCode = response.getParameter(ParameterNames.RETURN_VALUE) as number;
                if (errCode < 0) {
                    const value = response.getParameter(ParameterNames.PARAMETER) as string[];
                    return reject(value[0]);
                }
                const retval = response.getParameter(ParameterNames.PARAMETER) as string[];

                if(!retval[0] || typeof(retval[0]) !== 'string') {
                    return reject('could not find ' + script.name + ' on server');
                }

                if('false' === retval[1] || 'decrypted' === retval[1] || ('true' === retval[1] && script.allowDownloadEncrypted)) {
                    script.serverCode = ensureNoBOM(retval[0]);
                    script.encrypted = retval[1];

                    let scriptPath;

                    // get category for category as folder
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

        sdsConnection.PDClass.callOperation('PortalScript.downloadScript', [script.name]).then((returnValue) => {
            const response = returnValue as SDSResponse;
            const errCode = response.getParameter(ParameterNames.RETURN_VALUE) as number;
            if (errCode < 0) {
                const value = response.getParameter(ParameterNames.PARAMETER) as string[];
                return reject(value[0]);
            }
            const value = response.getParameter(ParameterNames.PARAMETER) as string[];

            if (!value || value.length === 0) {
                // script not on server
                return resolve();
            }
            if (value.length < 2) {
                return reject(`Unexpected return value length (${value.length}) in checkVersionEncryption on DOCUMENTS #${connInfo.documentsVersion}`);
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
            return reject(`Unexpected return value (${value}) in checkVersionEncryption on DOCUMENTS #${connInfo.documentsVersion}`);

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

        sdsConnection.PDClass.callOperation('PortalScript.downloadScript', [script.name]).then((returnValue) => {
            const response = returnValue as SDSResponse;
            const errCode = response.getParameter(ParameterNames.RETURN_VALUE) as number;
            if (errCode < 0) {
                const value = response.getParameter(ParameterNames.PARAMETER) as string[];
                return reject(value[0]);
            }
            const value = response.getParameter(ParameterNames.PARAMETER) as string[];

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
            return sdsConnection.PDClass.callOperation("PortalScript.uploadScript", params).then((value) => {

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
                // this section is executed once after all _uploadScript calls are finished
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
            sdsConnection.PDClass.callOperation('PortalScript.runScript', [script.name]).then((returnValue) => {
                const response = returnValue as SDSResponse;
                const errCode = response.getParameter(ParameterNames.RETURN_VALUE) as number;
                if (errCode < 0) {
                    // no error!
                    // bug in runScript and debugScript on Documents:
                    // if the script returns a value, RETURN_VALUE is set to -1

                    // const value = response.getParameter(ParameterNames.PARAMETER) as string[];
                    // return reject(value[0]);
                }
                const value = response.getParameter(ParameterNames.PARAMETER) as string[];
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
            sdsConnection.PDClass.callOperation('PortalScript.debugScript', [script.name]).then((returnValue) => {
                const response = returnValue as SDSResponse;
                const errCode = response.getParameter(ParameterNames.RETURN_VALUE) as number;
                if (errCode < 0) {
                    // no error!
                    // bug in runScript and debugScript on Documents:
                    // if the script returns a value, RETURN_VALUE is set to -1

                    // const value = response.getParameter(ParameterNames.PARAMETER) as string[];
                    // return reject(value[0]);
                }
                const value = response.getParameter(ParameterNames.PARAMETER) as string[];

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
            // from being saved
            return writeFileEnsureDir(script.serverCode, script.path).then((saved) => {
                script.localCode = script.serverCode;
                if(script.conflictMode) {
                    script.lastSyncHash = crypto.createHash('md5').update(script.localCode || '').digest('hex');
                }
                return numscripts + (saved? 1 : 0);
            });
        }, 0).then((numscripts: number) => {
            // this section is executed once after all writeFileEnsureDir calls are finished
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

        const stats = fs.lstatSync(elem);
        if (stats.isSymbolicLink()) {
            // returns the path where the symlink points to
            elem = fs.readlinkSync(elem);
        }

        if (fs.existsSync(elem)) {
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
        }

        return false;
    }
}


function ensureNoBOM(sourceCode: string | undefined): string | undefined {
    if (!sourceCode) {
        return undefined;
    }
    return sourceCode.replace(/^\ufeff/, '');
}
