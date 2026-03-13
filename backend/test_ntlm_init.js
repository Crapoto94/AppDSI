const ntlm = require('express-ntlm');
try {
    const middleware = ntlm({
        domain: 'IVRY',
        domaincontroller: 'ldap://10.103.130.118'
    });
    console.log('Middleware initialized successfully');
} catch (e) {
    console.error('Failed to initialize middleware:', e);
}
