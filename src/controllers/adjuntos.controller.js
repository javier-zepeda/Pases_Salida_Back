const {MAXIMO_ADJUNTOS_POR_PASE, contarAdjuntosActivos, obtenerAdjunto, esDelSistemaAnterior, guardarAdjuntos, quitarAdjunto
} = require('../services/adjuntos.service');
const { descargarArchivo } = require('../services/almacenamiento.service');
const { revisarSiPuedeModificar } = require('../helpers/edicion.helper');

// Imágenes adjuntas a un pase en todas las rutas, el middleware cargarPase ya dejó el pase en req.pase

// POST /api/pases/:id/adjuntos   (multipart, campo "imagenes")
// Mismas reglas que editar el pase.
async function subirAdjuntos(req, res) {
  try {
    const pase = req.pase;
    const impedimento = revisarSiPuedeModificar(req.usuario, pase);

    if (impedimento !== null) {
      return res.status(impedimento.estado).json({ mensaje: impedimento.mensaje });
    }

    const activos = await contarAdjuntosActivos(pase.id_pase);

    if (activos + req.files.length > MAXIMO_ADJUNTOS_POR_PASE) {
      return res.status(400).json({
        mensaje: 'Un pase puede tener máximo ' + MAXIMO_ADJUNTOS_POR_PASE + ' imágenes (ya tiene ' + activos + ')'
      });
    }

    const cantidad = await guardarAdjuntos(pase.id_pase, req.files, req.usuario);

    let mensaje = 'Se adjuntaron ' + cantidad + ' imágenes';
    if (cantidad === 1) {
      mensaje = 'Se adjuntó la imagen';
    }
    res.status(201).json({ mensaje: mensaje });
  } catch (error) {
    console.error('Error al subir adjuntos:', error.message);
    res.status(500).json({ mensaje: 'No se pudieron guardar las imágenes. Intente de nuevo.' });
  }
}

// GET /api/pases/:id/adjuntos/:idAdjunto  → la imagen
// El back la descarga de Azure y la pasa tal cual al navegador.
async function verAdjunto(req, res) {
  try {
    const adjunto = await buscarAdjuntoDeLaUrl(req, res);
    if (adjunto === null) {
      return;
    }

    if (esDelSistemaAnterior(adjunto)) {
      return res.status(404).json({ mensaje: 'Esta imagen es del sistema anterior y no se migró' });
    }

    const archivo = await descargarArchivo(adjunto.ruta);

    if (archivo === null) {
      return res.status(404).json({ mensaje: 'La imagen no se encontró en el almacenamiento' });
    }

    if (archivo.tamano) {
      res.set('Content-Length', String(archivo.tamano));
    }
    res.set({
      'Content-Type': adjunto.content_type,
      'Content-Disposition': 'inline',
      'Cache-Control': 'private, max-age=3600',
      // Que el navegador respete el tipo y no intente "adivinarlo"
      'X-Content-Type-Options': 'nosniff'
    });
    archivo.flujo.pipe(res);
  } catch (error) {
    console.error('Error al descargar el adjunto:', error.message);
    res.status(500).json({ mensaje: 'No se pudo obtener la imagen' });
  }
}

// DELETE /api/pases/:id/adjuntos/:idAdjunto  → quita la imagen del pase
async function eliminarAdjunto(req, res) {
  try {
    const impedimento = revisarSiPuedeModificar(req.usuario, req.pase);

    if (impedimento !== null) {
      return res.status(impedimento.estado).json({ mensaje: impedimento.mensaje });
    }

    const adjunto = await buscarAdjuntoDeLaUrl(req, res);
    if (adjunto === null) {
      return;
    }

    await quitarAdjunto(adjunto, req.usuario);
    res.json({ mensaje: 'Imagen quitada del pase' });
  } catch (error) {
    console.error('Error al quitar el adjunto:', error.message);
    res.status(500).json({ mensaje: 'No se pudo quitar la imagen' });
  }
}

// Lee :idAdjunto de la URL y busca el adjunto en el pase.
// Si no es válido o no existe, responde el error y devuelve null.
async function buscarAdjuntoDeLaUrl(req, res) {
  const idAdjunto = Number(req.params.idAdjunto);

  if (!Number.isInteger(idAdjunto) || idAdjunto < 1) {
    res.status(400).json({ mensaje: 'El número de imagen no es válido' });
    return null;
  }

  const adjunto = await obtenerAdjunto(req.pase.id_pase, idAdjunto);

  if (adjunto === null) {
    res.status(404).json({ mensaje: 'La imagen no existe en este pase' });
    return null;
  }
  return adjunto;
}

module.exports = { subirAdjuntos, verAdjunto, eliminarAdjunto };
