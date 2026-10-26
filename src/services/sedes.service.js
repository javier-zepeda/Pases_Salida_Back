const { QueryTypes } = require('sequelize');
const baseDatos = require("../config/baseDatos.js");

async function listarSedes() {
    const sedes = await baseDatos.query(
        `SELECT s.id_sede,
            s.nombre,
            s.direccion,
            s.mapa,
            s.activo,
            (SELECT COUNT(*)
             FROM Pases_Taller.taller t
             WHERE t.sede_id = s.id_sede
             AND t.activo = 1) AS talleres_activos
        FROM Pases_Taller.sede s
        ORDER BY s.nombre`,
        {type: QueryTypes.SELECT}
    );

    return sedes;
    
}

async function obtenerSedeById(idSede) {
    const filas = await baseDatos.query(
        `SELECT s.id_sede,
            s.nombre,
            s.direccion,
            s.mapa,
            s.activo,
            (SELECT COUNT(*)
             FROM Pases_Taller.taller t
             WHERE t.sede_id = s.id_sede
             AND t.activo = 1) AS talleres_activos
        FROM Pases_Taller.sede s
        WHERE s.id_sede = :idSede`,
        { replacements: { idSede: idSede}, type: QueryTypes.SELECT}
    );

    if(filas.length === 0){
        return null;
    }
    return filas[0];
}

async function existeNombreSede(idSedeExcluir, nombre) {
    const filas = await baseDatos.query(
        `SELECT COUNT(*) AS total
        FROM Pases_Taller.sede
        WHERE nombre = :nombre
        AND id_sede <> :idSedeExcluir`,
        { replacements: { nombre: nombre, idSedeExcluir: idSedeExcluir }, type: QueryTypes.SELECT }
    );

    return filas[0].total > 0;    
}

async function crearSede(datos) {
    const filas = await baseDatos.query(
        `INSERT INTO Pases_Taller.sede (nombre, direccion, mapa)
        OUTPUT INSERTED.id_sede
        VALUES (:nombre, :direccion, :mapa)`,
        {
            replacements: {
                nombre: datos.nombre,
                direccion: datos.direccion,
                mapa: datos.mapa
            },
            type: QueryTypes.SELECT
        }
    );

    return filas[0].id_sede;
}

async function editarSede(idSede, datos) {
    await baseDatos.query(
        `UPDATE Pases_Taller.sede
        SET nombre    = :nombre,
            direccion = :direccion,
            mapa      = :mapa
        WHERE id_sede = :idSede`,
        {
            replacements: {
                nombre: datos.nombre,
                direccion: datos.direccion,
                mapa: datos.mapa,
                idSede: idSede
            }
        }
    );
}

async function cambiarEstadoSede(idSede, activo) {
    await baseDatos.query(
        `UPDATE Pases_Taller.sede
        SET activo = :activo
        WHERE id_sede = :idSede`,
        { replacements: { activo: activo, idSede: idSede } }
    );
}

module.exports = {
    listarSedes, obtenerSedeById, existeNombreSede, crearSede, editarSede, cambiarEstadoSede
};
