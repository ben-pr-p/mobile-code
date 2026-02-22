# opencode-rn — Agent Guide

A React Native (Expo) mobile client for [opencode](https://github.com/sst/opencode), the AI coding agent. Voice-first interface for interacting with the opencode agent away from the keyboard.

## Stack

- **React Native** 0.81 via **Expo** 54
- **NativeWind** (Tailwind CSS for React Native) for styling
- **React Native Reanimated** 4 for animations
- **TypeScript** 5.9
- **Bun** as the package manager and runtime

## Commands

```sh
bun install          # install dependencies
bun run start        # start Expo dev server
bun run ios          # run on iOS simulator
bun run android      # run on Android emulator
bun run lint         # eslint + prettier check
bun run format       # eslint --fix + prettier --write
```

## Project Structure

```
opencode-rn/
├── App.tsx                  # root component
├── components/              # shared UI components
├── assets/                  # images, fonts, icons
├── docs/
│   ├── requirements.md      # full product requirements (start here)
│   └── designs/
│       ├── iphone.pen       # iPhone UI designs (Pencil)
│       └── ipad-min-landscape.pen  # iPad Mini landscape designs (Pencil)
├── global.css               # global Tailwind/NativeWind styles
├── tailwind.config.js
├── tsconfig.json
└── package.json
```

## Requirements & Design Docs

**Start with `docs/requirements.md`** — it documents all screens, voice input modes, offline behavior, and iPad layout adaptations derived from the Pencil design files.

For more specific or visual information beyond what's in `requirements.md`, the source designs are `.pen` files in `docs/designs/`. These require the **Pencil MCP tool** to read — do not attempt to read them as text files.

### Getting screenshots from design files

If you have access to the Pencil MCP tools, you can get screenshots of any frame:

1. Use `get_editor_state()` to see what file is open and what frames exist.
2. Use `batch_get(filePath, patterns=[{type: "frame"}], searchDepth=1)` to list all top-level frames and their IDs.
3. Use `get_screenshot(filePath, nodeId)` to render any frame as an image.

Key frames in `iphone.pen`:
- `DBiql` — Left Sidebar (Sessions)
- `rHaLS` — Main Session
- `Sur5f` — Right Sidebar (Projects)
- `6bCVL` — Right Sidebar (Projects, many)
- `ZmX9L` — Settings
- `Rni86`–`RwGZZ` — Hold Flow steps 1–5
- `Z1OQW`–`D3SZy` — Hands-Free Flow steps 1–5
- `72Eft`–`M2Qrh` — Auto-Record Flow steps 1–5

Key frames in `ipad-min-landscape.pen`:
- `P2k55` — Sessions List + Chat
- `4bcIL` — Session + Changes (diff view)
- `nDkEl` — Shell Detail + Chat
- `ocVmr` — Agent Detail + Chat
- `yD3eW` — Settings
- `vRGg5` — Projects
- `oYSZr`–`bnq9a` — Hold Flow steps 1–5
- `zgVJR`–`6FkbC` — Hands-Free Flow steps 1–5
- `cuzrC`–`VdcFV` — Auto-Record Flow steps 1–5
