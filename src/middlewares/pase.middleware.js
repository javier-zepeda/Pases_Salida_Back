const { obtenerPasePorId } = require('../services/pases.service');
const { puedeVerTaller } = require('../helpers/alcance.helper');

// Carga el pase indicado en la URL (/api/pases/:id) y lo deja en req.pase.
// Corta la petición si el número no es válido, si el pase no existe o si es de un taller que el usuario no tiene asignado.
// Va siempre después de autenticar (necesita req.usuario).
async function cargarPase(req, res, next) {
  try {
    const idPase = Number(req.params.id);

    if (!Number.isInteger(idPase) || idPase < 1) {
      return res.status(400).json({ mensaje: 'El número de pase no es válido' });
    }

    const pase = await obtenerPasePorId(idPase);

    if (pase === null) {
      return res.status(404).json({ mensaje: 'El pase de salida no existe' });
    }

    if (!puedeVerTaller(req.usuario, pase.taller_id)) {
      return res.status(403).json({ mensaje: 'Este pase pertenece a un taller que no tiene asignado' });
    }

    req.pase = pase;
    next();
  } catch (error) {
    console.error('Error al cargar el pase:', error.message);
    res.status(500).json({ mensaje: 'Error al obtener el pase de salida' });
  }
}

module.exports = { cargarPase };