const { Router } = require('express');
const { autenticar } = require('../middlewares/autenticacion.middleware');
const { requierePermiso } = require('../middlewares/permisos.middleware');
const { consultarOrdenParaPase } = require('../controllers/ordenes.controller');

const router = Router();

// GET /api/ordenes/:numero → datos de la orden en Integra + otras órdenes sin facturar
router.get('/:numero', autenticar, requierePermiso('pases.crear'), consultarOrdenParaPase);

module.exports = router;
