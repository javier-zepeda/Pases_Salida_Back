// Helper para determinar que talleres puede ver el usuario.


// Devuelve null si puede ver todos los talleres o la lista de ids de los talleres que tiene asignados.
function obtenerTalleresPermitidos(usuario) {
  if (usuario.permisos.includes('pases.ver_todos')) {
    return null;
  }
  return usuario.talleres.map((taller) => taller.id_taller);
}

// Determina si el usuario puede ver un taller específico.
function puedeVerTaller(usuario, tallerId) {
  const talleresPermitidos = obtenerTalleresPermitidos(usuario);

  if (talleresPermitidos === null) {
    return true;
  }
  
  return talleresPermitidos.includes(tallerId);
}

module.exports = { obtenerTalleresPermitidos, puedeVerTaller };