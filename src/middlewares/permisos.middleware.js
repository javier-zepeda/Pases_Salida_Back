// Crea un middleware que solo deja pasar a quien tenga el permiso indicado.
//
// Uso en una ruta:
//   router.get('/', autenticar, requierePermiso('pases.ver'), listarPases);
function requierePermiso(permiso) {
  return function verificarPermiso(req, res, next) {
    const permisosDelUsuario = req.usuario.permisos;

    if (!permisosDelUsuario.includes(permiso)) {
      return res.status(403).json({
        mensaje: 'No tiene permiso para realizar esta acción',
        permisoRequerido: permiso
      });
    }

    next();
  };
}

module.exports = { requierePermiso };