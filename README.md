# Proyecciones FRA

Proyección de planes de mantenimiento a N-4 semanas (estándar SOMA) para Flotación FRA, Concentradora Chuquicamata.

- **Proyección N-4**: arrastra la IP19, IA10 e IW38 de SAP. Arma especialidad, ciclo y estatus, y muestra la carta Gantt de operaciones y HH. Las HH de planes sin orden se estiman con la hoja de ruta de la Torre de control (en rojo).
- **Torre de control**: buscador de planes (Txt plan, ubicación técnica, denominación, puesto, empresa) y análisis del plan matriz.

`data/base.json` guarda el historial de semanas y la Torre vigente; la página lo carga sola al abrir. Lo que se carga en el navegador queda solo en ese navegador.
