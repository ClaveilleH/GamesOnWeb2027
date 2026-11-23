index: refreshed 49 files
# Codebase Architecture Map & God Nodes
- **Totals:** 49 files | 545 nodes | 3651 edges

## 2. Subsystem Clusters (Directory Communities)
- **`src/portals`** (10 files, 2,380L) — Key hubs: `traceView`, `secondaryGhostClipPlane`, `segmentCrossing`, `direction`
- **`tests`** (7 files, 1,800L) — Key hubs: `expectVector`, `link`, `position`, `slot`
- **`src/player`** (7 files, 1,112L) — Key hubs: `createSkeletonVisual`, `makeLimbs`, `oval`, `update`
- **`src/world`** (6 files, 926L) — Key hubs: `block`, `createTestTerrain`, `createPortalDemos`, `terrainMaterial`
- **`src/ui`** (4 files, 528L) — Key hubs: `createDebugMenu`, `element`, `createMenu`, `section`
- **`src/input`** (4 files, 467L) — Key hubs: `createInput`, `capture`, `createKeyboardLayout`, `save`
- **`src/dev`** (3 files, 426L) — Key hubs: `countIsolatedChanges`, `release`, `readPlanes`, `coordinates`
- **`root`** (2 files, 39L) — Key hubs: n/a
- **`src`** (2 files, 448L) — Key hubs: `start`, `present`, `resolveCharacter`, `characterByKey`
- **`ops`** (1 files, 71L) — Key hubs: `update`, `download`
- **`tests/support`** (1 files, 19L) — Key hubs: `startDevGame`, `expectCleanPage`
- **`src/platform`** (1 files, 32L) — Key hubs: `detectBrowser`, `createPlatform`

## 3. God Nodes (Most Connected Functions/Classes)
1. **`createDebugMenu`** (function) @ `src/ui/debugMenu.js:49-207` (159L) — `2` in / `62` out
2. **`start`** (function) @ `src/main.js:85-325` (241L) — `1` in / `42` out
3. **`traceView`** (function) @ `src/portals/cameraPath.js:87-145` (59L) — `12` in / `7` out
4. **`secondaryGhostClipPlane`** (function) @ `src/portals/math.js:222-263` (42L) — `10` in / `7` out
5. **`element`** (function) @ `src/ui/debugMenu.js:21-25` (5L) — `37` in / `0` out
6. **`block`** (function) @ `src/world/portalDemos.js:51-56` (6L) — `31` in / `1` out
7. **`createSkeletonVisual`** (function) @ `src/player/skeletonVisual.js:14-217` (204L) — `2` in / `24` out
8. **`createPortalDemos`** (function) @ `src/world/portalDemos.js:35-401` (367L) — `2` in / `21` out
9. **`createTestTerrain`** (function) @ `src/world/testTerrain.js:243-309` (67L) — `2` in / `21` out
10. **`createInput`** (function) @ `src/input/input.js:13-264` (252L) — `2` in / `21` out
11. **`createMenu`** (function) @ `src/ui/menu.js:7-145` (139L) — `2` in / `20` out
12. **`segmentCrossing`** (function) @ `src/portals/math.js:158-171` (14L) — `11` in / `4` out
13. **`capture`** (function) @ `src/input/input.js:88-129` (42L) — `5` in / `7` out
14. **`buildGarden`** (function) @ `src/world/portalDemos.js:323-393` (71L) — `1` in / `22` out
15. **`makeLimbs`** (function) @ `src/player/skeletonVisual.js:117-150` (34L) — `0` in / `26` out

## 4. Top Event / Signal Bus Channels
- **`change`** — 2 publisher(s), 12 listener(s)
- **`mousemove`** — 7 publisher(s), 1 listener(s)
- **`pointerlockchange`** — 5 publisher(s), 1 listener(s)
- **`keydown`** — 1 publisher(s), 3 listener(s)
- **`blur`** — 2 publisher(s), 1 listener(s)
- **`visibilitychange`** — 2 publisher(s), 1 listener(s)
- **`click`** — 0 publisher(s), 11 listener(s)
- **`pagehide`** — 0 publisher(s), 2 listener(s)
- **`type`** — 0 publisher(s), 2 listener(s)
- **`cancel`** — 0 publisher(s), 1 listener(s)
- **`console`** — 0 publisher(s), 1 listener(s)
- **`gow:interact`** — 1 publisher(s), 0 listener(s)
