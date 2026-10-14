// GET /api/sesion/perfil
// Devuelve quién es el usuario, sus roles, permisos y talleres.
// El front lo usa para mostrar u ocultar opciones.
function obtenerMiPerfil(req, res) {
  res.json(req.usuario);
}

module.exports = { obtenerMiPerfil };