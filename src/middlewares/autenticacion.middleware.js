const { obtenerPerfil } = require('../services/permisos.service');

// Identifica al usuario de la petición y deja su perfil en req.usuario.
//
// MODO PRUEBA (temporal): el correo se toma de CORREO_PRUEBA en el .env.
// Cuando tengamos el registro de Microsoft, aquí se validará el token
// y el correo saldrá del token. El resto de la aplicación no cambia.
async function autenticar(req, res, next) {
  try {
    const correo = obtenerCorreoDePrueba();

    if (correo === null) {
      return res.status(401).json({ mensaje: 'No ha iniciado sesión' });
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