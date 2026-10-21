const { Router } = require('express');
const { autenticar } = require('../middlewares/autenticacion.middleware');
const { requierePermiso } = require('../middlewares/permisos.middleware');
const { cargarPase } = require('../middlewares/pase.middleware');
const {
    obtenerPases,
    obtenerPase,
    crearNuevoPase,
    editarPaseExistente,
    autorizarPaseExistente,
    anularPaseExistente,
    imprimirPase
} = require('../controllers/pases.controller');

const router = Router();

// GET /api/pases                → listado con filtros y paginación
router.get('/', autenticar, requierePermiso('pases.ver'), obtenerPases);

// GET /api/pases/:id/pdf        → PDF del pase para imprimir (autorizados y anulados)
router.get('/:id/pdf', autenticar, requierePermiso('pases.imprimir'), cargarPase, imprimirPase);

// GET /api/pases/:id            → detalle de un pase
router.get('/:id', autenticar, requierePermiso('pases.ver'), cargarPase, obtenerPase);

// POST /api/pases               → crear un pase
router.post('/', autenticar, requierePermiso('pases.crear'), crearNuevoPase);

// PUT /api/pases/:id            → editar un pase
router.put('/:id', autenticar, requierePermiso('pases.editar'), cargarPase, editarPaseExistente);

// POST /api/pases/:id/autorizar → autorizar un pase (revisa órdenes pendientes en Integra)
router.post('/:id/autorizar', autenticar, requierePermiso('pases.autorizar'), cargarPase, autorizarPaseExistente);

// POST /api/pases/:id/anular    → anular un pase (motivo obligatorio)
router.post('/:id/anular', autenticar, requierePermiso('pases.anular'), cargarPase, anularPaseExistente);

module.exports = router;
