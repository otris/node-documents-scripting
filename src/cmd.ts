import * as os from 'os';
import * as config from './config';
import { SDSConnection } from 'node-sds';
import * as sdsAccess from './sdsAccess';


export let cmdvar = 0;

// command options
var program = require('commander');


// set up sdsAccess


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
            reject();
        });
    });
}


// program
//   .version('0.0.1')
//   .option('-u, --upload', 'upload only')
//   .option('-r, --run', 'upload and run')
//   .parse(process.argv);

program
    .version('0.0.1')
    .command('test <json> [dir...]')
    .action(function (json: string, dir: string, filter: string) {
        console.log('test json %s', json);
        if (dir) {
            console.log('test ' + dir[0]);
            let loginData: config.LoginData = new config.LoginData(json);
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
