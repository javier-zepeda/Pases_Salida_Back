const { QueryTypes } = require('sequelize');
const baseDatos = require('../config/baseDatos');

// Devuelve un taller por su id, o null si no existe
async function obtenerTaller(idTaller) {
    const filas = await baseDatos.query(
        `SELECT id_taller, nombre, sede_id, activo
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

module.exports = { obtenerTaller, listarTalleresActivos };