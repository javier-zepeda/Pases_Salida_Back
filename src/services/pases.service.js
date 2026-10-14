const { QueryTypes } = require('sequelize');
const baseDatos = require('../config/baseDatos');

// Lista pases de salida con filtros
async function listarPases(filtros){
    const condiciones = [];
    const parametros = {};

    if (filtros.talleres !== null){
        condiciones.push('p.taller_id IN (:talleres)');
        parametros.talleres = filtros.talleres;
    }

    if(filtros.estado !== null){
        condiciones.push('p.estado_id = :estado');
        parametros.estado = filtros.estado;
    }

    if (filtros.busqueda !== '') {
        condiciones.push('(p.numero_orden LIKE :busqueda OR p.placa LIKE :busqueda OR p.cliente LIKE :busqueda)');
        parametros.busqueda = '%' + filtros.busqueda + '%';
    }

    let where = '';
    if (condiciones.length > 0) {
        where = 'WHERE ' + condiciones.join(' AND ');
    }

    // 1. Total de pases que cumplen los filtros (para saber cuántas páginas hay)
    const resultadoTotal = await baseDatos.query(
        `SELECT COUNT(*) AS total
        FROM Pases_Taller.pase_salida p
        ${where}`,
        { replacements: parametros, type: QueryTypes.SELECT }
    );
    const total = resultadoTotal[0].total;

    // 2. Solo los pases de la página pedida
    parametros.saltar = (filtros.pagina - 1) * filtros.tamanoPagina;
    parametros.tomar = filtros.tamanoPagina;

    const pases = await baseDatos.query(
        `SELECT p.id_pase,
                p.numero_orden,
                p.cliente,
                p.tipo_vehiculo,
                p.marca,
                p.placa,
                t.nombre AS taller,
                p.estado_id,
                e.nombre AS estado,
                p.creado_por_nombre,
                CONVERT(VARCHAR(19), p.fecha_creacion, 126)     AS fecha_creacion,
                p.autorizado_por_nombre,
                CONVERT(VARCHAR(19), p.fecha_autorizacion, 126) AS fecha_autorizacion
        FROM Pases_Taller.pase_salida p
        LEFT JOIN Pases_Taller.taller t ON t.id_taller = p.taller_id
        JOIN Pases_Taller.estado_pase e ON e.id_estado = p.estado_id
        ${where}
        ORDER BY p.id_pase DESC
        OFFSET :saltar ROWS FETCH NEXT :tomar ROWS ONLY`,
        { replacements: parametros, type: QueryTypes.SELECT }
    );

    return { total: total, pases: pases };
}

module.exports = { listarPases };
