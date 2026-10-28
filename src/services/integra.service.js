const { QueryTypes } = require('sequelize');
const baseIntegra = require('../config/integra');

// Consultas al sistema Integra (AS/400): órdenes de trabajo del taller.
//
// Se consulta con OPENQUERY a través del linked server INTEGRA (ver config/integra.js).
// Tablas que se usan:
//   INTREP.FREP100 → cabecera de la orden (cliente, vehículo, etapa actual, factura)
//   INTREP.FREP080 → catálogo de etapas (TER = Terminada, FAC = Facturada, ...)
//   INTREP.FREP090 → catálogo de tipos de vehículo (Nivel 1: CAM = Camión, ...)
//
// Tres formas de responder:
//   - INTEGRA_SIMULADO=true (solo desarrollo) → datos de ejemplo
//   - con conexión (INTEGRA_SERVIDOR en el .env) → consulta real
//   - sin conexión o si Integra falla/tarda → "no disponible" (no bloquea nada)

// Por ahora solo se trabaja con la compañía FE
const COMPANIA = 'FE';

// Órdenes pendientes: solo se buscan las recibidas en los últimos 12 meses
// (órdenes más viejas que nunca se cerraron no deben bloquear un pase)
const MESES_PENDIENTES = 12;

// Etapas que NUNCA cuentan como pendientes, aunque no tengan fecha de factura:
//   FAC Facturada | CER Cerrada (algunas se cierran sin cobrar)
//   CIT Cita | CCT Confirmación de cita (todavía no hay trabajo que cobrar)
const ETAPAS_NO_PENDIENTES = ['FAC', 'CER', 'CIT', 'CCT'];

// OPENQUERY no acepta parámetros: el valor se escribe dentro de la consulta.
// Por seguridad, solo se aceptan letras, números y guion (sin comillas ni espacios).
const TEXTO_PERMITIDO = /^[A-Z0-9-]+$/;

// ---------------------------------------------------------------------------
// Consultar una orden por su número.
//
// Devuelve:
//   {
//     disponible: true | false,  → false = no se pudo consultar Integra
//     orden: null | {
//       numero_orden, taller, codigo_cliente, cliente,
//       placa, chasis, marca, tipo_vehiculo, estado
//     }
//   }
// Si Integra responde pero la orden no existe: disponible = true, orden = null.
// Se acepta cualquier orden que exista, sin importar su etapa.
// ---------------------------------------------------------------------------
async function consultarOrden(numeroOrden) {
    if (estaSimulado()) {
        return { disponible: true, orden: crearOrdenSimulada(numeroOrden) };
    }
    if (baseIntegra === null) {
        return { disponible: false, orden: null };
    }

    // Un número con caracteres raros no puede existir en Integra
    const numero = textoSeguro(numeroOrden);
    if (numero === null) {
        return { disponible: true, orden: null };
    }

    try {
        const filas = await consultarIntegra(
            CAMPOS_ORDEN +
            " WHERE ORD.GCICOD = '" + COMPANIA + "'" +
            " AND ORD.RORNUM = '" + numero + "'"
        );

        if (filas.length === 0) {
            return { disponible: true, orden: null };
        }

        const fila = filas[0];
        let estado = fila.NOMBRE_ETAPA || fila.ETAPA;
        if (fila.ANULADA === 'X') {
            estado = 'ANULADA';
        }

        return {
            disponible: true,
            orden: {
                numero_orden: fila.ORDEN,
                taller: fila.TALLER || null,
                codigo_cliente: fila.CODIGO_CLIENTE || null,
                cliente: fila.CLIENTE || null,
                placa: fila.PLACA || null,
                chasis: fila.CHASIS || null,
                marca: fila.MARCA || null,
                tipo_vehiculo: fila.TIPO || null,
                estado: estado || null
            }
        };
    } catch (error) {
        console.error('Error al consultar la orden en Integra:', error.message);
        return { disponible: false, orden: null };
    }
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
//     VEHICULO → es del mismo vehículo (misma placa o chasis)
//     CLIENTE  → es de otro vehículo del mismo cliente
//
// Una orden está pendiente si:
//   - NO tiene fecha de factura
//   - NO está en una de las ETAPAS_NO_PENDIENTES (facturada, cerrada o cita)
//   - NO está anulada
//   - se recibió en los últimos MESES_PENDIENTES meses
// ---------------------------------------------------------------------------
async function buscarOrdenesPendientes(pase) {
    if (estaSimulado()) {
        return { disponible: true, ordenes: crearPendientesSimuladas(pase) };
    }
    if (baseIntegra === null) {
        return { disponible: false, ordenes: [] };
    }

    const placa = textoSeguro(pase.placa);
    const chasis = textoSeguro(pase.chasis);
    const codigoCliente = textoSeguro(pase.codigo_cliente);

    // Cómo se busca: solo con los datos que vienen bien escritos
    const criteriosVehiculo = [];
    if (placa !== null) {
        criteriosVehiculo.push("ORD.RNUEQU = '" + placa + "'");
    }
    if (chasis !== null) {
        criteriosVehiculo.push("ORD.RSEEQU = '" + chasis + "'");
    }
    const criterios = criteriosVehiculo.slice();
    if (codigoCliente !== null) {
        criterios.push("ORD.GCLCOD = '" + codigoCliente + "'");
    }
    if (criterios.length === 0) {
        return { disponible: true, ordenes: [] };
    }

    // Se devuelven máximo 50: primero las del mismo vehículo (para que nunca
    // queden fuera si el cliente tiene una flota grande), luego las más recientes
    let primeroElVehiculo = '';
    if (criteriosVehiculo.length > 0) {
        primeroElVehiculo = 'CASE WHEN ' + criteriosVehiculo.join(' OR ') + ' THEN 0 ELSE 1 END, ';
    }
    const orden = ' ORDER BY ' + primeroElVehiculo +
        'ORD.RFSREC || ORD.RFAREC || ORD.RFMREC || ORD.RFDREC DESC';

    // La orden del propio pase no cuenta
    let sinLaOrdenDelPase = '';
    const numeroOrden = textoSeguro(pase.numero_orden);
    if (numeroOrden !== null) {
        sinLaOrdenDelPase = " AND ORD.RORNUM <> '" + numeroOrden + "'";
    }

    try {
        const filas = await consultarIntegra(
            CAMPOS_ORDEN +
            " WHERE ORD.GCICOD = '" + COMPANIA + "'" +
            sinLaOrdenDelPase +
            " AND ORD.RORFLA <> 'X'" +
            " AND ORD.RFDFAC IN ('', '00')" +
            " AND ORD.RORETA NOT IN ('" + ETAPAS_NO_PENDIENTES.join("', '") + "')" +
            " AND ORD.RFSREC || ORD.RFAREC || ORD.RFMREC || ORD.RFDREC >= '" + fechaLimitePendientes() + "'" +
            " AND (" + criterios.join(' OR ') + ")" +
            orden +
            " FETCH FIRST 50 ROWS ONLY"
        );

        const ordenes = filas.map(function (fila) {
            let relacion = 'CLIENTE';
            const mismaPlaca = placa !== null && fila.PLACA === placa;
            const mismoChasis = chasis !== null && fila.CHASIS === chasis;
            if (mismaPlaca || mismoChasis) {
                relacion = 'VEHICULO';
            }

            return {
                numero_orden: fila.ORDEN,
                cliente: fila.CLIENTE || null,
                placa: fila.PLACA || null,
                estado: fila.NOMBRE_ETAPA || fila.ETAPA || null,
                fecha_apertura: fechaDeIntegra(fila.SIGLO_REC, fila.ANIO_REC, fila.MES_REC, fila.DIA_REC),
                relacion: relacion
            };
        });

        return { disponible: true, ordenes: ordenes };
    } catch (error) {
        console.error('Error al buscar órdenes pendientes en Integra:', error.message);
        return { disponible: false, ordenes: [] };
    }
}

// ---------------------------------------------------------------------------
// CONSULTA REAL
// ---------------------------------------------------------------------------

// Campos de la orden: cabecera + nombre de la etapa + nombre del tipo de vehículo.
// (Esta consulta la ejecuta el AS/400, por eso usa su sintaxis: TRIM, ||, FETCH FIRST)
const CAMPOS_ORDEN =
    'SELECT TRIM(ORD.RORNUM) AS ORDEN, TRIM(ORD.RCOTAY) AS TALLER,' +
    ' TRIM(ORD.GCLCOD) AS CODIGO_CLIENTE, TRIM(ORD.RORNOM) AS CLIENTE,' +
    ' TRIM(ORD.RNUEQU) AS PLACA, TRIM(ORD.RSEEQU) AS CHASIS,' +
    ' TRIM(ORD.RCONI2) AS MARCA, TRIM(N1.RNMNI1) AS TIPO,' +
    ' TRIM(ORD.RORETA) AS ETAPA, TRIM(ETA.RNMETA) AS NOMBRE_ETAPA,' +
    ' TRIM(ORD.RORFLA) AS ANULADA,' +
    ' ORD.RFSREC AS SIGLO_REC, ORD.RFAREC AS ANIO_REC, ORD.RFMREC AS MES_REC, ORD.RFDREC AS DIA_REC' +
    ' FROM INTREP.FREP100 ORD' +
    ' LEFT JOIN INTREP.FREP090 N1 ON N1.GCICOD = ORD.GCICOD AND N1.RCONI1 = ORD.RCONI1' +
    ' LEFT JOIN INTREP.FREP080 ETA ON ETA.GCICOD = ORD.GCICOD AND ETA.RCOETA = ORD.RORETA';

// Envía la consulta al AS/400 por el linked server.
// Dentro de OPENQUERY las comillas simples se escriben dobles ('' en lugar de ').
async function consultarIntegra(consultaAs400) {
    const consulta = "SELECT * FROM OPENQUERY(INTEGRA, '" + consultaAs400.replace(/'/g, "''") + "')";
    return baseIntegra.query(consulta, { type: QueryTypes.SELECT });
}

// Devuelve el texto en mayúsculas si solo tiene letras, números y guion; si no, null
function textoSeguro(valor) {
    if (valor === null || valor === undefined) {
        return null;
    }
    const texto = String(valor).trim().toUpperCase();
    if (texto === '' || !TEXTO_PERMITIDO.test(texto)) {
        return null;
    }
    return texto;
}

// Integra guarda las fechas en 4 campos: siglo (0 = 19xx, 1 = 20xx), año, mes y día.
// "1", "26", "10", "27" → "2026-10-27"
function fechaDeIntegra(siglo, anio, mes, dia) {
    if (!anio || !mes || !dia || String(anio).trim() === '') {
        return null;
    }
    let anioCompleto = 1900 + Number(anio);
    if (String(siglo).trim() === '1') {
        anioCompleto = 2000 + Number(anio);
    }
    return anioCompleto + '-' + String(mes).trim().padStart(2, '0') + '-' + String(dia).trim().padStart(2, '0');
}

// Fecha de hace MESES_PENDIENTES meses en el formato de Integra (siglo+año+mes+día).
// Hoy 27/10/2026 → hace 12 meses 27/10/2025 → "1251027"
function fechaLimitePendientes() {
    const fecha = new Date();
    fecha.setMonth(fecha.getMonth() - MESES_PENDIENTES);

    let siglo = '0';
    if (fecha.getFullYear() >= 2000) {
        siglo = '1';
    }
    const anio = String(fecha.getFullYear() % 100).padStart(2, '0');
    const mes = String(fecha.getMonth() + 1).padStart(2, '0');
    const dia = String(fecha.getDate()).padStart(2, '0');
    return siglo + anio + mes + dia;
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
        taller: 'CEN',
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
