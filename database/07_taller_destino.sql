/* =============================================================================
   PASES DE SALIDA - 07. Taller de destino (pases de traslado)
   -----------------------------------------------------------------------------
   Un traslado mueve la unidad de un taller a otro: además del taller de salida
   (taller_id) se registra a qué taller va (taller_destino_id).

   1. tipo_pase.lleva_destino: marca qué tipos piden taller de destino
      (igual que requiere_orden y lleva_detalle). Solo TRASLADO = 1.
      Si mañana otro tipo lo necesita, se cambia aquí sin tocar código.
   2. pase_salida.taller_destino_id: opcional (NULL), apunta a un taller y no
      puede ser el mismo taller de salida.
      Los traslados migrados del PHP quedan en NULL ("no registrado").

   Se puede ejecutar varias veces: cada paso revisa si ya está hecho.
   (Cada paso va en su propio lote GO: SQL Server no deja usar una columna
   en el mismo lote en que se crea.)
   ============================================================================= */
USE [Dev-QA];
GO
SET NOCOUNT ON;
SET XACT_ABORT ON;
SET QUOTED_IDENTIFIER ON;   -- lo exigen los índices filtrados (SSMS ya lo trae activo; sqlcmd no)
GO

/* ---------------------------------------------------------------------------
   1. tipo_pase.lleva_destino
   --------------------------------------------------------------------------- */
IF COL_LENGTH('Pases_Taller.tipo_pase', 'lleva_destino') IS NULL
    ALTER TABLE Pases_Taller.tipo_pase
        ADD lleva_destino BIT NOT NULL
            CONSTRAINT DF_tipo_pase_lleva_destino DEFAULT (0);   -- 1 = pide taller de destino (traslado)
GO

UPDATE Pases_Taller.tipo_pase
SET lleva_destino = 1
WHERE codigo = 'TRASLADO' AND lleva_destino = 0;
GO

/* ---------------------------------------------------------------------------
   2. pase_salida.taller_destino_id
   --------------------------------------------------------------------------- */
IF COL_LENGTH('Pases_Taller.pase_salida', 'taller_destino_id') IS NULL
    ALTER TABLE Pases_Taller.pase_salida
        ADD taller_destino_id INT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_pase_salida_taller_destino')
    ALTER TABLE Pases_Taller.pase_salida
        ADD CONSTRAINT FK_pase_salida_taller_destino
            FOREIGN KEY (taller_destino_id) REFERENCES Pases_Taller.taller (id_taller);
GO

-- El destino no puede ser el mismo taller de salida
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_pase_salida_destino_distinto')
    ALTER TABLE Pases_Taller.pase_salida
        ADD CONSTRAINT CK_pase_salida_destino_distinto
            CHECK (taller_destino_id IS NULL OR taller_destino_id <> taller_id);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_pase_salida_taller_destino_id'
               AND object_id = OBJECT_ID(N'Pases_Taller.pase_salida'))
    CREATE INDEX IX_pase_salida_taller_destino_id ON Pases_Taller.pase_salida (taller_destino_id);
GO

/* ---------------------------------------------------------------------------
   Revisión
   --------------------------------------------------------------------------- */
SELECT id_tipo, codigo, requiere_orden, valida_pendientes, lleva_detalle, lleva_destino
FROM Pases_Taller.tipo_pase
ORDER BY id_tipo;

SELECT COUNT(*) AS traslados_sin_destino
FROM Pases_Taller.pase_salida
WHERE tipo_pase_id = (SELECT id_tipo FROM Pases_Taller.tipo_pase WHERE codigo = 'TRASLADO')
  AND taller_destino_id IS NULL;
GO
