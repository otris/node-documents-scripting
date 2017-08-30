import * as fs from 'fs';



export class LoginData {

    public server: string = '';
    public port: number = 0;
    public principal: string = '';
    public username: string = '';
    public password: string = '';
    public askForPassword: boolean = false;
    public askForPasswordStr: string;
    public userId: number;
    public sdsTimeout: number;
    public configFile: string;
    public getLoginData: (loginData: LoginData) => Promise<void>;
    public DocumentsVersion: string = '';
    public lastError: string = '';
    public lastWarning: string = '';

    public resetLoginData() {
        this.server = '';
        this.port = 0;
        this.principal = '';
        this.username = '';
    }

    public checkLoginData(): boolean {
        console.log('checkLoginData');
        if('' === this.server || 0  === this.port || '' === this.principal || '' === this.username) {
            return false;
        }
        return true;
    }


    async ensureLoginData(): Promise<void> {
        console.log(`ensureLoginData start: ask ${this.askForPassword} askStr ${this.askForPasswordStr} pw ${this.password}`);
        return new Promise<void>((resolve, reject) => {

            if(this.checkLoginData() && !(this.askForPassword && (this.askForPasswordStr === this.password))) {
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
