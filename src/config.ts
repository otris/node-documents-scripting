import * as fs from 'fs';
import { Hash } from 'node-sds';



export class ConnectionInformation {

    public server: string = '';
    public port: number = 0;
    public principal: string = '';
    public username: string = '';
    public password: Hash | '' | undefined;
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
        if ('' === this.server || 0  === this.port || '' === this.principal || '' === this.username) {
            return false;
        }
        return true;
    }


    public dispose() {
        //
    }

}
