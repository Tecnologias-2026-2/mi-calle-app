const mysql = require('mysql');

// Create connection pool
const connection = mysql.createConnection({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'tecnologias_db',
  port: process.env.DB_PORT || 3306
});

// Connect to database
connection.connect((err) => {
  if (err) {
    console.error('Error conectando a la base de datos:', err.code);
    return;
  }
  console.log('Conectado a la base de datos');
});

module.exports = connection;
