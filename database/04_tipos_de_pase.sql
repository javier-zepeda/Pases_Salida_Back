/* =============================================================================
   PASES DE SALIDA - 04. Tipos de pase y detalle de suministros
   -----------------------------------------------------------------------------
   Base de datos : Dev-QA
   Esquema       : Pases_Taller

   Qué hace
   1. Crea el catálogo tipo_pase con 5 tipos. Cada tipo trae sus reglas 
   2. Agrega tipo_pase_id a pase_salida. Los pases existentes quedan como "Unidad terminada".
   3. numero_orden pasa a ser opcional, con una regla: es obligatorio en "Unidad terminada" y "Prueba en carretera".
   4. Crea la tabla de detalle de suministros (qué sale y cuánto).
   5. Reclasifica los pases legados que no tienen un número de orden real      
   ============================================================================= */
USE [Dev-QA];
GO
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

/* ---------------------------------------------------------------------------
   1. Catálogo: tipo_pase
   --------------------------------------------------------------------------- */
IF OBJECT_ID(N'Pases_Taller.tipo_pase', N'U') IS NULL
CREATE TABLE Pases_Taller.tipo_pase (
    id_tipo            TINYINT      NOT NULL,
    codigo             VARCHAR(30)  NOT NULL,
    nombre             NVARCHAR(60) NOT NULL,
    requiere_orden     BIT          NOT NULL,  -- 1 = el número de orden es obligatorio
    valida_pendientes  BIT          NOT NULL,  -- 1 = revisa órdenes sin facturar al crear y autorizar
    lleva_detalle      BIT          NOT NULL,  -- 1 = lleva lista de artículos (suministros)
    activo             BIT          NOT NULL CONSTRAINT DF_tipo_pase_activo DEFAULT (1),
    CONSTRAINT PK_tipo_pase        PRIMARY KEY CLUSTERED (id_tipo),
    CONSTRAINT UQ_tipo_pase_codigo UNIQUE (codigo)
);
GO
MERGE Pases_Taller.tipo_pase AS d
USING (VALUES
    (1, 'UNIDAD_TERMINADA', N'Unidad terminada',    1, 1, 0),
    (2, 'PRUEBA_CARRETERA', N'Prueba en carretera', 1, 0, 0),
    (3, 'VEHICULO_INTERNO', N'Vehículo interno',    0, 0, 0),
    (4, 'SUMINISTROS',      N'Suministros',         0, 0, 1),
    (5, 'TRASLADO',         N'Traslado de unidad',  0, 0, 0)
) AS o (id_tipo, codigo, nombre, requiere_orden, valida_pendientes, lleva_detalle)
   ON d.id_tipo = o.id_tipo
WHEN MATCHED THEN UPDATE SET
    codigo = o.codigo,
    nombre = o.nombre,
    requiere_orden = o.requiere_orden,
    valida_pendientes = o.valida_pendientes,
    lleva_detalle = o.lleva_detalle
WHEN NOT MATCHED THEN INSERT (id_tipo, codigo, nombre, requiere_orden, valida_pendientes, lleva_detalle)
    VALUES (o.id_tipo, o.codigo, o.nombre, o.requiere_orden, o.valida_pendientes, o.lleva_detalle);
GO

/* ---------------------------------------------------------------------------
   2. Columna tipo_pase_id en pase_salida
   Al agregarla con DEFAULT (1), todos los pases existentes quedan como
   "Unidad terminada".
   --------------------------------------------------------------------------- */
IF COL_LENGTH(N'Pases_Taller.pase_salida', N'tipo_pase_id') IS NULL
    ALTER TABLE Pases_Taller.pase_salida
        ADD tipo_pase_id TINYINT NOT NULL
            CONSTRAINT DF_pase_salida_tipo_pase_id DEFAULT (1);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_pase_salida_tipo_pase')
    ALTER TABLE Pases_Taller.pase_salida
        ADD CONSTRAINT FK_pase_salida_tipo_pase
            FOREIGN KEY (tipo_pase_id) REFERENCES Pases_Taller.tipo_pase (id_tipo);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_pase_salida_tipo_pase_id' AND object_id = OBJECT_ID(N'Pases_Taller.pase_salida'))
    CREATE INDEX IX_pase_salida_tipo_pase_id ON Pases_Taller.pase_salida (tipo_pase_id, estado_id);
GO

/* ---------------------------------------------------------------------------
   3. numero_orden opcional
   se borra el índice, se cambia la columna y se vuelve a crear.
   --------------------------------------------------------------------------- */
IF EXISTS (SELECT 1 FROM sys.columns
           WHERE object_id = OBJECT_ID(N'Pases_Taller.pase_salida')
             AND name = N'numero_orden'
             AND is_nullable = 0)
BEGIN
    IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_pase_salida_numero_orden' AND object_id = OBJECT_ID(N'Pases_Taller.pase_salida'))
        DROP INDEX IX_pase_salida_numero_orden ON Pases_Taller.pase_salida;

    ALTER TABLE Pases_Taller.pase_salida ALTER COLUMN numero_orden VARCHAR(60) NULL;
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_pase_salida_numero_orden' AND object_id = OBJECT_ID(N'Pases_Taller.pase_salida'))
    CREATE INDEX IX_pase_salida_numero_orden ON Pases_Taller.pase_salida (numero_orden)
        WHERE numero_orden IS NOT NULL;
GO

-- Regla de respaldo en la base: "Unidad terminada" (1) y "Prueba en carretera" (2)
-- deben tener número de orden. Debe coincidir con tipo_pase.requiere_orden.
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_pase_salida_orden_segun_tipo')
    ALTER TABLE Pases_Taller.pase_salida
        ADD CONSTRAINT CK_pase_salida_orden_segun_tipo
            CHECK (tipo_pase_id NOT IN (1, 2) OR numero_orden IS NOT NULL);
GO

/* ---------------------------------------------------------------------------
   4. Detalle de suministros: qué sale y cuánto
   --------------------------------------------------------------------------- */
IF OBJECT_ID(N'Pases_Taller.pase_suministro_detalle', N'U') IS NULL
CREATE TABLE Pases_Taller.pase_suministro_detalle (
    id_detalle   INT IDENTITY(1,1) NOT NULL,
    pase_id      INT               NOT NULL,
    linea        SMALLINT          NOT NULL,   -- orden en que se muestra (1, 2, 3...)
    descripcion  NVARCHAR(200)     NOT NULL,   -- ej. 'Aceite 15W40'
    cantidad     DECIMAL(12, 2)    NOT NULL,
    unidad       NVARCHAR(30)      NULL,       -- ej. 'galones', 'cubetas', 'unidades'
    CONSTRAINT PK_pase_suministro_detalle       PRIMARY KEY CLUSTERED (id_detalle),
    CONSTRAINT FK_pase_suministro_detalle_pase  FOREIGN KEY (pase_id) REFERENCES Pases_Taller.pase_salida (id_pase),
    CONSTRAINT UQ_pase_suministro_detalle_linea UNIQUE (pase_id, linea),
    CONSTRAINT CK_pase_suministro_detalle_cant  CHECK (cantidad > 0)
);
GO

/* ---------------------------------------------------------------------------
   5. Reclasificar pases legados sin número de orden real
   Se consideran "sin orden real" los que no tienen al menos 3 dígitos
   seguidos en el número de orden (las órdenes reales son tipo OCE116834).
     - TRASLADO (5): la orden u observaciones mencionan traslado o entrega de unidad
     - PRUEBA (2):   las observaciones mencionan "prueba"
     - INTERNO (3):  el resto
   Solo toca pases legados que todavía son tipo 1, así que no repite trabajo.
   --------------------------------------------------------------------------- */
SET XACT_ABORT ON;
BEGIN TRANSACTION;

DECLARE @reclasificar TABLE (id_pase INT PRIMARY KEY, tipo_nuevo TINYINT NOT NULL);

INSERT INTO @reclasificar (id_pase, tipo_nuevo)
SELECT p.id_pase,
       CASE
           WHEN p.numero_orden LIKE '%TRASLADO%'
             OR p.numero_orden LIKE '%TRALADO%'
             OR p.numero_orden LIKE '%ENTREGA DE UNIDAD%'
             OR ISNULL(p.observaciones, N'') LIKE N'%TRASLADO%'
               THEN 5
           WHEN ISNULL(p.observaciones, N'') LIKE N'%PRUEBA%'
               THEN 2
           ELSE 3
       END
FROM Pases_Taller.pase_salida p
WHERE p.origen_orden = 'LEGADO'
  AND p.tipo_pase_id = 1
  AND p.numero_orden NOT LIKE '%[0-9][0-9][0-9]%';

UPDATE p
SET p.tipo_pase_id = r.tipo_nuevo
FROM Pases_Taller.pase_salida p
JOIN @reclasificar r ON r.id_pase = p.id_pase;

INSERT INTO Pases_Taller.pase_bitacora (pase_id, accion, usuario_nombre, detalle)
SELECT r.id_pase,
       'RECLASIFICAR',
       N'Script 04_tipos_de_pase',
       CONCAT(N'{"tipo_anterior":1,"tipo_nuevo":', r.tipo_nuevo,
              N',"motivo":"Pase legado sin número de orden real"}')
FROM @reclasificar r;

COMMIT TRANSACTION;
GO

/* ---------------------------------------------------------------------------
   Verificación
   --------------------------------------------------------------------------- */
SELECT t.id_tipo, t.nombre, COUNT(p.id_pase) AS pases
FROM Pases_Taller.tipo_pase t
LEFT JOIN Pases_Taller.pase_salida p ON p.tipo_pase_id = t.id_tipo
GROUP BY t.id_tipo, t.nombre
ORDER BY t.id_tipo;
GO

PRINT N'Tipos de pase listos.';
GO
