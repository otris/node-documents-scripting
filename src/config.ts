const sds = require("@otris/node-sds");
export type Hash = any;

const JANUS_CRYPTMD5_SALT: string = 'o3';

export type JanusPassword = '' | Hash;

export function getJanusPassword(val: string): JanusPassword {
    if (val.length > 0) {
        return sds.crypt_md5(val, JANUS_CRYPTMD5_SALT);
    }
    return '';
}

/**
 * For now only English and German.
 * But actually it's possible to set another language.
 */
export enum Language {
    German = 0,
    English = 1,
}

export class Connection {
    public server: string = "";
    public port: number = 0;
    public username: string = "";
    public password: Hash | "" | undefined;
    public principal: string = "";
    public sdsTimeout?: number;
    public clientName?: string;
    public tls?: boolean;
	public startTls?: boolean;
	public trustedCas?: string | string[];
}

export class ConnectionInformation extends Connection {

    public askForPassword: boolean = false;
    public userId?: number;
    public configFile?: string;
    public documentsVersion: string = '';
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
        if ('' === this.server || 0 === this.port || '' === this.principal || '' === this.username) {
            return false;
        }
        return true;
    }

    public checkAnyLoginData(): boolean {
        if ('' === this.server && 0 === this.port && '' === this.principal && '' === this.username) {
            return false;
        }
        return true;
    }


    public dispose() {
        //
    }

}
