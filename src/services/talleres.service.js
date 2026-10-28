const { QueryTypes } = require('sequelize');
const baseDatos = require('../config/baseDatos');

// Devuelve un taller por su id, o null si no existe
async function obtenerTaller(idTaller) {
    const filas = await baseDatos.query(
        `SELECT id_taller, nombre, codigo, sede_id, activo
        FROM Pases_Taller.taller
        WHERE id_taller = :idTaller`,
        { replacements: { idTaller: idTaller }, type: QueryTypes.SELECT }
    );

    if (filas.length === 0) {
        return null;
    }
    return filas[0];
}

// Lista los talleres activos con el nombre de su sede.
// talleres → [1, 2] para devolver solo esos | null para devolver todos
async function listarTalleresActivos(talleres) {
    let filtroTalleres = '';
    const parametros = {};

    if (talleres !== null) {
        filtroTalleres = 'AND t.id_taller IN (:talleres)';
        parametros.talleres = talleres;
    }

    const filas = await baseDatos.query(
        `SELECT t.id_taller, t.nombre, t.codigo, s.nombre AS sede
         FROM Pases_Taller.taller t
         LEFT JOIN Pases_Taller.sede s ON s.id_sede = t.sede_id
         WHERE t.activo = 1
         ${filtroTalleres}
         ORDER BY t.nombre`,
        { replacements: parametros, type: QueryTypes.SELECT }
    );

    return filas;
}

// ---------------------------------------------------------------------
// Mantenimiento de talleres
// ---------------------------------------------------------------------

// Todos los talleres (activos e inactivos) con su sede y cuántos usuarios tienen asignados
async function listarTalleres() {
    const talleres = await baseDatos.query(
        `SELECT t.id_taller,
            t.nombre,
            t.codigo,
            t.sede_id,
            s.nombre AS sede,
            s.activo AS sede_activa,
            t.activo,
            (SELECT COUNT(*)
             FROM Pases_Taller.usuario_taller ut
             WHERE ut.taller_id = t.id_taller) AS usuarios
        FROM Pases_Taller.taller t
        LEFT JOIN Pases_Taller.sede s ON s.id_sede = t.sede_id
        ORDER BY t.nombre`,
        { type: QueryTypes.SELECT }
    );

    return talleres;
}

// true si otro taller ya usa ese nombre (al crear se manda idTallerExcluir = 0)
async function existeNombreTaller(idTallerExcluir, nombre) {
    const filas = await baseDatos.query(
        `SELECT COUNT(*) AS total
        FROM Pases_Taller.taller
        WHERE nombre = :nombre
        AND id_taller <> :idTallerExcluir`,
        { replacements: { nombre: nombre, idTallerExcluir: idTallerExcluir }, type: QueryTypes.SELECT }
    );

    return filas[0].total > 0;
}

// true si otro taller ya usa ese código (al crear se manda idTallerExcluir = 0)
async function existeCodigoTaller(idTallerExcluir, codigo) {
    const filas = await baseDatos.query(
        `SELECT COUNT(*) AS total
        FROM Pases_Taller.taller
        WHERE codigo = :codigo
        AND id_taller <> :idTallerExcluir`,
        { replacements: { codigo: codigo, idTallerExcluir: idTallerExcluir }, type: QueryTypes.SELECT }
    );

    return filas[0].total > 0;
}

async function crearTaller(datos) {
    const filas = await baseDatos.query(
        `INSERT INTO Pases_Taller.taller (nombre, codigo, sede_id)
        OUTPUT INSERTED.id_taller
        VALUES (:nombre, :codigo, :sede_id)`,
        {
            replacements: {
                nombre: datos.nombre,
                codigo: datos.codigo,
                sede_id: datos.sede_id
            },
            type: QueryTypes.SELECT
        }
    );

    return filas[0].id_taller;
}

async function editarTaller(idTaller, datos) {
    await baseDatos.query(
        `UPDATE Pases_Taller.taller
        SET nombre  = :nombre,
            codigo  = :codigo,
            sede_id = :sede_id
        WHERE id_taller = :idTaller`,
        {
            replacements: {
                nombre: datos.nombre,
                codigo: datos.codigo,
                sede_id: datos.sede_id,
                idTaller: idTaller
            }
        }
    );
}

async function cambiarEstadoTaller(idTaller, activo) {
    await baseDatos.query(
        `UPDATE Pases_Taller.taller
        SET activo = :activo
        WHERE id_taller = :idTaller`,
        { replacements: { activo: activo, idTaller: idTaller } }
    );
}

module.exports = {
    obtenerTaller, listarTalleresActivos,
    listarTalleres, existeNombreTaller, existeCodigoTaller, crearTaller, editarTaller, cambiarEstadoTaller
};
