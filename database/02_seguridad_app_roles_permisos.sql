/* =============================================================================
   PASES DE SALIDA - 02. Aplicación, roles y permisos (RBAC compartido)
   -----------------------------------------------------------------------------
   Tablas: dbo.tbl_aplicaciones, dbo.COTI_tbl_roles, dbo.COTI_tbl_permisos,
           dbo.COTI_tbl_rol_permiso

   - La aplicación se registra con id 5, código 'PASES_TALLER'.
     Si ya existe por código, no se toca. Si el id 5 lo ocupa otra aplicación,
     se registra con el siguiente id disponible y se avisa.
   - El código (PASES_TALLER) es lo que deben usar el back y el front
     (?app=PASES_TALLER), NO el id, porque en QA/producción el id puede variar.
   - Ningún rol queda como 'es_defecto_app': nadie entra a Pases sin que un
     administrador le asigne un rol.

   Equivalencia con los niveles del sistema PHP (Pases.Usuario.nivel_usuario):
       1 Administrador | 2 Jefe de Taller | 3 Administrativo | 4 Receptor | 5 Cajero

   El script es idempotente: se puede ejecutar más de una vez.
   ============================================================================= */
USE [Dev-QA];
GO
SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

BEGIN TRANSACTION;

/* ---------------------------------------------------------------------------
   1. Aplicación
   --------------------------------------------------------------------------- */
DECLARE @app_id INT = (SELECT id FROM dbo.tbl_aplicaciones WHERE codigo = 'PASES_TALLER');

IF @app_id IS NULL
BEGIN
    IF NOT EXISTS (SELECT 1 FROM dbo.tbl_aplicaciones WHERE id = 5)
    BEGIN
        SET IDENTITY_INSERT dbo.tbl_aplicaciones ON;
        INSERT INTO dbo.tbl_aplicaciones (id, nombre, codigo, activo)
        VALUES (5, 'Pases de salida', 'PASES_TALLER', 1);
        SET IDENTITY_INSERT dbo.tbl_aplicaciones OFF;
    END
    ELSE
    BEGIN
        INSERT INTO dbo.tbl_aplicaciones (nombre, codigo, activo)
        VALUES ('Pases de salida', 'PASES_TALLER', 1);
        PRINT N'AVISO: el id 5 ya estaba ocupado; la aplicación se registró con otro id.';
    END

    SET @app_id = (SELECT id FROM dbo.tbl_aplicaciones WHERE codigo = 'PASES_TALLER');
END

PRINT CONCAT(N'Aplicación PASES_TALLER -> id ', @app_id);

/* ---------------------------------------------------------------------------
   2. Roles
   --------------------------------------------------------------------------- */
DECLARE @roles TABLE (nombre VARCHAR(100) PRIMARY KEY, nivel_legado INT);
INSERT INTO @roles (nombre, nivel_legado) VALUES
    ('Administrador',   1),
    ('Jefe de Taller',  2),
    ('Administrativo',  3),
    ('Receptor',        4),
    ('Cajero',          5);

INSERT INTO dbo.COTI_tbl_roles (nombre, activo, aplicacion_id, es_defecto_app)
SELECT r.nombre, 1, @app_id, 0
FROM @roles r
WHERE NOT EXISTS (SELECT 1 FROM dbo.COTI_tbl_roles x
                  WHERE x.aplicacion_id = @app_id AND x.nombre = r.nombre);

/* ---------------------------------------------------------------------------
   3. Permisos
   --------------------------------------------------------------------------- */
DECLARE @permisos TABLE (nombre VARCHAR(100) PRIMARY KEY);
INSERT INTO @permisos (nombre) VALUES
    ('pases.ver'),                    -- ver pases de sus talleres
    ('pases.ver_todos'),              -- ver pases de todos los talleres
    ('pases.crear'),
    ('pases.editar'),                 -- editar pases en estado Creado
    ('pases.editar_autorizado'),      -- editar pases ya autorizados
    ('pases.autorizar'),
    ('pases.autorizar_al_crear'),     -- al crear con "Facturar = Sí" queda autorizado
    ('pases.autorizar_con_pendientes'), -- autorizar aunque Integra tenga órdenes abiertas sin facturar
    ('pases.anular'),
    ('pases.imprimir'),
    ('historial.ver'),                -- historial de órdenes por vehículo / cliente
    ('catalogos.ver'),                -- sedes y talleres
    ('catalogos.editar'),
    ('usuarios.ver'),
    ('usuarios.asignar_rol');         -- asignar roles y talleres a usuarios

INSERT INTO dbo.COTI_tbl_permisos (nombre, aplicacion_id)
SELECT p.nombre, @app_id
FROM @permisos p
WHERE NOT EXISTS (SELECT 1 FROM dbo.COTI_tbl_permisos x
                  WHERE x.aplicacion_id = @app_id AND x.nombre = p.nombre);

/* ---------------------------------------------------------------------------
   4. Matriz rol -> permiso
   Basada en lo que permitía cada nivel en el sistema PHP
   (ajax/passesTable.ajax.php y las vistas de views/modules).
   --------------------------------------------------------------------------- */
DECLARE @matriz TABLE (rol VARCHAR(100), permiso VARCHAR(100), PRIMARY KEY (rol, permiso));
INSERT INTO @matriz (rol, permiso) VALUES
    -- Administrador: todo
    ('Administrador', 'pases.ver'), ('Administrador', 'pases.ver_todos'),
    ('Administrador', 'pases.crear'), ('Administrador', 'pases.editar'),
    ('Administrador', 'pases.editar_autorizado'), ('Administrador', 'pases.autorizar'),
    ('Administrador', 'pases.autorizar_con_pendientes'), ('Administrador', 'pases.anular'),
    ('Administrador', 'pases.imprimir'), ('Administrador', 'historial.ver'),
    ('Administrador', 'catalogos.ver'), ('Administrador', 'catalogos.editar'),
    ('Administrador', 'usuarios.ver'), ('Administrador', 'usuarios.asignar_rol'),

    -- Jefe de Taller: su taller; crea y edita pendientes; imprime
    ('Jefe de Taller', 'pases.ver'), ('Jefe de Taller', 'pases.crear'),
    ('Jefe de Taller', 'pases.editar'), ('Jefe de Taller', 'pases.imprimir'),
    ('Jefe de Taller', 'historial.ver'),

    -- Administrativo: todos los talleres; crea, edita (también autorizados), autoriza, imprime
    ('Administrativo', 'pases.ver'), ('Administrativo', 'pases.ver_todos'),
    ('Administrativo', 'pases.crear'), ('Administrativo', 'pases.editar'),
    ('Administrativo', 'pases.editar_autorizado'), ('Administrativo', 'pases.autorizar'),
    ('Administrativo', 'pases.imprimir'), ('Administrativo', 'historial.ver'),

    -- Receptor: su taller; crea y edita pendientes; imprime
    ('Receptor', 'pases.ver'), ('Receptor', 'pases.crear'),
    ('Receptor', 'pases.editar'), ('Receptor', 'pases.imprimir'),
    ('Receptor', 'historial.ver'),

    -- Cajero: su taller; autoriza (también al crear con factura); imprime
    -- (en PHP solo los usuarios 28 y 33 podían además crear: se les asigna
    --  también el rol Receptor en la migración)
    ('Cajero', 'pases.ver'), ('Cajero', 'pases.autorizar'),
    ('Cajero', 'pases.autorizar_al_crear'), ('Cajero', 'pases.imprimir'),
    ('Cajero', 'historial.ver');

INSERT INTO dbo.COTI_tbl_rol_permiso (rol_id, permiso_id)
SELECT r.id, p.id
FROM @matriz m
JOIN dbo.COTI_tbl_roles    r ON r.aplicacion_id = @app_id AND r.nombre = m.rol
JOIN dbo.COTI_tbl_permisos p ON p.aplicacion_id = @app_id AND p.nombre = m.permiso
WHERE NOT EXISTS (SELECT 1 FROM dbo.COTI_tbl_rol_permiso x
                  WHERE x.rol_id = r.id AND x.permiso_id = p.id);

COMMIT TRANSACTION;
GO

/* ---------------------------------------------------------------------------
   Verificación
   --------------------------------------------------------------------------- */
SELECT r.nombre AS rol, COUNT(rp.permiso_id) AS permisos
FROM dbo.COTI_tbl_roles r
JOIN dbo.tbl_aplicaciones a ON a.id = r.aplicacion_id AND a.codigo = 'PASES_TALLER'
LEFT JOIN dbo.COTI_tbl_rol_permiso rp ON rp.rol_id = r.id
GROUP BY r.nombre
ORDER BY r.nombre;
GO
