const { buscarOrdenesPendientes } = require('./integra.service');

// Regla de negocio: órdenes abiertas sin facturar.
//
// Problema que resuelve: un cliente llega por una reparación y luego por un
// servicio; se factura el servicio, se hace el pase con esa orden y la orden
// de la reparación queda sin cobrar.
//
// Regla acordada:
//   - Orden pendiente del MISMO VEHÍCULO → bloquea la autorización
//     (salvo quien tenga 'pases.autorizar_con_pendientes' y lo confirme).
//   - Orden pendiente del MISMO CLIENTE (otro vehículo) → solo se advierte,
//     para no trabar a clientes con flotas grandes.
//
// pase → objeto con numero_orden, placa, chasis y codigo_cliente
//
// Devuelve:
//   {
//     disponible:   true | false,  → false = no se pudo consultar Integra
//     todas:        todas las órdenes encontradas (para mostrarlas)
//     bloquean:     las del mismo vehículo
//     advertencias: las del mismo cliente
//   }
async function revisarOrdenesPendientes(pase) {
    const resultado = await buscarOrdenesPendientes(pase);

    const bloquean = [];
    const advertencias = [];

    for (const orden of resultado.ordenes) {
        if (orden.relacion === 'VEHICULO') {
            bloquean.push(orden);
        } else {
            advertencias.push(orden);
        }
    }

    return {
        disponible: resultado.disponible,
        todas: resultado.ordenes,
        bloquean: bloquean,
        advertencias: advertencias
    };
}

module.exports = { revisarOrdenesPendientes };
