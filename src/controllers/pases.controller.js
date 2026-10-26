const {
  listarPases,
  crearPase,
  editarPase,
  autorizarPase,
  anularPase
} = require('../services/pases.service');
const { obtenerTaller } = require('../services/talleres.service');
const { obtenerTipoPase } = require('../services/tipos.service');
const { consultarOrden } = require('../services/integra.service');
const { revisarOrdenesPendientes } = require('../services/pendientes.service');
const { validarDatosPase } = require('../validators/pase.validator');
const { generarPdfPase, formatearNumeroPase } = require('../services/pdfPase.service');
const { obtenerTalleresPermitidos, puedeVerTaller } = require('../helpers/alcance.helper');
const { revisarSiPuedeModificar } = require('../helpers/edicion.helper');

const TAMANO_PAGINA_POR_DEFECTO = 20;
const TAMANO_PAGINA_MAXIMO = 100;
const ESTADOS_VALIDOS = [0, 1, 2]; // 0 Creado, 1 Autorizado, 2 Anulado

// GET /api/pases?pagina=1&tamanoPagina=20&estado=0&tipo=1&busqueda=P123ABC
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

    // --- Filtro por tipo de pase (opcional) ---
    let tipo = null;
    if (req.query.tipo !== undefined && req.query.tipo !== '') {
      tipo = Number(req.query.tipo);

      if (!Number.isInteger(tipo) || tipo < 1) {
        return res.status(400).json({ mensaje: 'El tipo de pase no es válido' });
      }
    }

    // --- Búsqueda (opcional) ---
    let busqueda = '';
    if (typeof req.query.busqueda === 'string') {
      busqueda = req.query.busqueda.trim();
    }

    // --- Talleres que puede ver el usuario (null = todos) ---
    const talleres = obtenerTalleresPermitidos(req.usuario);

    // Sin talleres asignados no puede ver ningún pase
    if (talleres !== null && talleres.length === 0) {
      return res.json({ pases: [], total: 0, pagina: pagina, tamanoPagina: tamanoPagina });
    }

    const resultado = await listarPases({
      talleres: talleres,
      estado: estado,
      tipo: tipo,
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
// El middleware cargarPase ya validó el número, la existencia y el taller.
function obtenerPase(req, res) {
  res.json(req.pase);
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

// Devuelve el cuerpo JSON de la petición.
// Si no mandaron cuerpo, devuelve un objeto vacío para no tener que
// revisar "undefined" en cada lugar.
function obtenerCuerpo(req) {
  if (req.body === undefined || req.body === null) {
    return {};
  }
  return req.body;
}

// POST /api/pases
//
// Pasos:
//   1. Tipo de pase: debe existir y estar activo; define las reglas.
//   2. Validar los datos según el tipo.
//   3. Taller: debe existir, estar activo y ser del usuario.
//   4. Si el tipo lleva orden: comprobar en Integra que la orden exista.
//   5. Si el tipo revisa pendientes: buscar órdenes sin facturar.
//   6. Regla del cajero: autorizar al crear (si no hay órdenes pendientes).
//   7. Guardar.
async function crearNuevoPase(req, res) {
  try {
    const cuerpo = obtenerCuerpo(req);

    // 1. Tipo de pase
    const idTipo = Number(cuerpo.tipo_pase_id);

    if (!Number.isInteger(idTipo) || idTipo < 1) {
      return res.status(400).json({ mensaje: 'Debe seleccionar el tipo de pase' });
    }

    const tipoPase = await obtenerTipoPase(idTipo);

    if (tipoPase === null || !tipoPase.activo) {
      return res.status(400).json({ mensaje: 'El tipo de pase seleccionado no existe o está inactivo' });
    }

    // 2. Validar los datos según el tipo
    const { errores, datos } = validarDatosPase(cuerpo, tipoPase);

    if (errores.length > 0) {
      return res.status(400).json({ mensaje: 'Revise los datos del pase', errores: errores });
    }

    // 3. El taller debe existir, estar activo y ser uno de los del usuario
    const taller = await obtenerTaller(datos.taller_id);

    if (taller === null || !taller.activo) {
      return res.status(400).json({ mensaje: 'El taller seleccionado no existe o está inactivo' });
    }

    if (!puedeVerTaller(req.usuario, datos.taller_id)) {
      return res.status(403).json({ mensaje: 'No puede crear pases para un taller que no tiene asignado' });
    }

    // 3b. Taller de destino (traslado): puede ser cualquier taller activo
    const errorDestino = await revisarTallerDestino(datos, null);

    if (errorDestino !== null) {
      return res.status(400).json({ mensaje: errorDestino });
    }

    // 4. Orden de trabajo: en los tipos que la llevan, DEBE existir en Integra.
    //    Si Integra no responde, no se crea el pase: el usuario lo intenta
    //    más tarde (no se aceptan órdenes escritas a mano sin verificar).
    //    En los demás tipos la orden es opcional y queda como 'MANUAL'.
    datos.origen_orden = null;

    if (datos.numero_orden !== null) {
      datos.origen_orden = 'MANUAL';
    }

    if (tipoPase.requiere_orden) {
      const consulta = await consultarOrden(datos.numero_orden);

      if (!consulta.disponible) {
        return res.status(503).json({
          mensaje: 'No se pudo verificar la orden en Integra. Intente de nuevo en unos minutos.'
        });
      }
      if (consulta.orden === null) {
        return res.status(400).json({ mensaje: 'La orden ' + datos.numero_orden + ' no existe en Integra' });
      }
      datos.origen_orden = 'INTEGRA';
    }

    // 5. Órdenes abiertas sin facturar (solo en los tipos que lo revisan)
    let revision = { disponible: false, todas: [], hayPendientes: false };

    if (tipoPase.valida_pendientes) {
      revision = await revisarOrdenesPendientes(datos);
    }

    // 6. Regla del sistema anterior: si quien crea tiene el permiso
    //    'pases.autorizar_al_crear' (Cajero Receptor) y la orden se factura,
    //    el pase queda autorizado de una vez...
    //    ...salvo que el vehículo o el cliente tenga órdenes sin facturar:
    //    entonces se crea, pero queda en estado Creado (solo un Administrador
    //    puede autorizarlo con pendientes).
    const tienePermisoAutorizarAlCrear = req.usuario.permisos.includes('pases.autorizar_al_crear');
    const quiereAutorizarAlCrear = datos.facturar_orden && tienePermisoAutorizarAlCrear;

    let autorizarAlCrear = false;
    if (quiereAutorizarAlCrear && !revision.hayPendientes) {
      autorizarAlCrear = true;
    }

    // 7. Guardar (en la bitácora queda qué órdenes pendientes se le mostraron)
    const resultado = await crearPase(datos, req.usuario, autorizarAlCrear, revision.todas);

    let mensaje = 'Pase de salida creado';
    if (autorizarAlCrear) {
      mensaje = 'Pase de salida creado y autorizado';
    }
    if (quiereAutorizarAlCrear && revision.hayPendientes) {
      mensaje = 'Pase de salida creado, pero NO se autorizó: el vehículo o el cliente tiene órdenes sin facturar';
    }

    res.status(201).json({
      mensaje: mensaje,
      id_pase: resultado.id_pase,
      estado_id: resultado.estado_id,
      ordenes_pendientes: revision.todas
    });
  } catch (error) {
    console.error('Error al crear el pase:', error.message);
    res.status(500).json({ mensaje: 'Error al crear el pase de salida' });
  }
}

// Revisa en la base el taller de destino y deja su nombre en datos.taller_destino
// (para la bitácora). Devuelve el mensaje de error, o null si está bien.
//
// paseActual → null al crear; al editar, el pase guardado. Si al editar el
//              destino no cambió, no se vuelve a revisar (por si ese taller
//              se desactivó después de crear el pase).
async function revisarTallerDestino(datos, paseActual) {
  datos.taller_destino = null;

  if (datos.taller_destino_id === null) {
    return null;
  }

  if (paseActual !== null && paseActual.taller_destino_id === datos.taller_destino_id) {
    datos.taller_destino = paseActual.taller_destino;
    return null;
  }

  const destino = await obtenerTaller(datos.taller_destino_id);

  if (destino === null || !destino.activo) {
    return 'El taller de destino no existe o está inactivo';
  }

  datos.taller_destino = destino.nombre;
  return null;
}

// PUT /api/pases/:id
// El middleware cargarPase ya dejó el pase en req.pase.
async function editarPaseExistente(req, res) {
  try {
    const paseActual = req.pase;

    // 1. Reglas según el estado del pase
    const impedimento = revisarSiPuedeModificar(req.usuario, paseActual);

    if (impedimento !== null) {
      return res.status(impedimento.estado).json({ mensaje: impedimento.mensaje });
    }

    // 2. Tipo de pase, número de orden y taller no se cambian:
    //    se toman del pase actual aunque el navegador mande otros valores.
    const cuerpo = obtenerCuerpo(req);

    const cuerpoParaValidar = {
      ...cuerpo,
      numero_orden: paseActual.numero_orden,
      taller_id: paseActual.taller_id
    };

    // En los tipos con orden, el cliente y el vehículo vienen de Integra y
    // con ellos se buscan las órdenes pendientes: tampoco se cambian (si se
    // pudieran cambiar, alguien podría esquivar el bloqueo por pendientes).
    // En los tipos sin orden se escriben a mano y sí se pueden corregir.
    if (paseActual.requiere_orden) {
      cuerpoParaValidar.cliente = paseActual.cliente;
      cuerpoParaValidar.codigo_cliente = paseActual.codigo_cliente;
      cuerpoParaValidar.placa = paseActual.placa;
      cuerpoParaValidar.chasis = paseActual.chasis;
    }

    // Las reglas del tipo vienen con el pase (columnas de tipo_pase)
    const tipoPase = {
      id_tipo: paseActual.tipo_pase_id,
      requiere_orden: paseActual.requiere_orden,
      lleva_detalle: paseActual.lleva_detalle,
      lleva_destino: paseActual.lleva_destino
    };

    // 3. Mismas reglas de validación que al crear
    const { errores, datos } = validarDatosPase(cuerpoParaValidar, tipoPase);

    if (errores.length > 0) {
      return res.status(400).json({ mensaje: 'Revise los datos del pase', errores: errores });
    }

    // El taller de destino sí se puede corregir (el de salida no)
    const errorDestino = await revisarTallerDestino(datos, paseActual);

    if (errorDestino !== null) {
      return res.status(400).json({ mensaje: errorDestino });
    }

    // 4. Guardar solo si algo cambió
    const cambios = await editarPase(paseActual, datos, req.usuario);

    if (cambios === null) {
      return res.status(409).json({
        mensaje: 'El pase cambió de estado mientras lo editaba (otro usuario lo autorizó o anuló). Actualice la pantalla.'
      });
    }

    const camposModificados = Object.keys(cambios);

    if (camposModificados.length === 0) {
      return res.json({ mensaje: 'No hubo cambios', id_pase: paseActual.id_pase, campos_modificados: [] });
    }

    res.json({
      mensaje: 'Pase de salida actualizado',
      id_pase: paseActual.id_pase,
      campos_modificados: camposModificados
    });
  } catch (error) {
    console.error('Error al editar el pase:', error.message);
    res.status(500).json({ mensaje: 'Error al editar el pase de salida' });
  }
}

// POST /api/pases/:id/autorizar
// Cuerpo opcional: { "autorizar_con_pendientes": true }
//
// Pasos:
//   1. Solo se autorizan pases en estado Creado (0).
//   2. Si el tipo de pase revisa pendientes, se consulta Integra.
//      Órdenes sin facturar del MISMO VEHÍCULO o del MISMO CLIENTE → bloquean:
//        sin el permiso 'pases.autorizar_con_pendientes' → no se autoriza.
//        con el permiso (Administrador) → debe confirmarlo con autorizar_con_pendientes: true
//        (el front muestra las órdenes y pregunta "¿autorizar de todas formas?").
//   3. Se autoriza y se guarda en la bitácora el resultado de la revisión.
async function autorizarPaseExistente(req, res) {
  try {
    const pase = req.pase;

    // 1. Estado
    if (pase.estado_id === 1) {
      return res.status(409).json({ mensaje: 'El pase ya está autorizado' });
    }
    if (pase.estado_id === 2) {
      return res.status(409).json({ mensaje: 'Un pase anulado no se puede autorizar' });
    }

    // 2. Revisión de órdenes pendientes (solo en los tipos que lo revisan)
    let revision = { disponible: false, todas: [], hayPendientes: false };

    if (pase.valida_pendientes) {
      revision = await revisarOrdenesPendientes(pase);
    }

    if (revision.hayPendientes) {
      const puedeAutorizarConPendientes = req.usuario.permisos.includes('pases.autorizar_con_pendientes');

      if (!puedeAutorizarConPendientes) {
        return res.status(409).json({
          mensaje: 'No se puede autorizar: el vehículo o el cliente tiene órdenes sin facturar. Solo un Administrador puede autorizarlo.',
          ordenes_pendientes: revision.todas
        });
      }

      const cuerpo = obtenerCuerpo(req);
      const confirmoPendientes = cuerpo.autorizar_con_pendientes === true;

      if (!confirmoPendientes) {
        return res.status(409).json({
          mensaje: 'El vehículo o el cliente tiene órdenes sin facturar. Confirme si desea autorizar de todas formas.',
          requiere_confirmacion: true,
          ordenes_pendientes: revision.todas
        });
      }
    }

    // 3. Autorizar y dejar constancia de la revisión
    let resultadoValidacion = 'NO_APLICA';
    if (pase.valida_pendientes && revision.disponible) {
      resultadoValidacion = 'REALIZADA';
    }
    if (pase.valida_pendientes && !revision.disponible) {
      resultadoValidacion = 'NO_DISPONIBLE';
    }

    const detalleBitacora = {
      validacion_integra: resultadoValidacion,
      ordenes_pendientes: revision.todas,
      autorizado_con_pendientes: revision.hayPendientes
    };

    const autorizado = await autorizarPase(pase.id_pase, req.usuario, detalleBitacora);

    if (!autorizado) {
      return res.status(409).json({
        mensaje: 'El pase cambió de estado mientras se procesaba. Actualice la pantalla.'
      });
    }

    res.json({
      mensaje: 'Pase de salida autorizado',
      id_pase: pase.id_pase
    });
  } catch (error) {
    console.error('Error al autorizar el pase:', error.message);
    res.status(500).json({ mensaje: 'Error al autorizar el pase de salida' });
  }
}

const LARGO_MINIMO_MOTIVO = 5;
const LARGO_MAXIMO_MOTIVO = 500;

// POST /api/pases/:id/anular
// Cuerpo: { "motivo": "Se ingresó la placa equivocada" }
//
// Se pueden anular pases Creados (0) y Autorizados (1).
// El motivo es obligatorio: queda en el pase y en la bitácora.
async function anularPaseExistente(req, res) {
  try {
    const pase = req.pase;

    if (pase.estado_id === 2) {
      return res.status(409).json({ mensaje: 'El pase ya está anulado' });
    }

    // Motivo obligatorio
    const cuerpo = obtenerCuerpo(req);
    let motivo = '';
    if (typeof cuerpo.motivo === 'string') {
      motivo = cuerpo.motivo.trim();
    }

    if (motivo.length < LARGO_MINIMO_MOTIVO) {
      return res.status(400).json({
        mensaje: 'Indique el motivo de la anulación (mínimo ' + LARGO_MINIMO_MOTIVO + ' caracteres)'
      });
    }
    if (motivo.length > LARGO_MAXIMO_MOTIVO) {
      return res.status(400).json({
        mensaje: 'El motivo admite máximo ' + LARGO_MAXIMO_MOTIVO + ' caracteres'
      });
    }

    const anulado = await anularPase(pase.id_pase, req.usuario, motivo, pase.estado_id);

    if (!anulado) {
      return res.status(409).json({
        mensaje: 'El pase cambió de estado mientras se procesaba. Actualice la pantalla.'
      });
    }

    res.json({ mensaje: 'Pase de salida anulado', id_pase: pase.id_pase });
  } catch (error) {
    console.error('Error al anular el pase:', error.message);
    res.status(500).json({ mensaje: 'Error al anular el pase de salida' });
  }
}

// GET /api/pases/:id/pdf
//
// Devuelve el PDF del pase para imprimirlo solo se imprimen pases Autorizados (1) y Anulados (2). Un pase Creado (0) no se imprime para que nadie lo presente
async function imprimirPase(req, res) {
  try {
    const pase = req.pase;

    if (pase.estado_id === 0) {
      return res.status(409).json({ mensaje: 'El pase debe estar autorizado para poder imprimirlo' });
    }

    const pdf = await generarPdfPase(pase);
    const nombreArchivo = 'Pase No ' + formatearNumeroPase(pase.id_pase) + '.pdf';

    // "inline": el navegador lo abre en lugar de descargarlo
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="' + nombreArchivo + '"',
      'Content-Length': pdf.length
    });
    res.send(pdf);
  } catch (error) {
    console.error('Error al generar el PDF del pase:', error.message);
    res.status(500).json({ mensaje: 'Error al generar el PDF del pase de salida' });
  }
}

module.exports = {
  obtenerPases,
  obtenerPase,
  crearNuevoPase,
  editarPaseExistente,
  autorizarPaseExistente,
  anularPaseExistente,
  imprimirPase
};
