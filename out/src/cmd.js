"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const os = require("os");
const config = require("./config");
const sdsAccess = require("./sdsAccess");
exports.cmdvar = 0;
// command options
var program = require('commander');
// set up sdsAccess
sdsAccess.setServerOperation((sdsConnection, param) => documentsOperation(sdsConnection, param));
function documentsOperation(sdsConnection, param) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve, reject) => {
            if (param.length == 2 && typeof param[0] === 'string' && typeof param[1] === 'string') {
                sdsAccess.uploadAll(sdsConnection, param[1]).then(() => {
                    return sdsAccess.runAll(sdsConnection, param[1]).then((retval) => {
                        for (let i = 0; i < retval.length; i++) {
                            console.log("script " + i + ":" + os.EOL + retval[i]);
                        }
                        resolve();
                    });
                }).catch((reason) => {
                    reject();
                });
            }
            else {
                reject('incorrect parameter type');
            }
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
    .command('test <json> [otherDirs...]')
    .action(function (json, otherDirs) {
    console.log('test json %s', json);
    if (otherDirs) {
        console.log('test ' + otherDirs[0]);
        let loginData = new config.LoginData(json);
        sdsAccess.sdsSession(loginData, [json, otherDirs[0]], undefined);
        // otherDirs.forEach(function (oDir) {
        //     console.log('test ' + oDir);
        //     sdsAccess.sdsSession(loginData, [json, oDir]);
        // });
    }
    else {
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
//# sourceMappingURL=cmd.js.map