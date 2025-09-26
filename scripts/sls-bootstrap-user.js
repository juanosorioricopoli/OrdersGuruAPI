// scripts/sls-bootstrap-user.js
'use strict';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getCode = (e) => (e && (e.code || e.providerError?.code || e.name || '')).toString();
const getMsg  = (e) => (e && e.message || '').toString();

const isUserNotFound = (e) => {
  const c = getCode(e).toLowerCase();
  const m = getMsg(e).toLowerCase();
  return c.includes('usernotfound') || c.includes('user_not_found') || m.includes('user does not exist');
};

const isUsernameExists = (e) => getCode(e).toLowerCase().includes('usernameexists');
const isResourceNotFound = (e) => {
  const c = getCode(e).toLowerCase();
  return c.includes('resourcenotfound') || c.includes('resource_not_found');
};

class BootstrapUserPlugin {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options || {};
    this.provider = this.serverless.getProvider('aws');
    this.hooks = { 'after:deploy:deploy': this.run.bind(this) };
  }

  async run() {
    const stage  = this.options.stage  || this.serverless.service.provider.stage;
    const region = this.options.region || this.serverless.service.provider.region || 'us-east-1';

    const cfg = (this.serverless.service.custom && this.serverless.service.custom.bootstrapUser) || {};
    if (cfg.enabled === false) {
      this.serverless.cli.log('[bootstrapUser] disabled via custom.bootstrapUser.enabled=false');
      return;
    }

    const username  = this.options.username || cfg.username || 'juan@example.com';
    const password  = this.options.password || cfg.password || 'P@ssw0rd!';
    const makeAdmin = (typeof this.options.admin !== 'undefined') ? (String(this.options.admin) === 'true') : (cfg.admin ?? true);

    const request = (svc, method, params) => this.provider.request(svc, method, params, { region });
    const stackName = this.provider.naming.getStackName(stage);

    // 1) Outputs del stack
    const { Stacks } = await request('CloudFormation', 'describeStacks', { StackName: stackName });
    const outputs = Object.fromEntries((Stacks?.[0]?.Outputs || []).map(o => [o.OutputKey, o.OutputValue]));
    const userPoolId       = outputs.UserPoolId;
    const userPoolClientId = outputs.UserPoolClientId;
    const apiUrl           = outputs.ApiUrl;

    if (!userPoolId || !userPoolClientId) {
      this.serverless.cli.log('[bootstrapUser] Missing outputs UserPoolId/UserPoolClientId. Skipping.');
      return;
    }

    // 2) Verificar/crear usuario
    let exists = true;
    try {
      await request('CognitoIdentityServiceProvider', 'adminGetUser', { UserPoolId: userPoolId, Username: username });
    } catch (err) {
      if (isUserNotFound(err)) exists = false;
      else throw err;
    }

    if (!exists) {
      try {
        await request('CognitoIdentityServiceProvider', 'adminCreateUser', {
          UserPoolId: userPoolId,
          Username: username,
          MessageAction: 'SUPPRESS',
          UserAttributes: [
            { Name: 'email', Value: username },
            { Name: 'email_verified', Value: 'true' }
          ]
        });
      } catch (e) {
        if (!isUsernameExists(e)) throw e; // si existe, seguimos
      }
      // eventual consistency: espera un poco
      await sleep(1500);
    }

    // 3) Fijar password permanente (con reintentos)
    for (let i = 0; i < 3; i++) {
      try {
        await request('CognitoIdentityServiceProvider', 'adminSetUserPassword', {
          UserPoolId: userPoolId, Username: username, Password: password, Permanent: true
        });
        break;
      } catch (e) {
        if (isUserNotFound(e)) { await sleep(1500); continue; }
        throw e;
      }
    }

    // 4) Agregar al grupo admin (si existe)
    if (makeAdmin) {
      try {
        await request('CognitoIdentityServiceProvider', 'adminAddUserToGroup', {
          UserPoolId: userPoolId, Username: username, GroupName: 'admin'
        });
      } catch (e) {
        if (!isResourceNotFound(e)) this.serverless.cli.log(`[bootstrapUser] warning: ${getCode(e)} ${getMsg(e)}`);
        // si el grupo aún no existe, no detenemos el deploy
      }
    }

    // 5) Obtener token con pequeños reintentos por consistencia
    let idToken = '';
    for (let i = 0; i < 3; i++) {
      try {
        const auth = await request('CognitoIdentityServiceProvider', 'initiateAuth', {
          AuthFlow: 'USER_PASSWORD_AUTH',
          ClientId: userPoolClientId,
          AuthParameters: { USERNAME: username, PASSWORD: password }
        });
        idToken = auth?.AuthenticationResult?.IdToken || '';
        if (idToken) break;
      } catch (e) {
        // si es not authorized justo tras set password, reintentar
        await sleep(1500);
      }
    }

    const log = (msg) => this.serverless.cli.consoleLog(msg);
    log('\n==================================');
    log(' Orders API – Bootstrap complete');
    log(` Stage:   ${stage}`);
    log(` Region:  ${region}`);
    log(` API:     ${apiUrl || '(no ApiUrl output)'}`);
    log(` User:    ${username} ${makeAdmin ? '(admin)' : ''}`);
    log('----------------------------------');
    log(' IdToken (JWT):');
    log(idToken || '(no token)');
    log('----------------------------------');
    if (apiUrl && idToken) {
      log(' cURL quick test:');
      log(` curl -H "Authorization: Bearer ${idToken}" ${apiUrl}/orders`);
    }
    log('==================================\n');
  }
}

module.exports = BootstrapUserPlugin;
