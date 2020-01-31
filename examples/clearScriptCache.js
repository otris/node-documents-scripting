const serverOperations = require('../out/src/serverOperations');
const config = require('../out/src/config');

var login = new config.ConnectionInformation();
login.server = '127.0.0.1';
login.port = 11000;
login.principal = 'relations';
login.username = 'admin';
login.password = '';

serverOperations.serverSession(login, [], serverOperations.clearPortalScriptCache);
