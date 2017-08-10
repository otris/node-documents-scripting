import * as os from 'os';
import * as config from './config';
import { SDSConnection } from 'node-sds';
import * as sdsAccess from './sdsAccess';
import * as path from 'path';
import * as fs from 'fs';


export let cmdvar = 0;

// command options
var program = require('commander');


// set up sdsAccess

/**
 * Returns a list of files inside a directory
 * @param dir - directory path
 * @param [rec=true] - Specifies wether to read the directory recursive
 * @returns List of files
 */
function readDirSync(dir: string, rec: boolean = true): string[] {
    let results: string[] = [];
    let list = fs.readdirSync(dir);

    list.forEach(function (elem) {
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
 * Resolves a wildcard path and returns a list of files matches the wildcard path.
 * @param wildcardPath - File path which can contain wildcards
 * @returns List of files matching the path
 * @example
 * // Use wildcard
 * let files: string[] = resolveWildcardPath("src/test/*.js");
 *
 * // Use wildcards with recursion
 * let files: string[] = resolveWildcardPath("src/test/ ** /*.js"); // ignore the spacec before and after the "**"
 */
function resolveWildcardPath(wildcardPath: string): string[] {
    // resolve wildcards in the file path
    let indexOf = wildcardPath.indexOf("/**");
    let recursive = indexOf > -1;

    if (recursive) {
        wildcardPath = wildcardPath.replace("/**", "");
    }

    // if the path contains a wildcard, we have to make sure that wildcards can only be used at the end of a path
    indexOf = wildcardPath.lastIndexOf("/");
    let wildcardIndex = wildcardPath.indexOf("*");
    let wildcard = "";
    let wildcardReg: RegExp;

    if (wildcardIndex > -1) {
        if (wildcardIndex < indexOf) {
            throw new Error("Wildcards can only be used at the end of the path: " + wildcard);
        } else {
            wildcard = wildcardPath.substr(indexOf + 1).split(".").join("\\.").split("*").join(".*");
            wildcardPath = wildcardPath.substr(0, indexOf);

            try {
                wildcardReg = new RegExp("^" + wildcard + "$");
            } catch (err) {
                throw new Error("Invalid wildcard expression: " + wildcard);
            }
        }
    }

    // Get the files
    let files: string[] = [];
    if (!fs.existsSync(wildcardPath)) {
        throw new Error(`The path '${wildcardPath}' doesn't exists`);
    } else if (fs.statSync(wildcardPath).isFile()) {
        files.push(wildcardPath);
    } else {
        files = readDirSync(wildcardPath, recursive);
    }

    if (wildcard !== "") {
        // Filter the files
        files = files.filter((file) => {
            return wildcardReg.test(path.parse(file).base);
        });
    }

    return files;
}

/**
 * Executes a script
 * @param loginData - Login data for authentication with the DOCUMENTS-server
 * @param file - local file path to a script to execute or the script name on the DOCUMENTS-server
 * @param [uploadScript] - Specifies whether to upload the script before running
 * @returns The output of the script
 */
async function run(loginData: config.LoginData, file: string, uploadScript: boolean = false): Promise<string> {
    return new Promise<string>(async (resolve, reject) => {
        if (uploadScript) {
            await upload(loginData, [file]);
        }

        // run the script
        let script = {
            name: path.parse(file).name
        };

        return sdsAccess.sdsSession(loginData, [script], sdsAccess.runScript).then((executedScripts: sdsAccess.scriptT[]) => {
            // the array can only contain 1 element
            if (executedScripts.length > 1) {
                reject(`received more then 1 script after run script: ${executedScripts.length}`);
            } else if (executedScripts.length < 1) {
                reject(`no scripts received after execute script '${file}'`);
            } else {
                let script: sdsAccess.scriptT = executedScripts[0];

                console.log(`\nExecuted script '${file}':\n${script.output}`);
                resolve(script.output);
            }
        }).catch((reason) => {
            reject(reason);
        });
    });
}

/**
 * 
 * @param loginData - Login data for authentication with to DOCUMENTS-server
 * @param files - File paths or the file names to run
 * @param [uploadScript] - Specifies whether to upload the script before running
 */
async function runAll(loginData: config.LoginData, files: string[], uploadScripts: boolean = false): Promise<sdsAccess.scriptT[]> {
    return new Promise<sdsAccess.scriptT[]>(async (resolve, reject) => {
        if (uploadScripts) {
            await upload(loginData, files);
        }

        // resolve file paths to scriptT-objects
        let scriptsToExecute: sdsAccess.scriptT[] = [];
        files.forEach((file) => {
            scriptsToExecute.push({
                name: path.parse(file).name
            });
        });
        console.log(JSON.stringify(scriptsToExecute));

        // Execute the scripts
        return sdsAccess.sdsSession(loginData, scriptsToExecute, sdsAccess.runAll).then((executedScripts) => {
            executedScripts.forEach((script: sdsAccess.scriptT) => {
                console.log(`\nExecuted script '${script.name}':\n${script.output}`);
            });

            resolve(executedScripts);
        });
    });
}

/**
 * Uploads the passed files
 * @param loginData - Login data for authentication with the DOCUMENTS-server
 * @param files - Array of locale file paths to upload
 */
async function upload(loginData: config.LoginData, files: string[]) {
    return new Promise<void>((resolve, reject) => {
        let filesToUpload: sdsAccess.scriptT[] = [];

        // resolve file paths to scriptT-objects
        files.forEach((file) => {
            if (fs.existsSync(file)) {
                filesToUpload.push({
                    name: path.parse(file).name,
                    path: file,
                    sourceCode: fs.readFileSync(file).toString()
                });
            } else {
                reject(`The file '${file}' doesn't exists.`);
            }
        });

        // upload the scripts
        return sdsAccess.sdsSession(loginData, filesToUpload, sdsAccess.uploadAll).then(() => {
            resolve();
        }).catch((reason) => {
            reject(reason);
        });
    });
}

async function uploadAndRunAll(loginData: config.LoginData, folder: string, prefix: string): Promise<sdsAccess.scriptT[]> {
    return new Promise<sdsAccess.scriptT[]>((resolve, reject) => {
        let scripts: sdsAccess.scriptT[] = [];
        sdsAccess.getScriptsFromFolder(folder).then((_upscripts) => {
            return sdsAccess.sdsSession(loginData, _upscripts, sdsAccess.uploadAll).then(() => {
                return sdsAccess.getScriptsFromFolder(folder, prefix).then((_runscripts) => {
                    return sdsAccess.sdsSession(loginData, _runscripts, sdsAccess.runAll).then((retval) => {
                        for(let i=0; i<retval.length; i++) {
                            scripts.push(retval[i]);
                            console.log("script " + i + ":" + os.EOL + retval[i].output);
                        }
                        resolve(scripts);
                    });
                });
            });
        }).catch((reason) => {
            reject(reason);
        });
    });
}

/**
 * Command for executing files
 * @example
 * node cmd.js run <path to launch.json> <path to file/dir with or without wildcards>
 */
program
    .version("0.0.1")
    .command("run <json> <dir...>")
    .action((json: string, dir: string[]) => {
        try {
            if (typeof json === "undefined" || json === "") {
                throw new Error("No launch.json passed");
            } else if (!fs.existsSync(json)) {
                throw new Error(`The passed launch.json doesn't exists: ${json}`);
            }

            if (typeof dir === "undefined" || dir.length < 1) {
                throw new Error("No directory or file passed.");
            }

            if (dir.length > 1) {
                throw new Error("If you use wildcards in your path, set the path in quotemarks");
            }

            // we have only one element in the dir-array:
            // [0] => path (with or without) wildcards to upload (can be a directory or a file)
            let wildcardPath = dir[0].split("\\").join("/");

            // resolve the wildcard path
            let filesToRun = resolveWildcardPath(wildcardPath);

            // Execute the file(s)
            let loginData: config.LoginData = new config.LoginData();
            if (!loginData.loadConfigFile(json)) {
                throw new Error("Unable to load the config file.");
            }

            if (filesToRun.length <= 1) {
                run(loginData, filesToRun[0]);
            } else {
                runAll(loginData, filesToRun);
            }
        } catch (err) {
            console.log(`Error occured: ${err.message}`);
        }
    });

/**
 * Command for uploading files
 * @example
 * node cmd.js upload <path to launch.json> <path to file/dir with or without wildcards>
 */
program
    .version("0.0.1")
    .command("upload <json> <dir...>")
    .action((json: string, dir: string[]) => {
        try {
            if (typeof json === "undefined" || json === "") {
                throw new Error("No launch.json passed");
            } else if (!fs.existsSync(json)) {
                throw new Error(`The passed launch.json doesn't exists: ${json}`);
            }

            if (typeof dir === "undefined" || dir.length < 1) {
                throw new Error("No directory or file passed.");
            }

            if (dir.length > 1) {
                throw new Error("If you use wildcards in your path, set the path in quotemarks");
            }

            // we have only one element in the dir-array:
            // [0] => path (with or without) wildcards to upload (can be a directory or a file)
            let wildcardPath = dir[0].split("\\").join("/");

            // resolve the wildcard path
            let filesToUpload = resolveWildcardPath(wildcardPath);

            // upload the files
            let loginData: config.LoginData = new config.LoginData();
            if (!loginData.loadConfigFile(json)) {
                throw new Error("Unable to load the config file.");
            }

            upload(loginData, filesToUpload);
        } catch (err) {
            console.log(`Error occured: ${err.message}`);
        }
    });

/**
 * Command for upload and execute scripts from a directory.
 * @example
 * node cmd.js test <path to launch.json> <directory path> <prefix of scripts to execute>
 */
program
    .version('0.0.1')
    .command('test <json> [dir...]')
    .action(function (json: string, dir: string, filter: string) {
        console.log('test json %s', json);
        if (dir) {
            console.log('test ' + dir[0]);
            let loginData: config.LoginData = new config.LoginData();
            loginData.loadConfigFile(json)
            // dir[1] == name-prefix
            let params = [dir[0], dir[1]];
            uploadAndRunAll(loginData, dir[0], dir[1]);
            // dir.forEach(function (dir_i) {
            //     console.log('test ' + dir_i);
            // });
        } else {
            console.log('test dir missing');
        }
    });
 
program.parse(process.argv);

// if (process.argv.length > 2) {
//     console.log('argv ' + process.argv[0]); // node.exe
//     console.log('argv ' + process.argv[1]); // main.js
//     console.log('argv ' + process.argv[2]); // -u / -r
// }
// if (program.args) {
//     console.log('args ' + program.args);
// }


// github-https-link: https://github.com/otris/node-documents-scripting.git
// npm install git+github-https-link
// =>
// npm install git+https://github.com/otris/node-documents-scripting.git
//
// node .\node_modules\node-documents-scripting\out\src\cmd.js test C:\projekte\vscode-live-demo\.vscode\launch.json C:\projekte\vscode-live-demo\subfolder _test
