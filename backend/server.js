require('dotenv').config();
const http = require('http');
const { createClient } = require('@supabase/supabase-js');

// 1. Conexión a Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// 2. Creación del servidor web
const server = http.createServer(async (req, res) => {
  // Configuración de CORS y JSON
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  // Manejo de la petición OPTIONS (CORS preflight)
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  // Endpoint GET: Obtener todos los reportes
  if (req.method === 'GET' && req.url === '/reportes') {
    try {
      const { data, error } = await supabase.from('reportes').select('*');
      if (error) throw error;
      
      res.writeHead(200);
      return res.end(JSON.stringify(data));
    } catch (error) {
      console.error("Error en GET /reportes:", error);
      res.writeHead(500);
      return res.end(JSON.stringify({ error: 'Error interno al obtener los reportes' }));
    }
  }

  // Endpoint POST: Crear un nuevo reporte
  else if (req.method === 'POST' && req.url === '/reportes') {
    let body = '';
    
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const { data: insertedData, error } = await supabase.from('reportes').insert([data]).select();
        
        if (error) throw error;
        
        res.writeHead(201);
        return res.end(JSON.stringify(insertedData));
      } catch (error) {
        console.error("Error en POST /reportes:", error);
        res.writeHead(500);
        return res.end(JSON.stringify({ error: 'Error interno al crear el reporte' }));
      }
    });
  }

  // Manejo de rutas inexistentes (404)
  else {
    res.writeHead(404);
    return res.end(JSON.stringify({ error: 'Ruta no encontrada' }));
  }
});

// 3. Encender el servidor
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor de Mi Calle ejecutándose en puerto ${PORT}`);
  console.log(`http://localhost:${PORT}`);
});