/* =============================================================================
   PASES DE SALIDA - 05. Cliente opcional según el tipo de pase
   -----------------------------------------------------------------------------
   Base de datos : Dev-QA
   Esquema       : Pases_Taller

   En "Vehículo interno", "Suministros" y "Traslado de unidad" no hay cliente
   (el que sale es un empleado, que se registra en el campo piloto).
   El cliente sigue siendo obligatorio en "Unidad terminada" (1) y
   "Prueba en carretera" (2), igual que el número de orden.

   El script es idempotente: se puede ejecutar más de una vez.
   ============================================================================= */
USE [Dev-QA];
GO
SET NOCOUNT ON;
GO

IF EXISTS (SELECT 1 FROM sys.columns
           WHERE object_id = OBJECT_ID(N'Pases_Taller.pase_salida')
             AND name = N'cliente'
             AND is_nullable = 0)
    ALTER TABLE Pases_Taller.pase_salida ALTER COLUMN cliente NVARCHAR(400) NULL;
GO

-- Debe coincidir con tipo_pase.requiere_orden (los tipos con orden llevan cliente)
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_pase_salida_cliente_segun_tipo')
    ALTER TABLE Pases_Taller.pase_salida
        ADD CONSTRAINT CK_pase_salida_cliente_segun_tipo
            CHECK (tipo_pase_id NOT IN (1, 2) OR cliente IS NOT NULL);
GO

PRINT N'Cliente opcional según el tipo de pase: listo.';
GO
