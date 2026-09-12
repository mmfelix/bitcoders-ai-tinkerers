# Reglas del Proyecto para Kilo Code

## Reglas de Codificación y Desarrollo
1. **Preservar la Arquitectura Existente:** Al adaptar cualquiera de las plantillas (`apps/web`, `apps/channel`, `apps/mobile`), mantén el sistema de herramientas y la infraestructura base intacta.
2. **Pruebas y Verificación Constante:** Cada cambio debe validarse con `npm run verify` (en el root) o con `npm test` en `apps/mobile`.
3. **Manejo de Credenciales:** Nunca incrustes tokens o claves en código fuente ni respuestas de chat. Utiliza variables de entorno definidas en `.env`.
4. **Skills Disponibles:**
   - La habilidad `build-channels-agent` está disponible en `.kilo/skills/build-channels-agent/` (enlazada desde `.agents/skills`). Consúltala antes de modificar canales de Slack.
5. **Servidores MCP Disponibles:**
   - `copilotkit`: `https://mcp.copilotkit.ai/mcp`
   - `exa`: `https://mcp.exa.ai/mcp`
