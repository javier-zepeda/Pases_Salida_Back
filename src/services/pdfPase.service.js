const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

// Genera el PDF de un pase de salida con PDFKit.
//
// El pase se imprime en la mitad de arriba de una hoja carta (media carta), igual que en el sistema anterior, dentro de un marco. 
// Si el pase tiene muchos artículos, el marco crece y continúa en otra hoja.

const CARPETA_IMAGENES = path.join(__dirname, '..', 'assets', 'pdf');
const LOGO_CODACA = path.join(CARPETA_IMAGENES, 'logo_codaca.png');

// Algunas marcas se escriben abreviadas: nombre escrito → nombre del archivo
const MARCAS_ABREVIADAS = { INTER: 'international' };

const COLOR = {
  rojo: '#cc2229',
  texto: '#1a1a1a',
  secundario: '#666666',
  borde: '#cfcfcf',
  fondoFila: '#f6f6f6',
  blanco: '#ffffff',
  autorizado: '#2e7d32',
  autorizadoFondo: '#e8f5e9',
  anulado: '#c62828',
  anuladoFondo: '#fdecea',
  creado: '#b26a00',
  creadoFondo: '#fff4e0'
};

const ESTADO_AUTORIZADO = 1;
const ESTADO_ANULADO = 2;

const ANCHO_PAGINA = 612;   // carta: 8.5 x 11 pulgadas
const ALTO_PAGINA = 792;
const MARGEN = 24;          // de la hoja al marco
const RELLENO = 14;         // del marco al contenido
const FIN_MEDIA_CARTA = ALTO_PAGINA / 2 - 10;   // el marco termina antes de la mitad

const X = MARGEN + RELLENO;                       // inicio del contenido
const ANCHO = ANCHO_PAGINA - (MARGEN + RELLENO) * 2;
const LIMITE_INFERIOR = ALTO_PAGINA - MARGEN - RELLENO;

// ---------------------------------------------------------------------------
// Función principal
// ---------------------------------------------------------------------------

// Devuelve el PDF del pase como Buffer (para enviarlo en la respuesta)
function generarPdfPase(pase) {
  return new Promise((resolve, reject) => {
    const numero = formatearNumeroPase(pase.id_pase);

    const doc = new PDFDocument({
      size: 'LETTER',
      margin: 0,
      info: { Title: 'Pase No. ' + numero, Author: 'Grupo Codaca' }
    });

    const partes = [];
    doc.on('data', (parte) => partes.push(parte));
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);

    // "hoja" guarda dónde va el dibujo: la altura actual (y) y dónde empezó
    // el marco de la página actual
    const hoja = {
      doc: doc,
      pase: pase,
      numero: numero,
      y: MARGEN + RELLENO,
      inicioMarco: MARGEN,
      primeraPagina: true
    };

    if (pase.estado_id === ESTADO_ANULADO) {
      dibujarSelloAnulado(doc);   // primero, para que quede debajo del texto
    }

    dibujarEncabezado(hoja, numero);
    dibujarAvisoAnulado(hoja);
    dibujarSaludo(hoja);
    dibujarCliente(hoja);
    dibujarVehiculo(hoja);
    dibujarArticulos(hoja);
    dibujarObservaciones(hoja);
    dibujarFirmasYPie(hoja);
    cerrarMarco(hoja);

    doc.end();
  });
}

// ---------------------------------------------------------------------------
// Partes del pase
// ---------------------------------------------------------------------------

// Logo Codaca | título y tipo de pase | logo de la marca
// No. del pase | fecha y taller | estado
function dibujarEncabezado(hoja, numero) {
  const doc = hoja.doc;
  const pase = hoja.pase;
  const y = hoja.y;

  doc.image(LOGO_CODACA, X, y + 4, { height: 24 });

  const logoMarca = buscarLogoMarca(pase.marca);
  if (logoMarca !== null) {
    doc.image(logoMarca, X + ANCHO - 90, y, { fit: [90, 34], align: 'right', valign: 'center' });
  }

  doc.font('Helvetica-Bold').fontSize(15).fillColor(COLOR.texto)
    .text('PASE DE SALIDA', X + 150, y + 2, { width: ANCHO - 300, align: 'center' });
  doc.font('Helvetica').fontSize(9.5).fillColor(COLOR.secundario)
    .text(pase.tipo_pase.toUpperCase(), X + 150, y + 21, { width: ANCHO - 300, align: 'center' });

  // Línea roja debajo del encabezado
  hoja.y = Math.max(y + 40, doc.y + 6);
  doc.moveTo(X, hoja.y).lineTo(X + ANCHO, hoja.y).lineWidth(1.5).strokeColor(COLOR.rojo).stroke();
  hoja.y += 9;

  // Número del pase
  const yFila = hoja.y;
  doc.font('Helvetica').fontSize(9).fillColor(COLOR.secundario).text('No.', X, yFila + 5);
  doc.font('Helvetica-Bold').fontSize(16).fillColor(COLOR.rojo).text(numero, X + 18, yFila + 1);

  // Fecha y taller
  let centro = 'Fecha: ' + formatearFecha(pase.fecha_creacion);
  if (pase.taller) {
    centro += '     Taller: ' + pase.taller;
  }
  doc.font('Helvetica').fontSize(9.5).fillColor(COLOR.texto)
    .text(centro, X + 110, yFila + 5, { width: ANCHO - 220, align: 'center' });

  dibujarEtiquetaEstado(doc, pase, X + ANCHO, yFila + 1);

  hoja.y = Math.max(yFila + 28, doc.y + 8);
}

// Etiqueta de color con el estado, alineada a la derecha en "xDerecha"
function dibujarEtiquetaEstado(doc, pase, xDerecha, y) {
  let color = COLOR.creado;
  let fondo = COLOR.creadoFondo;
  if (pase.estado_id === ESTADO_AUTORIZADO) {
    color = COLOR.autorizado;
    fondo = COLOR.autorizadoFondo;
  } else if (pase.estado_id === ESTADO_ANULADO) {
    color = COLOR.anulado;
    fondo = COLOR.anuladoFondo;
  }

  const texto = pase.estado.toUpperCase();
  doc.font('Helvetica-Bold').fontSize(9);
  const ancho = doc.widthOfString(texto) + 20;

  doc.roundedRect(xDerecha - ancho, y, ancho, 18, 9).fill(fondo);
  doc.fillColor(color).text(texto, xDerecha - ancho, y + 5, { width: ancho, align: 'center' });
}

// Recuadro rojo con quién anuló y por qué
function dibujarAvisoAnulado(hoja) {
  const pase = hoja.pase;
  if (pase.estado_id !== ESTADO_ANULADO) {
    return;
  }

  const doc = hoja.doc;
  let texto = 'Pase anulado';
  if (pase.anulado_por_nombre) {
    texto += ' por ' + pase.anulado_por_nombre;
  }
  if (pase.fecha_anulacion) {
    texto += ' el ' + formatearFechaHora(pase.fecha_anulacion);
  }
  texto += ' · Motivo: ' + (pase.motivo_anulacion || 'sin motivo registrado');

  doc.font('Helvetica-Bold').fontSize(9);
  const alto = doc.heightOfString(texto, { width: ANCHO - 16 }) + 12;

  doc.roundedRect(X, hoja.y, ANCHO, alto, 4).fill(COLOR.anuladoFondo);
  doc.fillColor(COLOR.anulado).text(texto, X + 8, hoja.y + 6, { width: ANCHO - 16 });
  hoja.y += alto + 8;
}

function dibujarSaludo(hoja) {
  const doc = hoja.doc;
  doc.font('Helvetica-Bold').fontSize(10).fillColor(COLOR.texto)
    .text('Señor Agente: ', X, hoja.y, { width: ANCHO, continued: true })
    .font('Helvetica')
    .text('por este medio se autoriza la salida de las instalaciones según el detalle siguiente.');
  hoja.y = doc.y + 8;
}

// Orden de trabajo y cliente. Los tipos sin orden solo muestran el cliente (si tiene).
function dibujarCliente(hoja) {
  const pase = hoja.pase;

  if (pase.requiere_orden) {
    dibujarTituloSeccion(hoja, 'Orden de trabajo y cliente');
    dibujarFilaDeCampos(hoja, [
      { etiqueta: 'Orden de trabajo', valor: pase.numero_orden, ancho: 0.2 },
      { etiqueta: 'Código de cliente', valor: pase.codigo_cliente, ancho: 0.18 },
      { etiqueta: 'Cliente', valor: pase.cliente, ancho: 0.62 }
    ]);
  } else if (pase.cliente) {
    dibujarTituloSeccion(hoja, 'Cliente');
    dibujarFilaDeCampos(hoja, [{ etiqueta: 'Cliente', valor: pase.cliente, ancho: 1 }]);
  }
}

function dibujarVehiculo(hoja) {
  const pase = hoja.pase;
  dibujarTituloSeccion(hoja, 'Vehículo');
  dibujarFilaDeCampos(hoja, [
    { etiqueta: 'Placa', valor: pase.placa, ancho: 0.17 },
    { etiqueta: 'Tipo de vehículo', valor: pase.tipo_vehiculo, ancho: 0.28 },
    { etiqueta: 'Marca', valor: pase.marca, ancho: 0.25 },
    { etiqueta: 'Chasis', valor: pase.chasis, ancho: 0.30 }
  ]);

  // Traslado: de qué taller sale y a cuál va
  if (pase.lleva_destino) {
    dibujarFilaDeCampos(hoja, [
      { etiqueta: 'Sale de', valor: pase.taller, ancho: 0.45 },
      { etiqueta: 'Taller destino', valor: pase.taller_destino || 'No registrado', ancho: 0.55 }
    ]);
  }
}

// Tabla de artículos (solo los tipos que llevan detalle, ej. suministros)
function dibujarArticulos(hoja) {
  const pase = hoja.pase;
  if (!pase.lleva_detalle || pase.detalle.length === 0) {
    return;
  }

  const doc = hoja.doc;
  const columnas = [
    { titulo: 'No.', ancho: 30, alinear: 'center' },
    { titulo: 'Descripción', ancho: ANCHO - 30 - 70 - 90, alinear: 'left' },
    { titulo: 'Cantidad', ancho: 70, alinear: 'right' },
    { titulo: 'Unidad', ancho: 90, alinear: 'left' }
  ];

  dibujarTituloSeccion(hoja, 'Artículos (' + pase.detalle.length + ')');
  dibujarEncabezadoTabla(hoja, columnas);

  pase.detalle.forEach((linea, indice) => {
    const valores = [
      String(linea.linea),
      linea.descripcion,
      formatearCantidad(linea.cantidad),
      linea.unidad || ''
    ];

    doc.font('Helvetica').fontSize(9);
    const alto = doc.heightOfString(linea.descripcion, { width: columnas[1].ancho - 10 }) + 8;

    // Si la fila no cabe, se pasa a otra hoja y se repite el encabezado
    if (asegurarEspacio(hoja, alto)) {
      dibujarEncabezadoTabla(hoja, columnas);
    }

    if (indice % 2 === 1) {
      doc.rect(X, hoja.y, ANCHO, alto).fill(COLOR.fondoFila);
    }

    let x = X;
    columnas.forEach((columna, i) => {
      doc.font('Helvetica').fontSize(9).fillColor(COLOR.texto)
        .text(valores[i], x + 5, hoja.y + 4, { width: columna.ancho - 10, align: columna.alinear });
      x += columna.ancho;
    });

    hoja.y += alto;
  });

  doc.moveTo(X, hoja.y).lineTo(X + ANCHO, hoja.y).lineWidth(0.5).strokeColor(COLOR.borde).stroke();
  hoja.y += 6;
}

// Encabezado rojo con letras blancas, igual que las tablas de la aplicación
function dibujarEncabezadoTabla(hoja, columnas) {
  const doc = hoja.doc;
  asegurarEspacio(hoja, 18 + 20);   // el encabezado no se queda solo al final de una hoja

  doc.rect(X, hoja.y, ANCHO, 18).fill(COLOR.rojo);
  let x = X;
  for (const columna of columnas) {
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLOR.blanco)
      .text(columna.titulo, x + 5, hoja.y + 5, { width: columna.ancho - 10, align: columna.alinear });
    x += columna.ancho;
  }
  hoja.y += 18;
}

function dibujarObservaciones(hoja) {
  const observaciones = hoja.pase.observaciones;
  if (!observaciones || observaciones.trim() === '') {
    return;
  }

  const doc = hoja.doc;
  doc.font('Helvetica').fontSize(9.5);
  const alto = doc.heightOfString(observaciones, { width: ANCHO });

  dibujarTituloSeccion(hoja, 'Observaciones', alto);
  doc.font('Helvetica').fontSize(9.5).fillColor(COLOR.texto).text(observaciones, X, hoja.y, { width: ANCHO });
  hoja.y = doc.y + 8;
}

// Firmas (dos filas de tres) y el pie.
// En la primera hoja se bajan hasta el final de la media carta para que
// el pase siempre tenga la misma forma.
function dibujarFirmasYPie(hoja) {
  const pase = hoja.pase;
  const doc = hoja.doc;

  let etiquetaPiloto = 'Piloto';
  if (pase.tipo_pase_codigo === 'VEHICULO_INTERNO') {
    etiquetaPiloto = 'Empleado que lo usa';
  }

  const ALTO_FILA_FIRMAS = 50;
  const ALTO_PIE = 30;
  const altoTotal = ALTO_FILA_FIRMAS * 2 + ALTO_PIE;

  asegurarEspacio(hoja, altoTotal);

  const finMediaCarta = FIN_MEDIA_CARTA - RELLENO;
  if (hoja.primeraPagina && hoja.y + altoTotal < finMediaCarta) {
    hoja.y = finMediaCarta - altoTotal;
  }

  dibujarFilaDeFirmas(hoja, [
    { nombre: pase.piloto, etiqueta: 'Nombre del ' + etiquetaPiloto.toLowerCase() },
    { nombre: null, etiqueta: 'Firma del ' + etiquetaPiloto.toLowerCase() },
    { nombre: null, etiqueta: 'Hora de salida' }
  ], ALTO_FILA_FIRMAS);

  dibujarFilaDeFirmas(hoja, [
    { nombre: pase.supervisor, etiqueta: 'Jefe de taller / Supervisor' },
    { nombre: null, etiqueta: 'Firma' },
    { nombre: null, etiqueta: 'Firma y sello de garita' }
  ], ALTO_FILA_FIRMAS);

  // Pie: quién creó y autorizó | cuándo se imprimió
  const yPie = hoja.y + 6;
  doc.moveTo(X, yPie).lineTo(X + ANCHO, yPie).lineWidth(0.5).strokeColor(COLOR.borde).stroke();

  let izquierda = 'Creado por: ' + (pase.creado_por_nombre || '—') + ' · ' + formatearFechaHora(pase.fecha_creacion);
  if (pase.autorizado_por_nombre) {
    izquierda += '\nAutorizado por: ' + pase.autorizado_por_nombre + ' · ' + formatearFechaHora(pase.fecha_autorizacion);
  }
  const derecha = 'Impreso: ' + fechaHoraDeGuatemala() + '\nOriginal: Garita';

  doc.font('Helvetica').fontSize(7.5).fillColor(COLOR.secundario)
    .text(izquierda, X, yPie + 5, { width: ANCHO * 0.65, lineGap: 1 });
  const finIzquierda = doc.y;
  doc.text(derecha, X + ANCHO * 0.65, yPie + 5, { width: ANCHO * 0.35, align: 'right', lineGap: 1 });

  hoja.y = Math.max(finIzquierda, doc.y);
}

// Una fila de tres firmas: nombre (si lo hay) sobre la línea y la etiqueta debajo
function dibujarFilaDeFirmas(hoja, firmas, altoFila) {
  const doc = hoja.doc;
  const separacion = 24;
  const anchoFirma = (ANCHO - separacion * 2) / 3;
  const yLinea = hoja.y + altoFila - 16;

  firmas.forEach((firma, i) => {
    const x = X + i * (anchoFirma + separacion);

    if (firma.nombre) {
      doc.font('Helvetica').fontSize(9).fillColor(COLOR.texto);
      const alto = doc.heightOfString(firma.nombre, { width: anchoFirma });
      doc.text(firma.nombre, x, yLinea - alto - 2, { width: anchoFirma, align: 'center' });
    }

    doc.moveTo(x, yLinea).lineTo(x + anchoFirma, yLinea).lineWidth(0.7).strokeColor(COLOR.texto).stroke();
    doc.font('Helvetica-Bold').fontSize(8).fillColor(COLOR.secundario)
      .text(firma.etiqueta, x, yLinea + 3, { width: anchoFirma, align: 'center' });
  });

  hoja.y += altoFila;
}

// "ANULADO" grande, inclinado y transparente sobre la media carta
function dibujarSelloAnulado(doc) {
  const centroX = ANCHO_PAGINA / 2;
  const centroY = FIN_MEDIA_CARTA / 2 + 20;

  doc.save();
  doc.rotate(-18, { origin: [centroX, centroY] });
  doc.font('Helvetica-Bold').fontSize(96).fillColor(COLOR.anulado).fillOpacity(0.13)
    .text('ANULADO', centroX - 260, centroY - 40, { width: 520, align: 'center', lineBreak: false });
  doc.restore();
}

// ---------------------------------------------------------------------------
// Ayudantes de dibujo
// ---------------------------------------------------------------------------

// Título de sección en rojo con una línea fina.
// altoSiguiente: lo que viene después; así el título no queda solo al final de la hoja.
function dibujarTituloSeccion(hoja, titulo, altoSiguiente = 30) {
  const doc = hoja.doc;
  asegurarEspacio(hoja, 16 + altoSiguiente);

  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLOR.rojo)
    .text(titulo.toUpperCase(), X, hoja.y, { width: ANCHO, characterSpacing: 0.4 });
  const yLinea = doc.y + 2;
  doc.moveTo(X, yLinea).lineTo(X + ANCHO, yLinea).lineWidth(0.5).strokeColor(COLOR.borde).stroke();
  hoja.y = yLinea + 5;
}

// Varios campos en una misma fila: etiqueta pequeña arriba y el valor abajo.
// Los valores largos bajan de línea dentro de su columna y la fila crece
// (así un nombre de cliente largo ya no se encima con el campo de al lado).
// "ancho" de cada campo es la fracción de la fila (0.25 = un cuarto).
function dibujarFilaDeCampos(hoja, campos) {
  const doc = hoja.doc;
  const separacion = 12;

  // Primero se mide la fila más alta
  let altoFila = 0;
  for (const campo of campos) {
    const anchoCampo = ANCHO * campo.ancho - separacion;
    doc.font('Helvetica-Bold').fontSize(10);
    const alto = 11 + doc.heightOfString(textoOGuion(campo.valor), { width: anchoCampo });
    altoFila = Math.max(altoFila, alto);
  }

  asegurarEspacio(hoja, altoFila);

  let x = X;
  for (const campo of campos) {
    const anchoCampo = ANCHO * campo.ancho - separacion;

    doc.font('Helvetica').fontSize(7.5).fillColor(COLOR.secundario)
      .text(campo.etiqueta.toUpperCase(), x, hoja.y, { width: anchoCampo, characterSpacing: 0.3 });
    doc.font('Helvetica-Bold').fontSize(10).fillColor(COLOR.texto)
      .text(textoOGuion(campo.valor), x, hoja.y + 11, { width: anchoCampo });

    x += ANCHO * campo.ancho;
  }

  hoja.y += altoFila + 9;
}

// Si lo que se va a dibujar no cabe en la hoja, cierra el marco y empieza
// otra hoja. Devuelve true si cambió de hoja.
function asegurarEspacio(hoja, alto) {
  if (hoja.y + alto <= LIMITE_INFERIOR) {
    return false;
  }

  cerrarMarco(hoja);
  hoja.doc.addPage();
  hoja.y = MARGEN + RELLENO;
  hoja.inicioMarco = MARGEN;
  hoja.primeraPagina = false;

  hoja.doc.font('Helvetica').fontSize(8).fillColor(COLOR.secundario)
    .text('Pase No. ' + hoja.numero + ' (continuación)', X, hoja.y, { width: ANCHO, align: 'right' });
  hoja.y = hoja.doc.y + 6;
  return true;
}

// Dibuja el marco alrededor de lo que hay en la hoja actual.
// En la primera hoja mide al menos media carta.
function cerrarMarco(hoja) {
  let fin = hoja.y + RELLENO;
  if (hoja.primeraPagina) {
    fin = Math.max(fin, FIN_MEDIA_CARTA);
  }

  hoja.doc.roundedRect(MARGEN, hoja.inicioMarco, ANCHO_PAGINA - MARGEN * 2, fin - hoja.inicioMarco, 6)
    .lineWidth(0.8).strokeColor(COLOR.borde).stroke();
}

// Busca el logo por la primera palabra de la marca:
// "JAC 1042KN" → marcas/jac.jpg, "HINO 300" → marcas/hino.png.
// Para agregar una marca nueva basta con copiar su logo en assets/pdf/marcas.
function buscarLogoMarca(marca) {
  if (!marca) {
    return null;
  }

  const primeraPalabra = marca.trim().split(/\s+/)[0].toUpperCase();
  let nombreArchivo = primeraPalabra.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (MARCAS_ABREVIADAS[primeraPalabra]) {
    nombreArchivo = MARCAS_ABREVIADAS[primeraPalabra];
  }
  if (nombreArchivo === '') {
    return null;
  }

  for (const extension of ['.png', '.jpg']) {
    const ruta = path.join(CARPETA_IMAGENES, 'marcas', nombreArchivo + extension);
    if (fs.existsSync(ruta)) {
      return ruta;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Formatos
// ---------------------------------------------------------------------------

// 67025 → "0067025" (7 dígitos, igual que el sistema anterior)
function formatearNumeroPase(idPase) {
  return String(idPase).padStart(7, '0');
}

function textoOGuion(valor) {
  if (valor === null || valor === undefined || String(valor).trim() === '') {
    return '—';
  }
  return String(valor);
}

// 5 → "5", 2.5 → "2.5", 1234.75 → "1,234.75"
function formatearCantidad(cantidad) {
  return Number(cantidad).toLocaleString('es-GT', { maximumFractionDigits: 2 });
}

// La base de datos devuelve las fechas como texto en hora de Guatemala:
// "2026-10-19T17:17:05". Se leen tal cual, sin convertir zonas horarias.
function partesDeFecha(texto) {
  const partes = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(texto || '');
  if (partes === null) {
    return null;
  }
  return {
    anio: partes[1], mes: partes[2], dia: partes[3],
    hora: Number(partes[4]), minuto: partes[5]
  };
}

// "2026-10-19T17:17:05" → "19/10/2026"
function formatearFecha(texto) {
  const fecha = partesDeFecha(texto);
  if (fecha === null) {
    return '—';
  }
  return fecha.dia + '/' + fecha.mes + '/' + fecha.anio;
}

// "2026-10-19T17:17:05" → "19/10/2026 05:17 p. m."
function formatearFechaHora(texto) {
  const fecha = partesDeFecha(texto);
  if (fecha === null) {
    return '—';
  }
  // Los pases del sistema anterior solo guardaban la fecha (quedaron a las 00:00)
  if (fecha.hora === 0 && fecha.minuto === '00') {
    return formatearFecha(texto);
  }
  return formatearFecha(texto) + ' ' + horaDoce(fecha.hora, fecha.minuto);
}

// 17, "05" → "05:05 p. m."
function horaDoce(hora, minuto) {
  let sufijo = 'a. m.';
  if (hora >= 12) {
    sufijo = 'p. m.';
  }
  const hora12 = hora % 12 === 0 ? 12 : hora % 12;
  return String(hora12).padStart(2, '0') + ':' + minuto + ' ' + sufijo;
}

// Fecha y hora actual en Guatemala (el servidor puede estar en otra zona horaria)
function fechaHoraDeGuatemala() {
  const partes = {};
  const formato = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Guatemala',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  });
  for (const parte of formato.formatToParts(new Date())) {
    partes[parte.type] = parte.value;
  }
  return formatearFechaHora(partes.year + '-' + partes.month + '-' + partes.day + 'T' + partes.hour + ':' + partes.minute);
}

module.exports = { generarPdfPase, formatearNumeroPase };
