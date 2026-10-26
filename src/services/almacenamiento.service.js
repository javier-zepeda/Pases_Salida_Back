const { BlobServiceClient } = require('@azure/storage-blob');

// Guardar y leer archivos en Azure Blob Storage.
//
// Cómo está organizado Azure:
//   Cuenta (portalcodaca) → Contenedor (multimedia) → Archivos ("blobs")
//   Las "carpetas" son solo parte del nombre del archivo: local/pases_salida/66443/20261022-153000_k3j9x2.jpg
// El contenedor es PRIVADO: el navegador no puede abrir los archivos directo.
// El back los descarga y se los entrega al usuario (después de revisar permisos).

let contenedor = null;

// Se conecta la primera vez que se usa (no  al arrancar el servidor)
function obtenerContenedor() {
    if (contenedor !== null) {
        return contenedor;
    }

    const conexion = process.env.AZURE_STORAGE_CONNECTION_STRING;
    const nombreContenedor = process.env.AZURE_STORAGE_CONTAINER;

    if (!conexion || !nombreContenedor) {
        throw new Error('Falta AZURE_STORAGE_CONNECTION_STRING o AZURE_STORAGE_CONTAINER en el .env');
    }

    const cliente = BlobServiceClient.fromConnectionString(conexion);
    contenedor = cliente.getContainerClient(nombreContenedor);
    return contenedor;
}

// Carpeta donde van los archivos de un pase: <ambiente>/pases_salida/<id_pase>
// El ambiente (local, dev, qa, prod) es obligatorio para no mezclar
// archivos de prueba con los de producción.
function carpetaDelPase(idPase) {
    const ambiente = (process.env.AZURE_STORAGE_ENV || '').trim().toLowerCase();

    if (ambiente === '') {
        throw new Error('Falta AZURE_STORAGE_ENV en el .env (local, dev, qa o prod)');
    }

    return ambiente + '/pases_salida/' + idPase;
}

// Sube un archivo. ruta → nombre completo del blob (carpeta + archivo)
async function subirArchivo(ruta, contenido, tipoContenido) {
    const archivo = obtenerContenedor().getBlockBlobClient(ruta);

    await archivo.uploadData(contenido, {
        blobHTTPHeaders: { blobContentType: tipoContenido }
    });
}

// Devuelve { flujo, tipoContenido, tamano } para enviarlo al navegador,
// o null si el archivo no existe en Azure.
async function descargarArchivo(ruta) {
    const archivo = obtenerContenedor().getBlockBlobClient(ruta);

    try {
        const descarga = await archivo.download();
        return {
            flujo: descarga.readableStreamBody,
            tipoContenido: descarga.contentType,
            tamano: descarga.contentLength
        };
    } catch (error) {
        if (error.statusCode === 404) {
            return null;
        }
        throw error;
    }
}

// Borra un archivo (se usa solo para limpiar si falla el guardado en la base)
async function borrarArchivo(ruta) {
    await obtenerContenedor().getBlockBlobClient(ruta).deleteIfExists();
}

module.exports = { carpetaDelPase, subirArchivo, descargarArchivo, borrarArchivo };
