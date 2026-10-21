const jwt = require('jsonwebtoken');
const jwksRsa = require('jwks-rsa');

// Valida el token que el front obtiene al iniciar sesión con Microsoft.
// El token viene firmado por Microsoft. no hace falta ninguna contraseña (client secret): se revisa la firma con las llaves públicas que Microsoft publica para nuestra empresa (tenant).
// Se revisa además:
//   - audience (aud): que el token se emitió para nuestra aplicación (AZURE_CLIENT_ID)
//   - issuer (iss):   que lo emitió Microsoft para nuestra empresa (AZURE_TENANT_ID)
//   - exp:            que no esté vencido (jsonwebtoken lo revisa solo)

let clienteLlaves = null;
// Se crea una sola vez y guarda las llaves en memoria para no pedirlas en cada petición.
function obtenerClienteLlaves() {
  if (clienteLlaves === null) {
    clienteLlaves = jwksRsa({
      jwksUri: 'https://login.microsoftonline.com/' + process.env.AZURE_TENANT_ID + '/discovery/v2.0/keys',
      cache: true,
      cacheMaxAge: 12 * 60 * 60 * 1000,   // 12 horas
      rateLimit: true,
      jwksRequestsPerMinute: 10
    });
  }
  return clienteLlaves;
}

// jsonwebtoken llama a esta función para obtener la llave con la que se firmó
function buscarLlave(encabezado, callback) {
  obtenerClienteLlaves().getSigningKey(encabezado.kid)
    .then((llave) => callback(null, llave.getPublicKey()))
    .catch((error) => callback(error));
}

// Devuelve { correo, nombre } si el token es válido.
function validarTokenMicrosoft(token) {
  return new Promise((resolve, reject) => {
    const idTenant = process.env.AZURE_TENANT_ID;
    const idCliente = process.env.AZURE_CLIENT_ID;

    if (!idTenant || !idCliente) {
      return reject(new Error('Faltan AZURE_TENANT_ID o AZURE_CLIENT_ID en el .env'));
    }

    const opciones = {
      algorithms: ['RS256'],
      audience: idCliente,
      issuer: 'https://login.microsoftonline.com/' + idTenant + '/v2.0',
      clockTolerance: 60   // tolera 1 minuto de diferencia entre relojes
    };

    jwt.verify(token, buscarLlave, opciones, (error, datos) => {
      if (error) {
        return reject(error);
      }

      // Microsoft manda el correo en "preferred_username"
      const correo = datos.preferred_username || datos.email || null;
      if (!correo) {
        return reject(new Error('El token no trae el correo del usuario'));
      }

      resolve({ correo: correo, nombre: datos.name || '' });
    });
  });
}

module.exports = { validarTokenMicrosoft };
