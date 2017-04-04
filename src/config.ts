
// import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Hash, crypt_md5, JanusPassword, getJanusPassword } from 'node-sds';


const stripJsonComments = require('strip-json-comments');

const INI_DEFAULT_NAME: string = 'default.ini';
const LAUNCH_JSON_NAME: string = 'launch.json';
const INI_CONN_PART: string = '[Connection]';
const CRYPTMD5_SALT: string = 'o3';


const QP_SAVE_CONF: string = 'Save Login Data';
const QP_MAYBE_LATER: string = 'Maybe later';






const initialConfigurations = [
    {
        name: 'Launch Script on Server',
        request: 'launch',
        type: 'janus',
        script: '',
        username: '',
        password: '',
        principal: '',
        host: 'localhost',
        applicationPort: 11000,
        debuggerPort: 8089,
        stopOnEntry: false,
        log: {
            fileName: '${workspaceRoot}/vscode-janus-debug-launch.log',
            logLevel: {
                default: 'Debug',
            },
        },
    },
    {
        name: 'Attach to Server',
        request: 'attach',
        type: 'janus',
        host: 'localhost',
        debuggerPort: 8089,
        log: {
            fileName: '${workspaceRoot}/vscode-janus-debug-attach.log',
            logLevel: {
                default: 'Debug',
            },
        },
    },
];






export const SERVER: string = 'localhost';
export const PORT: number = 11000;
export const PRINCIPAL: string = 'dopaag';
export const USERNAME: string = 'admin';
export const PASSWORD = '';

export class LoginData {
    // todo private + getter...

    // login data
    public server: string = '';
    public port: number = 0;
    public principal: string = '';
    public username: string = '';
    public password: string = '';


    public checkLoginData(): boolean {
        if('' === this.server || 0  === this.port || '' === this.principal || '' === this.username) {
            console.log('checkLoginData: login data invalid');
            return false;
        }
        console.log('checkLoginData: login data valid');
        return true;
    }

    async ensureLoginData(jsonpath: string): Promise<void> {
        console.log('IniData.ensureLoginData');
        return new Promise<void>((resolve, reject) => {

            // if(this.checkLoginData()) {
            //     resolve();
            // // } else if(this.loadIniFile() && this.checkLoginData()) {
            // } else 


            // check launch.json for changes every time
            if(this.loadLaunchJson(jsonpath) && this.checkLoginData()) {
                resolve();

            } else { // loginData not set and no usable configuration file found
                reject();

                // // askForLoginData() is called inside inputProcedure(),
                // // inputProcedure() additional asks for the downloadpath
                // // and for saving the input
                // this.inputProcedure().then(() => {
                //     resolve();
                // }).catch((reason) => {
                //     reject(reason);
                // });
            }
        });
    }


    // async inputProcedure(): Promise<void> {
    //     return new Promise<void>((resolve, reject) => {

    //         // input login data
    //         this.askForLoginData().then(() => {
    //             // this.writeIniFile().then(() => {
    //             this.writeLaunchJson().then(() => {
    //                 // vscode.window.setStatusBarMessage('Saved login data');
    //                 resolve();
    //             }).catch((reason) => {
    //                 resolve();
    //             });
    //             resolve();
    //         }).catch((reason) => {
    //             console.log('reject from askForLoginData(): ' + reason);
    //             reject(reason);
    //         });
    //     });
    // }


    // async askForLoginData(): Promise<void> {
    //     console.log('IniData.askForLoginData');

    //     return new Promise<void>((resolve, reject) => {
    //         // showQuickPick() and showInputBox() return thenable(value) objects,
    //         // that is, these objects always have a then(value) function,
    //         // value can't be empty iff it's predefined in options
    //         vscode.window.showInputBox({
    //             prompt: 'Please enter the server',
    //             value: SERVER,
    //             ignoreFocusOut: true,
    //         }).then((server) => {
    //             if(server) {
    //                 this.server = server;
    //                 return vscode.window.showInputBox({
    //                     prompt: 'Please enter the port',
    //                     value: this.port? this.port.toString(): PORT.toString(),
    //                     ignoreFocusOut: true,
    //                 });
    //             }
    //         }).then((port) => {
    //             if(port) {
    //                 this.port = Number(port);
    //                 return vscode.window.showInputBox({
    //                     prompt: 'Please enter the principal',
    //                     value: this.principal? this.principal: PRINCIPAL,
    //                     ignoreFocusOut: true,
    //                 });
    //             }
    //         }).then((principal) => {
    //             if(principal) {
    //                 this.principal = principal;
    //                 return vscode.window.showInputBox({
    //                     prompt: 'Please enter the username',
    //                     value: this.username? this.username: USERNAME,
    //                     ignoreFocusOut: true,
    //                 });
    //             }
    //         }).then((username) => {
    //             if(username) {
    //                 this.username = username;
    //                 return vscode.window.showInputBox({
    //                     prompt: 'Please enter the password',
    //                     value: PASSWORD,
    //                     password: true,
    //                     ignoreFocusOut: true,
    //                 });
    //             }
    //         }).then((password) => {
    //             if(password != undefined) {
    //                 this.password = password;
    //                 resolve();
    //             } else {
    //                 reject();
    //                 vscode.window.showErrorMessage('Input login data cancelled: command cannot be executed');
    //             }
    //         });
    //     });
    // }








    public loadLaunchJson(jsonpath: string) : boolean {
        console.log('loadLaunchJson ' + jsonpath);
        // const launchJsonPath = path.join(vscode.workspace.rootPath, '.vscode', LAUNCH_JSON_NAME);
        let launchJsonPath;
        let base = path.basename(jsonpath);
        if('launch.json' === base) {
            launchJsonPath = jsonpath;
        } else if (!base) {
            launchJsonPath = path.join(jsonpath, LAUNCH_JSON_NAME);
        } else {
            console.log('wrong launch.json: ' + jsonpath);
            return false;
        }

        try {
            const jsonContent = fs.readFileSync(launchJsonPath, 'utf8');
            const jsonObject = JSON.parse(stripJsonComments(jsonContent));
            const configurations = jsonObject.configurations;

            if(configurations) {
                configurations.forEach((config: any) => {
                    if (config.request == 'launch') {
                        this.server = config.host;
                        this.port = config.applicationPort;
                        this.principal = config.principal;
                        this.username = config.username;
                        this.password = config.password;
                    }
                });
            }
        } catch (err) {
            return false;
        }

        return true;
    }


    // public loadIniFile(): boolean {
    //     console.log('IniData.loadIniFile');

    //     let file = this.findConfigurationFile(false);
    //     if(!file) {
    //         return false;
    //     }

    //     let contentBuf = fs.readFileSync(file, 'utf8');
    //     let contentStr = contentBuf.toString();
    //     let lines = contentStr.split(os.EOL);
    //     if(INI_CONN_PART === lines[0]) {
    //         for(let i=1; i<lines.length; i++) {
    //             // hash values doesn't contain '=',
    //             // so it should be ok to split using the seperator '='
    //             let line = lines[i].split('=');
    //             if(line && line.length > 0) {
    //                 switch(line[0]) {
    //                     case 'server':
    //                         this.server = line[1];
    //                         break;
    //                     case 'port':
    //                         this.port = Number(line[1]);
    //                         break;
    //                     case 'principal':
    //                         this.principal = line[1];
    //                         break;
    //                     case 'user':
    //                         this.username = line[1];
    //                         break;
    //                     case 'password':
    //                         // empty passwords are not hashed in janus
    //                         if(line[1].length > 0) {
    //                             this.password = line[1];
    //                         }
    //                         break;
    //                     case '':
    //                         console.log('empty line');
    //                         break;
    //                     default:
    //                         console.log('unknown entry ' + line[0]);
    //                 }
    //             }
    //         }
    //     }
    //     return true;
    // }



    // async writeIniFile(): Promise<void> {
    //     console.log('IniData.writeIniFile');
    //     let data = '';
    //     data += INI_CONN_PART + os.EOL;
    //     data += 'server=' + this.server + os.EOL;
    //     data += 'port=' + this.port + os.EOL;
    //     data += 'principal=' + this.principal + os.EOL;
    //     data += 'user=' + this.username + os.EOL;
    //     data += 'password=' + this.password + os.EOL;
    //     return this.writeConfigFile(data, false);
    // }
    

    // async writeLaunchJson(): Promise<void> {
    //     console.log('IniData.writeLaunchJson');

    //     initialConfigurations.forEach((config: any) => {
    //         if (config.request == 'launch') {
    //             config.host = this.server;
    //             config.applicationPort = this.port;
    //             config.principal = this.principal;
    //             config.username = this.username;
    //             config.password = this.password;
    //         }
    //     });

    //     const configurations = JSON.stringify(initialConfigurations, null, '\t')
    //         .split('\n').map(line => '\t' + line).join('\n').trim();

    //     const data = [
    //         '{',
    //         '\t// Use IntelliSense to learn about possible configuration attributes.',
    //         '\t// Hover to view descriptions of existing attributes.',
    //         '\t// For more information, visit',
    //         '\t// https://github.com/otris/vscode-janus-debug/wiki/Launching-the-Debugger',
    //         '\t"version": "0.2.0",',
    //         '\t"configurations": ' + configurations,
    //         '}',
    //     ].join('\n');

    //     return this.writeConfigFile(data);
    // }


    // public findConfigurationFile(json=true): string {
    //     console.log('IniData.findConfigurationFile');

    //     let rootPath = vscode.workspace.rootPath;
    //     if(!rootPath) {
    //         return '';
    //     }

    //     let ini = path.join(rootPath, '.vscode', json?LAUNCH_JSON_NAME:INI_DEFAULT_NAME);
    //     try {
    //         fs.accessSync(ini);
    //         return ini;
    //     } catch (e) {
    //         return '';
    //     }
    // }

    // async writeConfigFile (data, json=true) {

    //     return new Promise<void>((resolve, reject) => {
    //         let rootPath = vscode.workspace.rootPath;
            
    //         if(!rootPath) {
    //             vscode.window.showWarningMessage("Login Data can only be saved if a folder is open");
    //             resolve();

    //         } else {
    //             let _path: string = path.join(rootPath, '.vscode');
    //             let file = path.join(_path, json? LAUNCH_JSON_NAME: INI_DEFAULT_NAME);

    //             fs.writeFile(file, data, {encoding: 'utf8'}, function(error) {
    //                 if(error) {
    //                     if(error.code === 'ENOENT') {
    //                         fs.mkdir(_path, function(error) {
    //                             if(error) {
    //                                 reject(error);
    //                             } else {
    //                                 console.log('created path: ' + _path);
    //                                 fs.writeFile(file, data, {encoding: 'utf8'}, function(error) {
    //                                     if(error) {
    //                                         reject(error);
    //                                     } else {
    //                                         console.log('wrote file: ' +  file);
    //                                         resolve();
    //                                     }
    //                                 });
    //                             }
    //                         });
    //                     } else {
    //                         reject(error);
    //                     }
    //                 } else {
    //                     console.log('wrote file: ' +  file);
    //                     resolve();
    //                 }
    //             });

    //         }
    //     });
    // }

    dispose() {
        //
    }
}
