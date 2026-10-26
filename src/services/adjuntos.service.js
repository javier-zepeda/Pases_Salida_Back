const { QueryTypes } = require('sequelize');
const baseDatos = require('../config/baseDatos');
const { registrarEnBitacora } = require('./pases.service');
const { carpetaDelPase, subirArchivo, borrarArchivo } = require('./almacenamiento.service');

// Máximo de imágenes activas por pase
const MAXIMO_ADJUNTOS_POR_PASE = 10;

// Los adjuntos migrados del sistema anterior guardan la ruta del servidor PHP (views/img/exit_passes/...). Esas imágenes NO se subieron a Azure.
const PREFIJO_SISTEMA_ANTERIOR = 'views/';

// Cuántas imágenes activas tiene el pase
async function contarAdjuntosActivos(idPase) {
    const filas = await baseDatos.query(
        `SELECT COUNT(*) AS total
        FROM Pases_Taller.pase_adjunto
        WHERE pase_id = :idPase
        AND activo = 1`,
        { replacements: { idPase: idPase }, type: QueryTypes.SELECT }
    );
    return filas[0].total;
}

// Un adjunto activo de un pase (con su ruta en Azure), o null
async function obtenerAdjunto(idPase, idAdjunto) {
    const filas = await baseDatos.query(
        `SELECT id_adjunto, pase_id, ruta, nombre_archivo, content_type
        FROM Pases_Taller.pase_adjunto
        WHERE id_adjunto = :idAdjunto
        AND pase_id = :idPase
        AND activo = 1`,
        { replacements: { idPase: idPase, idAdjunto: idAdjunto }, type: QueryTypes.SELECT }
    );

    if (filas.length === 0) {
        return null;
    }
    return filas[0];
}

function esDelSistemaAnterior(adjunto) {
    return adjunto.ruta.startsWith(PREFIJO_SISTEMA_ANTERIOR);
}

// Sube las imágenes a Azure y las registra en la base de datos.
//
// archivos → req.files (de subida.middleware.js)
//
// Primero se suben todas a Azure; después se guardan en la base en una sola
// transacción. Si la base falla, se borran de Azure las que se subieron,
// para no dejar archivos sueltos.
async function guardarAdjuntos(idPase, archivos, usuario) {
    const carpeta = carpetaDelPase(idPase);
    const subidos = [];

    try {
        for (const archivo of archivos) {
            const ruta = carpeta + '/' + nombreUnico() + archivo.extension;
            await subirArchivo(ruta, archivo.buffer, archivo.mimetype);
            subidos.push({
                ruta: ruta,
                nombre_archivo: recortar(archivo.originalname, 255),
                content_type: archivo.mimetype,
                tamano_bytes: archivo.size
            });
        }

        await baseDatos.transaction(async (transaccion) => {
            for (const adjunto of subidos) {
                await baseDatos.query(
                    `INSERT INTO Pases_Taller.pase_adjunto
                        (pase_id, ruta, nombre_archivo, content_type, tamano_bytes, subido_por_id)
                    VALUES (:pase_id, :ruta, :nombre_archivo, :content_type, :tamano_bytes, :usuario_id)`,
                    {
                        replacements: { pase_id: idPase, ...adjunto, usuario_id: usuario.id },
                        transaction: transaccion
                    }
                );
            }

            await registrarEnBitacora(transaccion, idPase, 'ADJUNTAR', usuario, {
                archivos: subidos.map((adjunto) => adjunto.nombre_archivo)
            });
        });
    } catch (error) {
        for (const adjunto of subidos) {
            await borrarArchivo(adjunto.ruta).catch(() => {});
        }
        throw error;
    }

    return subidos.length;
}

// Quita una imagen del pase. No se borra de Azure ni de la tabla:
// queda inactiva (activo = 0) para no perder el respaldo.
async function quitarAdjunto(adjunto, usuario) {
    await baseDatos.transaction(async (transaccion) => {
        await baseDatos.query(
            `UPDATE Pases_Taller.pase_adjunto
            SET activo = 0
            WHERE id_adjunto = :idAdjunto`,
            { replacements: { idAdjunto: adjunto.id_adjunto }, transaction: transaccion }
        );

        await registrarEnBitacora(transaccion, adjunto.pase_id, 'QUITAR_ADJUNTO', usuario, {
            archivo: adjunto.nombre_archivo
        });
    });
}

// Ej. "20261022-153000_k3j9x2" (fecha y hora + letras al azar)
function nombreUnico() {
    const fecha = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
    const azar = Math.random().toString(36).slice(2, 8);
    return fecha + '_' + azar;
}

function recortar(texto, largoMaximo) {
    if (!texto) {
        return null;
    }
    return texto.slice(0, largoMaximo);
}

module.exports = {
    MAXIMO_ADJUNTOS_POR_PASE,
    contarAdjuntosActivos,
    obtenerAdjunto,
    esDelSistemaAnterior,
    guardarAdjuntos,
    quitarAdjunto
};
