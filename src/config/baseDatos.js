const { Sequelize } = require('sequelize');

// Conexion a la base de datos de DEV-QA 
const baseDatos = new Sequelize(
    process.env.DB_NOMBRE,
    process.env.DB_USUARIO,
    process.env.DB_CONTRASENA,
    {
        host: process.env.DB_SERVIDOR,
        port: Number(process.env.DB_PUERTO),
        dialect: 'mssql',
        logging: false,
        dialectOptions: {
            options: {
                encrypt: true,
                // Solo en local: acepta el certificado autofirmado de SQL Server
                trustServerCertificate: process.env.DB_CONFIAR_CERTIFICADO === 'true'
            }
        }
    }
);

module.exports = baseDatos;