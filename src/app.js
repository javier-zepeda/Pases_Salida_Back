const express = require('express');
const cors = require('cors');
const rutas = require('./routes');

const app = express();

// SOLO PERMITIRÁ PETICIONES DESDE EL FRONTEND PASES DE SALIDA
app.use(cors({ origin: process.env.URL_FRONTEND }));

// LEER EL CONTENIDO DE LAS PETICIONES EN FORMATO JSON
app.use(express.json());

// TODAS LAS RUTAS DE LA API EMPIEZAN CON /api
app.use('/api', rutas);

module.exports = app;