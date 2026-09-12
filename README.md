<div align="center">

<img src="assets/wire-desk-logo.png" alt="Wire Desk Logo" width="220" />

# Wire Desk
### Agente Editorial Ambiental y Multiplataforma para Equipos de Contenido

[![Verify Pipeline](https://img.shields.io/badge/verify-passing-brightgreen.svg)](#verificación-y-pruebas)
[![Node](https://img.shields.io/badge/node-v22+-blue.svg)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-v11.1.3-orange.svg)](https://pnpm.io/)
[![CopilotKit Channels](https://img.shields.io/badge/CopilotKit-Channels-purple.svg)](https://copilotkit.ai/)

**De una conversación en Slack a guiones listos para publicar en múltiples redes, con un archivo de decisiones que aprende qué rinde mejor.**

[Especificación](docs/SPEC_WIRE_DESK.md) · [Estrategia de Jueces](docs/ESTRATEGIA_JUECES_AI_TINKERERS.md) · [Plan de Equipo](docs/PLAN_HACKATHON.md)

</div>

---

## 1. El Problema que Resuelve

Los equipos y creadores de contenido pierden horas críticas en tres cuellos de botella:
1. **Rastrear:** Monitorear qué tendencias resuenan en su nicho en tiempo real.
2. **Reescribir:** Reformular la misma idea central 5–6 veces para formatos con reglas incompatibles (Reels, Threads, X, Instagram).
3. **Recordar:** Saber qué formatos le funcionan mejor a *este* equipo particular, en vez de guiarse por promedios genéricos del mercado.

---

## 2. La Solución: Wire Desk

Inspirado en cómo operaban las agencias de noticias (*news wires*), **Wire Desk** es un agente que **vive en el hilo de Slack** donde el equipo ya debate contenido. Escucha la conversación, consulta tendencias externas en vivo, redacta una **plantilla modular reutilizable** y permite elegir o descartar formatos con **un solo clic**, registrando cada decisión en un archivo persistente local.

```
┌─────────────────────────────────────────┐
│ 1. ESCUCHA AMBIENTAL & SEÑAL            │
│    Lee el debate del hilo de Slack      │
│    + busca tendencias reales con Exa.   │
└────────────────────┬────────────────────┘
                     ▼
┌─────────────────────────────────────────┐
│ 2. REDACCIÓN MODULAR EN SLACK           │
│    Emite una MasterBriefCard con:       │
│    • Gancho, Desarrollo, Cierre, Foto   │
│    • Adaptación precisa por red social  │
└────────────────────┬────────────────────┘
                     ▼
┌─────────────────────────────────────────┐
│ 3. APROBACIÓN EN 1 CLIC (Human-in-Loop) │
│    El creador toca "[Uso este Reel]".   │
│    Guarda la decisión en el archivo sin │
│    publicar a ciegas en redes.          │
└────────────────────┬────────────────────┘
                     ▼
┌─────────────────────────────────────────┐
│ 4. MEMORIA HISTÓRICA                    │
│    "¿Qué formato vengo usando más?"     │
│    Muestra un ranking con las métricas  │
│    y elecciones reales del equipo.      │
└─────────────────────────────────────────┘
```

---

## 3. Aportaciones Técnicas Principales

* **Integración Nativa en Slack (`apps/channel`):** No es un chatbot flotante ni un wrapper de texto plano. Renderiza tarjetas visuales interactivas (`MasterBriefCard`, `FormatStatsCard`) con botones interactivos que no requieren salir de Slack.
* **Redacción con Reglas Reales de Plataforma:**
  * **Instagram:** Caption <2200 car. con gancho visible antes de los 125 caracteres.
  * **TikTok / Reels:** Guiones de 15–30s con gancho en el segundo 1.
  * **Threads:** Textos concisos <500 car. de tono conversacional sin CTA invasivo.
  * **X (Twitter):** Posts unitarios <280 car. o hilos con remates claros.
* **Archivo de Decisiones Seguro y Atómico (`apps/channel/src/store.ts`):** 
  * Validación estricta con **Zod** (`idea`, `sourceTrend`, `platform`, `format`, `decidedAt`).
  * Escritura atómica mediante temporales y reemplazo seguro para evitar corrupción.
  * Agrupación estadística precisa por la tupla `(platform, format)` ordenada por frecuencia.
* **Control Humano Garantizado (*Human-in-the-Loop*):** Los botones ejecutan handlers directos de persistencia; el agente nunca publica automáticamente en cuentas reales.
* **Compatibilidad Multi-Agente:** Configurado y listo para trabajar simultáneamente con **Kilo Code** (`kilo.jsonc`, `.kilo/`), **OpenAI Codex CLI** (`CODEX.md`, `.codex/`) y **Cursor**.

---

## 4. Estructura del Monorepositorio

```
.
├── apps/
│   ├── channel/             <-- MVP: Agente de Slack (CopilotKit Channels + Exa)
│   │   ├── src/store.ts     <-- Almacén atómico de decisiones y estadísticas
│   │   ├── src/tools.tsx    <-- Tools: read_thread, log_decision, get_format_stats
│   │   └── src/components.tsx <-- Tarjetas y botones interactivos nativos
│   ├── web/                 <-- Panel Next.js (Fase 2: dashboard comparativo)
│   └── mobile/              <-- App Expo / React Native (Fase 3: pocket assistant)
├── packages/
│   └── agent-core/          <-- Prompt Wire Desk y normalización de modelos
├── docs/
│   ├── SPEC_WIRE_DESK.md    <-- Especificación completa del producto
│   ├── PLAN_HACKATHON.md    <-- Plan de ejecución y reparto por tracks
│   └── ESTRATEGIA_JUECES_AI_TINKERERS.md <-- Criterios de evaluación (5/5)
├── kilo.jsonc               <-- Configuración y MCPs para Kilo Code
└── CODEX.md                 <-- Directivas maestras para OpenAI Codex CLI
```

---

## 5. Puesta en Marcha Rápida

### Requisitos
* **Node.js:** v22.0.0 o superior
* **pnpm:** v11.0.0 o superior

### Instalación
```bash
# 1. Instalar dependencias del monorepositorio
pnpm install

# 2. Configurar variables de entorno
cp .env.example .env
# Edita .env y añade tu OPENAI_API_KEY y EXA_API_KEY (opcional)
```

### Comandos Clave

| Comando | Descripción |
| :--- | :--- |
| **`pnpm run verify`** | Ejecuta el pipeline completo de typechecks y suites de pruebas sin requerir credenciales externas. |
| **`pnpm run dev:slack`** | Levanta el canal de Slack localmente con recarga en vivo. |
| **`pnpm run dev:web`** | Inicia el frontend web en `http://localhost:3100`. |
| **`cd apps/mobile && pnpm test`** | Ejecuta las pruebas del cliente móvil. |

---

## 6. Verificación y Calidad

El proyecto mantiene una cobertura automatizada rigurosa para garantizar 0 regresiones antes de cada commit:

```bash
pnpm run verify
```
* **Resultado:** 100+ tests unitarios y de integración superados en menos de 2 segundos en `agent-core`, `apps/channel` y `apps/web`.
