/* =============================================================================
   PASES DE SALIDA - 06. Rol "Cajero Receptor"
   -----------------------------------------------------------------------------
   Para las personas "comodín" de las sucursales, que cobran (cajero) y también
   reciben vehículos (receptor). En lugar de darles dos roles, tienen uno solo.

   Permisos = Receptor + Cajero:
       pases.ver, pases.crear, pases.editar, pases.imprimir, historial.ver,
       pases.autorizar, pases.autorizar_al_crear
   Igual que los demás roles (menos Administrador y Administrativo): solo ve
   y trabaja los talleres que tiene asignados.
   Se puede ejecutar varias veces: no duplica nada.
   ============================================================================= */
USE [Dev-QA];
GO
SET NOCOUNT ON;
SET XACT_ABORT ON;
SET QUOTED_IDENTIFIER ON;   -- lo exige un índice filtrado de COTI_tbl_roles (SSMS ya lo trae activo; sqlcmd no)
GO

BEGIN TRANSACTION;

DECLARE @app_id INT = (SELECT id FROM dbo.tbl_aplicaciones WHERE codigo = 'PASES_TALLER');

IF @app_id IS NULL
    THROW 50000, N'No existe la aplicación PASES_TALLER (ejecute primero el script 02).', 1;

/* ---------------------------------------------------------------------------
   1. Rol y permisos
   --------------------------------------------------------------------------- */
IF NOT EXISTS (SELECT 1 FROM dbo.COTI_tbl_roles WHERE aplicacion_id = @app_id AND nombre = 'Cajero Receptor')
    INSERT INTO dbo.COTI_tbl_roles (nombre, activo, aplicacion_id, es_defecto_app)
    VALUES ('Cajero Receptor', 1, @app_id, 0);

DECLARE @rol_cajero_receptor INT = (SELECT id FROM dbo.COTI_tbl_roles WHERE aplicacion_id = @app_id AND nombre = 'Cajero Receptor');
DECLARE @rol_cajero          INT = (SELECT id FROM dbo.COTI_tbl_roles WHERE aplicacion_id = @app_id AND nombre = 'Cajero');
DECLARE @rol_receptor        INT = (SELECT id FROM dbo.COTI_tbl_roles WHERE aplicacion_id = @app_id AND nombre = 'Receptor');

DECLARE @permisos TABLE (nombre VARCHAR(100) PRIMARY KEY);
INSERT INTO @permisos (nombre) VALUES
    ('pases.ver'),
    ('pases.crear'),
    ('pases.editar'),
    ('pases.autorizar'),
    ('pases.autorizar_al_crear'),
    ('pases.imprimir'),
    ('historial.ver');

INSERT INTO dbo.COTI_tbl_rol_permiso (rol_id, permiso_id)
SELECT @rol_cajero_receptor, p.id
FROM @permisos x
JOIN dbo.COTI_tbl_permisos p ON p.aplicacion_id = @app_id AND p.nombre = x.nombre
WHERE NOT EXISTS (SELECT 1 FROM dbo.COTI_tbl_rol_permiso rp
                  WHERE rp.rol_id = @rol_cajero_receptor AND rp.permiso_id = p.id);

/* ---------------------------------------------------------------------------
   2. Usuarios con Cajero Y Receptor → Cajero Receptor
   --------------------------------------------------------------------------- */
DECLARE @usuarios TABLE (usuario_id INT PRIMARY KEY);

INSERT INTO @usuarios (usuario_id)
SELECT ur.usuario_id
FROM dbo.COTI_tbl_usuario_rol ur
WHERE ur.rol_id IN (@rol_cajero, @rol_receptor)
GROUP BY ur.usuario_id
HAVING COUNT(DISTINCT ur.rol_id) = 2;

INSERT INTO dbo.COTI_tbl_usuario_rol (usuario_id, rol_id, es_defecto)
SELECT u.usuario_id, @rol_cajero_receptor, 0
FROM @usuarios u
WHERE NOT EXISTS (SELECT 1 FROM dbo.COTI_tbl_usuario_rol x
                  WHERE x.usuario_id = u.usuario_id AND x.rol_id = @rol_cajero_receptor);

DELETE ur
FROM dbo.COTI_tbl_usuario_rol ur
JOIN @usuarios u ON u.usuario_id = ur.usuario_id
WHERE ur.rol_id IN (@rol_cajero, @rol_receptor);

DECLARE @cantidad_usuarios INT = (SELECT COUNT(*) FROM @usuarios);
PRINT CONCAT(N'Usuarios pasados a Cajero Receptor: ', @cantidad_usuarios);

/* ---------------------------------------------------------------------------
   3. El Cajero no crea pases: se le quita 'autorizar_al_crear'
   --------------------------------------------------------------------------- */
DELETE rp
FROM dbo.COTI_tbl_rol_permiso rp
JOIN dbo.COTI_tbl_permisos p ON p.id = rp.permiso_id
WHERE rp.rol_id = @rol_cajero
  AND p.aplicacion_id = @app_id
  AND p.nombre = 'pases.autorizar_al_crear';

COMMIT TRANSACTION;
GO

/* ---------------------------------------------------------------------------
   Revisión: permisos por rol y usuarios con el rol nuevo
   --------------------------------------------------------------------------- */
SELECT r.nombre AS rol, COUNT(rp.permiso_id) AS permisos,
       STRING_AGG(p.nombre, ', ') WITHIN GROUP (ORDER BY p.nombre) AS lista
FROM dbo.COTI_tbl_roles r
LEFT JOIN dbo.COTI_tbl_rol_permiso rp ON rp.rol_id = r.id
LEFT JOIN dbo.COTI_tbl_permisos p     ON p.id = rp.permiso_id
WHERE r.aplicacion_id = (SELECT id FROM dbo.tbl_aplicaciones WHERE codigo = 'PASES_TALLER')
  AND r.nombre IN ('Cajero', 'Receptor', 'Cajero Receptor')
GROUP BY r.nombre;

SELECT ur.usuario_id, r.nombre AS rol
FROM dbo.COTI_tbl_usuario_rol ur
JOIN dbo.COTI_tbl_roles r ON r.id = ur.rol_id
WHERE r.aplicacion_id = (SELECT id FROM dbo.tbl_aplicaciones WHERE codigo = 'PASES_TALLER')
  AND r.nombre = 'Cajero Receptor';
GO
