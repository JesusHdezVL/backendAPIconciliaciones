const express = require('express');
const sql = require('mssql');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
app.use(bodyParser.json());
app.use(cors());

// Configuración de conexión a Azure SQL
const dbConfig = {
    user: 'admin_viajes_lili',
    password: '$3<Leca8#LP,5y9',
    server: 'server-viajes-lili.database.windows.net',
    database: 'db_viajes_lili',
    options: {
        encrypt: true, // Asegura la conexión
    }
};

sql.connect(dbConfig).then(pool => {
    console.log('Conexión exitosa a Azure SQL');

    // Endpoint para obtener datos
    app.get('/getData', async (req, res) => {
        try {
            const result = await pool.request().query('SELECT * FROM conciliacion');
            res.status(200).json(result.recordset);
        } catch (err) {
            res.status(500).send(err.message);
        }
    });

    app.post('/addDataLog/', async (req, res) => {
        const { id, usr, asesor, asesor_ant, corsario,corsario_ant, recibo, recibo_ant, fecha_validacion, fecha_validacion_ant } = req.body; 
        console.log(req.body);
        if (!id && !usr && !asesor && !asesor_ant && !corsario && !corsario_ant && !recibo && !recibo_ant && !fecha_validacion && !fecha_validacion_ant) {
            return res.status(400).json({ message: 'Debe enviar al menos un campo para actualizar' });
        }
        try {
            const query = `
            INSERT INTO conciliacion_log(id, usr, asesor, asesor_ant, corsario, corsario_ant, recibo, recibo_ant, fecha_validacion, fecha_validacion_ant)
            VALUES (@id, @usr, @asesor, @asesor_ant, @corsario, @corsario_ant, @recibo, @recibo_ant, @fecha_validacion, @fecha_validacion_ant)
            `;

            const result = await pool.request()
                .input('id', sql.Int, id)
                .input('usr', sql.VarChar, usr)
                .input('asesor', sql.VarChar, asesor)
                .input('asesor_ant', sql.VarChar, asesor_ant)
                .input('corsario', sql.VarChar, corsario)
                .input('corsario_ant', sql.VarChar, corsario_ant)
                .input('recibo', sql.VarChar, recibo)
                .input('recibo_ant', sql.VarChar, recibo_ant)
                .input('fecha_validacion', sql.DateTime, new Date(fecha_validacion))
                .input('fecha_validacion_ant', sql.DateTime, new Date(fecha_validacion_ant))
                .query(query);
            console.log(result.output);
            console.log(result);
            res.status(201).json({ message: 'Registro creado exitosamente' });
        } catch (err) {
            console.error('Error al agregar el registro:', err);
            res.status(500).json({ message: 'Error interno del servidor' });
        }
    });

    // Endpoint para actualizar datos
    app.put('/updateData/:id', async (req, res) => {
        console.log("Body: ");
        console.log(req.body);
        console.log("\n Params: ")
        console.log(req.params);
        console.log("\n");
        try {
            const { id } = req.params; // ID del registro a actualizar
            const { asesor, corsario, recibo, fecha_validacion } = req.body; // Datos enviados desde el cliente
    
            // Validar que se envíe al menos un campo
            if (!asesor && !corsario && !recibo && !fecha_validacion) {
                return res.status(400).json({ message: 'Debe enviar al menos un campo para actualizar' });
            }
    
            // Consulta para obtener el registro actual
            const selectQuery = `
                SELECT asesor, corsario, recibo, fecha_validacion
                FROM conciliacion
                WHERE id = @id
            `;
            const currentRecord = await pool.request()
                .input('id', sql.Int, id)
                .query(selectQuery);
    
            if (currentRecord.recordset.length === 0) {
                return res.status(404).json({ message: 'Registro no encontrado' });
            }
    
            const currentData = currentRecord.recordset[0];
    
            // Construir dinámicamente la consulta de actualización
            let updateQuery = 'UPDATE conciliacion SET ';
            const updateFields = [];
            const updateInputs = [];
    
            if (asesor && asesor !== currentData.asesor) {
                updateFields.push('asesor = @asesor');
                updateInputs.push({ name: 'asesor', type: sql.VarChar, value: asesor });
            }
            if (corsario && corsario !== currentData.corsario) {
                updateFields.push('corsario = @corsario');
                updateInputs.push({ name: 'corsario', type: sql.VarChar, value: corsario });
            }
            if (recibo && recibo !== currentData.recibo) {
                updateFields.push('recibo = @recibo');
                updateInputs.push({ name: 'recibo', type: sql.VarChar, value: recibo });
            }
            if (fecha_validacion && fecha_validacion !== currentData.fecha_validacion?.toISOString()) {
                updateFields.push('fecha_validacion = @fecha_validacion');
                updateInputs.push({ name: 'fecha_validacion', type: sql.DateTime, value: new Date(fecha_validacion) });
            }
    
            // Si no hay campos por actualizar
            if (updateFields.length === 0) {
                return res.status(200).json({ message: 'No hay cambios en los datos' });
            }
    
            updateQuery += updateFields.join(', ') + ' WHERE id = @id';
    
            // Ejecutar la consulta de actualización
            const updateRequest = pool.request();
            updateInputs.forEach(input => updateRequest.input(input.name, input.type, input.value));
            updateRequest.input('id', sql.Int, id);
    
            const result = await updateRequest.query(updateQuery);
    
            if (result.rowsAffected[0] > 0) {
                res.status(200).json({ message: 'Registro actualizado correctamente' });
            } else {
                res.status(404).json({ message: 'No se pudo actualizar el registro' });
            }
        } catch (err) {
            console.error(err);
            res.status(500).send(err.message);
        }
    });
    

}).catch(err => console.error('Error de conexión:', err));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`API corriendo en el puerto ${port}`));
//app.listen(3000, () => console.log('API corriendo en el puerto 3000'));






/*

const express = require('express');
const sql = require('mssql');
const bodyParser = require('body-parser');
const cors = require('cors');


const app = express();
app.use(bodyParser.json());
app.use(cors());

// Configuración de conexión a Azure SQL
const dbConfig = {
    user: 'admin_viajes_lili',
    password: '$3<Leca8#LP,5y9',
    server: 'server-viajes-lili.database.windows.net',
    database: 'db_viajes_lili',
    options: {
        encrypt: true, // Asegura la conexión
    }
};

sql.connect(dbConfig).then(pool => {
    console.log('Conexión exitosa a Azure SQL');

    // Ejemplo: Endpoint para obtener datos
    app.get('/getData', async (req, res) => {
        try {
            const result = await pool.request().query('SELECT * FROM conciliacion');
            //print(result.recordset)
            res.status(200).json(result.recordset);
        } catch (err) {
            res.status(500).send(err.message);
        }
    });

}).catch(err => console.error('Error de conexión:', err));

app.listen(3000, () => console.log('API corriendo en el puerto 3000'));

*/