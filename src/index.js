// CARGAR VARIABLES DE ENTORNO
require('dotenv').config();

// IMPORTAR EL SERVIDOR EXPRESS
const app = require('./app');
// IMPORTAR LA CONEXIÓN A LA BASE DE DATOS
const baseDatos = require('./config/baseDatos');

// INICIAR EL SERVIDOR EN EL PUERTO DEFINIDO EN LAS VARIABLES DE ENTORNO
const puerto = process.env.PUERTO || 3100;

async function iniciarServidor() {
    try{
        await baseDatos.authenticate();
        console.log('Conectado a la base de datos:', process.env.DB_NOMBRE);        
    } catch (error) {
        console.error('No se pudo conectar a la base de datos:', error.message);
        process.exit(1);
    }

    app.listen(puerto, () => {
        console.log(`Servidor de Pases de Salida en http://localhost:${puerto}`);
    })
}

iniciarServidor();