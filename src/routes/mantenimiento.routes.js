const { Router } = require('express');
const { autenticar } = require('../middlewares/autenticacion.middleware');
const { requierePermiso } = require('../middlewares/permisos.middleware');
const {
  obtenerSedes,
  crearNuevaSede,
  editarSedeExistente,
  cambiarEstadoDeSede
} = require('../controllers/sedes.controller');
const {
  obtenerTalleres,
  crearNuevoTaller,
  editarTallerExistente,
  cambiarEstadoDeTaller
} = require('../controllers/talleres.controller');

const router = Router();

// Mantenimientos de sedes y talleres (por ahora solo el Administrador tiene estos permisos)

// --- Sedes ---

// GET   /api/mantenimiento/sedes            → todas las sedes, activas e inactivas
router.get('/sedes', autenticar, requierePermiso('catalogos.ver'), obtenerSedes);

// POST  /api/mantenimiento/sedes            → crear sede
router.post('/sedes', autenticar, requierePermiso('catalogos.editar'), crearNuevaSede);

// PUT   /api/mantenimiento/sedes/:id        → editar nombre, dirección y mapa
router.put('/sedes/:id', autenticar, requierePermiso('catalogos.editar'), editarSedeExistente);

// PATCH /api/mantenimiento/sedes/:id/estado → activar o desactivar
router.patch('/sedes/:id/estado', autenticar, requierePermiso('catalogos.editar'), cambiarEstadoDeSede);

// --- Talleres ---

// GET   /api/mantenimiento/talleres            → todos los talleres, activos e inactivos
router.get('/talleres', autenticar, requierePermiso('catalogos.ver'), obtenerTalleres);

// POST  /api/mantenimiento/talleres            → crear taller
router.post('/talleres', autenticar, requierePermiso('catalogos.editar'), crearNuevoTaller);

// PUT   /api/mantenimiento/talleres/:id        → editar nombre, código y sede
router.put('/talleres/:id', autenticar, requierePermiso('catalogos.editar'), editarTallerExistente);

// PATCH /api/mantenimiento/talleres/:id/estado → activar o desactivar
router.patch('/talleres/:id/estado', autenticar, requierePermiso('catalogos.editar'), cambiarEstadoDeTaller);

module.exports = router;