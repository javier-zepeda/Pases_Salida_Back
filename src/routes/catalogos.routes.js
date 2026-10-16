const { Router } = require('express');
const { autenticar } = require('../middlewares/autenticacion.middleware');
const { requierePermiso } = require('../middlewares/permisos.middleware');
const { obtenerTiposPase, obtenerMisTalleres } = require('../controllers/catalogos.controller');

const router = Router();

// GET /api/catalogos/tipos-pase  → tipos de pase con sus reglas
router.get('/tipos-pase', autenticar, requierePermiso('pases.ver'), obtenerTiposPase);

// GET /api/catalogos/talleres    → talleres que el usuario puede usar
router.get('/talleres', autenticar, requierePermiso('pases.ver'), obtenerMisTalleres);

module.exports = router;
