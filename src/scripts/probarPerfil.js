// Prueba manual: muestra el perfil de Pases de un correo.
// Uso: node scripts/probarPerfil.js correo@codaca.com.gt
require('dotenv').config();

const baseDatos = require('../config/baseDatos');
const { obtenerPerfil } = require('../services/permisos.service');

async function probar() {
  const correo = process.argv[2];

  if (!correo) {
    console.log('Falta el correo. Uso: node scripts/probarPerfil.js correo@codaca.com.gt');
    return;
  }

  const perfil = await obtenerPerfil(correo);

  if (perfil === null) {
    console.log('Sin acceso a Pases de Salida:', correo);
  } else {
    console.log(JSON.stringify(perfil, null, 2));
  }

  await baseDatos.close();
}

probar();