"use strict";
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
        console.log('ensureLoginData');
        if (this.loadLaunchJson() && this.checkLoginData()) {
            return true;
        }
        return false;
    }
    dispose() {
        //
    }
}
exports.LoginData = LoginData;
//# sourceMappingURL=config.js.map