const { Router } = require('express');
const baseDatos = require('../config/baseDatos');
const sesionRoutes = require('./sesion.routes');
const pasesRoutes = require('./pases.routes');
const router = Router();

// Prueba de conexión a la base de datos
router.get('/salud', async (req, res) => {
    try {
        await baseDatos.authenticate();
        res.json({ estado: 'ok', baseDatos: 'conectada' });
    } catch (error) {
        res.status(500).json({ estado: 'error', baseDatos: 'sin conexión', detalle: error.message });
    }
});

// Todo lo de /api/sesion/... lo maneja sesion.routes.js
router.use('/sesion', sesionRoutes);

// Todo lo de /api/pases/... lo maneja pases.routes.js
router.use('/pases', pasesRoutes);

module.exports = router;