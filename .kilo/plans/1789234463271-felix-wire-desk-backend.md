# Plan de Felix: backend y tools de Wire Desk

Estado: listo para implementar. Fecha: 2026-09-12. Este documento planifica; no acredita implementacion ni pruebas ejecutadas.

## 1. Objetivo y alcance acordado

Entregar el archivo persistente de decisiones y los tools de lectura/escritura que cierran el flujo de Wire Desk dentro de Slack: contexto del hilo -> brief -> ediciones -> eleccion humana -> archivo -> consulta con datos reales.

- Felix confirmo el recorte del hackathon: un unico equipo/creador por instancia, cinco campos por decision y estadisticas de todo el historial.
- Se cuentan **elecciones**, no publicaciones, alcance, engagement ni rendimiento. No se registran descartes ni se filtra por mes.
- Felix confirmo conservar el historial corrupto: lectura degradada sin terminar el proceso y escrituras bloqueadas hasta recuperarlo; los errores de permisos/disco no equivalen a historial vacio.
- Se mantiene la decision original de no implementar locking ni cola de escrituras. La alternativa de cola no fue aprobada. Concurrencia entre escrituras y multiples procesos sobre el mismo archivo quedan fuera de alcance.
- No se construyen dashboard web, app movil Wire Desk, SQLite, microservicios, autenticacion nueva, conectores sociales ni publicacion real.
- Este plan concreta `docs/PLAN_HACKATHON.md`, especialmente el track de Felix, y el recorte de `docs/SPEC_WIRE_DESK.md`, secciones 9-11. Las decisiones confirmadas aqui prevalecen sobre los esqueletos cuando difieren.

## 2. Base real del repositorio

| Area revisada | Estado y consecuencia para el trabajo |
|---|---|
| `apps/channel/src/tools.tsx:29-127` | Existen `readThread` y `proposeAction`; no hay store ni tools Wire Desk. Conservar su comportamiento y pruebas de referencia. Los tools retornan datos, no `{ ok: true }`. |
| `apps/channel/src/components.tsx` y `channel.tsx` | Siguen registrados los componentes de incidentes. Ruby agrega las cards; Diego cambia el registro al final. Felix no edita estos archivos en paralelo. |
| `apps/channel/src/agent.ts:19-85` | `ChannelRunAgent` resuelve la reentrada del agente. Mantener su clonacion, aborto e instancias internas nuevas. |
| `packages/agent-core/src/agent.ts:21-45` | `makeAgent` admite `prompt` y `workplace`; conserva `maxSteps: 10`. El override de prompt es suficiente, no hace falta otro backend. |
| `packages/agent-core/src/shared.ts` y `schemas.ts` | Frontera browser-safe. Mantener tipos y validacion del archivo local en `apps/channel/src/store.ts`; no exportar `fs` por `agent-core/shared`. Un tipo aislado no es el problema: lo son las dependencias transitivas de servidor. |
| `apps/web` y `apps/mobile` | Web conserva incidentes/follow-ups; movil conserva finanzas y su runtime servido por web. No adaptarlos ni instalar todas las superficies. |
| `apps/web/src/lib/server/followups.ts` | Referencia de separacion entre aprobacion, persistencia y confirmacion; no reutilizar su almacen ni incorporar su complejidad al MVP. |
| `.gitignore:14-15` | `.data/` ya esta ignorado. Verificarlo, no agregar la regla otra vez. |
| `apps/channel/package.json:8-17` | Tests descubren exclusivamente `src/**/*.test.tsx`. Mantener Channels `0.9.2`, runtime `1.70.3` y JSX de Channels, no React. |
| `package.json` y `pnpm-workspace.yaml` | Node >=22, pnpm `11.1.3`, override `@ag-ui/client=0.0.59`. `verify` cubre core/channel/web; no movil ni Auth0, ni builds o servicios reales. |
| `README.md`, `dev-docs`, `SUBMISSION.md` | Parte del quickstart aun dice `npm ci` aunque el root usa pnpm. El guion Wire Desk ya existe en `dev-docs/demo-prompts.md`; actualizarlo, no duplicarlo. |

Tambien se revisaron `AGENTS.md`, la skill `build-channels-agent`, las reglas/overview del hackathon, `using-sponsor-tools.md` y la estrategia interna de jueces. La rubrica oficial y el portal local prevalecen sobre predicciones internas de puntuacion.

## 3. Flujo y contratos congelados

```text
Hilo de Slack: equipo/creador de esta instancia
                         |
             ChannelRunAgent + makeAgent
                         |
         read_thread / search_web / cards
                         |
       +-----------------+------------------+
       |                                    |
Eleccion explicita por texto       Click de EditionCard (Ruby)
       |                                    |
log_decision (Felix)               handler directo, sin agente
       |                                    |
       +-------------- appendDecision ------+
                              |
              apps/channel/.data/decisions.json
                              |
                       getFormatStats
                              |
                    get_format_stats
                              |
                 format_stats_card (Ruby)
```

Interfaces locales y firmas a entregar primero a Ruby y Diego:

```ts
export interface DecisionLogEntry {
  idea: string;
  sourceTrend: string;
  platform: string;
  format: string;
  decidedAt: string;
}

export interface FormatStat {
  format: string;
  platform: string;
  count: number;
  lastUsed: string;
}

export declare function appendDecision(entry: DecisionLogEntry): Promise<DecisionLogEntry[]>;
export declare function readDecisions(): Promise<DecisionLogEntry[]>;
export declare function getFormatStats(): Promise<FormatStat[]>;
```

- `appendDecision` devuelve el historial posterior a la escritura; `readDecisions` conserva el orden de insercion, no es un ranking ni un conjunto deduplicado.
- `getFormatStats` devuelve un ranking por `count` descendente. Empates conservan la primera aparicion del par plataforma/formato. La suma de `count` coincide con las entradas validas del archivo.
- Agrupar por la tupla exacta `(platform, format)`, sin colisiones por concatenacion con `:`. No deduplicar elecciones legitimas ni inventar alias de formatos.
- `lastUsed` corresponde al instante mas reciente del grupo, comparando fechas validadas cronologicamente, no strings ISO con offsets potencialmente distintos. Conservar el timestamp original seleccionado.
- `logDecision`, nombre SDK `log_decision`: cuatro campos de entrada, timestamp creado en servidor mediante `new Date().toISOString()`; devuelve la entrada persistida, no JSON serializado ni un booleano de exito.
- `getFormatStatsTool`, nombre SDK `get_format_stats`: sin parametros. Devuelve el ranking o un mensaje explicito de falta de historial/error, nunca un `[]` mudo al agente.
- Nombres SDK de Ruby: `master_brief_card`, `edition_card`, `format_stats_card`. No renombrarlos durante la integracion.
- El click llama a `appendDecision` directamente. No llama a `logDecision.handler`, no reanuda al agente y no debe volver a registrarse como otra eleccion en el turno siguiente.

## 4. Diseno del store y fallos

Implementar con `node:fs/promises`, utilidades estandar de Node y Zod ya instalado; sin dependencias nuevas.

1. Resolver el archivo por `WIRE_DESK_STORE_PATH`, con default relativo al modulo cuando la variable no existe: `apps/channel/.data/decisions.json`. Un override vacio es un error de configuracion, no debe redirigir tests al historial real. Usar `fileURLToPath` en vez de `.pathname` para rutas con espacios/caracteres escapados. Los overrides relativos siguen el directorio de trabajo del proceso; documentar y usar paths absolutos en tests/demo.
2. Evaluar la configuracion al iniciar cada operacion publica y capturar una sola ruta durante toda esa operacion. No congelar la variable al importar el modulo: `tools.test.tsx` importa tools antes de configurar fixtures.
3. Validar datos al escribir y al leer: objetos con los cinco strings requeridos, textos no vacios y timestamp ISO con zona e instante valido. Validar el array completo; una entrada invalida vuelve no confiable el archivo, no se descarta silenciosamente. Mantener `platform` como string del contrato; tool/prompt deben usar las claves canonicas de las cards.
4. Crear el directorio cuando se escribe. Preparar un temporal unico en el mismo directorio y reemplazar el archivo mediante `rename` solo tras completar el temporal. No truncar directamente el historial valido. Limpiar solo temporales propios ante fallos.
5. Mantener un lector interno estricto para distinguir ausencia, corrupcion y error de filesystem. No implementar `appendDecision` sobre la lectura publica que degrada corrupcion a `[]`.

| Estado | `readDecisions` | `appendDecision` | `getFormatStats` / tool |
|---|---|---|---|
| Archivo ausente (`ENOENT`) | `[]` | Crea el historial con la entrada | `[]` en store; mensaje `No decisions logged yet...` en tool |
| JSON `[]` | `[]` | Agrega la primera entrada | Mismo estado vacio legitimo |
| Historial valido | Entradas en orden | Persiste el historial ampliado | Ranking real |
| JSON corrupto, vacio fisico, no-array o entrada invalida | `[]` y advertencia sanitizada; archivo intacto | Rechazo controlado, sin reemplazarlo | Error controlado: historial no disponible, no tabla con ceros ni afirmacion de que nunca hubo decisiones |
| Permisos, ruta incompatible, error de disco | Error controlado | Error controlado, sin anunciar exito | Mensaje de fallo distinguible del estado vacio |
| Entrada nueva invalida | No aplica | Rechazo antes de escribir | `log_decision` no anuncia que la guardo |

Los errores del store se gestionan en tools y handlers, no terminan el listener. Informar al usuario y al agente con mensajes seguros y accionables; nunca volcar contenido del archivo, argumentos privados, stacks o credenciales. Ante error de guardado, no mostrar la confirmacion de exito.

La escritura temporal evita archivos parcialmente truncados, **no** resuelve lost updates. Dos operaciones read-modify-write superpuestas pueden perder una decision aun con un solo proceso. Documentar esta limitacion junto al store y operar la demo con escrituras estrictamente secuenciales. No prometer uso concurrente ni tolerancia a varios listeners.

## 5. Ejecucion ordenada de Felix

### Paso 1. Baseline y contrato

- Registrar el estado inicial con `git status --short` y ejecutar los checks existentes antes de editar. No revertir trabajo ajeno.
- Verificar Node/pnpm y dependencias; si falta la instalacion, usar `pnpm install --frozen-lockfile`, no `npm ci` en el root.
- Entregar las interfaces anteriores a Ruby. Si requiere un stub compilable, debe fallar explicitamente para operaciones no implementadas, nunca simular que guardo datos; eliminarlo antes de la integracion funcional.
- Acordar archivos: Felix posee `store.ts`, `store.test.tsx`, los nuevos tools y sus pruebas; Ruby posee componentes; Diego posee prompt, registro y adaptacion de search. `delivery.test.tsx` se modifica en el checkpoint conjunto.

Aceptacion: contrato importable y errores de baseline separados de los nuevos; ningun cambio en paquetes/lockfile por este track.

### Paso 2. Store y pruebas de filesystem

- Crear `apps/channel/src/store.ts` y `apps/channel/src/store.test.tsx` con los contratos y la politica de fallos de la seccion 4.
- Cada caso usa un directorio temporal propio, override absoluto, restauracion de `process.env` y limpieza en `finally`/teardown. Serializar los casos que comparten entorno dentro del mismo proceso.
- Verificar persistencia mediante lectura real del archivo y, en un caso, un proceso nuevo leyendo el mismo fixture; no confundir cache de modulo con persistencia.
- Registrar el limite de concurrencia y la recuperacion manual del historial en el README de channel durante implementacion. No reparar ni borrar archivos reales automaticamente.

Aceptacion: ausencia y vacio funcionan; corrupcion no altera bytes; fallos no simulan exito; agregados correctos sin acceso al archivo real.

### Paso 3. Tools y configuracion

- Agregar `logDecision` y `getFormatStatsTool` en `apps/channel/src/tools.tsx`, sin cambiar la logica de `readThread`/`proposeAction` ni el re-export de search.
- Validar inputs con Zod; mantener coherencia con la validacion del store, tambien usado directamente por Ruby. El tool de escritura solo registra elecciones humanas explicitas, no propuestas del modelo ni resultados web.
- Agregar casos a `tools.test.tsx`: retorno crudo coherente con disco, fecha del servidor, falta de historial, corrupcion, fallo de escritura y argumentos invalidos. Las llamadas directas a `.handler` no prueban por si solas la validacion del SDK: probar tambien el schema o la entrega real del tool.
- Documentar `WIRE_DESK_STORE_PATH` opcional en `.env.example` y `apps/channel/README.md`, sin editar `.env` ni introducir valores privados. El store siempre esta disponible; no agregar `isStoreConfigured()`.
- Verificar la regla `.data/` existente. Un override fuera de `.data/` necesita una ruta privada/temporal, no otro archivo publico del repositorio.

Aceptacion: exports listos para Diego; exito implica persistencia comprobable y vacio/error no se confunden.

### Paso 4. Integracion con Ruby y Diego

| Responsable | Ajuste obligatorio y criterio de aceptacion |
|---|---|
| Ruby + Felix | `EditionCard` serializa clicks de esa card y separa estado **persistido** de **actualizado en Slack**. Si append funciona y update falla, el siguiente click reintenta solo update, sin otro append. Si append falla, se permite reintentar guardado. Doble click exitoso agrega una sola entrada. Esto no coordina cards distintas. |
| Felix + Ruby | Extender `delivery.test.tsx` con el gateway existente y una card registrada. Extraer el action ID real, entregar un click separado, verificar archivo y `slack.message.replace`; no probarlo solamente con `renderToIR`. Espiar que el click no inicia una ejecucion del agente. |
| Diego | Registrar siempre ambos tools, quitar `proposeAction` del array activo y registrar las tres cards, solo cuando sus exports existan. Conservar handlers de mencion, suscripcion y mensajes. |
| Diego | Crear `packages/agent-core/src/wire-desk-prompt.ts` separado y exportarlo en `package.json`, `src/index.ts` y `src/shared.ts` de core; no reemplazar globalmente `ONCALL_ROLE`. Usar `makeAgent(tid, { prompt: WIRE_DESK_PROMPT, workplace: false })`: sin `workplace: false`, una clave Ambiguous habilita MCP externo heredado. Retirar tambien el contexto Workplace del canal Wire Desk. |
| Diego + Felix | Neutralizar el copy de incidentes que aun aparece en la descripcion de `read_thread`, sin cambiar su handler. Coordinar este pequeno cambio en `tools.tsx` con Felix. |
| Diego + Ruby | Coordinar `welcomeMessage` en `components.tsx`: tambien cambiar el prompt del boton que hoy pide una incident card. `channel.tsx` no es el unico punto de colaboracion entre tracks. |
| Diego + Ruby | Ajustar prompt, demo y `format_stats_card` para decir "formato mas elegido en el historial". No prometer filtro mensual ni mejor rendimiento; no volver a llamar `log_decision` por una confirmacion de card ya guardada. |

Aceptacion: brief y ediciones no escriben; una aprobacion escribe; una consulta posterior usa esa eleccion y el resto del historial. No hay tools MCP externos ni ambiguedad con el dominio de incidentes.

### Paso 5. Fallos y regresiones

Mantener sin cambios funcionales `search.tsx`: ya publica el fallo y entrega el error al agente. Felix verifica; Diego cambia solo su copy de dominio y el fallback del prompt.

| Prueba | Resultado requerido |
|---|---|
| N = 0, 1, 2 y multiples entradas; grupos repetidos/distintos | Conteos exactos, suma N, ranking no creciente; empates estables |
| Fechas fuera de orden, offsets diferentes y empate de instante | `lastUsed` correcto; no depende del orden de append |
| Strings Unicode, separadores en labels y ruta con espacios | Round-trip fiel y grupos/ruta correctos |
| JSON truncado, objeto, array con `null`, campos/fecha invalidos | Lectura degradada prevista; bytes conservados; escritura bloqueada; stats no inventadas |
| Ruta invalida y fallo de escritura/rename simulado | Error visible; historial anterior intacto cuando no se completo el reemplazo |
| Doble click; append correcto/update fallido/reintento | Solo una entrada; el reintento termina la confirmacion |
| Append fallido/reintento | Sin confirmacion falsa y una sola entrada cuando finalmente se guarda |
| Reinicio tras una escritura finalizada | El historial se recupera. No exigir que sobrevivan los handlers inline anteriores al reinicio |
| Sin clave Exa al arrancar | Search no se registra; se redacta desde el hilo y se informa la limitacion |
| Search registrado pero proveedor falla | Error de busqueda visible, despues brief/ediciones desde el hilo; archivo y listener siguen operativos |

Inyectar fallos mediante el harness/mock existente, no cambiando permisos ni corrompiendo datos de la demo real. Los tests offline prueban integracion determinista, no que un LLM real siga el prompt.

### Paso 6. Ensayo, evidencia y entrega

- Con un archivo de demo aislado, iniciar un solo listener estable, producir brief y ediciones, elegir un formato y comprobar que el JSON cambio exactamente una vez.
- Consultar: `@wiredesk what format am I actually choosing most in the recorded history?` Verificar que la card reproduce los conteos reales, sin comparaciones de rendimiento.
- Comprobar historial tras reiniciar, pero generar cards nuevas para probar nuevos clicks. Evitar hot reload mientras haya aprobaciones pendientes.
- Probar por separado ausencia de clave y fallo real del proveedor. Para ausencia, reiniciar con `EXA_API_KEY` explicitamente vacia en el entorno del proceso; quitarla solo del shell no basta si `.env` vuelve a cargarla. No borrar ni invalidar credenciales guardadas.
- Preparar evidencia de herencia vs. trabajo del evento en `SUBMISSION.md`: archivo y tools de Felix, cards de Ruby, prompt/search/wiring de Diego. La mutacion demostrada es local, no una publicacion externa.
- El equipo prepara video de dos minutos, descripcion, repositorio y post segun el portal local; no inventar deadline ni publicar/enviar sin instrucciones del equipo. La secuencia tecnica debe integrarse antes del ensayo funcional final.

## 6. Comandos de validacion

Ejecutar desde el root durante implementacion:

```bash
pnpm --filter channel run typecheck
pnpm --filter channel exec node --import tsx --test src/store.test.tsx src/tools.test.tsx
pnpm --filter channel run test
pnpm run typecheck
pnpm run verify
git check-ignore -v apps/channel/.data/decisions.json
git diff --check
git status --short
```

`npm run verify` es la entrada alternativa exigida por las reglas locales y ejecuta el mismo script basado en pnpm. No confundir esa cobertura con todos los directorios del monorepo.

- Tras los exports compartidos de Diego, agregar `pnpm --filter web run build` para comprobar la frontera del bundle. `verify` no incluye ese build.
- Movil y Auth0 quedan intactos y fuera de este track. Sus checks separados solo son necesarios si la integracion acaba afectandolos; no provisionarlos para validar un store de Slack.
- `pnpm why @ag-ui/client -r` comprueba deduplicacion si aparece un conflicto de tipos; no actualizar el par de versiones para resolver una API inventada.
- El ensayo live usa el comando estable `pnpm --filter channel start` con la configuracion existente. Si falta conexion Slack, seguir `pnpm run channel:setup -- --no-clipboard` y la skill oficial emitida, reutilizando esta app; ese comando por si solo no provisiona un canal operativo.

## 7. Limites y salida

- Persistencia local de un solo equipo: no hay aislamiento por usuario/canal, almacenamiento remoto ni recuperacion garantizada si se pierde el disco. No usar esta instancia para varios clientes ni asumir durabilidad en hosting efimero.
- Sin coordinacion de escrituras: uso secuencial estricto en la demo. Soportar simultaneidad requiere otro cambio aprobado antes de ofrecerlo como comportamiento fiable.
- La proteccion de doble click es local a la card y al proceso. No hay ID persistente de evento, deduplicacion entre texto/click o idempotencia tras reinicios; no presentar garantia de exactly-once.
- La eleccion por texto depende de la interpretacion del agente; el schema valida estructura, no demuestra consentimiento. El click es la evidencia principal de control humano para la demo.
- Recuperacion de corrupcion: conservar el archivo, diagnosticar y restaurar o elegir una nueva ruta mediante accion explicita del operador. Sin reseteo automatico, sin migraciones destructivas.
- No hay decisiones de producto pendientes: filtro mensual, metricas, multicuenta, concurrencia e integraciones nuevas estan fuera del alcance elegido.

Definition of Done de Felix: store y dos tools con contratos estables, tests aislados en verde, integracion del click probada con Ruby, registro seguro de Diego verificado, `typecheck`/`verify` aprobados, archivo real excluido de Git y evidencia live diferenciada de los mocks. No declarar este estado hasta ejecutar los checks y el ensayo.

Validacion de esta planificacion: inspeccion estatica del repositorio y estado inicial limpio en `main`. No se ejecutaron suites, builds ni llamadas live; la consulta de versiones Node/pnpm fue bloqueada por permisos, por lo que el baseline de ejecucion queda en el paso 1.
