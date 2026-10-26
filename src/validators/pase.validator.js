// Reglas de validación de los datos de un pase de salida.
// Se usan al crear y al editar.
//
// Las reglas cambian según el tipo de pase (tabla Pases_Taller.tipo_pase):
//   - requiere_orden = 1 → número de orden y cliente obligatorios
//   - lleva_detalle  = 1 → lista de artículos obligatoria (suministros)
//   - lleva_destino  = 1 → taller de destino obligatorio y distinto del de salida (traslado)
//     (que el taller exista y esté activo lo revisa el controlador en la base)
//
// Recibe:
//   cuerpo    → lo que mandó el navegador
//   tipoPase  → el tipo de pase leído de la base de datos
//
// Devuelve { errores, datos }:
//   errores → lista de mensajes; vacía si todo está bien
//   datos   → los valores limpios, listos para guardar

const MAXIMO_LINEAS_DETALLE = 50;

function validarDatosPase(cuerpo, tipoPase) {
    const errores = [];

    // 1. Limpiar: quitar espacios al inicio y al final
    const datos = {
        tipo_pase_id:   tipoPase.id_tipo,
        numero_orden:   limpiarTexto(cuerpo.numero_orden),
        codigo_cliente: limpiarTexto(cuerpo.codigo_cliente),
        cliente:        limpiarTexto(cuerpo.cliente),
        tipo_vehiculo:  limpiarTexto(cuerpo.tipo_vehiculo),
        marca:          limpiarTexto(cuerpo.marca).toUpperCase(),
        placa:          limpiarTexto(cuerpo.placa).toUpperCase(),
        chasis:         limpiarTexto(cuerpo.chasis).toUpperCase(),
        piloto:         limpiarTexto(cuerpo.piloto),
        supervisor:     limpiarTexto(cuerpo.supervisor),
        observaciones:  limpiarTexto(cuerpo.observaciones),
        taller_id:      Number(cuerpo.taller_id),
        taller_destino_id: null,
        facturar_orden: cuerpo.facturar_orden,
        detalle:        []
    };

    // 2. Orden y cliente: obligatorios solo en los tipos que trabajan con orden
    if (tipoPase.requiere_orden) {
        validarObligatorio(errores, datos.numero_orden, 'número de orden', 60);
        validarObligatorio(errores, datos.cliente,      'cliente',         400);
    } else {
        validarLargo(errores, datos.numero_orden, 'número de orden', 60);
        validarLargo(errores, datos.cliente,      'cliente',         400);
    }

    // 3. Vehículo y personas: obligatorios en todos los tipos
    //    (en vehículo interno, suministros y traslado, el piloto es el empleado que sale)
    validarObligatorio(errores, datos.tipo_vehiculo, 'tipo de vehículo', 100);
    validarObligatorio(errores, datos.marca,         'marca',            60);
    validarObligatorio(errores, datos.placa,         'placa',            60);
    validarObligatorio(errores, datos.piloto,        'piloto',           150);
    validarObligatorio(errores, datos.supervisor,    'supervisor',       150);

    // 4. Campos opcionales: solo se revisa el largo
    validarLargo(errores, datos.codigo_cliente, 'código de cliente', 20);
    validarLargo(errores, datos.chasis,         'chasis',            60);
    validarLargo(errores, datos.observaciones,  'observaciones',     1000);

    // 5. Taller: número entero positivo
    if (!Number.isInteger(datos.taller_id) || datos.taller_id < 1) {
        errores.push('Debe seleccionar un taller');
    }

    // 5b. Taller de destino: solo en los tipos que lo piden (traslado).
    //     En los demás se guarda NULL aunque el navegador mande algo.
    if (tipoPase.lleva_destino) {
        datos.taller_destino_id = Number(cuerpo.taller_destino_id);

        if (!Number.isInteger(datos.taller_destino_id) || datos.taller_destino_id < 1) {
            errores.push('Debe seleccionar el taller de destino');
        } else if (datos.taller_destino_id === datos.taller_id) {
            errores.push('El taller de destino debe ser distinto del taller de salida');
        }
    }

    // 6. Facturar orden: debe ser true o false (no "si", no 1).
    //    En los tipos sin orden no aplica y se guarda como false.
    if (tipoPase.requiere_orden) {
        if (typeof datos.facturar_orden !== 'boolean') {
            errores.push('Debe indicar si se factura la orden');
        }
    } else {
        datos.facturar_orden = false;
    }

    // 7. Detalle de artículos: solo en suministros
    if (tipoPase.lleva_detalle) {
        datos.detalle = validarDetalle(errores, cuerpo.detalle);
    }

    // 8. Los opcionales vacíos se guardan como NULL, no como texto vacío
    datos.numero_orden = vacioANulo(datos.numero_orden);
    datos.cliente = vacioANulo(datos.cliente);
    datos.codigo_cliente = vacioANulo(datos.codigo_cliente);
    datos.chasis = vacioANulo(datos.chasis);
    datos.observaciones = vacioANulo(datos.observaciones);

    return { errores: errores, datos: datos };
}

// Valida la lista de artículos de un pase de suministros.
// Cada línea: { descripcion: 'Aceite 15W40', cantidad: 5, unidad: 'galones' }
// Devuelve la lista limpia, con el número de línea asignado (1, 2, 3...).
function validarDetalle(errores, detalle) {
    if (!Array.isArray(detalle) || detalle.length === 0) {
        errores.push('Debe agregar al menos un artículo en el detalle');
        return [];
    }

    if (detalle.length > MAXIMO_LINEAS_DETALLE) {
        errores.push('El detalle admite máximo ' + MAXIMO_LINEAS_DETALLE + ' artículos');
        return [];
    }

    const lineas = [];

    for (let i = 0; i < detalle.length; i++) {
        const numeroLinea = i + 1;
        const lineaRecibida = detalle[i];

        if (lineaRecibida === null || typeof lineaRecibida !== 'object') {
            errores.push('Detalle, línea ' + numeroLinea + ': formato no válido');
            continue;
        }

        const descripcion = limpiarTexto(lineaRecibida.descripcion);
        const unidad = limpiarTexto(lineaRecibida.unidad);
        const cantidad = Number(lineaRecibida.cantidad);

        validarObligatorio(errores, descripcion, 'descripción (línea ' + numeroLinea + ')', 200);
        validarLargo(errores, unidad, 'unidad (línea ' + numeroLinea + ')', 30);

        if (isNaN(cantidad) || cantidad <= 0) {
            errores.push('Detalle, línea ' + numeroLinea + ': la cantidad debe ser mayor que 0');
        } else if (!tieneMaximoDosDecimales(cantidad)) {
            errores.push('Detalle, línea ' + numeroLinea + ': la cantidad admite máximo 2 decimales');
        }

        lineas.push({
            linea: numeroLinea,
            descripcion: descripcion,
            cantidad: cantidad,
            unidad: vacioANulo(unidad)
        });
    }

    return lineas;
}

// Si es texto, le quita los espacios de los extremos. Si no, devuelve ''.
function limpiarTexto(valor) {
    if (typeof valor !== 'string') {
        return '';
    }
    return valor.trim();
}

function validarObligatorio(errores, valor, nombreCampo, largoMaximo) {
    if (valor === '') {
        errores.push('El campo «' + nombreCampo + '» es obligatorio');
        return;
    }
    validarLargo(errores, valor, nombreCampo, largoMaximo);
}

function validarLargo(errores, valor, nombreCampo, largoMaximo) {
    if (valor.length > largoMaximo) {
        errores.push('El campo «' + nombreCampo + '» admite máximo ' + largoMaximo + ' caracteres');
    }
}

function vacioANulo(valor) {
    if (valor === '') {
        return null;
    }
    return valor;
}

// 5, 5.5 y 5.25 son válidos; 5.255 no (la columna es DECIMAL(12, 2))
function tieneMaximoDosDecimales(numero) {
    const multiplicado = Math.round(numero * 100);
    return Math.abs(multiplicado - numero * 100) < 0.000001;
}

module.exports = { validarDatosPase, limpiarTexto, validarObligatorio, validarLargo, vacioANulo };
