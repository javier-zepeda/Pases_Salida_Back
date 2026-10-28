const {
  listarSedes,
  obtenerSedeById,
  existeNombreSede,
  crearSede,
  editarSede,
  cambiarEstadoSede
} = require('../services/sedes.service');
const { validarSede } = require('../validators/catalogo.validator');

//GET /api/mantenimiento/sedes
async function obtenerSedes(req, res) {
    try {
        const sedes = await listarSedes();
        res.json(sedes);
    } catch (error) {
        console.error("Error al listar sedes: ", error.message);
        res.status(500).json({ mensaje: 'Error al obtener las sedes'});
    }
}

// POST /api/mantenimiento/sedes
async function crearNuevaSede(req, res) {
  try {
    // 1. Validar el formato de los datos
    const { errores, datos } = validarSede(req.body || {});

    if (errores.length > 0) {
      return res.status(400).json({ mensaje: 'Revise los datos de la sede', errores: errores });
    }

    // 2. El nombre no se puede repetir (al crear, ninguna sede se excluye: 0)
    const nombreRepetido = await existeNombreSede(0, datos.nombre);

    if (nombreRepetido) {
      return res.status(409).json({ mensaje: 'Ya existe una sede con el nombre ' + datos.nombre });
    }

    // 3. Guardar
    const idSede = await crearSede(datos);
    res.status(201).json({ mensaje: 'Sede creada', id_sede: idSede });
  } catch (error) {
    console.error('Error al crear la sede:', error.message);
    res.status(500).json({ mensaje: 'Error al crear la sede' });
  }
}

// PUT /api/mantenimiento/sedes/:id
async function editarSedeExistente(req, res) {
  try {
    // 1. El id de la URL debe ser un número válido y la sede debe existir
    const idSede = leerId(req.params.id);

    if (idSede === null) {
      return res.status(400).json({ mensaje: 'El número de sede no es válido' });
    }

    const sede = await obtenerSedeById(idSede);

    if (sede === null) {
      return res.status(404).json({ mensaje: 'La sede no existe' });
    }

    // 2. Validar los datos nuevos
    const { errores, datos } = validarSede(req.body || {});

    if (errores.length > 0) {
      return res.status(400).json({ mensaje: 'Revise los datos de la sede', errores: errores });
    }

    // 3. Nombre repetido: la sede que se edita no cuenta
    //    (si deja su mismo nombre, no es un error)
    const nombreRepetido = await existeNombreSede(idSede, datos.nombre);

    if (nombreRepetido) {
      return res.status(409).json({ mensaje: 'Ya existe otra sede con el nombre ' + datos.nombre });
    }

    // 4. Guardar
    await editarSede(idSede, datos);
    res.json({ mensaje: 'Sede actualizada', id_sede: idSede });
  } catch (error) {
    console.error('Error al editar la sede:', error.message);
    res.status(500).json({ mensaje: 'Error al editar la sede' });
  }
}

// PATCH /api/mantenimiento/sedes/:id/estado
async function cambiarEstadoDeSede(req, res) {
  try {
    
    const idSede = leerId(req.params.id);

    if (idSede === null) {
      return res.status(400).json({ mensaje: 'El número de sede no es válido' });
    }

    // Debe ser true o false exactamente (no "si", no 1)
    const cuerpo = req.body || {};
    const activo = cuerpo.activo;

    if (typeof activo !== 'boolean') {
      return res.status(400).json({ mensaje: 'Debe indicar si la sede queda activa (true) o inactiva (false)' });
    }

    const sede = await obtenerSedeById(idSede);

    if (sede === null) {
      return res.status(404).json({ mensaje: 'La sede no existe' });
    }

    // Una sede con talleres activos no se puede desactivar:
    // primero se desactivan sus talleres.
    if (!activo && sede.talleres_activos > 0) {
      return res.status(409).json({
        mensaje: 'No se puede desactivar: la sede tiene ' + sede.talleres_activos +
          ' talleres activos. Desactívelos primero.'
      });
    }

    await cambiarEstadoSede(idSede, activo);

    let mensaje = 'Sede desactivada';
    if (activo) {
      mensaje = 'Sede activada';
    }
    res.json({ mensaje: mensaje, id_sede: idSede });
  } catch (error) {
    console.error('Error al cambiar el estado de la sede:', error.message);
    res.status(500).json({ mensaje: 'Error al cambiar el estado de la sede' });
  }
}

function leerId(valor) {
  const numero = Number(valor);

  if (!Number.isInteger(numero) || numero < 1) {
    return null;
  }
  return numero;
}

module.exports = { obtenerSedes, crearNuevaSede, editarSedeExistente, cambiarEstadoDeSede };