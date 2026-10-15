const { listarPases, obtenerPasePorId } = require('../services/pases.service');

const TAMANO_PAGINA_POR_DEFECTO = 20;
const TAMANO_PAGINA_MAXIMO = 100;
const ESTADOS_VALIDOS = [0, 1, 2]; // 0 Creado, 1 Autorizado, 2 Anulado
    
const { obtenerTalleresPermitidos, puedeVerTaller } = require('../helpers/alcance.helper');

// GET /api/pases?pagina=1&tamanoPagina=20&estado=0&busqueda=P123ABC
async function obtenerPases(req, res) {
  try {
    // --- Paginación ---
    const pagina = leerNumeroPositivo(req.query.pagina, 1);

    let tamanoPagina = leerNumeroPositivo(req.query.tamanoPagina, TAMANO_PAGINA_POR_DEFECTO);
    if (tamanoPagina > TAMANO_PAGINA_MAXIMO) {
      tamanoPagina = TAMANO_PAGINA_MAXIMO;
    }

    // --- Filtro por estado (opcional) ---
    let estado = null;
    if (req.query.estado !== undefined && req.query.estado !== '') {
      estado = parseInt(req.query.estado, 10);

      if (!ESTADOS_VALIDOS.includes(estado)) {
        return res.status(400).json({ mensaje: 'El estado debe ser 0 (Creado), 1 (Autorizado) o 2 (Anulado)' });
      }
    }

    // --- Búsqueda (opcional) ---
    let busqueda = '';
    if (typeof req.query.busqueda === 'string') {
      busqueda = req.query.busqueda.trim();
    }

    // --- Talleres puede ver el usuario ---  
    const talleres = obtenerTalleresPermitidos(req.usuario);

    // Sin talleres asignados no puede ver ningún pase
    if (talleres !== null && talleres.length === 0) {
      return res.json({ pases: [], total: 0, pagina: pagina, tamanoPagina: tamanoPagina });
    }

    const resultado = await listarPases({
      talleres: talleres,
      estado: estado,
      busqueda: busqueda,
      pagina: pagina,
      tamanoPagina: tamanoPagina
    });

    res.json({
      pases: resultado.pases,
      total: resultado.total,
      pagina: pagina,
      tamanoPagina: tamanoPagina
    });
  } catch (error) {
    console.error('Error al listar pases:', error.message);
    res.status(500).json({ mensaje: 'Error al obtener los pases de salida' });
  }
}

// GET /api/pases/:id
async function obtenerPase(req, res) {
  try {
    // 1. El número viene en la Url se convierte y se valida
    const idPase = Number(req.params.id);
    
    if(!Number.isInteger(idPase) || idPase < 1) {
      return res.status(400).json({ mensaje: 'El ID del pase debe ser un número entero mayor que 0' });
    }

    // 2. Validar si existe
    const pase = await obtenerPasePorId(idPase);

    if(pase === null) {
      return res.status(404).json({ mensaje: 'No se encontró el pase de salida' });
    }

    // 3. Validar si el usuario puede ver el taller del pase
    if(!puedeVerTaller(req.usuario, pase.taller_id)) {
      return res.status(403).json({ mensaje: 'No tiene permiso para ver este pase de salida' });
    }

    res.json(pase);
  } catch (error) {
    console.error('Error al obtener pase por ID:', error.message);
    res.status(500).json({ mensaje: 'Error al obtener el pase de salida' });
  }
}

// Convierte un valor de la URL en un entero mayor que 0.
// Si no es válido, devuelve el valor por defecto.
function leerNumeroPositivo(valor, valorPorDefecto) {
  const numero = parseInt(valor, 10);

  if (isNaN(numero) || numero < 1) {
    return valorPorDefecto;
  }
  return numero;
}

module.exports = { obtenerPases, obtenerPase};