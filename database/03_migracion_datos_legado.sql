/* =============================================================================
   PASES DE SALIDA - 03. Migración de datos del sistema PHP
   -----------------------------------------------------------------------------
   Origen : FAENCASA.Pases.{Sede, Taller, Usuario, Pase_salida}  (producción)
   Destino: Dev-QA.Pases_Taller.*  +  dbo.COTI_tbl_usuarios / COTI_tbl_usuario_rol

   ANTES DE EJECUTAR: cargar una copia de las tablas legadas en Dev-QA, en un
   esquema temporal llamado Pases_Legacy:
     1. En SSMS, sobre FAENCASA (producción): clic derecho > Tasks >
        Generate Scripts > seleccionar las 4 tablas del esquema Pases >
        Advanced > "Types of data to script" = "Schema and data".
     2. En el archivo generado reemplazar:
          USE [FAENCASA]   ->  USE [Dev-QA]
          [Pases]          ->  [Pases_Legacy]
     3. Ejecutarlo en Dev-QA.

   Qué hace
   - Sedes, talleres y pases conservan sus id originales (el número del pase es
     el que aparece impreso en los PDF ya entregados).
   - Usuarios: NO se copia Pases.Usuario. Cada usuario activo con correo se
     busca por email en COTI_tbl_usuarios; si no existe se crea. Se le asigna
     el rol equivalente a su nivel y sus talleres.
   - Los nombres de quien creó / autorizó se guardan como texto, de modo que
     el histórico se conserva aunque el usuario no tenga cuenta.
   - Adjuntos: se registra la ruta del servidor PHP; las imágenes se suben al
     Blob en un paso aparte y luego se actualiza 'ruta'.

   Todo corre en una sola transacción: si algo falla no queda nada a medias.
   Se niega a correr si Pases_Taller.pase_salida ya tiene datos.
   ============================================================================= */
USE [Dev-QA];
GO
SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

/* ---------------------------------------------------------------------------
   0. Validaciones previas (no modifican nada)
   --------------------------------------------------------------------------- */
IF OBJECT_ID(N'Pases_Legacy.Pase_salida', N'U') IS NULL
   OR OBJECT_ID(N'Pases_Legacy.Usuario', N'U') IS NULL
   OR OBJECT_ID(N'Pases_Legacy.Taller', N'U') IS NULL
   OR OBJECT_ID(N'Pases_Legacy.Sede', N'U') IS NULL
    THROW 50001, N'Faltan las tablas Pases_Legacy.*: cargue primero la copia del sistema PHP (ver encabezado).', 1;

IF NOT EXISTS (SELECT 1 FROM dbo.tbl_aplicaciones WHERE codigo = 'PASES_TALLER')
    THROW 50002, N'La aplicación PASES_TALLER no existe: ejecute primero 02_seguridad_app_roles_permisos.sql.', 1;

IF EXISTS (SELECT 1 FROM Pases_Taller.pase_salida)
   OR EXISTS (SELECT 1 FROM Pases_Taller.taller)
   OR EXISTS (SELECT 1 FROM Pases_Taller.sede)
    THROW 50003, N'Pases_Taller ya tiene datos: la migración ya se ejecutó.', 1;

IF EXISTS (SELECT 1 FROM Pases_Legacy.Pase_salida WHERE estado IS NOT NULL AND estado NOT IN (0, 1, 2))
    THROW 50004, N'Hay pases con un estado distinto de 0/1/2. Revíselos antes de migrar.', 1;

-- Textos que no caben en las nuevas columnas (se informan, no se cortan)
SELECT id_pase, LEN(cliente) AS largo_cliente
FROM Pases_Legacy.Pase_salida
WHERE LEN(cliente) > 400;
IF @@ROWCOUNT > 0
    THROW 50005, N'Hay clientes de más de 400 caracteres (ver resultado). Ajuste la columna o los datos.', 1;
GO

BEGIN TRANSACTION;

DECLARE @app_id INT = (SELECT id FROM dbo.tbl_aplicaciones WHERE codigo = 'PASES_TALLER');

/* ---------------------------------------------------------------------------
   1. Sedes y talleres (conservan id)
   --------------------------------------------------------------------------- */
SET IDENTITY_INSERT Pases_Taller.sede ON;
INSERT INTO Pases_Taller.sede (id_sede, nombre, direccion, mapa, activo)
SELECT id_sede,
       ISNULL(NULLIF(LTRIM(RTRIM(descripcion)), ''), CONCAT(N'Sede ', id_sede)),
       CAST(CAST(direccion AS VARCHAR(MAX)) AS NVARCHAR(400)),
       CAST(CAST(mapa AS VARCHAR(MAX)) AS NVARCHAR(MAX)),
       CASE WHEN ISNULL(estado, 1) = 1 THEN 1 ELSE 0 END
FROM Pases_Legacy.Sede;
SET IDENTITY_INSERT Pases_Taller.sede OFF;

SET IDENTITY_INSERT Pases_Taller.taller ON;
INSERT INTO Pases_Taller.taller (id_taller, nombre, codigo, sede_id, activo)
SELECT id_taller,
       ISNULL(NULLIF(LTRIM(RTRIM(descripcion)), ''), CONCAT(N'Taller ', id_taller)),
       NULLIF(LTRIM(RTRIM(codigo)), ''),
       sede_id,
       CASE WHEN ISNULL(estado, 1) = 1 THEN 1 ELSE 0 END
FROM Pases_Legacy.Taller;
SET IDENTITY_INSERT Pases_Taller.taller OFF;

/* ---------------------------------------------------------------------------
   2. Usuarios: mapa id legado -> id en COTI_tbl_usuarios
   --------------------------------------------------------------------------- */
-- Las tablas temporales viven en tempdb, que usa la intercalación del servidor
-- (Modern_Spanish_CI_AS). COLLATE DATABASE_DEFAULT las alinea con Dev-QA
-- (SQL_Latin1_General_CP1_CI_AS) para poder comparar contra COTI_tbl_usuarios.
DROP TABLE IF EXISTS #usuario_map;
CREATE TABLE #usuario_map (
    id_legado     INT           NOT NULL PRIMARY KEY,
    email         VARCHAR(150)  COLLATE DATABASE_DEFAULT NULL,
    nombre        NVARCHAR(150) COLLATE DATABASE_DEFAULT NOT NULL,
    nivel         INT           NULL,
    taller_id     INT           NULL,
    activo        BIT           NOT NULL,
    es_principal  BIT           NOT NULL,   -- 1 = primer registro con ese email
    usuario_id    INT           NULL
);

INSERT INTO #usuario_map (id_legado, email, nombre, nivel, taller_id, activo, es_principal)
SELECT u.id_usuario,
       NULLIF(LOWER(LTRIM(RTRIM(u.correo))), ''),
       LEFT(ISNULL(NULLIF(CONCAT_WS(' ',
                NULLIF(LTRIM(RTRIM(u.primer_nombre)), ''),
                NULLIF(LTRIM(RTRIM(u.segundo_nombre)), ''),
                NULLIF(LTRIM(RTRIM(u.primer_apellido)), ''),
                NULLIF(LTRIM(RTRIM(u.segundo_apellido)), '')), ''), u.usuario), 150),
       u.nivel_usuario,
       u.taller_id,
       CASE WHEN ISNULL(u.estado, 1) = 1 THEN 1 ELSE 0 END,
       CASE WHEN ROW_NUMBER() OVER (PARTITION BY NULLIF(LOWER(LTRIM(RTRIM(u.correo))), '')
                                    ORDER BY ISNULL(u.estado, 1) DESC, u.id_usuario) = 1
            THEN 1 ELSE 0 END
FROM Pases_Legacy.Usuario u;

-- 2a. Enlazar con usuarios COTI que ya existen (por email)
UPDATE m
SET usuario_id = c.id
FROM #usuario_map m
CROSS APPLY (SELECT TOP 1 id FROM dbo.COTI_tbl_usuarios c
             WHERE LOWER(LTRIM(RTRIM(c.email))) = m.email
             ORDER BY c.activo DESC, c.id) c
WHERE m.email IS NOT NULL;

-- 2b. Crear en COTI los usuarios activos con correo que aún no existen
INSERT INTO dbo.COTI_tbl_usuarios (nombre, email, activo)
SELECT LEFT(m.nombre, 150), m.email, 1
FROM #usuario_map m
WHERE m.usuario_id IS NULL AND m.email IS NOT NULL AND m.activo = 1 AND m.es_principal = 1;

UPDATE m
SET usuario_id = c.id
FROM #usuario_map m
CROSS APPLY (SELECT TOP 1 id FROM dbo.COTI_tbl_usuarios c
             WHERE LOWER(LTRIM(RTRIM(c.email))) = m.email
             ORDER BY c.activo DESC, c.id) c
WHERE m.usuario_id IS NULL AND m.email IS NOT NULL;

/* ---------------------------------------------------------------------------
   3. Roles de la app Pases según el nivel legado (solo usuarios activos)
   --------------------------------------------------------------------------- */
DECLARE @nivel_rol TABLE (nivel INT PRIMARY KEY, rol VARCHAR(100));
INSERT INTO @nivel_rol VALUES
    (1, 'Administrador'), (2, 'Jefe de Taller'), (3, 'Administrativo'),
    (4, 'Receptor'),      (5, 'Cajero');

;WITH asignaciones AS (
    SELECT m.usuario_id, nr.rol
    FROM #usuario_map m
    JOIN @nivel_rol nr ON nr.nivel = m.nivel
    WHERE m.usuario_id IS NOT NULL AND m.activo = 1
    UNION
    -- Cajeros que en PHP podían crear pases (id fijos 28 y 33 en exit_passes.php)
    SELECT m.usuario_id, 'Receptor'
    FROM #usuario_map m
    WHERE m.usuario_id IS NOT NULL AND m.activo = 1 AND m.nivel = 5 AND m.id_legado IN (28, 33)
)
INSERT INTO dbo.COTI_tbl_usuario_rol (usuario_id, rol_id, es_defecto)
SELECT DISTINCT a.usuario_id, r.id, 0
FROM asignaciones a
JOIN dbo.COTI_tbl_roles r ON r.aplicacion_id = @app_id AND r.nombre = a.rol
WHERE NOT EXISTS (SELECT 1 FROM dbo.COTI_tbl_usuario_rol x
                  WHERE x.usuario_id = a.usuario_id AND x.rol_id = r.id);

/* ---------------------------------------------------------------------------
   4. Talleres de cada usuario
   --------------------------------------------------------------------------- */
INSERT INTO Pases_Taller.usuario_taller (usuario_id, taller_id)
SELECT DISTINCT m.usuario_id, m.taller_id
FROM #usuario_map m
JOIN Pases_Taller.taller t ON t.id_taller = m.taller_id
WHERE m.usuario_id IS NOT NULL AND m.activo = 1;

/* ---------------------------------------------------------------------------
   5. Pases (conservan id_pase)
   --------------------------------------------------------------------------- */
SET IDENTITY_INSERT Pases_Taller.pase_salida ON;
INSERT INTO Pases_Taller.pase_salida (
    id_pase, numero_orden, origen_orden, cliente, tipo_vehiculo, marca, placa,
    piloto, supervisor, observaciones, facturar_orden, taller_id, estado_id,
    creado_por_id, creado_por_nombre, fecha_creacion,
    autorizado_por_id, autorizado_por_nombre, fecha_autorizacion)
SELECT p.id_pase,
       ISNULL(NULLIF(LTRIM(RTRIM(p.orden)), ''), 'SIN-ORDEN'),
       'LEGADO',
       ISNULL(NULLIF(LTRIM(RTRIM(CAST(p.cliente AS NVARCHAR(MAX)))), N''), N'(sin cliente)'),
       NULLIF(LTRIM(RTRIM(p.tipo_vehiculo)), ''),
       NULLIF(LTRIM(RTRIM(p.marca)), ''),
       NULLIF(LTRIM(RTRIM(p.placas)), ''),
       NULLIF(LTRIM(RTRIM(p.piloto)), ''),
       NULLIF(LTRIM(RTRIM(p.supervisor)), ''),
       NULLIF(LTRIM(RTRIM(CAST(CAST(p.comentarios AS VARCHAR(MAX)) AS NVARCHAR(MAX)))), N''),
       CASE WHEN p.factura = 1 THEN 1 ELSE 0 END,
       p.taller_id,
       ISNULL(p.estado, 0),
       mc.usuario_id,
       mc.nombre,
       CAST(COALESCE(p.fecha, NULLIF(p.fecha_autorizacion, '19000101'), '19000101') AS DATETIME2(0)),
       ma.usuario_id,
       ma.nombre,
       CAST(NULLIF(p.fecha_autorizacion, '19000101') AS DATETIME2(0))
FROM Pases_Legacy.Pase_salida p
LEFT JOIN #usuario_map mc ON mc.id_legado = p.creado_por
LEFT JOIN #usuario_map ma ON ma.id_legado = p.autorizado_por;
SET IDENTITY_INSERT Pases_Taller.pase_salida OFF;

/* ---------------------------------------------------------------------------
   6. Adjuntos (se omite la imagen por defecto no_image.png)
   --------------------------------------------------------------------------- */
INSERT INTO Pases_Taller.pase_adjunto (pase_id, ruta, nombre_archivo, subido_por_id, fecha_subida)
SELECT x.id_pase,
       x.ruta,
       CASE WHEN CHARINDEX('/', REVERSE(x.ruta)) > 0
            THEN RIGHT(x.ruta, CHARINDEX('/', REVERSE(x.ruta)) - 1)
            ELSE x.ruta END,
       mc.usuario_id,
       CAST(COALESCE(x.fecha, '19000101') AS DATETIME2(0))
FROM (SELECT id_pase, creado_por, fecha,
             LTRIM(RTRIM(CAST(CAST(adjunto AS VARCHAR(MAX)) AS NVARCHAR(1000)))) AS ruta
      FROM Pases_Legacy.Pase_salida) x
LEFT JOIN #usuario_map mc ON mc.id_legado = x.creado_por
WHERE NULLIF(x.ruta, N'') IS NOT NULL
  AND x.ruta NOT LIKE N'%no_image.png';

/* ---------------------------------------------------------------------------
   7. Bitácora: una entrada de migración por pase
   --------------------------------------------------------------------------- */
INSERT INTO Pases_Taller.pase_bitacora (pase_id, accion, usuario_nombre, detalle)
SELECT id_pase, 'MIGRACION', N'Migración FAENCASA.Pases',
       CONCAT(N'{"origen":"FAENCASA.Pases","id_pase_legado":', id_pase, N'}')
FROM Pases_Taller.pase_salida;

COMMIT TRANSACTION;

/* ---------------------------------------------------------------------------
   8. Reporte
   --------------------------------------------------------------------------- */
SELECT 'sedes'   AS tabla, (SELECT COUNT(*) FROM Pases_Legacy.Sede)        AS legado, (SELECT COUNT(*) FROM Pases_Taller.sede)        AS migrado
UNION ALL
SELECT 'talleres',         (SELECT COUNT(*) FROM Pases_Legacy.Taller),                (SELECT COUNT(*) FROM Pases_Taller.taller)
UNION ALL
SELECT 'pases',            (SELECT COUNT(*) FROM Pases_Legacy.Pase_salida),           (SELECT COUNT(*) FROM Pases_Taller.pase_salida)
UNION ALL
SELECT 'adjuntos',         NULL,                                                      (SELECT COUNT(*) FROM Pases_Taller.pase_adjunto)
UNION ALL
SELECT 'usuario_taller',   NULL,                                                      (SELECT COUNT(*) FROM Pases_Taller.usuario_taller);

-- Usuarios legados que NO quedaron con acceso (sin correo, inactivos o nivel desconocido)
SELECT m.id_legado, m.nombre, m.email, m.nivel, m.activo,
       CASE WHEN m.email IS NULL THEN 'sin correo'
            WHEN m.activo = 0 THEN 'inactivo'
            WHEN m.nivel NOT IN (1, 2, 3, 4, 5) OR m.nivel IS NULL THEN 'nivel desconocido'
            WHEN m.es_principal = 0 THEN 'correo duplicado'
            ELSE 'revisar' END AS motivo
FROM #usuario_map m
WHERE m.usuario_id IS NULL OR m.activo = 0 OR m.nivel NOT IN (1, 2, 3, 4, 5) OR m.nivel IS NULL
ORDER BY motivo, m.nombre;

DROP TABLE #usuario_map;

PRINT N'Migración terminada. Cuando todo esté validado se puede eliminar el esquema Pases_Legacy.';
GO
