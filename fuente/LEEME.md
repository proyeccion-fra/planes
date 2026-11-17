# Fuentes de la herramienta Proyección N-4 / Torre de control

Esta carpeta guarda el código con el que se arma la página. No la usa la página publicada: es el respaldo para poder seguir trabajando sin rehacer nada.

- `app.html`, `app.js`: página (proyección, Torre, buscador).
- `core.js`: lectura de IP19, IA10, IW38 y armado de la semana.
- `torre.js`: lectura y análisis de la Torre de control (tabla de puestos y catálogo de equipos GCON incluidos).
- `torretx.js` + `datos_fra.json`: arma la Torre desde transacciones SAP (IH06, IP16, IP18, IA10, IW38, MAF).
- `shim.js`: almacenamiento de la versión GitHub (data/base.json + navegador).
- `assemble.py`: arma el artefacto de Claude. `build_gh.py`: arma `index.html` para GitHub (copiar SOLO index.html; nunca sobrescribir data/base.json).
- `area/`: versión para otras áreas (sin datos de Flotación, filtro por área, datos en el navegador). `build_area.py` + `area_extra.py`.
- `scripts/cargar_semana.js`: carga una semana (IP19+IA10+IW38) y genera los archivos para data/base.json. `scripts/armar_torre.js`: arma una Torre desde transacciones.

Regla: agregar semanas o Torres sumando claves a data/base.json, sin modificar las existentes.
