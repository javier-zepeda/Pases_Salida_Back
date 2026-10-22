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

    if (filtros.tipo !== null) {
        condiciones.push('p.tipo_pase_id = :tipo');
        parametros.tipo = filtros.tipo;
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
                p.tipo_pase_id,
                tp.nombre AS tipo_pase,
                p.numero_orden,
                p.cliente,
                p.tipo_vehiculo,
                p.marca,
                p.placa,
                p.piloto,
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
        JOIN Pases_Taller.tipo_pase tp ON tp.id_tipo = p.tipo_pase_id
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
            p.tipo_pase_id,
            tp.codigo AS tipo_pase_codigo,
            tp.nombre AS tipo_pase,
            tp.requiere_orden,
            tp.valida_pendientes,
            tp.lleva_detalle,
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
        JOIN Pases_Taller.tipo_pase tp ON tp.id_tipo = p.tipo_pase_id
        WHERE p.id_pase = :idPase`,
        { replacements: { idPase: idPase }, type: QueryTypes.SELECT }
    );

    if (filas.length === 0) {
        return null;
    }

    const pase = filas[0];
    pase.detalle = await buscarDetalleSuministros(idPase);
    pase.adjuntos = await buscarAdjuntos(idPase);
    pase.bitacora = await buscarBitacora(idPase);

    return pase;
}

// Artículos del pase (solo los pases de suministros tienen detalle)
async function buscarDetalleSuministros(idPase) {
    const lineas = await baseDatos.query(
        `SELECT linea,
            descripcion,
            cantidad,
            unidad
        FROM Pases_Taller.pase_suministro_detalle
        WHERE pase_id = :idPase
        ORDER BY linea`,
        { replacements: { idPase: idPase }, type: QueryTypes.SELECT }
    );

    // DECIMAL llega como texto ('5.00'): se convierte a número
    for (const linea of lineas) {
        linea.cantidad = Number(linea.cantidad);
    }

    return lineas;
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

// Crea un pase de salida, su detalle de artículos (si lleva) y su primer
// registro en la bitácora. Todo va en una transacción: se guarda todo o nada.
//
// datos            → lo que devolvió validarDatosPase, más origen_orden
//                    ('INTEGRA', 'MANUAL' o null si el pase no lleva orden)
// usuario           → req.usuario (quién lo crea)
// autorizarAlCrear  → true si el pase queda autorizado de una vez
// ordenesPendientes → órdenes sin facturar que se le mostraron al usuario
//                     (quedan en la bitácora como constancia)
async function crearPase(datos, usuario, autorizarAlCrear, ordenesPendientes) {
    // Estado inicial: 0 Creado, o 1 Autorizado si aplica la regla del cajero
    let estadoInicial = 0;
    let autorizadoPorId = null;
    let autorizadoPorNombre = null;

    if (autorizarAlCrear) {
        estadoInicial = 1;
        autorizadoPorId = usuario.id;
        autorizadoPorNombre = usuario.nombre;
    }

    const resultado = await baseDatos.transaction(async (transaccion) => {
        // 1. Insertar el pase. OUTPUT devuelve el número que le asignó SQL Server.
        const filas = await baseDatos.query(
            `INSERT INTO Pases_Taller.pase_salida (
                tipo_pase_id, numero_orden, origen_orden, codigo_cliente, cliente, tipo_vehiculo,
                marca, placa, chasis, piloto, supervisor, observaciones,
                facturar_orden, taller_id, estado_id,
                creado_por_id, creado_por_nombre,
                autorizado_por_id, autorizado_por_nombre, fecha_autorizacion)
            OUTPUT INSERTED.id_pase
            VALUES (
                :tipo_pase_id, :numero_orden, :origen_orden, :codigo_cliente, :cliente, :tipo_vehiculo,
                :marca, :placa, :chasis, :piloto, :supervisor, :observaciones,
                :facturar_orden, :taller_id, :estado_id,
                :creado_por_id, :creado_por_nombre,
                :autorizado_por_id, :autorizado_por_nombre,
                CASE WHEN :estado_id = 1 THEN SYSDATETIME() ELSE NULL END)`,
            {
                replacements: {
                tipo_pase_id: datos.tipo_pase_id,
                numero_orden: datos.numero_orden,
                origen_orden: datos.origen_orden,
                codigo_cliente: datos.codigo_cliente,
                cliente: datos.cliente,
                tipo_vehiculo: datos.tipo_vehiculo,
                marca: datos.marca,
                placa: datos.placa,
                chasis: datos.chasis,
                piloto: datos.piloto,
                supervisor: datos.supervisor,
                observaciones: datos.observaciones,
                facturar_orden: datos.facturar_orden,
                taller_id: datos.taller_id,
                estado_id: estadoInicial,
                creado_por_id: usuario.id,
                creado_por_nombre: usuario.nombre,
                autorizado_por_id: autorizadoPorId,
                autorizado_por_nombre: autorizadoPorNombre
            },
            type: QueryTypes.SELECT,
            transaction: transaccion
            }
        );

        const idPase = filas[0].id_pase;

        // 2. Detalle de artículos (solo suministros; en los demás la lista viene vacía)
        await guardarDetalleSuministros(transaccion, idPase, datos.detalle);

        // 3. Registrar en la bitácora quién lo creó
        await registrarEnBitacora(transaccion, idPase, 'CREAR', usuario, {
            estado_inicial: estadoInicial,
            autorizado_al_crear: autorizarAlCrear,
            ordenes_pendientes: ordenesPendientes
        });

        return { id_pase: idPase, estado_id: estadoInicial };

    });

    return resultado;
}

// Campos que se pueden modificar al editar.
// numero_orden y taller_id NO se editan (igual que en el sistema anterior).
const CAMPOS_EDITABLES = [
    'codigo_cliente',
    'cliente',
    'tipo_vehiculo',
    'marca',
    'placa',
    'chasis',
    'piloto',
    'supervisor',
    'observaciones',
    'facturar_orden'
];

// Edita un pase y registra en la bitácora qué campos cambiaron.
// Devuelve un objeto con los cambios: { placa: { antes: 'A', despues: 'B' }, ... }
// Si no cambió nada, devuelve un objeto vacío y no toca la base de datos.
// El UPDATE solo modifica el pase si TODAVÍA tiene el estado con el que se cargó.
async function editarPase(paseActual, datosNuevos, usuario) {
    // 1. Comparar campo por campo
    const cambios = {};

    for (const campo of CAMPOS_EDITABLES) {
        const valorAntes = paseActual[campo];
        const valorDespues = datosNuevos[campo];

        if (valorAntes !== valorDespues) {
            cambios[campo] = { antes: valorAntes, despues: valorDespues };
        }
    }

    // El detalle de artículos (suministros) se compara como texto JSON:
    // si cambió cualquier línea, se reemplaza la lista completa.
    const detalleAntes = JSON.stringify(paseActual.detalle);
    const detalleDespues = JSON.stringify(datosNuevos.detalle);
    const cambioElDetalle = detalleAntes !== detalleDespues;

    if (cambioElDetalle) {
        cambios.detalle = { antes: paseActual.detalle, despues: datosNuevos.detalle };
    }

    // 2. Si no cambió nada, no hay nada que guardar
    if (Object.keys(cambios).length === 0) {
        return cambios;
    }

    // 3. Guardar el pase y su bitácora juntos
    const guardado = await baseDatos.transaction(async (transaccion) => {

        const filas = await baseDatos.query(
            `UPDATE Pases_Taller.pase_salida
            SET codigo_cliente     = :codigo_cliente,
                cliente            = :cliente,
                tipo_vehiculo      = :tipo_vehiculo,
                marca              = :marca,
                placa              = :placa,
                chasis             = :chasis,
                piloto             = :piloto,
                supervisor         = :supervisor,
                observaciones      = :observaciones,
                facturar_orden     = :facturar_orden,
                modificado_por_id  = :usuario_id,
                fecha_modificacion = SYSDATETIME()
            OUTPUT INSERTED.id_pase
            WHERE id_pase = :id_pase
              AND estado_id = :estado_al_cargar`,
        {
            replacements: {
                codigo_cliente: datosNuevos.codigo_cliente,
                cliente: datosNuevos.cliente,
                tipo_vehiculo: datosNuevos.tipo_vehiculo,
                marca: datosNuevos.marca,
                placa: datosNuevos.placa,
                chasis: datosNuevos.chasis,
                piloto: datosNuevos.piloto,
                supervisor: datosNuevos.supervisor,
                observaciones: datosNuevos.observaciones,
                facturar_orden: datosNuevos.facturar_orden,
                usuario_id: usuario.id,
                id_pase: paseActual.id_pase,
                estado_al_cargar: paseActual.estado_id
            },
            type: QueryTypes.SELECT,
            transaction: transaccion
        });

        // Ninguna fila modificada: el pase cambió de estado mientras se editaba
        if (filas.length === 0) {
            return false;
        }

        if (cambioElDetalle) {
            await borrarDetalleSuministros(transaccion, paseActual.id_pase);
            await guardarDetalleSuministros(transaccion, paseActual.id_pase, datosNuevos.detalle);
        }

        await registrarEnBitacora(transaccion, paseActual.id_pase, 'EDITAR', usuario, {
            cambios: cambios
        });
        return true;
    });

    if (!guardado) {
        return null;
    }
    return cambios;
}

// Cambia un pase de Creado (0) a Autorizado (1) y lo registra en la bitácora.
//
// El UPDATE solo modifica el pase si TODAVÍA está en estado 0. Si otro
// usuario lo autorizó o lo anuló un instante antes, no cambia nada y
// devuelve false; así dos personas no pueden autorizar el mismo pase.
//
// detalleBitacora → datos de la validación con Integra que se guardan en la bitácora
async function autorizarPase(idPase, usuario, detalleBitacora) {
    const autorizado = await baseDatos.transaction(async (transaccion) => {
        const filas = await baseDatos.query(
            `UPDATE Pases_Taller.pase_salida
             SET estado_id             = 1,
                 autorizado_por_id     = :usuario_id,
                 autorizado_por_nombre = :usuario_nombre,
                 fecha_autorizacion    = SYSDATETIME()
             OUTPUT INSERTED.id_pase
             WHERE id_pase = :id_pase
               AND estado_id = 0`,
            {
                replacements: {
                    usuario_id: usuario.id,
                    usuario_nombre: usuario.nombre,
                    id_pase: idPase
                },
                type: QueryTypes.SELECT,
                transaction: transaccion
            }
        );

        // Ninguna fila modificada: el pase ya no estaba en estado Creado
        if (filas.length === 0) {
            return false;
        }

        await registrarEnBitacora(transaccion, idPase, 'AUTORIZAR', usuario, detalleBitacora);
        return true;
    });

    return autorizado;
}

// Anula un pase (estado 2) guardando quién, cuándo y por qué.
//
// estadoAnterior → el estado que tenía el pase al cargarlo (0 o 1).
// Igual que al autorizar, si el estado cambió mientras tanto no se
// modifica nada y devuelve false.
async function anularPase(idPase, usuario, motivo, estadoAnterior) {
    const anulado = await baseDatos.transaction(async (transaccion) => {
        const filas = await baseDatos.query(
            `UPDATE Pases_Taller.pase_salida
             SET estado_id          = 2,
                 anulado_por_id     = :usuario_id,
                 anulado_por_nombre = :usuario_nombre,
                 fecha_anulacion    = SYSDATETIME(),
                 motivo_anulacion   = :motivo
             OUTPUT INSERTED.id_pase
             WHERE id_pase = :id_pase
               AND estado_id = :estado_anterior`,
            {
                replacements: {
                    usuario_id: usuario.id,
                    usuario_nombre: usuario.nombre,
                    motivo: motivo,
                    id_pase: idPase,
                    estado_anterior: estadoAnterior
                },
                type: QueryTypes.SELECT,
                transaction: transaccion
            }
        );

        if (filas.length === 0) {
            return false;
        }

        await registrarEnBitacora(transaccion, idPase, 'ANULAR', usuario, {
            motivo: motivo,
            estado_anterior: estadoAnterior
        });
        return true;
    });

    return anulado;
}

// Inserta las líneas del detalle de suministros.
// Se usa dentro de las transacciones de crear y editar.
// detalle → lista de { linea, descripcion, cantidad, unidad } (puede venir vacía)
async function guardarDetalleSuministros(transaccion, idPase, detalle) {
    for (const linea of detalle) {
        await baseDatos.query(
            `INSERT INTO Pases_Taller.pase_suministro_detalle (pase_id, linea, descripcion, cantidad, unidad)
             VALUES (:pase_id, :linea, :descripcion, :cantidad, :unidad)`,
            {
                replacements: {
                    pase_id: idPase,
                    linea: linea.linea,
                    descripcion: linea.descripcion,
                    cantidad: linea.cantidad,
                    unidad: linea.unidad
                },
                transaction: transaccion
            }
        );
    }
}

// Borra todas las líneas del detalle de un pase (para reemplazarlas al editar)
async function borrarDetalleSuministros(transaccion, idPase) {
    await baseDatos.query(
        `DELETE FROM Pases_Taller.pase_suministro_detalle WHERE pase_id = :pase_id`,
        { replacements: { pase_id: idPase }, transaction: transaccion }
    );
}

// Inserta un registro en la bitácora del pase.
// Se usa dentro de las transacciones de crear, editar, autorizar y anular,
// por eso recibe la transacción: si algo falla, el registro también se deshace.
//
// accion  → 'CREAR', 'EDITAR', 'AUTORIZAR', 'ANULAR', ...
// detalle → objeto con información adicional; se guarda como JSON
async function registrarEnBitacora(transaccion, idPase, accion, usuario, detalle) {
    await baseDatos.query(
        `INSERT INTO Pases_Taller.pase_bitacora (pase_id, accion, usuario_id, usuario_nombre, detalle)
         VALUES (:pase_id, :accion, :usuario_id, :usuario_nombre, :detalle)`,
        {
            replacements: {
                pase_id: idPase,
                accion: accion,
                usuario_id: usuario.id,
                usuario_nombre: usuario.nombre,
                detalle: JSON.stringify(detalle)
            },
            transaction: transaccion
        }
    );
}

module.exports = {
    listarPases,
    obtenerPasePorId,
    crearPase,
    editarPase,
    autorizarPase,
    anularPase
};
