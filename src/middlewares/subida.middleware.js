const multer = require('multer');

// Recibe las imágenes que se adjuntan a un pase (formulario multipart, campo "imagenes"). Los archivos quedan en memoria (req.files), no en disco.

const TAMANO_MAXIMO_MB = 2;
const MAXIMO_ARCHIVOS_POR_ENVIO = 10;

// Tipo que manda el navegador y extensión con la que se guarda
const TIPOS_PERMITIDOS = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp'
};

const subida = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: TAMANO_MAXIMO_MB * 1024 * 1024,
    files: MAXIMO_ARCHIVOS_POR_ENVIO
  },
  fileFilter: function (req, archivo, aceptar) {
    if (TIPOS_PERMITIDOS[archivo.mimetype]) {
      aceptar(null, true);
    } else {
      const error = new Error('Solo se permiten imágenes JPG, PNG o WEBP: ' + archivo.originalname);
      error.code = 'TIPO_NO_PERMITIDO';
      aceptar(error);
    }
  }
}).array('imagenes', MAXIMO_ARCHIVOS_POR_ENVIO);

function recibirImagenes(req, res, next) {
  subida(req, res, function (error) {
    if (error) {
      return res.status(400).json({ mensaje: mensajeDeError(error) });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ mensaje: 'Debe seleccionar al menos una imagen' });
    }

    // El tipo lo dice el navegador y se puede falsificar: se revisan
    // los primeros bytes del archivo para confirmar que sí es una imagen.
    for (const archivo of req.files) {
      if (!esImagenReal(archivo.buffer, archivo.mimetype)) {
        return res.status(400).json({ mensaje: 'El archivo ' + archivo.originalname + ' no es una imagen válida' });
      }
      archivo.extension = TIPOS_PERMITIDOS[archivo.mimetype];
    }

    next();
  });
}

function mensajeDeError(error) {
  if (error.code === 'LIMIT_FILE_SIZE') {
    return 'Cada imagen puede pesar máximo ' + TAMANO_MAXIMO_MB + ' MB';
  }
  if (error.code === 'LIMIT_FILE_COUNT' || error.code === 'LIMIT_UNEXPECTED_FILE') {
    return 'Puede subir máximo ' + MAXIMO_ARCHIVOS_POR_ENVIO + ' imágenes a la vez';
  }
  if (error.code === 'TIPO_NO_PERMITIDO') {
    return error.message;
  }
  return 'No se pudieron recibir las imágenes';
}

// "Firma" de cada formato: los primeros bytes siempre son los mismos
function esImagenReal(contenido, tipo) {
  if (tipo === 'image/jpeg') {
    return contenido.length > 3 && contenido[0] === 0xFF && contenido[1] === 0xD8 && contenido[2] === 0xFF;
  }
  if (tipo === 'image/png') {
    return contenido.length > 8 && contenido.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]));
  }
  if (tipo === 'image/webp') {
    return contenido.length > 12 &&
      contenido.toString('ascii', 0, 4) === 'RIFF' &&
      contenido.toString('ascii', 8, 12) === 'WEBP';
  }
  return false;
}

module.exports = { recibirImagenes, MAXIMO_ARCHIVOS_POR_ENVIO, TAMANO_MAXIMO_MB };
