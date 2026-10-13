/* =============================================================================
   PASES DE SALIDA - 01. Esquema y tablas
   -----------------------------------------------------------------------------
   Base de datos : Dev-QA
   Esquema       : Pases_Taller
   Reemplaza a   : FAENCASA.Pases (aplicación PHP)

   Notas de diseño
   - Usuarios, roles y permisos NO viven aquí: se usan las tablas compartidas
     dbo.COTI_tbl_usuarios / COTI_tbl_roles / COTI_tbl_permisos con la
     aplicación 'PASES_TALLER' (ver 02_seguridad_app_roles_permisos.sql).
   - Lo único propio de Pases es a qué taller(es) pertenece cada usuario
     (Pases_Taller.usuario_taller).
   - Los nombres de quien creó / autorizó / anuló se guardan también como texto
     (*_nombre) para conservar el histórico de usuarios legados que no tengan
     cuenta en COTI_tbl_usuarios.
   - Los estados conservan la numeración del sistema PHP (0, 1, 2) para que la
     migración sea directa.

   El script es idempotente: se puede ejecutar más de una vez.
   ============================================================================= */
USE [Dev-QA];
GO
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

/* ---------------------------------------------------------------------------
   Esquema
   --------------------------------------------------------------------------- */
IF SCHEMA_ID(N'Pases_Taller') IS NULL
    EXEC (N'CREATE SCHEMA Pases_Taller AUTHORIZATION dbo');
GO

/* ---------------------------------------------------------------------------
   Catálogo: sede
   --------------------------------------------------------------------------- */
IF OBJECT_ID(N'Pases_Taller.sede', N'U') IS NULL
CREATE TABLE Pases_Taller.sede (
    id_sede         INT IDENTITY(1,1) NOT NULL,
    nombre          NVARCHAR(100)     NOT NULL,
    direccion       NVARCHAR(400)     NULL,
    mapa            NVARCHAR(MAX)     NULL,      -- URL o iframe de Google Maps (legado)
    activo          BIT               NOT NULL CONSTRAINT DF_sede_activo         DEFAULT (1),
    fecha_creacion  DATETIME2(0)      NOT NULL CONSTRAINT DF_sede_fecha_creacion DEFAULT (SYSDATETIME()),
    CONSTRAINT PK_sede PRIMARY KEY CLUSTERED (id_sede)
);
GO

/* ---------------------------------------------------------------------------
   Catálogo: taller
   --------------------------------------------------------------------------- */
IF OBJECT_ID(N'Pases_Taller.taller', N'U') IS NULL
CREATE TABLE Pases_Taller.taller (
    id_taller       INT IDENTITY(1,1) NOT NULL,
    nombre          NVARCHAR(100)     NOT NULL,
    codigo          VARCHAR(10)       NULL,      -- código del taller en Integra / AX
    sede_id         INT               NULL,
    activo          BIT               NOT NULL CONSTRAINT DF_taller_activo         DEFAULT (1),
    fecha_creacion  DATETIME2(0)      NOT NULL CONSTRAINT DF_taller_fecha_creacion DEFAULT (SYSDATETIME()),
    CONSTRAINT PK_taller      PRIMARY KEY CLUSTERED (id_taller),
    CONSTRAINT FK_taller_sede FOREIGN KEY (sede_id) REFERENCES Pases_Taller.sede (id_sede)
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_taller_sede_id' AND object_id = OBJECT_ID(N'Pases_Taller.taller'))
    CREATE INDEX IX_taller_sede_id ON Pases_Taller.taller (sede_id);
GO

/* ---------------------------------------------------------------------------
   Usuario <-> taller (alcance de datos)
   Un usuario puede pertenecer a varios talleres. Los usuarios con el permiso
   'pases.ver_todos' ven todos los talleres sin necesidad de registro aquí.
   --------------------------------------------------------------------------- */
IF OBJECT_ID(N'Pases_Taller.usuario_taller', N'U') IS NULL
CREATE TABLE Pases_Taller.usuario_taller (
    usuario_id        INT          NOT NULL,
    taller_id         INT          NOT NULL,
    fecha_asignacion  DATETIME2(0) NOT NULL CONSTRAINT DF_usuario_taller_fecha DEFAULT (SYSDATETIME()),
    CONSTRAINT PK_usuario_taller         PRIMARY KEY CLUSTERED (usuario_id, taller_id),
    CONSTRAINT FK_usuario_taller_usuario FOREIGN KEY (usuario_id) REFERENCES dbo.COTI_tbl_usuarios (id),
    CONSTRAINT FK_usuario_taller_taller  FOREIGN KEY (taller_id)  REFERENCES Pases_Taller.taller (id_taller)
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_usuario_taller_taller_id' AND object_id = OBJECT_ID(N'Pases_Taller.usuario_taller'))
    CREATE INDEX IX_usuario_taller_taller_id ON Pases_Taller.usuario_taller (taller_id);
GO

/* ---------------------------------------------------------------------------
   Catálogo: estado del pase
   --------------------------------------------------------------------------- */
IF OBJECT_ID(N'Pases_Taller.estado_pase', N'U') IS NULL
CREATE TABLE Pases_Taller.estado_pase (
    id_estado  TINYINT      NOT NULL,
    codigo     VARCHAR(20)  NOT NULL,
    nombre     NVARCHAR(50) NOT NULL,
    CONSTRAINT PK_estado_pase        PRIMARY KEY CLUSTERED (id_estado),
    CONSTRAINT UQ_estado_pase_codigo UNIQUE (codigo)
);
GO
MERGE Pases_Taller.estado_pase AS d
USING (VALUES (0, 'CREADO',     N'Creado'),
              (1, 'AUTORIZADO', N'Autorizado'),
              (2, 'ANULADO',    N'Anulado')) AS o (id_estado, codigo, nombre)
   ON d.id_estado = o.id_estado
WHEN MATCHED THEN UPDATE SET codigo = o.codigo, nombre = o.nombre
WHEN NOT MATCHED THEN INSERT (id_estado, codigo, nombre) VALUES (o.id_estado, o.codigo, o.nombre);
GO

/* ---------------------------------------------------------------------------
   Pase de salida
   id_pase es el número impreso en el PDF: la migración conserva los números
   del sistema PHP (IDENTITY_INSERT) y los nuevos continúan desde el último.
   --------------------------------------------------------------------------- */
IF OBJECT_ID(N'Pases_Taller.pase_salida', N'U') IS NULL
CREATE TABLE Pases_Taller.pase_salida (
    id_pase                INT IDENTITY(1,1) NOT NULL,

    -- Orden de trabajo y datos que se prellenan desde Integra / AX
    numero_orden           VARCHAR(60)    NOT NULL,
    origen_orden           VARCHAR(10)    NULL,      -- INTEGRA | AX | MANUAL | LEGADO
    codigo_cliente         VARCHAR(20)    NULL,      -- GCLCOD en Integra
    cliente                NVARCHAR(400)  NOT NULL,
    tipo_vehiculo          NVARCHAR(100)  NULL,
    marca                  NVARCHAR(60)   NULL,
    placa                  VARCHAR(60)    NULL,
    chasis                 VARCHAR(60)    NULL,

    -- Datos capturados en el pase
    piloto                 NVARCHAR(150)  NULL,
    supervisor             NVARCHAR(150)  NULL,
    observaciones          NVARCHAR(MAX)  NULL,
    facturar_orden         BIT            NOT NULL CONSTRAINT DF_pase_salida_facturar_orden DEFAULT (0),
    taller_id              INT            NULL,
    estado_id              TINYINT        NOT NULL CONSTRAINT DF_pase_salida_estado_id      DEFAULT (0),

    -- Auditoría (id del usuario COTI + nombre como respaldo histórico)
    creado_por_id          INT            NULL,
    creado_por_nombre      NVARCHAR(150)  NULL,
    fecha_creacion         DATETIME2(0)   NOT NULL CONSTRAINT DF_pase_salida_fecha_creacion DEFAULT (SYSDATETIME()),
    autorizado_por_id      INT            NULL,
    autorizado_por_nombre  NVARCHAR(150)  NULL,
    fecha_autorizacion     DATETIME2(0)   NULL,
    anulado_por_id         INT            NULL,
    anulado_por_nombre     NVARCHAR(150)  NULL,
    fecha_anulacion        DATETIME2(0)   NULL,
    motivo_anulacion       NVARCHAR(500)  NULL,
    modificado_por_id      INT            NULL,
    fecha_modificacion     DATETIME2(0)   NULL,

    -- Control de concurrencia optimista (dos usuarios editando el mismo pase)
    version                ROWVERSION     NOT NULL,

    CONSTRAINT PK_pase_salida                PRIMARY KEY CLUSTERED (id_pase),
    CONSTRAINT FK_pase_salida_taller         FOREIGN KEY (taller_id)         REFERENCES Pases_Taller.taller (id_taller),
    CONSTRAINT FK_pase_salida_estado         FOREIGN KEY (estado_id)         REFERENCES Pases_Taller.estado_pase (id_estado),
    CONSTRAINT FK_pase_salida_creado_por     FOREIGN KEY (creado_por_id)     REFERENCES dbo.COTI_tbl_usuarios (id),
    CONSTRAINT FK_pase_salida_autorizado_por FOREIGN KEY (autorizado_por_id) REFERENCES dbo.COTI_tbl_usuarios (id),
    CONSTRAINT FK_pase_salida_anulado_por    FOREIGN KEY (anulado_por_id)    REFERENCES dbo.COTI_tbl_usuarios (id),
    CONSTRAINT FK_pase_salida_modificado_por FOREIGN KEY (modificado_por_id) REFERENCES dbo.COTI_tbl_usuarios (id),
    CONSTRAINT CK_pase_salida_origen_orden   CHECK (origen_orden IN ('INTEGRA', 'AX', 'MANUAL', 'LEGADO'))
);
GO
-- Listado principal: por taller y estado, lo más reciente primero
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_pase_salida_taller_estado_fecha' AND object_id = OBJECT_ID(N'Pases_Taller.pase_salida'))
    CREATE INDEX IX_pase_salida_taller_estado_fecha ON Pases_Taller.pase_salida (taller_id, estado_id, fecha_creacion DESC);
-- Búsquedas e historial por orden, placa, chasis y cliente
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_pase_salida_numero_orden' AND object_id = OBJECT_ID(N'Pases_Taller.pase_salida'))
    CREATE INDEX IX_pase_salida_numero_orden ON Pases_Taller.pase_salida (numero_orden);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_pase_salida_placa' AND object_id = OBJECT_ID(N'Pases_Taller.pase_salida'))
    CREATE INDEX IX_pase_salida_placa ON Pases_Taller.pase_salida (placa) WHERE placa IS NOT NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_pase_salida_chasis' AND object_id = OBJECT_ID(N'Pases_Taller.pase_salida'))
    CREATE INDEX IX_pase_salida_chasis ON Pases_Taller.pase_salida (chasis) WHERE chasis IS NOT NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_pase_salida_codigo_cliente' AND object_id = OBJECT_ID(N'Pases_Taller.pase_salida'))
    CREATE INDEX IX_pase_salida_codigo_cliente ON Pases_Taller.pase_salida (codigo_cliente) WHERE codigo_cliente IS NOT NULL;
GO

/* ---------------------------------------------------------------------------
   Adjuntos del pase (Azure Blob). Permite varios por pase.
   En la migración, 'ruta' guarda la ruta del servidor PHP; se actualiza al
   subir las imágenes al Blob.
   --------------------------------------------------------------------------- */
IF OBJECT_ID(N'Pases_Taller.pase_adjunto', N'U') IS NULL
CREATE TABLE Pases_Taller.pase_adjunto (
    id_adjunto      INT IDENTITY(1,1) NOT NULL,
    pase_id         INT               NOT NULL,
    ruta            NVARCHAR(1000)    NOT NULL,
    nombre_archivo  NVARCHAR(255)     NULL,
    content_type    VARCHAR(100)      NULL,
    tamano_bytes    BIGINT            NULL,
    subido_por_id   INT               NULL,
    fecha_subida    DATETIME2(0)      NOT NULL CONSTRAINT DF_pase_adjunto_fecha_subida DEFAULT (SYSDATETIME()),
    activo          BIT               NOT NULL CONSTRAINT DF_pase_adjunto_activo       DEFAULT (1),
    CONSTRAINT PK_pase_adjunto            PRIMARY KEY CLUSTERED (id_adjunto),
    CONSTRAINT FK_pase_adjunto_pase       FOREIGN KEY (pase_id)       REFERENCES Pases_Taller.pase_salida (id_pase),
    CONSTRAINT FK_pase_adjunto_subido_por FOREIGN KEY (subido_por_id) REFERENCES dbo.COTI_tbl_usuarios (id)
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_pase_adjunto_pase_id' AND object_id = OBJECT_ID(N'Pases_Taller.pase_adjunto'))
    CREATE INDEX IX_pase_adjunto_pase_id ON Pases_Taller.pase_adjunto (pase_id);
GO

/* ---------------------------------------------------------------------------
   Bitácora del pase: quién hizo qué y cuándo.
   accion: CREAR | EDITAR | AUTORIZAR | ANULAR | IMPRIMIR | ADJUNTAR |
           VALIDACION_INTEGRA | MIGRACION
   detalle: JSON (p. ej. órdenes abiertas encontradas al intentar autorizar).
   --------------------------------------------------------------------------- */
IF OBJECT_ID(N'Pases_Taller.pase_bitacora', N'U') IS NULL
CREATE TABLE Pases_Taller.pase_bitacora (
    id_bitacora     BIGINT IDENTITY(1,1) NOT NULL,
    pase_id         INT                  NOT NULL,
    accion          VARCHAR(30)          NOT NULL,
    usuario_id      INT                  NULL,
    usuario_nombre  NVARCHAR(150)        NULL,
    detalle         NVARCHAR(MAX)        NULL,
    fecha           DATETIME2(0)         NOT NULL CONSTRAINT DF_pase_bitacora_fecha DEFAULT (SYSDATETIME()),
    CONSTRAINT PK_pase_bitacora         PRIMARY KEY CLUSTERED (id_bitacora),
    CONSTRAINT FK_pase_bitacora_pase    FOREIGN KEY (pase_id)    REFERENCES Pases_Taller.pase_salida (id_pase),
    CONSTRAINT FK_pase_bitacora_usuario FOREIGN KEY (usuario_id) REFERENCES dbo.COTI_tbl_usuarios (id),
    CONSTRAINT CK_pase_bitacora_detalle CHECK (detalle IS NULL OR ISJSON(detalle) = 1)
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_pase_bitacora_pase_id' AND object_id = OBJECT_ID(N'Pases_Taller.pase_bitacora'))
    CREATE INDEX IX_pase_bitacora_pase_id ON Pases_Taller.pase_bitacora (pase_id, fecha);
GO

PRINT N'Esquema Pases_Taller listo.';
GO
