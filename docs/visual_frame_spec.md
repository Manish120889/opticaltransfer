# Visual Frame Specification (v1.0)

## Overview
This document defines the spatial layout, finder pattern geometry, dynamic color calibration bar, header strip, and symbol cell matrix for rendered visual frames.

---

## 1. Frame Geometry Layout

```
┌────────────────────────────────────────────────────────┐
│ [FINDER 1]   ██ CALIBRATION SWATCH BAR ██   [FINDER 2] │
├────────────────────────────────────────────────────────┤
│ ░░ HEADER STRIP ░░ (Frame Type, Sequence ID, CRC32)   │
├────────────────────────────────────────────────────────┤
│                                                        │
│             DATA TILE GRID (COLOR MATRIX)              │
│                 N x N Color Palette Cells              │
│                                                        │
├────────────────────────────────────────────────────────┤
│ [FINDER 3]   ██ CALIBRATION SWATCH BAR ██   [FINDER 4] │
└────────────────────────────────────────────────────────┘
```

---

## 2. Corner Alignment Finder Patterns
- **Dimensions**: Outer square width $W_f$, middle ring $W_f \times 0.6$, inner core $W_f \times 0.2$.
- **Coloring**: High-contrast Black/White nested square hierarchy (`Black Outer` -> `White Ring` -> `Black Core`).
- **Positions**: Top-Left $(0,0)$, Top-Right $(W-W_f, 0)$, Bottom-Left $(0, H-H_f)$, Bottom-Right $(W-W_f, H-H_f)$.
- **Purpose**: Enables robust 4-point homography estimation ($H$) and perspective correction under camera tilt, skew, keystoning, and radial lens distortion.

---

## 3. Dynamic Color Swatch Calibration Bar
Located adjacent to finder patterns along the top and bottom frame margins:
- Swatches representing every active color palette entry (e.g. 4 colors for Safe, 16 colors for Fast, 64 colors for Turbo) plus pure `#000000` (Black) and `#FFFFFF` (White).
- Receiver samples these exact swatches on every incoming video frame, calculating dynamic RGB/CIELAB color space centroids $\mathbf{c}_k$.
- This cancels out ambient lighting shifts, screen brightness differences, camera white balance hunting, and display color gamut variations.

---

## 4. Transmission Profiles

### Safe Mode
- **Palette**: 4 high-contrast primary colors (Black, White, Red, Cyan / Blue).
- **Bits per tile**: 2 bits ($2^2 = 4$).
- **Grid Layout**: 24 x 24 tiles.
- **Inner ECC**: 25% parity redundancy.
- **Framerate Target**: 10 - 15 fps.
- **Best for**: Low-end webcams, poor lighting, hand movement, reflection/glare.

### Fast Mode (Production Standard)
- **Palette**: 16 calibrated RGB colors.
- **Bits per tile**: 4 bits ($2^4 = 16$).
- **Grid Layout**: 36 x 36 tiles.
- **Inner ECC**: 15% parity redundancy.
- **Framerate Target**: 30 fps.
- **Estimated Throughput**: 50 - 150 KB/s.

### Turbo Mode (Aggressive)
- **Palette**: 64 high-density colors (6 bits/tile).
- **Grid Layout**: 48 x 48 tiles.
- **Framerate Target**: 45 - 60 fps.
- **Estimated Throughput**: 150 - 250+ KB/s.

---

## 5. Per-Frame Validation
- Every frame payload is protected by a 32-bit CRC32C checksum appended to the header strip.
- Frames failing CRC validation are immediately discarded by the receiver before entering the fountain decoder.
