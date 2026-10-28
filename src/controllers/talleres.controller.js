const {
  obtenerTaller,
  listarTalleres,
  existeNombreTaller,
  existeCodigoTaller,
  crearTaller,
  editarTaller,
  cambiarEstadoTaller
} = require('../services/talleres.service');
const { obtenerSedeById } = require('../services/sedes.service');
const { validarTaller } = require('../validators/catalogo.validator');

// Mantenimiento de talleres. Las rutas están en mantenimiento.routes.js
// (ver: catalogos.ver | crear, editar y cambiar estado: catalogos.editar).

// GET /api/mantenimiento/talleres → todos los talleres, activos e inactivos
async function obtenerTalleres(req, res) {
  try {
    const talleres = await listarTalleres();
    res.json(talleres);
  } catch (error) {
    console.error('Error al listar talleres:', error.message);
    res.status(500).json({ mensaje: 'Error al obtener los talleres' });
  }
}

// POST /api/mantenimiento/talleres
// Cuerpo: { "nombre": "TALLER ZONA 7", "codigo": "Z07", "sede_id": 1 }
async function crearNuevoTaller(req, res) {
  try {
    // 1. Validar el formato de los datos
    const { errores, datos } = validarTaller(req.body || {});

    if (errores.length > 0) {
      return res.status(400).json({ mensaje: 'Revise los datos del taller', errores: errores });
    }

    // 2. La sede debe existir y estar activa
    const errorSede = await revisarSede(datos.sede_id, null);

    if (errorSede !== null) {
      return res.status(errorSede.codigo).json({ mensaje: errorSede.mensaje });
    }

    // 3. Nombre y código no se pueden repetir (al crear, ningún taller se excluye: 0)
    const errorRepetido = await revisarRepetidos(0, datos);

    if (errorRepetido !== null) {
      return res.status(409).json({ mensaje: errorRepetido });
    }

    // 4. Guardar
    const idTaller = await crearTaller(datos);
    res.status(201).json({ mensaje: 'Taller creado', id_taller: idTaller });
  } catch (error) {
    console.error('Error al crear el taller:', error.message);
    res.status(500).json({ mensaje: 'Error al crear el taller' });
  }
}

// PUT /api/mantenimiento/talleres/:id
// Mismo cuerpo que al crear. El estado (activo) se cambia con otra ruta.
async function editarTallerExistente(req, res) {
  try {
    // 1. El id de la URL debe ser un número válido y el taller debe existir
    const idTaller = leerId(req.params.id);

    if (idTaller === null) {
      return res.status(400).json({ mensaje: 'El número de taller no es válido' });
    }

    const taller = await obtenerTaller(idTaller);

    if (taller === null) {
      return res.status(404).json({ mensaje: 'El taller no existe' });
    }

    // 2. Validar los datos nuevos
    const { errores, datos } = validarTaller(req.body || {});

    if (errores.length > 0) {
      return res.status(400).json({ mensaje: 'Revise los datos del taller', errores: errores });
    }

    // 3. La sede debe existir. Si la cambia, la nueva debe estar activa.
    const errorSede = await revisarSede(datos.sede_id, taller.sede_id);

    if (errorSede !== null) {
      return res.status(errorSede.codigo).json({ mensaje: errorSede.mensaje });
    }

    // 4. Nombre y código repetidos: el taller que se edita no cuenta
    const errorRepetido = await revisarRepetidos(idTaller, datos);

    if (errorRepetido !== null) {
      return res.status(409).json({ mensaje: errorRepetido });
    }

    // 5. Guardar
    await editarTaller(idTaller, datos);
    res.json({ mensaje: 'Taller actualizado', id_taller: idTaller });
  } catch (error) {
    console.error('Error al editar el taller:', error.message);
    res.status(500).json({ mensaje: 'Error al editar el taller' });
  }
}

// PATCH /api/mantenimiento/talleres/:id/estado
// Cuerpo: { "activo": true } o { "activo": false }
async function cambiarEstadoDeTaller(req, res) {
  try {
    const idTaller = leerId(req.params.id);

    if (idTaller === null) {
      return res.status(400).json({ mensaje: 'El número de taller no es válido' });
    }

    // Debe ser true o false exactamente (no "si", no 1)
    const cuerpo = req.body || {};
    const activo = cuerpo.activo;

    if (typeof activo !== 'boolean') {
      return res.status(400).json({ mensaje: 'Debe indicar si el taller queda activo (true) o inactivo (false)' });
    }

    const taller = await obtenerTaller(idTaller);

    if (taller === null) {
      return res.status(404).json({ mensaje: 'El taller no existe' });
    }

    // Un taller no se puede activar si su sede está inactiva:
    // primero se activa la sede (o se le cambia la sede al taller).
    if (activo && taller.sede_id !== null) {
      const sede = await obtenerSedeById(taller.sede_id);

      if (sede !== null && !sede.activo) {
        return res.status(409).json({
          mensaje: 'No se puede activar: la sede ' + sede.nombre + ' está inactiva. Actívela primero.'
        });
      }
    }

    await cambiarEstadoTaller(idTaller, activo);

    let mensaje = 'Taller desactivado';
    if (activo) {
      mensaje = 'Taller activado';
    }
    res.json({ mensaje: mensaje, id_taller: idTaller });
  } catch (error) {
    console.error('Error al cambiar el estado del taller:', error.message);
    res.status(500).json({ mensaje: 'Error al cambiar el estado del taller' });
  }
}

// Revisa la sede elegida. Devuelve null si está bien, o { codigo, mensaje } si no.
//   idSedeActual → la sede que el taller ya tenía (null al crear).
//   Si no la cambió, se acepta aunque esté inactiva: así se puede editar
//   el nombre de un taller viejo sin obligar a moverlo de sede.
async function revisarSede(idSede, idSedeActual) {
  const sede = await obtenerSedeById(idSede);

  if (sede === null) {
    return { codigo: 400, mensaje: 'La sede seleccionada no existe' };
  }

  if (!sede.activo && idSede !== idSedeActual) {
    return { codigo: 409, mensaje: 'La sede ' + sede.nombre + ' está inactiva. Elija una sede activa.' };
  }

  return null;
}

// Devuelve el mensaje de error si el nombre o el código ya los usa otro taller, o null
async function revisarRepetidos(idTallerExcluir, datos) {
  const nombreRepetido = await existeNombreTaller(idTallerExcluir, datos.nombre);

  if (nombreRepetido) {
    return 'Ya existe un taller con el nombre ' + datos.nombre;
  }

  const codigoRepetido = await existeCodigoTaller(idTallerExcluir, datos.codigo);

  if (codigoRepetido) {
    return 'Ya existe un taller con el código ' + datos.codigo;
  }

  return null;
}

// "15" → 15 | "abc", "0", "-3", "1.5" → null
function leerId(valor) {
  const numero = Number(valor);

  if (!Number.isInteger(numero) || numero < 1) {
    return null;
  }
  return numero;
}

module.exports = { obtenerTalleres, crearNuevoTaller, editarTallerExistente, cambiarEstadoDeTaller };
