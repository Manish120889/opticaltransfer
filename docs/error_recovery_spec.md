# Error Recovery & Fountain Coding Specification (v1.0)

## Overview
Optical screen-to-camera channels suffer from dropped video frames, rolling shutter artifacts, motion blur, out-of-order frame capture, and camera defocus. This document specifies the two-tier error recovery strategy that guarantees reliable file reconstruction without any backchannel retransmission request.

---

## 1. Two-Tier Error Protection Layer Architecture

```
[ Captured Camera Frame ]
           │
           ▼
┌────────────────────────────────────────┐
│ Layer 1: CRC32C & Inner Cell Parity   │
│ - Check frame CRC32C.                  │
│ - Apply symbol parity bit correction.  │
│ - Discard corrupted unfixable frames.  │
└────────────────────────────────────────┘
           │ (Valid Symbols)
           ▼
┌────────────────────────────────────────┐
│ Layer 2: Luby Transform Fountain Code │
│ - Collect fountain packets (degree d). │
│ - Perform Gaussian elimination / LT    │
│   belief propagation decoding.         │
│ - Solves K source blocks from any      │
│   K * (1 + ε) valid received packets.  │
└────────────────────────────────────────┘
           │
           ▼
[ Reconstructed Original Payload ]
```

---

## 2. Luby Transform (LT) Fountain Code Specification

### Degree Distribution
The degree $d$ (number of source blocks XORed in a repair packet) is chosen according to the **Robust Soliton Distribution** $R(K, c, \delta)$:

1. Ideal Soliton Distribution $\rho(i)$:
   $$\rho(1) = \frac{1}{K}$$
   $$\rho(i) = \frac{1}{i(i-1)} \quad \text{for } i = 2, \dots, K$$

2. Ripple Function $\tau(i)$:
   $$S = c \cdot \ln(K / \delta) \cdot \sqrt{K}$$
   $$\tau(i) = \frac{S}{K \cdot i} \quad \text{for } i = 1, \dots, \lfloor K/S \rfloor - 1$$
   $$\tau(i) = \frac{S \cdot \ln(S / \delta)}{K} \quad \text{for } i = \lfloor K/S \rfloor$$
   $$\tau(i) = 0 \quad \text{for } i > \lfloor K/S \rfloor$$

3. Combined Normalized Distribution $\mu(i)$:
   $$\beta = \sum_{i=1}^{K} (\rho(i) + \tau(i))$$
   $$\mu(i) = \frac{\rho(i) + \tau(i)}{\beta}$$

### Encoder Algorithm
For each generated repair packet $m$:
1. Sample degree $d \sim \mu(i)$ using pseudo-random seed $s_m$.
2. Uniformly sample $d$ distinct source block indices $\{i_1, i_2, \dots, i_d\} \subseteq \{0, \dots, K-1\}$.
3. Compute repair block data $D_m = B_{i_1} \oplus B_{i_2} \oplus \dots \oplus B_{i_d}$.

### Decoder Algorithm (Belief Propagation & Linear Solver)
1. Maintain a bipartite graph connecting received repair packets $M$ to source blocks $K$.
2. Whenever a degree-1 packet (containing exactly 1 un-decoded source block) arrives:
   - Immediately decode the source block value.
   - XOR the solved block into all connected degree-$d$ packets.
   - Reduce the degree of connected packets by 1.
3. If belief propagation stalls due to dense degree cycles, execute incremental Gaussian Elimination over GF(2) to resolve remaining linear equations.
4. Total packets required for decoding: $K \cdot (1 + \epsilon)$ where overhead $\epsilon \approx 0.05 \dots 0.15$.
