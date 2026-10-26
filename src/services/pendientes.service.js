const { buscarOrdenesPendientes } = require('./integra.service');

// Regla de negocio: órdenes abiertas sin facturar.
//
// Problema que resuelve: un cliente llega por una reparación y luego por un
// servicio; se factura el servicio, se hace el pase con esa orden y la orden
// de la reparación queda sin cobrar.
//
// Regla acordada (solo en los tipos con valida_pendientes = Unidad terminada):
//   - Cualquier orden pendiente, del MISMO VEHÍCULO o del MISMO CLIENTE
//     (en todos los talleres), impide autorizar el pase.
//   - Solo quien tenga 'pases.autorizar_con_pendientes' (Administrador)
//     puede hacer la excepción, confirmándolo. Así se atiende a clientes
//     con flotas grandes sin dejar la puerta abierta a todos.
//   - Los demás pueden crear el pase: queda en Creado, con la advertencia.
//
// pase → objeto con numero_orden, placa, chasis y codigo_cliente
//
// Devuelve:
//   {
//     disponible:    true | false,  → false = no se pudo consultar Integra
//     todas:         las órdenes encontradas; cada una dice su relacion
//                    ('VEHICULO' o 'CLIENTE') para mostrarlas por separado
//     hayPendientes: true si hay al menos una (bloquea la autorización)
//   }
async function revisarOrdenesPendientes(pase) {
    const resultado = await buscarOrdenesPendientes(pase);

    return {
        disponible: resultado.disponible,
        todas: resultado.ordenes,
        hayPendientes: resultado.ordenes.length > 0
    };
}

module.exports = { revisarOrdenesPendientes };
