# Instrucciones para Agentes Kilo / Kilo Code

Bienvenido al proyecto **bitcoders-ai-tinkerers**, basado en el **Agents, Everywhere Hackathon Starter Kit** (AI Tinkerers / CopilotKit).

## 1. Misión del Proyecto y Criterios de Evaluación
El objetivo central es construir un agente funcional que habite un entorno real donde la gente trabaja, habla o vive, superando los criterios de evaluación de los jueces:
- **Core Requirements & Functionality (5/5):** Agente funcional de punta a punta, robusto y confiable.
- **Innovation & Theme Alignment (5/5):** Patrón agéntico que aprovecha el entorno nativo y NO es un simple chatbox wrapper.
- **Technical Execution & Integration (5/5):** Orquestación robusta, Tool Calling / MCP estructurado, manejo de fallos y mutación de estado.
- **Usefulness & Agentic Experience (5/5):** Resuelve un problema doloroso con supervisión *human-in-the-loop*.
*Consulta [`docs/ESTRATEGIA_JUECES_AI_TINKERERS.md`](file:///home/felixjr/Documentos/Projects/repositories/bitcoders-ai-tinkerers/docs/ESTRATEGIA_JUECES_AI_TINKERERS.md) para el análisis crítico completo.*

---

## 2. Estructura de Plantillas Disponibles

| Plantilla | Ubicación | Pila Tecnológica | Caso de Ejemplo |
| :--- | :--- | :--- | :--- |
| **Slack Channel** | `apps/channel/` | CopilotKit Channels + Exa | Triage y resolución de incidentes en hilo de Slack |
| **Web App** | `apps/web/` | Next.js + CopilotKit React + Ambiguous AI | Workspace interactivo con guardado persistente |
| **Mobile App** | `apps/mobile/` | Expo / React Native + CopilotKit RN | Finanzas personales con aprobación táctil local |
| **Núcleo Compartido** | `packages/agent-core/` | TypeScript / Core Logic | Lógica y tipos compartidos entre apps |

---

## 3. Comandos de Verificación Obligatorios

Antes de reportar que una tarea está completada, ejecuta siempre las verificaciones:

1. **Workspace raíz (Slack y Web):**
   ```bash
   pnpm run verify
   ```
   *(Ejecuta typechecks y 90+ tests sin necesidad de credenciales externas).*

2. **Workspace móvil (`apps/mobile`):**
   ```bash
   cd apps/mobile && pnpm test && pnpm run typecheck
   ```

3. **Ejecución local en desarrollo:**
   - Web: `pnpm run dev:web` (inicia en http://localhost:3000)
   - Slack: `pnpm run dev:slack`
   - Mobile: `cd apps/mobile && pnpm start`

---

## 4. Reglas Críticas de Arquitectura (CopilotKit)

- **`@ag-ui/client` debe permanecer deduplicado:** El `package.json` raíz lo fija mediante `overrides`. No agregues versiones desalineadas.
- **`@copilotkit/channels` y `@copilotkit/runtime` forman una pareja fija:** Deben actualizarse juntos con versiones idénticas.
- **Archivos JSX en Channels deben ser `.tsx`:** El `tsconfig.json` establece `jsxImportSource: "@copilotkit/channels"`. Esto **no** es React estándar.
- **`maxSteps` en `BuiltInAgent`:** Por defecto es 1; si el agente usa herramientas, debe incrementarse para permitir el ciclo llamada-observación-respuesta.
- **Límites de escritura:** Las mutaciones externas destructivas siempre deben requerir aprobación humana previa (*approval step / human-in-the-loop*).
