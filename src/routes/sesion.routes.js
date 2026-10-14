const { Router } = require('express');
const { autenticar } = require('../middlewares/autenticacion.middleware');
const { obtenerMiPerfil } = require('../controllers/sesion.controller');

const router = Router();

// GET /api/sesion/perfil
router.get('/perfil', autenticar, obtenerMiPerfil);

module.exports = router;