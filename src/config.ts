import * as fs from 'fs';
import { Hash } from 'node-sds';


/**
 * For now only English and German.
 * But actually it's possible to set another language.
 */
export enum Language {
    German = 0,
    English = 1,
}

export class ConnectionInformation {

    public server: string = '';
    public port: number = 0;
    public principal: string = '';
    public username: string = '';
    public password: Hash | '' | undefined;
    public askForPassword: boolean = false;
    public userId?: number;
    public sdsTimeout?: number;
    public configFile?: string;
    public documentsVersion: string = '';
    public decryptionPermission?: boolean;
    /**
     * Language has always been German, because if no language is set,
     * the server sets the language to 0, and that is German.
     * The existing behaviour shouldn't be changed, so the default
     * language will still be German.
     */
    public language: Language = Language.German;
    public lastWarning: string = '';
    public lastError: string = '';

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

    public checkNoLoginData(): boolean {
        if ('' === this.server && 0  === this.port && '' === this.principal && '' === this.username) {
            return false;
        }
        return true;
    }


    public dispose() {
        //
    }

}
