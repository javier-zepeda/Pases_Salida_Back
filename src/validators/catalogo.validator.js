const { limpiarTexto, validarObligatorio, validarLargo, vacioANulo } = require('./pase.validator');

// Reglas de validación de los catálogos (sedes y talleres).
// Igual que en los pases, devuelven { errores, datos }:
//   errores → lista de mensajes; vacía si todo está bien
//   datos   → los valores limpios, listos para guardar

// Mismos largos que las columnas de la tabla Pases_Taller.sede
const LARGO_NOMBRE = 100;
const LARGO_DIRECCION = 400;
const LARGO_MAPA = 1000;

// Cuerpo esperado: { nombre: 'SEDE ZONA 7', direccion: '...', mapa: 'https://...' }
function validarSede(cuerpo) {
    const errores = [];

    // 1. Limpiar. El nombre va en mayúsculas, igual que las sedes que ya existen.
    const datos = {
        nombre: limpiarTexto(cuerpo.nombre).toUpperCase(),
        direccion: limpiarTexto(cuerpo.direccion),
        mapa: limpiarTexto(cuerpo.mapa)
    };

    // 2. Obligatorios y largos
    validarObligatorio(errores, datos.nombre, 'nombre', LARGO_NOMBRE);
    validarLargo(errores, datos.direccion, 'dirección', LARGO_DIRECCION);
    validarLargo(errores, datos.mapa, 'mapa', LARGO_MAPA);

    // 3. El mapa solo puede ser un enlace (no un <iframe> como en el PHP):
    //    el front lo muestra como botón "Ver en el mapa".
    if (datos.mapa !== '' && !datos.mapa.startsWith('https://')) {
        errores.push('El mapa debe ser un enlace que empiece con https:// (el de "Compartir" en Google Maps)');
    }

    // 4. Los opcionales vacíos se guardan como NULL
    datos.direccion = vacioANulo(datos.direccion);
    datos.mapa = vacioANulo(datos.mapa);

    return { errores: errores, datos: datos };
}

// Mismos largos que las columnas de la tabla Pases_Taller.taller
const LARGO_CODIGO = 10;

// Cuerpo esperado: { nombre: 'TALLER ZONA 7', codigo: 'Z07', sede_id: 1 }
// (que la sede exista y esté activa lo revisa el controlador en la base)
function validarTaller(cuerpo) {
    const errores = [];

    // 1. Limpiar. Nombre y código van en mayúsculas, igual que los que ya existen.
    const datos = {
        nombre: limpiarTexto(cuerpo.nombre).toUpperCase(),
        codigo: limpiarTexto(cuerpo.codigo).toUpperCase(),
        sede_id: Number(cuerpo.sede_id)
    };

    // 2. Obligatorios y largos
    validarObligatorio(errores, datos.nombre, 'nombre', LARGO_NOMBRE);
    validarObligatorio(errores, datos.codigo, 'código', LARGO_CODIGO);

    // 3. El código solo lleva letras y números (ej. CEN, Z18): se usa para buscar en Integra
    if (datos.codigo !== '' && !/^[A-Z0-9]+$/.test(datos.codigo)) {
        errores.push('El código solo puede tener letras y números, sin espacios');
    }

    // 4. Sede: número entero positivo
    if (!Number.isInteger(datos.sede_id) || datos.sede_id < 1) {
        errores.push('Debe seleccionar la sede');
    }

    return { errores: errores, datos: datos };
}

module.exports = { validarSede, validarTaller };
