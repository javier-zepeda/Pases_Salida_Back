const { Router } = require('express');
const { autenticar } = require('../middlewares/autenticacion.middleware');
const { requierePermiso } = require('../middlewares/permisos.middleware');
const { obtenerTiposPase, obtenerMisTalleres, obtenerTalleresDestino } = require('../controllers/catalogos.controller');

const router = Router();

// GET /api/catalogos/tipos-pase  → tipos de pase con sus reglas
router.get('/tipos-pase', autenticar, requierePermiso('pases.ver'), obtenerTiposPase);

// GET /api/catalogos/talleres    → talleres que el usuario puede usar
router.get('/talleres', autenticar, requierePermiso('pases.ver'), obtenerMisTalleres);

// GET /api/catalogos/talleres-destino → todos los talleres activos (destino de un traslado)
router.get('/talleres-destino', autenticar, requierePermiso('pases.ver'), obtenerTalleresDestino);

module.exports = router;
