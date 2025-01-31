const express = require('express');
const sql = require('mssql');
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const bodyParser = require('body-parser');
const { body, validationResult } = require("express-validator");
const cors = require('cors');
const env_var = require('dotenv').config();
const { format } = require('date-fns');
const { es } = require('date-fns/locale');
const nodemailer = require('nodemailer');
const { marked } = require('marked');

const app = express();
app.use(bodyParser.json());
app.use(cors());
    /*
    const dbConfig = {
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        server: "localhost",
        database: process.env.DB_DATABASE,
        options: {
            encrypt: false,//true,
            enableArithAbort: true
        },
        debug: true,
        port: 1433 
    */
const dbConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    options: {
        encrypt: true,
    },
};

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.email_user,
        pass: process.env.email_password,
    },
    });

const users = [
{ id: 1, username: process.env.userNameId1, password: process.env.passwordId1 }, // Contraseña: 1234
];

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

async function closeDB() {
    try {
        if (pool) {
            await pool.close();
            console.log("Conexión cerrada correctamente");
        }
    } catch (error) {
        console.error("Error al cerrar la conexión:", error);
    }
}

const generateToken = (user) => {
  return jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "1h",
  });
};

// Middleware para verificar tokens
const verifyToken = (req, res, next) => {
  const token = req.headers["authorization"]?.split(" ")[1];

  if (!token) {
    return res.status(403).json({ error: "Token no proporcionado" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // Guarda la información del token en req.user
    next();
  } catch (err) {
    return res.status(401).json({ error: "Token inválido o expirado" });
  }
};



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

app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  

  /*
  console.log('user: '+ username);
  console.log('password: ' + password);
  console.log(process.env.userNameId1);
  console.log(process.env.passwordId1);
  */

  const user = users.find((u) => u.username === username);
  if (!user) {
    return res.status(401).json({ error: "Usuario incorrecto" });
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    return res.status(401).json({ error: "Credenciales incorrectas" });
  }

  const token = generateToken(user);
  res.json({ token });
});


app.post('/getData', verifyToken, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { filters } = req.body;
    console.log('getData filtros: ' + filters);
    // Construir la consulta dinámica con filtros
    let query = 'SELECT * FROM conciliacion WHERE 1=1'; // 1=1 permite concatenar condiciones fácilmente

    if (filters.id) {
        query += ' AND id = @id';
    }

    if (filters.fecha_inicio && filters.fecha_fin) {
        query += ' AND @fecha_inicio<= fecha AND fecha<= @fecha_fin';
    }
    else if(filters.fecha_inicio && !filters.fecha_fin){
        query += ' AND @fecha_inicio<= fecha';
    }
    else if (!filters.fecha_inicio && filters.fecha_fin){
        query += ' AND fecha <= @fecha_fin';
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
        query += ' AND editable = @availability';
    }

    if (filters.sortBy) {
        const sortOrder = filters.sortOrder === 'asc' ? 'ASC' : 'DESC';
        query += ` ORDER BY ${filters.sortBy} ${sortOrder}`;
    }
    
    console.log("query: ", query);
    try {
        // Llamar a la función de conexión
        connectWithRetry();
        // Crear una solicitud de consulta
        const request = pool.request();
        if (filters.id) {
            request.input('id', sql.Int, filters.id);
        }
    
        if (filters.fecha_inicio) {
            request.input('fecha_inicio', sql.Date, filters.fecha_inicio);
        }

        if (filters.fecha_fin) {
            request.input('fecha_fin', sql.Date, filters.fecha_fin);
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
        //console.log(result.recordset);
        console.log(result.recordset.length);

        await closeDB();

        res.status(200).json(result.recordset);

        /*
        const result = await pool.request().query('SELECT * FROM conciliacion');
        console.log(result.recordset);
        res.status(200).json(result.recordset);
        */
    } catch (err) {
        console.error('Error al obtener datos:', err);
        await closeDB();
        res.status(500).send(err.message);
    }
});


app.get('/getDataCambios/:id', verifyToken, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    try {
        // Llamar a la función de conexión
        connectWithRetry();
        var query;
        const id = req.params.id;
        var result = pool.request();
        if(id != -1){
            console.log("getDataCambios");
            query = `
            SELECT TOP 1 * 
            FROM controlCambios
            WHERE id = @id
            ORDER BY id_cambio DESC
            `;
    
            // Ejecutar la consulta con parámetros
            
            result.input('id', sql.Int, id) // Define el parámetro @id como entero
        }
        else{
            console.log("solicitud de todos los datos de cambios");
            query = `
            SELECT * 
            FROM controlCambios
            `;
        }
        const finalresult = await result.query(query);
        console.log('resultados cambios encontrado: ' + finalresult.recordset[0]);
        await closeDB();
        // Devolver los resultados como JSON
        res.json(finalresult.recordset);
    } catch (err) {
        console.error('Error al consultar la base de datos:', err);
        await closeDB();
        res.status(500).json({ error: 'Error interno del servidor' });
    }
    
});

app.put('/updateDataCambios/:id', verifyToken, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    
    console.log("Body /updateDataCambios/:id: ");
    console.log(req.body);
    console.log("\n Params /updateDataCambios/:id: ")
    console.log(req.params);
    console.log("\n");
    
    try {
        // Llamar a la función de conexión
        connectWithRetry();
        const { id } = req.params; // ID del registro a actualizar
        const { fecha_aprobacion_modificacion,  user_aprobacion_peticion, email_user_aprobacion_peticion} = req.body; // Datos enviados desde el cliente

        // Validar que se envíe al menos un campo
        if (!fecha_aprobacion_modificacion && !user_aprobacion_peticion && !email_user_aprobacion_peticion ) {
            return res.status(400).json({ message: 'Debe enviar al menos un campo para actualizar' });
        }
        console.log("punto  1");
        // Consulta para obtener el registro actual
        const selectQuery = `
            SELECT fecha_aprobacion_modificacion, user_aprobacion_peticion, email_user_aprobacion_peticion
            FROM dbo.controlCambios
            WHERE id_cambio = @id;
        `;

        console.log(selectQuery);
        const currentRecord = await pool.request()
            .input('id', sql.Int, id)
            .query(selectQuery);
        console.log(currentRecord.recordset[0]);
        if (currentRecord.recordset.length === 0) {
            return res.status(404).json({ message: 'Registro no encontrado' });
        }
        
        const currentData = currentRecord.recordset[0];

        // Construir dinámicamente la consulta de actualización
        let updateQuery = 'UPDATE controlCambios SET ';
        const updateFieldsControl = [];
        const updateInputsControl = [];

        if (fecha_aprobacion_modificacion && fecha_aprobacion_modificacion !== currentData.fecha_aprobacion_modificacion) {
            updateFieldsControl.push('fecha_aprobacion_modificacion = @fecha_aprobacion_modificacion');
            updateInputsControl.push({ name: 'fecha_aprobacion_modificacion', type: sql.DateTime, value: fecha_aprobacion_modificacion });
        }
        if (user_aprobacion_peticion && user_aprobacion_peticion !== currentData.user_aprobacion_peticion) {
            updateFieldsControl.push('user_aprobacion_peticion = @user_aprobacion_peticion');
            updateInputsControl.push({ name: 'user_aprobacion_peticion', type: sql.VarChar, value: user_aprobacion_peticion });
        }
        if (email_user_aprobacion_peticion && email_user_aprobacion_peticion !== currentData.email_user_aprobacion_peticion) {
            updateFieldsControl.push('email_user_aprobacion_peticion = @email_user_aprobacion_peticion');
            updateInputsControl.push({ name: 'email_user_aprobacion_peticion', type: sql.VarChar, value: email_user_aprobacion_peticion });
        }
       
        // Si no hay campos por actualizar
        if (updateFieldsControl.length === 0) {
            return res.status(200).json({ message: 'No hay cambios en los datos' });
        }

        updateQuery += updateFieldsControl.join(', ') + ' WHERE id_cambio = @id';

        // Ejecutar la consulta de actualización
        const updateRequestControl = pool.request();
        updateInputsControl.forEach(input => updateRequestControl.input(input.name, input.type, input.value));
        updateRequestControl.input('id', sql.Int, id);

        console.log(updateQuery);

        const result = await updateRequestControl.query(updateQuery);

        await closeDB();

        if (result.rowsAffected[0] > 0) {
            res.status(200).json({ message: 'Registro cambios actualizado correctamente' });
        } else {
            res.status(404).json({ message: 'No se pudo actualizar el registro de cambios' });
        }
    } catch (err) {
        console.error(err);
        await closeDB();
        res.status(500).send(err.message);
    }
});


app.post('/addDataCambios', verifyToken, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { id, fechaPeticionModificacion, userPeticionModificacion, emailUserPeticionModificacion, asesor, corsario, recibo, fecha_validacion, notaRazonCambios} = req.body;
    if (!id && !fechaPeticionModificacion && !userPeticionModificacion && !emailUserPeticionModificacion && !asesor && !corsario && !recibo && !fecha_validacion && !notaRazonCambios) {
        return res.status(400).json({ message: 'Debe enviar al menos un campo para actualizar' });
    }
    try {
        // Llamar a la función de conexión
        connectWithRetry();
        console.log(req.body);
        const query = `
        INSERT INTO controlCambios(id, fecha_peticion_modificacion, user_peticion_modificacion, email_user_peticion_modificacion, Asesor, Corsario, Recibo, fecha_validacion, notaRazonCambios)
        VALUES (@id, @fechaPeticionModificacion, @userPeticionModificacion, @emailUserPeticionModificacion, @asesor, @corsario, @recibo, @fecha_validacion, @notaRazonCambios)
        `;
        const request = pool.request()
            .input('id', sql.Int, id)
            .input('fechaPeticionModificacion', sql.DateTime, new Date(fecha_validacion))
            .input('userPeticionModificacion', sql.VarChar, userPeticionModificacion)
            .input('emailUserPeticionModificacion', sql.VarChar, emailUserPeticionModificacion)
            .input('asesor', sql.VarChar, asesor)
            .input('corsario', sql.VarChar, corsario)
            .input('recibo', sql.VarChar, recibo)
            .input('fecha_validacion', sql.DateTime, new Date(fecha_validacion))
            .input('notaRazonCambios', sql.VarChar, notaRazonCambios)

        console.log("params addlogs: ", request.params);
        result = await request.query(query);
        await closeDB();
        res.status(200).json({ message: 'Registro en cambios creado exitosamente' });
    } catch (err) {
        console.error('Error al agregar el registro a la tabla cambios:', err);
        await closeDB();
        res.status(500).json({ message: 'Error interno del servidor' });
    }
});

app.post('/addDataLog', verifyToken, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    // Llamar a la función de conexión
    connectWithRetry();
    const { id, usr, asesor, asesor_ant, corsario, corsario_ant, recibo, recibo_ant, fecha_validacion, fecha_validacion_ant, availability, availability_ant } = req.body;
    if (!id && !usr && !asesor && !asesor_ant && !corsario && !corsario_ant && !recibo && !recibo_ant && !fecha_validacion && !fecha_validacion_ant && !availability && !availability_ant) {
        return res.status(400).json({ message: 'Debe enviar al menos un campo para actualizar' });
    }
    try {
        console.log(req.body);
        const query = `
        INSERT INTO conciliacion_log(id, usr, asesor, asesor_ant, corsario, corsario_ant, recibo, recibo_ant, fecha_validacion, fecha_validacion_ant, editable, editable_ant)
        VALUES (@id, @usr, @asesor, @asesor_ant, @corsario, @corsario_ant, @recibo, @recibo_ant, @fecha_validacion, @fecha_validacion_ant, @availability, @availability_ant)
        `;
        const request = pool.request()
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
            .input('availability', sql.Bit, availability)
            .input('availability_ant', sql.Bit, availability_ant)

        console.log("params addlogs: ", request.params);
        result = await request.query(query);

        await closeDB();
        res.status(201).json({ message: 'Registro creado exitosamente' });
    } catch (err) {
        console.error('Error al agregar el registro:', err);
        await closeDB();
        res.status(500).json({ message: 'Error interno del servidor' });
    }
});

app.post('/send-email', verifyToken, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { to, subject, text } = req.body
    const htmlBody = marked(text.trim()); // Convertir a HTML
    console.log(htmlBody);
    const mailOptions = {
        from: 'jesus.hernandez.vlili@gmail.com',
        to: to,
        subject: subject,
        html: htmlBody, //
      };
    console.log("transporter");
    transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
        console.log(error);
        res.status(500).json({ message: 'Error interno del servidor, error: ' + error });
    } else {
        res.status(200).json({ message: 'Petición enviada exitosamente' });
        console.log('Solicitud enviada con notificación por correo');
    }
    });
  });

app.post('/uploadData', verifyToken, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const data_list = req.body;

    if (!(data_list.length>0)) {
        console.log(res.status(400).json({ message: 'Debe enviar al menos un campo para actualizar' }));
        return res.status(400).json({ message: 'Debe enviar al menos un campo para actualizar' });
    }
    try {
        // Llamar a la función de conexión
        connectWithRetry();
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
            
              await pool.request()
                .input('fechaOperacion', sql.DateTime, new Date(item['Fecha Operación']))
                .input('concepto', sql.VarChar, item['Concepto'])
                .input('referencia', sql.VarChar, item['Referencia'])
                .input('referenciaAmpliada', sql.VarChar, item['Referencia Ampliada'])
                .input('cargo', sql.VarChar, item['Cargo'] ? parseFloat(item['Cargo']) : null)
                .input('abono', sql.Float, item['Abono'] ? parseFloat(item['Abono']) : null)
                .query(insertQuery);
            
              console.log('Registro insertado:', item);
            } else {
              console.log('Registro ya existente:', item);
            }
          }
          await closeDB();
          res.status(200).json({ message: 'Verificación e inserción completadas' });
        
    } catch (err) {
        console.error('Error al agregar el registro:', err);
        await closeDB();
        res.status(500).json({ message: 'Error interno del servidor' });
    }
});

// Otros endpoints...

    // Endpoint para actualizar datos
app.put('/updateData/:id', verifyToken, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    

    console.log("/updateData/:id Body: ");
    console.log(req.body);
    console.log("\n /updateData/:id Params: ")
    console.log(req.params);
    console.log("\n");
    try {
        const { id } = req.params; // ID del registro a actualizar
        const { asesor, corsario, recibo, fecha_validacion, availability, estatusCambio } = req.body; // Datos enviados desde el cliente

        // Llamar a la función de conexión
        connectWithRetry();
        // Validar que se envíe al menos un campo
        if (!asesor && !corsario && !recibo && !fecha_validacion && !availability && !estatusCambio) {
            return res.status(400).json({ message: 'Debe enviar al menos un campo para actualizar' });
        }

        // Consulta para obtener el registro actual
        const selectQuery = `
            SELECT asesor, corsario, recibo, fecha_validacion, editable, estatusCambio
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
        if (availability != null) {
            updateFields.push('editable = @availability');
            updateInputs.push({ name: 'availability', type: sql.Bit, value: availability });
        }
        if (estatusCambio && estatusCambio !== currentData.estatusCambio) {
            updateFields.push('estatusCambio = @estatusCambio');
            updateInputs.push({ name: 'estatusCambio', type: sql.VarChar, value: estatusCambio});
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
            await closeDB();
            res.status(200).json({ message: 'Registro actualizado correctamente' });
        } else {
            await closeDB();
            res.status(404).json({ message: 'No se pudo actualizar el registro' });
        }
    } catch (err) {
        console.error(err);
        await closeDB();
        res.status(500).send(err.message);
    }
});
    

const port = process.env.PORT || 8080; //8080   3000
app.listen(port, () => console.log(`API corriendo en el puerto ${port}`));
