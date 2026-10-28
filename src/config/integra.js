const { Sequelize } = require('sequelize');

// Conexión al servidor SQL que tiene el linked server INTEGRA (AS/400).
// Es distinta de la base de Pases (baseDatos.js): solo se usa para leer órdenes.
//
// Si INTEGRA_SERVIDOR no está en el .env, no se crea la conexión (queda en null)
// y la aplicación sigue funcionando: Integra responde "no disponible".
let baseIntegra = null;

if (process.env.INTEGRA_SERVIDOR) {
    baseIntegra = new Sequelize(
        process.env.INTEGRA_BASE || 'master',
        process.env.INTEGRA_USUARIO,
        process.env.INTEGRA_CONTRASENA,
        {
            host: process.env.INTEGRA_SERVIDOR,
            port: Number(process.env.INTEGRA_PUERTO || 1433),
            dialect: 'mssql',
            logging: false,
            dialectOptions: {
                options: {
                    encrypt: true,
                    trustServerCertificate: process.env.INTEGRA_CONFIAR_CERTIFICADO === 'true',
                    // Si Integra tarda más de esto, se deja de esperar y responde "no disponible"
                    connectTimeout: 10000,
                    requestTimeout: 15000
                }
            }
        }
    );
}

module.exports = baseIntegra;
