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

// Devolver un pase con todos sus datos, sus adjuntos y su bitacora
async function obtenerPasePorId(idPase) {
    const filas = await baseDatos.query(
        `SELECT p.id_pase,
            p.numero_orden,
            p.origen_orden,
            p.codigo_cliente,
            p.cliente,
            p.tipo_vehiculo,
            p.marca,
            p.placa,
            p.chasis,
            p.piloto,
            p.supervisor,
            p.observaciones,
            p.facturar_orden,
            p.taller_id,
            t.nombre AS taller,
            p.estado_id,
            e.nombre AS estado,
            p.creado_por_nombre,
            CONVERT(VARCHAR(19), p.fecha_creacion, 126)     AS fecha_creacion,
            p.autorizado_por_nombre,
            CONVERT(VARCHAR(19), p.fecha_autorizacion, 126) AS fecha_autorizacion,
            p.anulado_por_nombre,
            CONVERT(VARCHAR(19), p.fecha_anulacion, 126)    AS fecha_anulacion,
            p.motivo_anulacion
        FROM Pases_Taller.pase_salida p
        LEFT JOIN Pases_Taller.taller t ON t.id_taller = p.taller_id
        JOIN Pases_Taller.estado_pase e ON e.id_estado = p.estado_id
        WHERE p.id_pase = :idPase`,
        { replacements: { idPase: idPase }, type: QueryTypes.SELECT }
    );

    if (filas.length === 0) {
        return null;
    }

    const pase = filas[0];
    pase.adjuntos = await buscarAdjuntos(idPase);
    pase.bitacora = await buscarBitacora(idPase);

    return pase;
}

// Adjuntos activos del pase
async function buscarAdjuntos(idPase) {
    const adjuntos = await baseDatos.query(
        `SELECT id_adjunto,
            nombre_archivo,
            ruta,
            content_type,
            CONVERT(VARCHAR(19), fecha_subida, 126) AS fecha_subida
        FROM Pases_Taller.pase_adjunto
        WHERE pase_id = :idPase
        AND activo = 1
        ORDER BY fecha_subida`,
        { replacements: { idPase: idPase }, type: QueryTypes.SELECT }
    );

    return adjuntos;
}

// Historial de acciones sobre el pase
async function buscarBitacora(idPase) {
    const registros = await baseDatos.query(
        `SELECT accion,
            usuario_nombre,
            detalle,
            CONVERT(VARCHAR(19), fecha, 126) AS fecha
        FROM Pases_Taller.pase_bitacora
        WHERE pase_id = :idPase
        ORDER BY fecha, id_bitacora`,
        { replacements: { idPase: idPase }, type: QueryTypes.SELECT }
    );

    return registros;
}

module.exports = { listarPases, obtenerPasePorId };
