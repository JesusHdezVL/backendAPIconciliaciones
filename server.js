const express = require('express');
const sql = require('mssql');
const bodyParser = require('body-parser');
const cors = require('cors');
const env_var = require('dotenv').config();
const { format } = require('date-fns');
const { es } = require('date-fns/locale');

const app = express();
app.use(bodyParser.json());
app.use(cors());

const dbConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    options: {
        encrypt: true,
    }
};


let pool;

// Función para conectar a la base de datos con reintentos
const connectWithRetry = async () => {
    try {
        console.log('Intentando conectar a Azure SQL...');
        pool = await sql.connect(dbConfig);
        console.log('Conexión exitosa a Azure SQL');
    } catch (err) {
        console.error('Error al conectar a la base de datos:', err.message);
        setTimeout(connectWithRetry, 5000); // Reintenta después de 5 segundos
    }
};

// Llamar a la función de conexión
connectWithRetry();

// Middleware para verificar la conexión antes de cada request
app.use(async (req, res, next) => {
    if (!pool || !pool.connected) {
        try {
            console.log('Reconectando a la base de datos...');
            await connectWithRetry();
        } catch (err) {
            console.error('No se pudo reconectar:', err.message);
            return res.status(500).json({ message: 'Error al conectar a la base de datos' });
        }
    }
    next();
});

// Endpoints
app.post('/getData', async (req, res) => {
    const { filters } = req.body;

    // Construir la consulta dinámica con filtros
    let query = 'SELECT * FROM conciliacion WHERE 1=1'; // 1=1 permite concatenar condiciones fácilmente

    if (filters.id) {
        query += ' AND id = @id';
    }

    if (filters.fecha) {
        query += ' AND fecha = @fecha';
    }

    if (filters.descripcion) {
        query += ' AND descripcion LIKE @descripcion';
    }

    if (filters.referencia) {
        query += ' AND referencia LIKE @referencia';
    }

    if (filters.referencia_ampliada) {
        query += ' AND referencia_ampliada LIKE @referencia_ampliada';
    }

    if (filters.cargo) {
        query += ' AND estatus = @cargo';
    }

    if (filters.proveedor) {
        query += ' AND proveedor = @proveedor';
    }

    if (filters.asesor) {
        query += ' AND asesor = @asesor';
    }

    if (filters.corsario) {
        query += ' AND corsario = @corsario';
    }

    if (filters.recibo) {
        query += ' AND recibo = @recibo';
    }

    if (filters.abono && filters.abono.min !== null && filters.abono.max !== null) {
        query += ' AND abono BETWEEN @abonoMin AND @abonoMax';
    }

    if (filters.availability !== undefined && filters.availability !== null) {
        query += ' AND availability = @availability';
    }

    if (filters.sortBy) {
        const sortOrder = filters.sortOrder === 'asc' ? 'ASC' : 'DESC';
        query += ` ORDER BY ${filters.sortBy} ${sortOrder}`;
    }
    console.log(filters);
    console.log("query: ", query);
    try {
        // Crear una solicitud de consulta
        const request = pool.request();
        if (filters.id) {
            request.input('id', sql.Int, filters.id);
        }
    
        if (filters.fecha) {
        request.input('fecha', sql.Date, filters.fecha);
        }
    
        if (filters.descripcion) {
        request.input('descripcion', sql.VarChar, `%${filters.descripcion}%`);
        }
    
        if (filters.referencia) {
        request.input('referencia', sql.VarChar, `%${filters.referencia}%`);
        }
    
        if (filters.referencia_ampliada) {
        request.input('referencia_ampliada', sql.VarChar, `%${filters.referencia_ampliada}%`);
        }
    
        if (filters.cargo) {
        request.input('cargo', sql.VarChar, filters.cargo);
        }
    
        if (filters.proveedor) {
        request.input('proveedor', sql.VarChar, filters.proveedor);
        }
    
        if (filters.asesor) {
        request.input('asesor', sql.VarChar, filters.asesor);
        }
    
        if (filters.corsario) {
        request.input('corsario', sql.VarChar, filters.corsario);
        }
    
        if (filters.recibo) {
        request.input('recibo', sql.VarChar, filters.recibo);
        }
    
        if (filters.abono && filters.abono.min !== null && filters.abono.max !== null) {
        request.input('abonoMin', sql.Float, filters.abono.min);
        request.input('abonoMax', sql.Float, filters.abono.max);
        }
    
        if (filters.availability !== undefined && filters.availability !== null) {
        request.input('availability', sql.Bit, filters.availability);
        }
        console.log("params: ", request.params);
        // Ejecutar la consulta
        const result = await request.query(query);
        console.log(result.recordset);
        console.log(result.recordset.length);

        res.status(200).json(result.recordset);

        /*
        const result = await pool.request().query('SELECT * FROM conciliacion');
        console.log(result.recordset);
        res.status(200).json(result.recordset);
        */
    } catch (err) {
        console.error('Error al obtener datos:', err);
        res.status(500).send(err.message);
    }
});

app.post('/addDataLog/', async (req, res) => {
    const { id, usr, asesor, asesor_ant, corsario, corsario_ant, recibo, recibo_ant, fecha_validacion, fecha_validacion_ant } = req.body;
    if (!id && !usr && !asesor && !asesor_ant && !corsario && !corsario_ant && !recibo && !recibo_ant && !fecha_validacion && !fecha_validacion_ant) {
        return res.status(400).json({ message: 'Debe enviar al menos un campo para actualizar' });
    }
    try {
        const query = `
        INSERT INTO conciliacion_log(id, usr, asesor, asesor_ant, corsario, corsario_ant, recibo, recibo_ant, fecha_validacion, fecha_validacion_ant)
        VALUES (@id, @usr, @asesor, @asesor_ant, @corsario, @corsario_ant, @recibo, @recibo_ant, @fecha_validacion, @fecha_validacion_ant)
        `;
        await pool.request()
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
        res.status(201).json({ message: 'Registro creado exitosamente' });
    } catch (err) {
        console.error('Error al agregar el registro:', err);
        res.status(500).json({ message: 'Error interno del servidor' });
    }
});

app.post('/uploadData/', async (req, res) => {
    const data_list = req.body;

    if (!(data_list.length>0)) {
        console.log(res.status(400).json({ message: 'Debe enviar al menos un campo para actualizar' }));
        return res.status(400).json({ message: 'Debe enviar al menos un campo para actualizar' });
    }
    try {
        console.log(data_list);
        for (const item of data_list) {
            // Verificar si el registro ya existe
            const existsQuery = `
              SELECT * FROM conciliacion
              WHERE fecha = @fechaOperacion
              AND descripcion = @concepto
              AND referencia = @referencia
              AND referencia_ampliada = @referenciaAmpliada
              AND estatus = @cargo
              AND abono = @abono
            `;

            /*
                
                 
              
              
                
            */
            console.log(format(item['Fecha Operación'], 'yyyy-MM-dd'));
            const fecha = new Date(item['Fecha Operación']);
            // "Hack": agrega la diferencia de tu zona horaria en minutos
            fecha.setMinutes(fecha.getMinutes() + fecha.getTimezoneOffset());

            //const resultado = format(fecha, 'yyyy-MM-dd');
            console.log("resultado: ", format(fecha, 'yyyy-MM-dd')); 
            
            //console.log(new Date(item['Fecha Operación']));
            const existsResult = await pool.request()
              .input('fechaOperacion', sql.DateTime, format(fecha, 'yyyy-MM-dd'))
              .input('concepto', sql.VarChar, item['Concepto'])
              .input('referencia', sql.VarChar, item['Referencia'])
              .input('referenciaAmpliada', sql.VarChar, item['Referencia Ampliada'])
              .input('cargo',  sql.VarChar,item['Cargo']==null ? 'IS NULL':item['Cargo']=='' ? '' : item['Cargo'])
              .input('abono', sql.Float, item['Abono'] ? parseFloat(item['Abono']) : null)
              .query(existsQuery);
            console.log(existsResult.recordset);
            console.log('Consulta (parametrizada):', existsQuery);
            console.log('Parámetros: ', format(fecha, 'yyyy-MM-dd'));
            console.log('Parámetros: ', item['Concepto']);
            console.log('Parámetros: ', item['Referencia']);
            console.log('Parámetros: ', item['Referencia Ampliada']);
            console.log('Parámetros: ', item['Cargo']==null ? 'IS NULL':item['Cargo']=='' ? '' : item['Cargo']);
            console.log('Parámetros: ', item['Abono'] ? parseFloat(item['Abono']) : null);
            
            console.log(item['Cargo']==null ? 'IS NULL':item['Cargo']=='' ? '' : item['Cargo']);
            // Si no existe, insertar el registro
            if (existsResult.recordset.length === 0) {
              const insertQuery = `
                INSERT INTO conciliacion (fecha, descripcion, referencia, referencia_ampliada, estatus, abono)
                VALUES (@fechaOperacion, @concepto, @referencia, @referenciaAmpliada, @cargo, @abono)
              `;
            /*
              await pool.request()
                .input('fechaOperacion', sql.DateTime, new Date(item['Fecha Operación']))
                .input('concepto', sql.VarChar, item['Concepto'])
                .input('referencia', sql.VarChar, item['Referencia'])
                .input('referenciaAmpliada', sql.VarChar, item['Referencia Ampliada'])
                .input('cargo', sql.VarChar, item['Cargo'] ? parseFloat(item['Cargo']) : null)
                .input('abono', sql.Float, item['Abono'] ? parseFloat(item['Abono']) : null)
                .query(insertQuery);
            */
              console.log('Registro insertado:', item);
            } else {
              console.log('Registro ya existente:', item);
            }
          }
      
          res.status(200).json({ message: 'Verificación e inserción completadas' });
        
    } catch (err) {
        console.error('Error al agregar el registro:', err);
        res.status(500).json({ message: 'Error interno del servidor' });
    }
});

// Otros endpoints...

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
    

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`API corriendo en el puerto ${port}`));
