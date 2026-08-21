# Decisions Log

Fixed architectural / stack decisions. Any change here must be discussed and dated.

---

## 2026-08-20 — Initial decisions after brief round 1

### D-001 — Protocol: VDA5050

**Decision:** Backend and frontend communicate via **VDA5050** (v1.6 message spec).
**Why:** Semyon is building the backend to this standard. Ecosystem support is mature.
**Impact:**
- Frontend uses `vda-5050-lib` (npm) for typed messages
- Transport: **MQTT** (VDA5050 default) — WebSocket bridge in browser
- No need to invent custom message contracts

### D-002 — Map editor: vda5050-lif-editor approach

**Decision:** Approved [vda5050-lif-editor.vercel.app](https://vda5050-lif-editor.vercel.app/) as the reference. We build our own editor with the same LIF-JSON export format (compatible with VDA5050 Layout Interchange Format v1.0.0).
**Why:** Open, standardized, referenced in Nav2 docs. Not portable as-is (React + Cytoscape stack), so we reimplement in Vue + Konva.
**Impact:**
- Custom Konva-based canvas editor
- Export button produces LIF-compliant JSON
- Import backend-served maps (starting with PNG + JSON zones; later `.pgm/.yaml` from ROS map_server)

### D-003 — Stack: Vue 3 + JavaScript (no TypeScript)

**Decision:** Vue 3 + Vite + Pinia + Vue Router 4 + Tailwind v4. **JavaScript, no TypeScript.**
**Why:** Explicit backend/frontend split — Semyon requested Vue.js without TS.
**Impact:**
- No `.ts` / `.tsx` files
- JSDoc annotations for critical shared types (VDA5050 payloads)
- `vda-5050-lib` types available but not enforced

### D-004 — UI language: English

**Decision:** All UI strings in English. No i18n at MVP stage.
**Why:** Target market is international industrial buyers of AMR/AGV systems.

### D-005 — Color scheme: light theme, white → dark blue

**Decision:** Light theme by default. Palette anchored on white (`#fff`) → deep blue (`brand-800: #1e40af`). Robot statuses use a separate categorical palette (green/yellow/red/gray).
**Why:** Client preference. Reads as clean industrial control panel.
**Impact:**
- `--color-brand-*` scale in `src/assets/main.css`
- Optional dark theme via `naive-ui` config, toggle in Topbar

### D-006 — Roles: 3 tiers (no read-only observer)

**Decision:** Operator / Engineer / Admin. **No** read-only "Observer" role.
**Why:** Explicit brief answer. Simplifies auth model.

### D-007 — Missions & Alerts are view-only in UI

**Decision:** Missions and Alerts are **read-only telemetry** rendered from backend streams. UI does not create/edit missions or alert rules.
**Why:** Backend owns mission planning. UI is a visualization / control surface.
**Open question:** How does the Operator role "assign missions" (role description) if UI is view-only? → clarify in round 2.

### D-008 — No Analytics module

**Decision:** No analytics / heatmaps / CSV-PDF export at MVP.
**Why:** Explicit brief answer.

### D-009 — Manual teleop: included

**Decision:** Dedicated `/teleop` route with keyboard / joystick control per selected robot. Placeholder video feed slot.
**Why:** Explicit brief request.
**Impact:** `nipplejs` for touch joystick; WebSocket `cmd_vel`-style channel.

### D-010 — Multi-floor / multi-map

**Decision:** Multiple maps and floors. Robot ↔ map assignment stored on backend. Selector in topbar. Robot may transition between maps.
**Why:** Explicit brief answer.

### D-011 — Repo & collaboration

**Decision:** Repo at [github.com/DDmsngr/fleet-manager](https://github.com/DDmsngr/fleet-manager) (public). Deploy to GitHub Pages on push to `main`. Semyon invited as collaborator with `write` (push) permission.
**Why:** Client can watch progress live; standard flow for this workspace.

---

## Open questions for round 2 (bring to Semyon)

- **OQ-1** (D-007): How does the Operator assign missions if UI is view-only? Do we need an "Assign mission" modal?
- **OQ-2**: Does the backend expose an MQTT-over-WebSocket bridge (for browser), or should the fleet UI use a plain WebSocket wrapper the backend implements? VDA5050 assumes MQTT; browsers can't do raw MQTT.
- **OQ-3**: Update rate of robot state messages (Hz)? Impacts UI throttling.
- **OQ-4**: Authentication — JWT? API keys? SSO?
- **OQ-5**: Map format handoff — backend delivers PNG + JSON zones, or `.pgm/.yaml` directly? Latter needs a browser parser.
- **OQ-6**: Where will the robots operate? Warehouse / factory / hospital? Affects map iconography and copy tone.
