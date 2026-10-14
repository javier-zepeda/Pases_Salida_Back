const { listarPases } = require('../services/pases.service');

const TAMANO_PAGINA_POR_DEFECTO = 20;
const TAMANO_PAGINA_MAXIMO = 100;
const ESTADOS_VALIDOS = [0, 1, 2]; // 0 Creado, 1 Autorizado, 2 Anulado

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

    // --- Alcance: qué talleres puede ver el usuario ---
    let talleres = null; // null = todos los talleres

    if (!req.usuario.permisos.includes('pases.ver_todos')) {
      talleres = req.usuario.talleres.map((taller) => taller.id_taller);

      // Sin talleres asignados no puede ver ningún pase
      if (talleres.length === 0) {
        return res.json({ pases: [], total: 0, pagina: pagina, tamanoPagina: tamanoPagina });
      }
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

// Convierte un valor de la URL en un entero mayor que 0.
// Si no es válido, devuelve el valor por defecto.
function leerNumeroPositivo(valor, valorPorDefecto) {
  const numero = parseInt(valor, 10);

  if (isNaN(numero) || numero < 1) {
    return valorPorDefecto;
  }
  return numero;
}

module.exports = { obtenerPases };