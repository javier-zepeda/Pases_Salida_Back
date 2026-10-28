const { obtenerResumen } = require('../services/inicio.service');
const { obtenerTalleresPermitidos } = require('../helpers/alcance.helper');

// GET /api/inicio/resumen
// Números de las tarjetas de Inicio. Los pases se cuentan solo de los talleres
// que el usuario puede ver (igual que el listado). Sedes y talleres solo se
// devuelven a quien tiene 'catalogos.ver'; a los demás les llegan como null.
async function obtenerResumenInicio(req, res) {
  try {
    const talleresPermitidos = obtenerTalleresPermitidos(req.usuario);

    let resumen;
    if (talleresPermitidos !== null && talleresPermitidos.length === 0) {
      // Sin talleres asignados no ve ningún pase; los catálogos sí se cuentan
      resumen = await obtenerResumen([0]);
    } else {
      resumen = await obtenerResumen(talleresPermitidos);
    }

    if (!req.usuario.permisos.includes('catalogos.ver')) {
      resumen.sedes = null;
      resumen.talleres = null;
    }

    res.json(resumen);
  } catch (error) {
    console.error('Error al obtener el resumen de inicio:', error.message);
    res.status(500).json({ mensaje: 'Error al obtener el resumen' });
  }
}

module.exports = { obtenerResumenInicio };
