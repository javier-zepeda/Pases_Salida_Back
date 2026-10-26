// ¿Puede el usuario modificar este pase? (editar datos, subir o quitar imágenes)
//
// Reglas según el estado:
//   - Anulado (2): nadie lo modifica.
//   - Autorizado (1): solo quien tenga 'pases.editar_autorizado'.
//   - Creado (0): cualquiera con 'pases.editar' (lo revisa la ruta).
//
// Devuelve null si puede, o { estado, mensaje } para responder el error.
function revisarSiPuedeModificar(usuario, pase) {
  if (pase.estado_id === 2) {
    return { estado: 409, mensaje: 'Un pase anulado no se puede modificar' };
  }

  const puedeModificarAutorizados = usuario.permisos.includes('pases.editar_autorizado');

  if (pase.estado_id === 1 && !puedeModificarAutorizados) {
    return { estado: 403, mensaje: 'No tiene permiso para modificar pases ya autorizados' };
  }

  return null;
}

module.exports = { revisarSiPuedeModificar };
