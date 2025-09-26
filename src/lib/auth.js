function getClaims(event) {
  const claims = (event && event.requestContext && event.requestContext.authorizer && event.requestContext.authorizer.claims) || {};
  if (typeof claims['cognito:groups'] === 'string') {
    claims['cognito:groups'] = claims['cognito:groups'].split(',');
  }
  return claims;
}

function isAdmin(claims) {
  const groups = claims['cognito:groups'] || [];
  const adminGroup = process.env.ADMIN_GROUP || 'admin';
  return Array.isArray(groups) && groups.includes(adminGroup);
}

module.exports = { getClaims, isAdmin };
