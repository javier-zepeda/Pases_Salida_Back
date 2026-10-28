const { QueryTypes } = require('sequelize');
const baseDatos = require('../config/baseDatos');

// Números de las tarjetas de la página de Inicio, en una sola consulta.
// talleres → [1, 2] para contar solo los pases de esos talleres | null para contar todos
// (sedes y talleres activos se cuentan siempre completos: son catálogos)
async function obtenerResumen(talleres) {
    // 1 = 1 es una condición que siempre se cumple: así la consulta es la misma con o sin filtro
    let condicionTalleres = '1 = 1';
    const parametros = {};

    if (talleres !== null) {
        condicionTalleres = 'p.taller_id IN (:talleres)';
        parametros.talleres = talleres;
    }

    const filas = await baseDatos.query(
        `SELECT
            (SELECT COUNT(*)
             FROM Pases_Taller.pase_salida p
             WHERE ${condicionTalleres}) AS pases,
            (SELECT COUNT(*)
             FROM Pases_Taller.pase_salida p
             WHERE ${condicionTalleres}
             AND p.estado_id = 0) AS por_autorizar,
            (SELECT COUNT(*) FROM Pases_Taller.sede WHERE activo = 1) AS sedes,
            (SELECT COUNT(*) FROM Pases_Taller.taller WHERE activo = 1) AS talleres`,
        { replacements: parametros, type: QueryTypes.SELECT }
    );

    return filas[0];
}

module.exports = { obtenerResumen };
