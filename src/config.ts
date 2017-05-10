import * as fs from 'fs';
const stripJsonComments = require('strip-json-comments');



export class LoginData {

    public server: string = '';
    public port: number = 0;
    public principal: string = '';
    public username: string = '';
    public password: string = '';
    public userId;
    // ~infinity: ms = 0x7FFFFFFF;
    public sdsTimeout;
    public launchjson;
    public getLoginData: (loginData: LoginData) => Promise<void>;
    public DocumentsVersion: string = '';

    constructor (_launchjson?: string) {
        if(_launchjson) {
            this.launchjson = _launchjson;
        }
    }


    public checkLoginData(): boolean {
        console.log('checkLoginData');
        if('' === this.server || 0  === this.port || '' === this.principal || '' === this.username) {
            return false;
        }
        return true;
    }

    public loadLaunchJson() : boolean {
        console.log('loadLaunchJson');
        if(!this.launchjson) {
            return false;
        }
        try {
            const jsonContent = fs.readFileSync(this.launchjson, 'utf8');
            const jsonObject = JSON.parse(stripJsonComments(jsonContent));
            const configurations = jsonObject.configurations;

            if(configurations) {
                configurations.forEach((config: any) => {
                    if (config.type === 'janus' && config.request === 'launch') {
                        this.server = config.host;
                        this.port = config.applicationPort;
                        this.principal = config.principal;
                        this.username = config.username;
                        this.password = config.password;
                        this.sdsTimeout = config.sdsTimeout;
                    }
                });
            }
        } catch (err) {
            return false;
        }

        return true;
    }

    async ensureLoginData(): Promise<void> {
        console.log('ensureLoginData');
        return new Promise<void>((resolve, reject) => {
        
            // todo: change to callback to make it
            // independend from special file launch.json
            this.loadLaunchJson();

            if(this.checkLoginData()) {
                resolve();
            } else if(this.getLoginData) {

                // is this ok? maybe change to callback parameter...
                this.getLoginData(this).then(() => {

                    if(this.checkLoginData()) {
                        resolve();
                    } else {
                        reject('getting login data failed');
                    }
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
