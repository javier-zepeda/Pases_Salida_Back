const { listarTiposPase } = require('../services/tipos.service');
const { listarTalleresActivos } = require('../services/talleres.service');
const { obtenerTalleresPermitidos } = require('../helpers/alcance.helper');

// GET /api/catalogos/tipos-pase
// Tipos de pase activos con sus reglas. El front los usa para el selector
// del formulario y para saber qué campos mostrar según el tipo.
async function obtenerTiposPase(req, res) {
  try {
    const tipos = await listarTiposPase();
    res.json(tipos);
  } catch (error) {
    console.error('Error al listar tipos de pase:', error.message);
    res.status(500).json({ mensaje: 'Error al obtener los tipos de pase' });
  }
}

// GET /api/catalogos/talleres
// Talleres activos que el usuario puede usar: todos si tiene 'pases.ver_todos',
// o solo los que tiene asignados.
async function obtenerMisTalleres(req, res) {
  try {
    const talleresPermitidos = obtenerTalleresPermitidos(req.usuario);

    if (talleresPermitidos !== null && talleresPermitidos.length === 0) {
      return res.json([]);
    }

    const talleres = await listarTalleresActivos(talleresPermitidos);
    res.json(talleres);
  } catch (error) {
    console.error('Error al listar talleres:', error.message);
    res.status(500).json({ mensaje: 'Error al obtener los talleres' });
  }
}

// GET /api/catalogos/talleres-destino
// TODOS los talleres activos (no solo los del usuario): en un traslado la
// unidad se envía a otro taller, que normalmente no es uno de los suyos.
async function obtenerTalleresDestino(req, res) {
  try {
    const talleres = await listarTalleresActivos(null);
    res.json(talleres);
  } catch (error) {
    console.error('Error al listar talleres de destino:', error.message);
    res.status(500).json({ mensaje: 'Error al obtener los talleres' });
  }
}

module.exports = { obtenerTiposPase, obtenerMisTalleres, obtenerTalleresDestino };
