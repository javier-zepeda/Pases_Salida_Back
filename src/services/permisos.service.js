const { QueryTypes } = require('sequelize');
const baseDatos = require('../config/baseDatos');

// Código de la aplicación en dbo.tbl_aplicaciones.
// Se usa el código y no el id porque el id puede cambiar entre ambientes.
const CODIGO_APLICACION = 'PASES_TALLER';

// Busca al usuario en la tabla compartida de usuarios
async function buscarUsuarioPorCorreo(correo) {
  const usuarios = await baseDatos.query(
    `SELECT id, nombre, email, activo
     FROM dbo.COTI_tbl_usuarios
     WHERE LOWER(email) = LOWER(:correo)`,
    { replacements: { correo: correo }, type: QueryTypes.SELECT }
  );

  if (usuarios.length === 0) {
    return null;
  }
  return usuarios[0];
}

// Roles del usuario, solo los de la aplicación Pases
async function buscarRoles(usuarioId) {
  const filas = await baseDatos.query(
    `SELECT r.nombre
     FROM dbo.COTI_tbl_usuario_rol ur
     JOIN dbo.COTI_tbl_roles r       ON r.id = ur.rol_id
     JOIN dbo.tbl_aplicaciones a     ON a.id = r.aplicacion_id
     WHERE ur.usuario_id = :usuarioId
       AND a.codigo = :codigoAplicacion
       AND r.activo = 1
       AND a.activo = 1`,
    { replacements: { usuarioId: usuarioId, codigoAplicacion: CODIGO_APLICACION }, type: QueryTypes.SELECT }
  );

  return filas.map((fila) => fila.nombre);
}

// Permisos que le dan todos sus roles de Pases (sin repetir)
async function buscarPermisos(usuarioId) {
  const filas = await baseDatos.query(
    `SELECT DISTINCT p.nombre
     FROM dbo.COTI_tbl_usuario_rol ur
     JOIN dbo.COTI_tbl_roles r        ON r.id = ur.rol_id
     JOIN dbo.COTI_tbl_rol_permiso rp ON rp.rol_id = r.id
     JOIN dbo.COTI_tbl_permisos p     ON p.id = rp.permiso_id
     JOIN dbo.tbl_aplicaciones a      ON a.id = r.aplicacion_id
     WHERE ur.usuario_id = :usuarioId
       AND a.codigo = :codigoAplicacion
       AND p.aplicacion_id = a.id
       AND r.activo = 1
       AND a.activo = 1`,
    { replacements: { usuarioId: usuarioId, codigoAplicacion: CODIGO_APLICACION }, type: QueryTypes.SELECT }
  );

  return filas.map((fila) => fila.nombre);
}

// Talleres activos a los que pertenece el usuario
async function buscarTalleres(usuarioId) {
  const filas = await baseDatos.query(
    `SELECT t.id_taller, t.nombre
     FROM Pases_Taller.usuario_taller ut
     JOIN Pases_Taller.taller t ON t.id_taller = ut.taller_id
     WHERE ut.usuario_id = :usuarioId
       AND t.activo = 1`,
    { replacements: { usuarioId: usuarioId }, type: QueryTypes.SELECT }
  );

  return filas;
}

// Arma el perfil completo del usuario para la aplicación Pases.
// Devuelve null si el usuario no existe, está inactivo o no tiene ningún rol en Pases.
async function obtenerPerfil(correo) {
  const usuario = await buscarUsuarioPorCorreo(correo);

  if (usuario === null) {
    return null;
  }
  if (!usuario.activo) {
    return null;
  }

  const roles = await buscarRoles(usuario.id);

  // Sin rol en Pases = sin acceso, aunque exista en otras aplicaciones
  if (roles.length === 0) {
    return null;
  }

  const permisos = await buscarPermisos(usuario.id);
  const talleres = await buscarTalleres(usuario.id);

  return {
    id: usuario.id,
    nombre: usuario.nombre,
    correo: usuario.email,
    roles: roles,
    permisos: permisos,
    talleres: talleres
  };
}

module.exports = { obtenerPerfil };