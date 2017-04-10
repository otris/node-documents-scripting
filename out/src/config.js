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
const fs = require("fs");
const stripJsonComments = require('strip-json-comments');
class LoginData {
    constructor(_launchjson) {
        this.server = '';
        this.port = 0;
        this.principal = '';
        this.username = '';
        this.password = '';
        if (_launchjson) {
            this.launchjson = _launchjson;
        }
    }
    checkLoginData() {
        console.log('checkLoginData');
        if ('' === this.server || 0 === this.port || '' === this.principal || '' === this.username) {
            return false;
        }
        return true;
    }
    loadLaunchJson() {
        console.log('loadLaunchJson');
        if (!this.launchjson) {
            return false;
        }
        try {
            const jsonContent = fs.readFileSync(this.launchjson, 'utf8');
            const jsonObject = JSON.parse(stripJsonComments(jsonContent));
            const configurations = jsonObject.configurations;
            if (configurations) {
                configurations.forEach((config) => {
                    if (config.request == 'launch') {
                        this.server = config.host;
                        this.port = config.applicationPort;
                        this.principal = config.principal;
                        this.username = config.username;
                        this.password = config.password;
                        this.sdsTimeout = config.sdsTimeout;
                    }
                });
            }
        }
        catch (err) {
            return false;
        }
        return true;
    }
    ensureLoginData() {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('ensureLoginData');
            return new Promise((resolve, reject) => {
                this.loadLaunchJson();
                if (this.checkLoginData()) {
                    resolve();
                }
                else if (this.getLoginData) {
                    this.getLoginData(this).then(() => {
                        resolve();
                    }).catch((reason) => {
                        reject(reason);
                    });
                }
                else {
                    reject();
                }
            });
        });
    }
    dispose() {
        //
    }
}
exports.LoginData = LoginData;
//# sourceMappingURL=config.js.map