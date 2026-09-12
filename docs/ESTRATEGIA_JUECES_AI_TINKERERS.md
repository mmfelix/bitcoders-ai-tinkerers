# Estrategia Maestra y Análisis Crítico: Criterios de Evaluación del Hackathon

> **Proyecto:** bitcoders-ai-tinkerers  
> **Objetivo:** Cumplir con la puntuación máxima (5/5) en los 4 criterios de evaluación.

---

## 1. BLUF (Bottom Line Up Front)

El criterio de evaluación penaliza drásticamente los **"wrappers"** (chatbots genéricos incrustados en Slack, Discord o extensiones web que se limitan a un patrón de *pregunta-respuesta*). Para obtener la puntuación máxima (**5/5 en cada eje**), el proyecto no debe ser una ventana de conversación flotante, sino un **agente ambiental y simbiótico** integrado en el tejido donde las personas ya interactúan, dotado de:

1. **Percepción de contexto nativo:** Telemetría, eventos o mutaciones del entorno sin requerir prompts manuales constantes.
2. **Ejecución autónoma bidireccional:** Herramientas reales, modificación del estado del entorno y auto-corrección de fallos.
3. **Controlabilidad humana explícita:** Supervisión *human-in-the-loop*, capacidad de previsualizar, aprobar o deshacer acciones críticas.

---

## 2. Deconstrucción Crítica de la Rúbrica Oficial

```
┌─────────────────────────────────────────────────────────────┐
│              LA REGLA DE ORO DE LOS JUECES                  │
│  "Si tu agente puede reemplazarse por una pestaña abierta    │
│   de ChatGPT/Claude, tu puntuación máxima será 2 de 5."     │
└─────────────────────────────────────────────────────────────┘
```

### A. Core Requirements & Functionality (1–5)
> *¿Entrega un agente funcional dentro de un lugar donde la gente ya trabaja, habla o vive? ¿El flujo central funciona de punta a punta?*

* **Puntajes Bajos (1–2):** 
  * Proyectos que no compilan o cuya demostración se basa en maquetas estáticas (Figma, llamadas simuladas con retardos ficticios).
  * Flujos partidos donde el agente solo hace la mitad del trabajo y deja al usuario varado.
* **El Estándar de Excelencia (5):**
  * El agente es **robusto, confiable y 100% funcional en vivo**.
  * Ejecuta un flujo cerrado de inicio a fin dentro del entorno real (ej. terminal, IDE, canvas, mensajería).
  * Ante errores de API o parámetros inválidos, posee tolerancia a fallos (*graceful degradation*, reintentos con backoff exponencial y auto-corrección).

### B. Innovation & Theme Alignment (1–5)
> *¿Explora un espacio o interacción novedosa para agentes? ¿El entorno mejora materialmente las capacidades del agente?*

* **Puntajes Bajos (1–2):** 
  * La trampa clásica del "chat wrapper": poner una caja de texto en Slack o Discord para hacer preguntas genéricas. El entorno es irrelevante y decorativo.
* **El Estándar de Excelencia (5):**
  * **Patrón de interacción no reproducible en un chatbox.**
  * El entorno proporciona un sustrato de información y capacidad de mutación único (ej. manipular el AST del código, interceptar peticiones de red en DevTools, sincronizarse con eventos de voz o canvas colaborativo en tiempo real).
  * El entorno no hospeda al agente; el entorno **potencia** al agente.

### C. Technical Execution & Integration (1–5)
> *Calidad del código, arquitectura, confiabilidad, uso de herramientas, manejo de datos y profundidad de integración con el entorno.*

* **Puntajes Bajos (1–2):** 
  * Un script lineal con llamadas monolíticas a un LLM, expresiones regulares frágiles y sin esquemas de datos estructurados.
* **El Estándar de Excelencia (5):**
  * **Orquestación formal:** Grafos de estado, agentes reactivos o llamadas mediante estándares modernos (Tool Calling tipado / MCP - Model Context Protocol).
  * **Integración bidireccional profunda:** No solo lee del entorno; escribe, escucha WebSockets/webhooks y altera el estado del host.
  * **Ciclo de auto-verificación:** El agente ejecuta una acción, audita el resultado (ej. código de salida, diff generado) y se autocorrige antes de responder.

### D. Usefulness & Agentic Experience (1–5)
> *¿Crea valor tangible para el usuario? ¿Es intuitivo, efectivo y adecuado para el entorno?*

* **Puntajes Bajos (1–2):** 
  * Cajas negras impredecibles que destruyen datos o requieren prompts kilométricos que toman más tiempo que hacer la tarea manualmente.
* **El Estándar de Excelencia (5):**
  * Resuelve un problema real y doloroso con mínima fricción cognitiva (*mixed-initiative design*).
  * El usuario mantiene el control: vistas previas claras (*diffs*, planes de ejecución) antes de operaciones de alto impacto, permitiendo aprobación en un clic (`[Aprobar / Rechazar]`).

---

## 3. Matriz Comparativa: Proyecto Promedio vs. Proyecto Ganador

| Dimensión | Enfoque Común / Perdedor (Score 1–2) | Enfoque Ganador (Score 5) |
| :--- | :--- | :--- |
| **Punto de Inserción** | Sidebar flotante o bot conversacional genérico. | Integrado en el flujo de trabajo (IDE, terminal, browser, OS, chat nativo). |
| **Disparador (*Trigger*)** | Prompt manual explícito del usuario (`/ask ...`). | Eventos contextuales + proactividad disparada por cambios de estado. |
| **Acción Real** | Solo devuelve texto sugiriendo qué hacer. | Modifica el entorno (edita archivos, crea ramas, muta bases de datos). |
| **Manejo de Errores** | Falla silenciosa o error crudo en consola. | Reintentos adaptativos, auto-corrección e informes limpios al usuario. |
| **Gobernanza** | O es un juguete pasivo o un script sin frenos. | Autonomía calibrada con barandillas (*guardrails*) y supervisión interactiva. |

---

## 4. Arquitectura de Referencia Recomendada

Diagrama de flujo vertical para implementación del agente:

```
┌─────────────────────────────────────────┐
│           ENTORNO NATIVO                │
│    (IDE / Terminal / Browser / OS)      │
└────────────────────┬────────────────────┘
                     │ Eventos / Mutaciones del entorno
                     ▼
┌─────────────────────────────────────────┐
│          SENSOR DE CONTEXTO             │
│    (Captura diffs, logs, DOM, eventos)  │
└────────────────────┬────────────────────┘
                     │ Payload estructurado
                     ▼
┌─────────────────────────────────────────┐
│        ORQUESTADOR DEL AGENTE           │
│  ┌───────────────────────────────────┐  │
│  │     Planificación y Memoria       │  │
│  ├───────────────────────────────────┤  │
│  │    Selección de Herramientas      │  │
│  ├───────────────────────────────────┤  │
│  │  Ciclo de Reflexión / Verificación│  │
│  └───────────────────────────────────┘  │
└────────────────────┬────────────────────┘
                     │ Invocación de herramientas
                     ▼
┌─────────────────────────────────────────┐
│        ACTUADOR EN EL ENTORNO           │
│  ┌───────────────────────────────────┐  │
│  │  Mutación de Estado / Parches     │  │
│  ├───────────────────────────────────┤  │
│  │  Previsualización (Human-in-Loop) │  │
│  └───────────────────────────────────┘  │
└────────────────────┬────────────────────┘
                     │ Feedback del entorno
                     ▼
┌─────────────────────────────────────────┐
│          VERIFICACIÓN DE ÉXITO          │
│    (Tests, comprobación de estado)      │
└─────────────────────────────────────────┘
```

---

## 5. Tres Arquetipos con Potencial de 5/5 para Bitcoders

### Opción A: El "Copiloto Táctico de Terminal & Debugging" (Donde la gente trabaja)
* **Entorno:** Terminal (CLI/TUI) o flujo de Git local.
* **Flujo Clave:** 
  1. Detecta un comando fallido, test caído o excepción en el log local.
  2. Inspecciona el árbol de código relevante sin que el usuario tenga que copiar/pegar el error.
  3. Formula una solución, aplica el parche en un archivo temporal o rama de prueba, corre el comando de nuevo para confirmar que resuelve el fallo.
  4. Muestra un `git diff` interactivo en la terminal pidiendo confirmación (`[y/N]`).
* **Por qué es un 5:** Es imposible de replicar en un chat web; vive en la máquina del desarrollador y ejecuta verificaciones reales.

### Opción B: El "Compañero Ambiental de Discord / Slack" (Donde la gente habla)
* **Entorno:** Canal colaborativo técnico.
* **Flujo Clave:** 
  1. Escucha pasivamente el intercambio entre programadores/diseñadores.
  2. Cuando se discute un problema ("la API de pagos está devolviendo 500 en staging"), el agente consulta métricas o el repositorio en segundo plano.
  3. Interviene de forma sintética y contextual: *"Detecté que el endpoint `/checkout` falló 12 veces en los últimos 10 min por error de validación en el campo `currency`. Aquí está la traza y el enlace al PR que modificó ese archivo hace 1 hora"*.
* **Por qué es un 5:** Opera con la temporalidad y dinámica multipartita de un canal grupal sin exigir comandos rígidos.

### Opción C: El "Auditor y Agente Activo en Browser / DevTools" (Donde la gente navega)
* **Entorno:** Extensión profunda en Chrome DevTools / Consola.
* **Flujo Clave:**
  1. Se engancha al Chrome DevTools Protocol (CDP).
  2. Mientras el desarrollador navega su app en `localhost`, el agente audita problemas de accesibilidad (a11y), fugas de memoria, peticiones lentas o llamadas duplicadas.
  3. Genera el código de prueba (Playwright / Cypress) para reproducir el bug y propone el arreglo exacto de CSS/JS.
* **Por qué es un 5:** Accede a primitivas nativas del navegador inaccesibles para cualquier modelo en la nube.

---

## 6. Checklist de Validación para la Presentación y Demo

- [ ] **Sin modo chat clásico:** ¿El usuario interactúa a través de acciones, atajos o eventos y no solo escribiendo "Hola, por favor ayúdame con..."?
- [ ] **Demostración determinista (2 minutos):** ¿El flujo de demostración está preparado para que los jueces vean el valor en menos de 90 segundos?
- [ ] **Acción tangible:** ¿El agente modificó un archivo, ejecutó un script, creó un artefacto o solucionó un error en tiempo real?
- [ ] **Resiliencia evidente:** Si ocurre un fallo en una API o un test no pasa, ¿el agente muestra cómo se recupera o reporta el problema con elegancia?
- [ ] **Human-in-the-loop:** ¿El usuario siempre tiene la última palabra sobre las mutaciones importantes?
