# Fleet Manager

Web UI for controlling a fleet of industrial AMR / AGV robots via **VDA5050** protocol.
Backend by [@Semen23](https://github.com/Semen23) (C++). Frontend by [@DDmsngr](https://github.com/DDmsngr) (Vue 3).

- **Live:** https://ddmsngr.github.io/fleet-manager/
- **Docs:** [docs/BRIEF.md](docs/BRIEF.md) · [docs/DECISIONS.md](docs/DECISIONS.md) · [docs/REFERENCES.md](docs/REFERENCES.md) · [docs/SKILLS_AND_TOOLS.md](docs/SKILLS_AND_TOOLS.md)

## Stack

- Vue 3 + Vite + Pinia + Vue Router
- Tailwind CSS v4
- Naive UI (components)
- Konva.js (map canvas — planned)
- `vda-5050-lib` (VDA5050 message types)
- `nipplejs` (teleop joystick — planned)

## Dev

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

Deploys automatically to GitHub Pages on push to `main`.

## Routes

| Route | Purpose |
|---|---|
| `/dashboard` | KPI + event feed |
| `/map` | Live map with real-time robot positions |
| `/map-editor` | Layout editor with VDA5050 LIF export |
| `/robots` | Fleet table + per-robot control |
| `/missions` | Read-only mission telemetry |
| `/alerts` | Read-only alert stream |
| `/teleop` | Manual joystick control |
| `/settings` | Backend connection, users, general |
