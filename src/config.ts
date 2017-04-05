import * as fs from 'fs';
const stripJsonComments = require('strip-json-comments');



export class LoginData {

    public server: string = '';
    public port: number = 0;
    public principal: string = '';
    public username: string = '';
    public password: string = '';
    public launchjson = '';

    constructor (_launchjson: string) {
        this.launchjson = _launchjson;
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

    public ensureLoginData(): boolean {
        console.log('ensureLoginData');
        if(this.loadLaunchJson() && this.checkLoginData()) {
            return true;
        }
        return false;
    }


    dispose() {
        //
    }

}
