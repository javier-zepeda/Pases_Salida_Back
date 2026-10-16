const { QueryTypes } = require('sequelize');
const baseDatos = require('../config/baseDatos');

// Tipos de pase y sus reglas.
// Las reglas viven en la tabla Pases_Taller.tipo_pase (no en el código):
//   requiere_orden    → el número de orden y el cliente son obligatorios
//   valida_pendientes → se revisan órdenes sin facturar en Integra
//   lleva_detalle     → lleva lista de artículos (suministros)

// Lista los tipos de pase activos (para el formulario y los filtros)
async function listarTiposPase() {
    const tipos = await baseDatos.query(
        `SELECT id_tipo, codigo, nombre, requiere_orden, valida_pendientes, lleva_detalle
         FROM Pases_Taller.tipo_pase
         WHERE activo = 1
         ORDER BY id_tipo`,
        { type: QueryTypes.SELECT }
    );

    return tipos;
}

// Devuelve un tipo de pase por su id, o null si no existe
async function obtenerTipoPase(idTipo) {
    const filas = await baseDatos.query(
        `SELECT id_tipo, codigo, nombre, requiere_orden, valida_pendientes, lleva_detalle, activo
         FROM Pases_Taller.tipo_pase
         WHERE id_tipo = :idTipo`,
        { replacements: { idTipo: idTipo }, type: QueryTypes.SELECT }
    );

    if (filas.length === 0) {
        return null;
    }
    return filas[0];
}

module.exports = { listarTiposPase, obtenerTipoPase };
