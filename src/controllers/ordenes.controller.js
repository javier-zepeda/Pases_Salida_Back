const { consultarOrden } = require('../services/integra.service');
const { revisarOrdenesPendientes } = require('../services/pendientes.service');

const LARGO_MAXIMO_ORDEN = 60;

// GET /api/ordenes/:numero
//
// La usa el formulario de "nuevo pase" cuando el usuario escribe la orden:
//   - Devuelve los datos de la orden para prellenar cliente y vehículo.
//   - Devuelve las OTRAS órdenes sin facturar del mismo vehículo o cliente,
//     para que quien crea el pase las vea ANTES de guardarlo.
//
// Respuestas:
//   200 { disponible: true,  orden: {...}, ordenes_pendientes: [...] }
//   200 { disponible: false, orden: null,  ... } → Integra no responde:
//                                                  el usuario llena los datos a mano
//   404 → Integra respondió, pero la orden no existe
async function consultarOrdenParaPase(req, res) {
  try {
    const numeroOrden = req.params.numero.trim();

    if (numeroOrden === '' || numeroOrden.length > LARGO_MAXIMO_ORDEN) {
      return res.status(400).json({ mensaje: 'El número de orden no es válido' });
    }

    const consulta = await consultarOrden(numeroOrden);

    if (!consulta.disponible) {
      return res.json({
        disponible: false,
        mensaje: 'No se pudo consultar Integra: ingrese los datos del vehículo a mano',
        orden: null,
        ordenes_pendientes: []
      });
    }

    if (consulta.orden === null) {
      return res.status(404).json({ mensaje: 'La orden ' + numeroOrden + ' no existe en Integra' });
    }

    const revision = await revisarOrdenesPendientes(consulta.orden);

    res.json({
      disponible: true,
      orden: consulta.orden,
      ordenes_pendientes: revision.todas
    });
  } catch (error) {
    console.error('Error al consultar la orden:', error.message);
    res.status(500).json({ mensaje: 'Error al consultar la orden' });
  }
}

module.exports = { consultarOrdenParaPase };
