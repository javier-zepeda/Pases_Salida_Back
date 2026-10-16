// Consultas al sistema Integra (AS/400): órdenes de trabajo del taller.
//
// PENDIENTE: falta saber en qué tablas y campos de Integra está:
//   - la orden con su cliente y su vehículo (en el PHP: INTREP.FREP100)
//   - el estado que indica que una orden ya se facturó
//   - cómo buscar órdenes por placa, chasis y cliente
// Mientras tanto:
//   - sin simulación, todo responde "no disponible" y NO bloquea nada
//     (la aplicación se comporta igual que el sistema anterior).
//   - con INTEGRA_SIMULADO=true en el .env (solo desarrollo), responde datos
//     de ejemplo para poder construir y probar el front.

// ---------------------------------------------------------------------------
// Consultar una orden por su número.
//
// Devuelve:
//   {
//     disponible: true | false,  → false = no se pudo consultar Integra
//     orden: null | {
//       numero_orden, codigo_cliente, cliente,
//       placa, chasis, marca, tipo_vehiculo, estado
//     }
//   }
// Si Integra responde pero la orden no existe: disponible = true, orden = null.
// ---------------------------------------------------------------------------
async function consultarOrden(numeroOrden) {
    if (estaSimulado()) {
        return { disponible: true, orden: crearOrdenSimulada(numeroOrden) };
    }

    // Aquí irá la consulta real a Integra
    return { disponible: false, orden: null };
}

// ---------------------------------------------------------------------------
// Órdenes abiertas sin facturar del mismo vehículo (placa o chasis) o del
// mismo cliente, sin contar la orden del propio pase.
//
// pase → objeto con numero_orden, placa, chasis y codigo_cliente
//
// Devuelve:
//   {
//     disponible: true | false,
//     ordenes: [
//       { numero_orden, cliente, placa, estado, fecha_apertura,
//         relacion: 'VEHICULO' | 'CLIENTE' }
//     ]
//   }
//   relacion indica por qué aparece la orden:
//     VEHICULO → es del mismo vehículo  (bloquea la autorización)
//     CLIENTE  → es de otro vehículo del mismo cliente (solo se advierte)
// ---------------------------------------------------------------------------
async function buscarOrdenesPendientes(pase) {
    if (estaSimulado()) {
        return { disponible: true, ordenes: crearPendientesSimuladas(pase) };
    }

    // Aquí irá la consulta real a Integra
    return { disponible: false, ordenes: [] };
}

// ---------------------------------------------------------------------------
// MODO SIMULADO (solo desarrollo)
//   - Cualquier número de orden "existe" y devuelve datos de ejemplo.
//   - Si el número de orden contiene "VEH" → tiene una orden pendiente del mismo vehículo.
//   - Si el número de orden contiene "CLI" → tiene una orden pendiente del mismo cliente.
//   - Si el número de orden contiene "NOEXISTE" → la orden no existe.
//   Ejemplos: SIM-001 (sin pendientes), SIM-VEH-001, SIM-CLI-001, SIM-VEH-CLI-001
// ---------------------------------------------------------------------------
function estaSimulado() {
    const esDesarrollo = process.env.NODE_ENV === 'development';
    const simulado = process.env.INTEGRA_SIMULADO === 'true';
    return esDesarrollo && simulado;
}

function crearOrdenSimulada(numeroOrden) {
    if (numeroOrden.toUpperCase().includes('NOEXISTE')) {
        return null;
    }

    return {
        numero_orden: numeroOrden,
        codigo_cliente: 'C00123',
        cliente: 'TRANSPORTES DE PRUEBA, S.A.',
        placa: 'C123ABC',
        chasis: 'JHDFG8JPSXXX12345',
        marca: 'HINO',
        tipo_vehiculo: 'CAMION',
        estado: 'EN PROCESO'
    };
}

function crearPendientesSimuladas(pase) {
    const ordenes = [];
    let numeroOrden = '';
    if (pase.numero_orden) {
        numeroOrden = pase.numero_orden.toUpperCase();
    }

    if (numeroOrden.includes('VEH')) {
        ordenes.push({
            numero_orden: 'SIM-REPARACION-01',
            cliente: 'TRANSPORTES DE PRUEBA, S.A.',
            placa: pase.placa,
            estado: 'FINALIZADA SIN FACTURAR',
            fecha_apertura: '2026-09-20',
            relacion: 'VEHICULO'
        });
    }

    if (numeroOrden.includes('CLI')) {
        ordenes.push({
            numero_orden: 'SIM-OTRO-VEHICULO-01',
            cliente: 'TRANSPORTES DE PRUEBA, S.A.',
            placa: 'C777XYZ',
            estado: 'EN PROCESO',
            fecha_apertura: '2026-10-01',
            relacion: 'CLIENTE'
        });
    }

    return ordenes;
}

module.exports = { consultarOrden, buscarOrdenesPendientes };
