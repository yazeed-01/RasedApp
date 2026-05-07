# React Native Speed Camera System — Build Plan

A phased roadmap to build a mobile speed-detection system with single-point speed measurement, license plate recognition, violation logging, and multi-camera average-speed enforcement.

---

## Overview

The app does three things: (1) detects vehicles via the phone camera and measures their speed in real time, (2) reads license plates and saves violations with timestamps, (3) syncs across devices so two cameras can detect "section violations" — when a car covers a known distance faster than the legal time allows.

**Total timeline estimate**
- Solo developer: 14–16 weeks for MVP
- Small team (2–3 devs): 8–10 weeks
- Production hardening: +4–6 weeks on top

**Headline tech stack**
- React Native (bare workflow or Expo prebuild — you need native modules)
- `react-native-vision-camera` + frame processors for camera + ML hooks
- `react-native-fast-tflite` for on-device ML inference
- YOLOv8n (vehicles) + ML Kit Text Recognition (plates), or a custom CRNN model
- `@shopify/react-native-skia` for bounding-box overlay
- WatermelonDB or SQLite for local storage
- Firebase (Firestore + Storage) or Supabase for multi-device sync

---

## Phase 0 — Foundation (Week 1)

**Goal:** Working RN project, all native modules wired up, architecture decisions locked.

**Tasks**
- Init project with Expo prebuild or bare React Native + TypeScript
- Install core deps: vision-camera, fast-tflite, skia, sqlite, mmkv, navigation
- Configure permissions in `Info.plist` and `AndroidManifest.xml`: camera, location (background if you want GPS while screen off), storage
- Set up navigation skeleton (React Navigation, 3 tabs: Camera / Log / Average Speed)
- Initialize Firebase or Supabase project — auth, database, storage buckets
- Decide DB schema upfront (see Phase 5)

**Deliverables**
- App builds on iOS + Android with camera permission prompt working
- Firebase/Supabase project provisioned
- Empty 3-tab navigation runs

**Risks / decisions**
- Vision Camera v3 vs v4 (v4 has frame processors as plugins — use v4)
- Expo managed workflow won't work — you need bare or prebuild for native ML

---

## Phase 1 — Camera & UI Scaffolding (Week 2)

**Goal:** Live camera feed showing in the app with all UI screens stubbed out.

**Tasks**
- Vision Camera live preview component
- Set up frame processor (this is the hook where ML will run later — for now just log frame dimensions)
- Build the UI from the prototype: live preview, speed readout, plate readout, vehicle/violation counters
- Settings screen: camera ID, speed limit, GPS coords, calibration entry point
- Stub out Log tab and Avg Speed tab with empty states
- Persist settings with MMKV (faster than AsyncStorage)

**Deliverables**
- Camera preview at full FPS
- Tab navigation works
- Settings save and reload

---

## Phase 2 — Object Detection (Weeks 3–4)

**Goal:** Detect vehicles in real time and draw boxes around them.

**Tasks**
- Pick a model: YOLOv8n (~3MB tflite, fast), MobileNet SSD (smaller), or EfficientDet-Lite (more accurate, slower)
- Convert to TFLite or CoreML — find a pre-converted version on Hugging Face if possible
- Integrate via `react-native-fast-tflite` — load model, run inference inside frame processor
- Throttle inference: run on every 3rd–5th frame (target 10–15 inference FPS, not full 30/60 FPS)
- Filter classes: keep only `car`, `truck`, `bus`, `motorcycle`
- Render bounding boxes with Skia overlay synced to the preview
- Add NMS (non-max suppression) if the model doesn't include it

**Deliverables**
- Live vehicle detection at 10+ inference FPS
- Boxes render correctly aligned to preview
- Class filter working

**Risks**
- iOS uses CoreML delegate, Android uses NNAPI/GPU delegate — performance varies wildly between devices
- Models trained on COCO are OK but not optimized for traffic scenes — consider fine-tuning later

---

## Phase 3 — Tracking & Speed Measurement (Weeks 5–6)

**Goal:** Assign persistent IDs to vehicles across frames and calculate speed in km/h.

**Tasks**
- Implement an IoU-based tracker (simplest) or port SORT (Simple Online Realtime Tracking) to JS or native
- Persist track IDs across frames — vehicle gets the same ID until it leaves the frame
- Build a calibration wizard:
  - User marks two points on the road on screen (e.g. start of one lane marking and start of the next)
  - User enters the real-world distance between them (lane markings in Jordan are typically 3m painted + 6m gap on highways, so 9m total)
  - App stores a perspective transform (homography matrix) mapping pixels to ground-plane meters
- Speed calculation per frame:
  - Take vehicle bottom-center point in pixels
  - Transform to ground-plane coords using homography
  - Measure displacement between frames: `meters / time_delta = m/s`
  - Convert to km/h
- Smooth with a Kalman filter or simple moving average over the last 5 frames
- Validate: drive a known speed past the camera using GPS as ground truth

**Deliverables**
- Per-vehicle speed displayed live with ±5 km/h accuracy after calibration
- Calibration wizard with save/load

**Critical decisions**
- Single-frame speed vs averaged speed across a "measurement zone" (zone is more accurate)
- Camera height/angle affect accuracy — recommend mounting at known angle

---

## Phase 4 — License Plate Recognition (Weeks 7–8)

**Goal:** Read the plate text for each tracked vehicle.

**Tasks**
- Crop plate region from each vehicle's bounding box. Two approaches:
  - **Heuristic:** lower 30% of vehicle box, filter by aspect ratio (~3:1 or 4:1) — fast but misses
  - **Dedicated model:** use a plate detector like `plate-detector-yolo` — more accurate
- OCR options:
  - **ML Kit Text Recognition** — free, on-device, decent for clear plates
  - **Custom CRNN model** — better for plates specifically, more setup
- Validate plate format with regex specific to your region. Jordan plates are typically `NN-NNNNN` (commercial) or `NN-NNNN` (private)
- Multi-frame voting: same track ID sees multiple frames → take the most common OCR reading
- Set a confidence threshold — don't log plates below it
- Handle common OCR errors: 0/O, 1/I/L, 8/B

**Deliverables**
- Plate text attached to each tracked vehicle
- 70%+ accuracy in good daylight conditions
- Format validation rejects garbage reads

**Risks**
- Night, blur, angled plates kill accuracy
- Different countries = different plate fonts and layouts

---

## Phase 5 — Violation Logging (Week 9)

**Goal:** Save violations locally with full evidence and a usable log view.

**Schema**
```
violations:
  id (uuid)
  plate (text)
  speed_kmh (real)
  speed_limit (int)
  is_violation (bool)
  timestamp (datetime)
  camera_id (text)
  gps_lat (real)
  gps_lng (real)
  image_path (text — path to plate crop)
  confidence (real)
  synced (bool)
```

**Tasks**
- SQLite or WatermelonDB setup with above schema
- On vehicle exiting frame, save the final reading + image crop
- Save plate crop image to local file system
- Build Log tab UI: filter by date, camera, violation status; tap a row to see image
- CSV export for offline analysis
- Admin actions: delete entry, edit plate (manual correction)

**Deliverables**
- Violations persist across app restarts
- Image evidence viewable
- CSV export works

---

## Phase 6 — Backend & Multi-Device Sync (Weeks 10–11)

**Goal:** Two cameras share readings in real time so they can be cross-referenced.

**Tasks**
- Firebase Firestore or Supabase setup with collections:
  - `cameras` — registered devices with location, owner, calibration
  - `readings` — every plate reading, indexed by plate for fast cross-camera lookup
- Auth: each device registers with a unique camera ID + API key
- On every local violation, push reading to backend: `{ plate, timestamp, camera_id, speed, gps }`
- Image upload to Firebase Storage / Supabase Storage
- Real-time listener: when other cameras log readings, receive them locally
- Offline queue: writes go to local DB first, sync when online
- Handle clock skew — store both device timestamp and server timestamp

**Deliverables**
- Two devices sync readings in real time
- Image upload works with retry on failure
- Offline-first behavior validated by airplane-mode test

---

## Phase 7 — Average Speed Enforcement (Week 12)

**Goal:** Cross-camera violation detection using the time-distance check.

**Tasks**
- Configure camera pairs in admin UI: `camera_A_id`, `camera_B_id`, `distance_km`
- When a new reading arrives at Camera B, query backend: "Has this plate been seen at Camera A within the last X minutes?"
- Match plates with fuzzy logic to absorb OCR errors (Levenshtein distance ≤ 1)
- Calculate: `avg_speed = distance_km / ((timestamp_B - timestamp_A) / 3600)`
- If `avg_speed > legal_limit`, generate a `section_violation` record
- Compare to single-point readings: a car can pass both cameras at legal speed but speed up between them — the section check catches this
- Dashboard tab: route-level violations with both camera images side by side

**Deliverables**
- Section violations auto-generated when plates match across cameras
- Cross-camera dashboard with evidence
- Configurable distances and time windows

---

## Phase 8 — Hardening & Field Testing (Weeks 13–14)

**Goal:** Survive real-world conditions, not just lab setups.

**Tasks**
- Night handling: increase exposure, consider an IR-friendly mount
- Weather: log false-detection rates in rain/fog and tune confidence thresholds
- Occlusion: when one car blocks another, tracker should not swap IDs — test and fix
- False positives: parked cars, pedestrians, signs — exclude with motion threshold (`speed > 5 km/h` filter)
- Battery: reduce inference frequency when idle, drop FPS at low battery
- Thermal: detect thermal throttling and downscale model input size
- Privacy: encrypt the SQLite DB at rest, set a data retention policy (auto-delete after N days), document GDPR-style compliance
- Field test: mount on a tripod near a real road, run for hours, compare to GPS ground truth from a known driver

**Deliverables**
- 24-hour stable operation without crash
- Documented accuracy in different conditions (day/night/rain)
- Privacy/retention policy implemented

---

## Critical Watch-Out Points

1. **Calibration is everything.** Bad calibration = wrong speeds. If you ever showed someone a "speeding ticket" from this app, wrong calibration becomes a real problem. Always show users the calibration source.
2. **Phone cameras are not certified speed-enforcement equipment.** Real police speed cameras are LIDAR or doppler radar, certified to legal standards. This system should be framed as a research/learning/private-monitoring tool — not used to issue fines.
3. **Plate OCR varies by region.** Train and test on Jordanian plates specifically. ML Kit may handle Latin-script plates fine but Arabic-script plates might need a custom model.
4. **Privacy and legal compliance.** Recording license plates of cars in public has real legal implications in many jurisdictions. Check Jordanian data protection law (and GDPR if any data crosses to EU). Plan for: consent signage if mounted publicly, data retention limits, encryption at rest.
5. **Clock sync between cameras.** A 2-second clock skew over a 5km distance equals a ~9 km/h speed error. Use NTP or always trust the server timestamp.
6. **Edge cases will dominate testing.** Cars changing lanes mid-frame, motorcycles partially occluded, plates with reflective glare — budget time for these, they're not afterthoughts.

---

## Recommended Build Order Within Each Phase

For every phase: build the simplest version that proves the concept, validate it works, then optimize. Don't try to ship YOLOv8 with full Kalman tracking on day one — get a slow, simple version working end-to-end first, then improve each piece.

The biggest mistake on a project like this is spending Phase 2 perfecting object detection before you know if Phase 4 OCR will even work on your plates. Ship a janky end-to-end pipeline by Week 8, then go back and tune.
