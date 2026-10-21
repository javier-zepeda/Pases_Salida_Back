const { obtenerPerfil } = require('../services/permisos.service');
const { validarTokenMicrosoft } = require('../services/tokenMicrosoft.service');

// Identifica al usuario de la petición y deja su perfil en req.usuario.
//
// El front manda el token de Microsoft en el encabezado:  Authorization: Bearer <token>
// Del token se saca el correo, y con el correo se busca el perfil (roles, permisos y talleres) en las tablas COTI.
async function autenticar(req, res, next) {
  try {
    const correo = await identificarCorreo(req);

    if (correo === null) {
      return res.status(401).json({ mensaje: 'No ha iniciado sesión o su sesión venció' });
    }

    const perfil = await obtenerPerfil(correo);

    if (perfil === null) {
      return res.status(403).json({ mensaje: 'No tiene acceso a Pases de Salida' });
    }

    // Desde aquí, cualquier controlador puede usar req.usuario
    req.usuario = perfil;
    next();
  } catch (error) {
    console.error('Error al identificar al usuario:', error.message);
    res.status(500).json({ mensaje: 'Error al verificar el usuario' });
  }
}

// Devuelve el correo del usuario, o null si no se pudo identificar.
//   1. Si la petición trae token: el correo sale del token (si es válido).
//   2. Si no trae token y estamos en desarrollo: CORREO_PRUEBA del .env (sirve para probar la API sin pasar por el login).
async function identificarCorreo(req) {
  const token = leerToken(req);

  if (token !== null) {
    try {
      const datos = await validarTokenMicrosoft(token);
      return datos.correo;
    } catch (error) {
      console.warn('Token de Microsoft no válido:', error.message);
      return null;   // un token malo nunca cae al modo de prueba
    }
  }

  return obtenerCorreoDePrueba();
}

// "Authorization: Bearer abc.def.ghi" → "abc.def.ghi"
function leerToken(req) {
  const encabezado = req.get('Authorization');

  if (!encabezado || !encabezado.startsWith('Bearer ')) {
    return null;
  }

  const token = encabezado.slice('Bearer '.length).trim();
  if (token === '') {
    return null;
  }
  return token;
}

// Solo devuelve el correo de prueba si estamos en desarrollo
function obtenerCorreoDePrueba() {
  const esDesarrollo = process.env.NODE_ENV === 'development';
  const correo = process.env.CORREO_PRUEBA;

  if (esDesarrollo && correo) {
    return correo;
  }
  return null;
}

module.exports = { autenticar };
