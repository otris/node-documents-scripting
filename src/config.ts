import * as fs from 'fs';



export class ConnectionInformation {

    public server: string = '';
    public port: number = 0;
    public principal: string = '';
    public username: string = '';
    public password: string = '';
    public askForPassword: boolean = false;
    public userId: number;
    public sdsTimeout: number;
    public configFile: string;
    public documentsVersion: string = '';
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
        if ('' === this.server || 0  === this.port || '' === this.principal || '' === this.username) {
            return false;
        }
        return true;
    }


    public dispose() {
        //
    }

}
