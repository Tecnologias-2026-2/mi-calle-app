-- V9: Auditoria exclusivamente de lectura de politicas Mi Calle.
-- No modifica tablas, politicas, usuarios, Storage ni otros objetos.

select
  schemaname as esquema,
  tablename as tabla,
  policyname as nombre,
  cmd as operacion,
  roles,
  permissive as es_permisiva,
  qual as expresion_using,
  with_check as expresion_with_check
from pg_policies
where (schemaname = 'public'
       and tablename in (
         'perfiles',
         'reportes',
         'ubicaciones',
         'fotografias',
         'historial_estados'
       ))
   or (schemaname = 'storage'
       and tablename = 'objects')
order by schemaname, tablename, policyname;
