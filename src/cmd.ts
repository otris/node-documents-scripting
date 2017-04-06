import * as os from 'os';
import * as config from './config';
import { SDSConnection } from 'node-sds';
import * as sdsAccess from './sdsAccess';


export let cmdvar = 0;

// command options
var program = require('commander');


// set up sdsAccess


async function documentsOperation(sdsConnection: SDSConnection, param: string[]): Promise<string[]> {
    return new Promise<string[]>((resolve, reject) => {
        if(param.length >= 1 && typeof param[0] === 'string') {
            
            sdsAccess.uploadAll(sdsConnection, param).then(() => {
                return sdsAccess.runAll(sdsConnection, param).then((retval) => {
                    for(let i=0; i<retval.length; i++) {
                        console.log("script " + i + ":" + os.EOL + retval[i]);
                    }
                    resolve(['']);
                });
            }).catch((reason) => {
                reject();
            });

        } else {
            reject('incorrect parameter type');
        }
    });
}


// program
//   .version('0.0.1')
//   .option('-u, --upload', 'upload only')
//   .option('-r, --run', 'upload and run')
//   .parse(process.argv);

program
    .version('0.0.1')
    .command('test <json> [otherDirs...]')
    .action(function (json, otherDirs) {
        console.log('test json %s', json);
        if (otherDirs) {
            console.log('test ' + otherDirs[0]);
            let loginData: config.LoginData = new config.LoginData(json);
            let params = [otherDirs[0]];
            sdsAccess.sdsSession(loginData, params, documentsOperation);
            // otherDirs.forEach(function (oDir) {
            //     console.log('test ' + oDir);
            //     sdsAccess.sdsSession(loginData, [json, oDir]);
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
// node .\node_modules\node-documents-scripting\out\src\cmd.js test C:\projekte\vscode-live-demo\.vscode\launch.json C:\projekte\vscode-live-demo\subfolder
