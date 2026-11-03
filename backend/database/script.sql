-- Crear base de datos
CREATE DATABASE IF NOT EXISTS tecnologias_db;
USE tecnologias_db;

-- Crear tabla de usuarios
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  email VARCHAR(100) NOT NULL UNIQUE,
  telefono VARCHAR(20),
  fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Crear índices
CREATE INDEX idx_email ON users(email);
CREATE INDEX idx_fecha_creacion ON users(fecha_creacion);

-- Insertar datos de ejemplo
INSERT INTO users (nombre, email, telefono) VALUES
('Juan Pérez', 'juan@example.com', '3101234567'),
('María García', 'maria@example.com', '3107654321'),
('Carlos López', 'carlos@example.com', '3109876543');
