const { Router } = require('express');
const { autenticar } = require('../middlewares/autenticacion.middleware');
const { requierePermiso } = require('../middlewares/permisos.middleware');
const { obtenerPases } = require('../controllers/pases.controller');

const router = Router();

// GET /api/pases
router.get('/', autenticar, requierePermiso('pases.ver'), obtenerPases);

module.exports = router;