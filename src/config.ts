import * as fs from 'fs';
const stripJsonComments = require('strip-json-comments');



export class LoginData {

    public server: string = '';
    public port: number = 0;
    public principal: string = '';
    public username: string = '';
    public password: string = '';
    public askForPassword: boolean = false;
    public askForPasswordStr: string = '';
    public userId: number;
    public sdsTimeout: number;
    public configFile: string;
    public getLoginData: (loginData: LoginData) => Promise<void>;
    public DocumentsVersion: string = '';

    public checkLoginData(): boolean {
        console.log('checkLoginData');
        if('' === this.server || 0  === this.port || '' === this.principal || '' === this.username) {
            return false;
        }
        return true;
    }

    public loadConfigFile(configFile: string) : boolean {
        console.log('loadConfigFile');
        this.configFile = configFile;

        try {
            const jsonContent = fs.readFileSync(this.configFile, 'utf8');
            const jsonObject = JSON.parse(stripJsonComments(jsonContent));
            const configurations = jsonObject.configurations;

            if(configurations) {
                configurations.forEach((config: any) => {
                    if (config.type === 'janus' && config.request === 'launch') {
                        this.server = config.host;
                        this.port = config.applicationPort;
                        this.principal = config.principal;
                        this.username = config.username;
                        if(this.askForPasswordStr === config.password) {
                            this.askForPassword = true;
                        }
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
        console.log(`ensureLoginData start: ask ${this.askForPassword} askStr ${this.askForPasswordStr} pw ${this.password}`);
        return new Promise<void>((resolve, reject) => {

            const askpw = (this.askForPassword && (this.askForPasswordStr === this.password));
            if(this.checkLoginData() && !askpw) {
                resolve();

            } else if(this.getLoginData) {

                // is this ok? maybe change to callback parameter...
                this.getLoginData(this).then(() => {

                    if(this.checkLoginData() && (this.askForPasswordStr !== this.password)) {
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
