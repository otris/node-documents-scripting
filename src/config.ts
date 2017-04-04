import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Hash, crypt_md5, JanusPassword, getJanusPassword } from 'node-sds';


const stripJsonComments = require('strip-json-comments');



export class LoginData {

    public server: string = '';
    public port: number = 0;
    public principal: string = '';
    public username: string = '';
    public password: string = '';
    public launchjson = '';
    public inputfunction: (_loginData) => Promise<void>;

    constructor (_launchjson: string, _inputfunction?: (_loginData) => Promise<void>) {
        this.launchjson = _launchjson;
        if(_inputfunction) {
            this.inputfunction = _inputfunction;
        }
    }


    public checkLoginData(): boolean {
        if('' === this.server || 0  === this.port || '' === this.principal || '' === this.username) {
            return false;
        }
        return true;
    }

    public loadLaunchJson() : boolean {
        if(!this.launchjson) {
            return false;
        }
        try {
            const jsonContent = fs.readFileSync(this.launchjson, 'utf8');
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

    async ensureLoginData(): Promise<void> {
        console.log('IniData.ensureLoginData');
        return new Promise<void>((resolve, reject) => {

            // check launch.json for changes every time
            if(this.loadLaunchJson() && this.checkLoginData()) {
                resolve();

            } else if(this.inputfunction) {
                this.inputfunction(this).then(() => {
                    resolve();
                }).catch((reason) => {
                    reject(reason);
                });
            } else {
                reject();
            }

        });
    }


    dispose() {
        //
    }

}
