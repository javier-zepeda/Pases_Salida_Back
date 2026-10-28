const { Router } = require('express');
const { autenticar } = require('../middlewares/autenticacion.middleware');
const { requierePermiso } = require('../middlewares/permisos.middleware');
const { obtenerResumenInicio } = require('../controllers/inicio.controller');

const router = Router();

// GET /api/inicio/resumen → números de las tarjetas de la página de Inicio
router.get('/resumen', autenticar, requierePermiso('pases.ver'), obtenerResumenInicio);

module.exports = router;
