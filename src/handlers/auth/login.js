const AWS = require('aws-sdk');
const { ok, badRequest, unauthorized } = require('../../lib/http');

const cognito = new AWS.CognitoIdentityServiceProvider();
const clientId = process.env.USER_POOL_CLIENT_ID;

exports.handler = async (event) => {
  if (!clientId) {
    console.error('Missing USER_POOL_CLIENT_ID env variable');
    return badRequest('Cognito User Pool client not configured');
  }

  if (!event.body) {
    return badRequest('Missing body');
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch (err) {
    return badRequest('Invalid JSON body');
  }

  const { username, password, refreshToken } = payload;

  let params;
  if (refreshToken) {
    params = {
      ClientId: clientId,
      AuthFlow: 'REFRESH_TOKEN_AUTH',
      AuthParameters: { REFRESH_TOKEN: refreshToken }
    };
  } else {
    if (!username || !password) {
      return badRequest('username and password are required');
    }
    params = {
      ClientId: clientId,
      AuthFlow: 'USER_PASSWORD_AUTH',
      AuthParameters: { USERNAME: username, PASSWORD: password }
    };
  }

  try {
    const result = await cognito.initiateAuth(params).promise();
    const auth = result.AuthenticationResult || {};

    if (!auth.IdToken && !auth.AccessToken) {
      console.error('Unexpected Cognito response', result);
      return unauthorized('Authentication failed');
    }

    return ok({
      idToken: auth.IdToken || null,
      accessToken: auth.AccessToken || null,
      refreshToken: auth.RefreshToken || refreshToken || null,
      tokenType: auth.TokenType || 'Bearer',
      expiresIn: typeof auth.ExpiresIn === 'number' ? auth.ExpiresIn : null
    });
  } catch (error) {
    const code = (error.code || error.name || '').toString();

    if (['NotAuthorizedException', 'UserNotFoundException', 'UserNotConfirmedException', 'PasswordResetRequiredException'].includes(code)) {
      return unauthorized('Invalid username or password');
    }

    if (code === 'InvalidParameterException') {
      return badRequest('Invalid parameters for Cognito authentication');
    }

    console.error('Cognito initiateAuth failed', error);
    return badRequest('Authentication request failed');
  }
};