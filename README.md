# GeoNoise - Environmental Noise Modeling Software

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![ISO 9613-2](https://img.shields.io/badge/Standard-ISO%209613--2-green.svg)](https://www.iso.org/standard/20649.html)

**GeoNoise** is a free, open-source, browser-based environmental noise modeling application for acoustic consultants, environmental engineers, and urban planners. Calculate outdoor sound propagation using ISO 9613-2 methods with advanced features including multi-path ray tracing and coherent phasor summation.

🌐 **Try it now:** [https://geonoise.app](https://geonoise.app)

---

## 🔊 What is Environmental Noise Modeling?

Environmental noise modeling predicts how sound travels outdoors from sources (traffic, industrial equipment, HVAC systems) to receivers (homes, schools, hospitals). Key applications include:

- **Environmental Impact Assessments (EIA)** for construction and industrial projects
- **Noise barrier design** and effectiveness evaluation
- **Urban planning** and zoning compliance
- **Regulatory compliance** with noise ordinances
- **Community noise studies** for wind farms, airports, highways

---

## ✨ Features

### Standards-Based Propagation (ISO 9613-2)
- **Geometric divergence** - Spherical and cylindrical spreading
- **Atmospheric absorption** - ISO 9613-1 full calculation or simplified lookup
- **Ground effects** - ISO 9613-2 tables or two-ray phasor interference model
- **Barrier diffraction** - Maekawa formula with over-top and side diffraction
- **Building occlusion** - 3D polygon intersection with roof diffraction

### Dual Calculation Engines
| Engine | Use Case | Method |
|--------|----------|--------|
| **Grid Engine** | Noise maps, receivers, measure grids | ISO 9613-2 single-path, fast |
| **Probe Engine** | Point analysis, frequency response | Multi-path ray tracing, coherent phasor |

### Advanced Physics Modeling
- **Coherent phasor summation** - Phase-accurate interference patterns
- **Ground dip phenomenon** - Destructive interference from ground reflection
- **Wall reflections** - First-order specular reflections via image source method
- **Delany-Bazley impedance** - Ground surface characterization with Miki extension
- **Sommerfeld correction** - Spherical wave ground reflection (coming soon)

### Interactive Noise Mapping
- **Real-time noise maps** - Dynamic recalculation on geometry changes
- **9-band octave spectrum** - 63 Hz to 16 kHz analysis
- **A/C/Z frequency weighting** - Industry-standard weighting curves
- **Contour visualization** - Iso-dB contour lines or gradient heatmaps
- **CSV/JSON export** - For post-processing and reporting

---

## 🧮 Physics Equations

GeoNoise implements the complete ISO 9613-2 outdoor sound propagation model:

```
Lp = Lw - Adiv - Aatm - Agr - Abar
```

Where:
- **Lw** = Sound power level (dB re 10⁻¹² W)
- **Adiv** = Geometric divergence: `20·log₁₀(d) + 10·log₁₀(4π)`
- **Aatm** = Atmospheric absorption: `α(f,T,RH) × d / 1000`
- **Agr** = Ground effect: ISO tables or `−20·log₁₀|1 + Γ·e^(jkΔr)|`
- **Abar** = Barrier diffraction: `10·log₁₀(3 + 20N)` (Maekawa)

### Ground Impedance (Delany-Bazley)
```
Zn = 1 + 9.08(f/σ)^(-0.75) − j·11.9(f/σ)^(-0.73)
```

### Barrier Diffraction (Maekawa)
```
N = 2δf/c     (Fresnel number)
Abar = 10·log₁₀(3 + 20N)   (thin barrier, cap 20 dB)
Abar = 10·log₁₀(3 + 40N)   (thick barrier, cap 25 dB)
```

### Coherent Multi-Path Summation
```
p_total = Σ pᵢ · e^(j·φᵢ)    where φᵢ = −k·dᵢ + φ_reflection
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ with npm
- Modern browser (Chrome, Firefox, Safari, Edge)

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/geonoise.git
cd geonoise

# Install dependencies
npm install

# Build all packages
npm run build

# Start development server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Quick Start

1. **Add a source** - Click "S" button or press `S` key, click on map
2. **Add a receiver** - Click "R" button or press `R` key, click on map
3. **Compute** - Click "Compute" button to calculate sound levels
4. **Generate Map** - Click "Generate Map" for a full noise heatmap

---

## 📚 Documentation

| Document | Description |
|----------|-------------|
| [CHANGELOG.md](docs/CHANGELOG.md) | Version history and recent changes |
| [ROADMAP.md](docs/ROADMAP.md) | Planned features and development direction |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design and package structure |
| [PHYSICS_REFERENCE.md](docs/PHYSICS_REFERENCE.md) | Complete physics equations reference |
| [PHYSICS_UI_RESTRUCTURE.md](docs/PHYSICS_UI_RESTRUCTURE.md) | Physics settings panel design |

---

## 🏗️ Project Structure

```
geonoise/
├── apps/
│   └── web/                    # Main web application
│       ├── src/
│       │   ├── main.ts         # Application entry point
│       │   ├── probeWorker.ts  # Ray tracing web worker
│       │   └── style.css       # Neumorphic UI styles
│       └── index.html          # HTML with SEO meta tags
├── packages/
│   ├── shared/                 # Shared utilities, phasor math
│   ├── core/                   # Schema definitions, validation
│   ├── geo/                    # Geometry utilities
│   ├── engine/                 # Propagation calculations
│   ├── engine-backends/        # CPU worker backend
│   └── engine-webgpu/          # WebGPU backend (planned)
└── docs/                       # Documentation
```

---

## 🔬 Technical Details

### Calculation Methods

| Feature | Grid Engine | Probe Engine |
|---------|-------------|--------------|
| Path count | 1 per source | Multiple (ray traced) |
| Ground effect | ISO or Two-Ray | Two-ray phasor |
| Wall reflections | No | Yes (first-order) |
| Summation | Incoherent (power) | Coherent (phasor) |
| Performance | Fast (50k points/sec) | Slower (per-probe) |

### Browser Requirements
- **ES2022 modules** - Native import/export
- **Web Workers** - Background calculation threads
- **Canvas 2D** - Map and chart rendering
- **Optional:** WebGPU for future GPU acceleration

---

## 🤝 Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

### Development Commands

```bash
npm run dev          # Start dev server with hot reload
npm run build        # Production build
npm run build:clean  # Clean build (clears all caches)
npm run test         # Run test suite
```

---

## 📖 References

### Standards
- **ISO 9613-1:1993** - Atmospheric absorption calculation
- **ISO 9613-2:1996** - Outdoor sound propagation (general method)

### Academic Sources
- Maekawa, Z. (1968). "Noise reduction by screens." *Applied Acoustics*, 1(3), 157-173
- Delany, M.E. & Bazley, E.N. (1970). "Acoustical properties of fibrous absorbent materials." *Applied Acoustics*, 3(2), 105-116
- Miki, Y. (1990). "Acoustical properties of porous materials." *J. Acoust. Soc. Jpn.*, 11(1), 19-24
- Pierce, A.D. (1981). *Acoustics: An Introduction to Its Physical Principles and Applications*. McGraw-Hill

---

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

---

## 🔗 Keywords

Environmental noise modeling, acoustic propagation software, ISO 9613-2, sound level calculation, noise mapping, barrier diffraction, ground effect, Maekawa formula, Delany-Bazley model, outdoor acoustics, noise assessment tool, environmental impact assessment, noise contour map, sound propagation calculator, free noise software, web-based acoustics, coherent phasor summation, multi-path ray tracing, atmospheric absorption, noise consultant tools, urban noise planning, industrial noise prediction, traffic noise modeling, construction noise assessment.

---

<p align="center">
  <strong>Built with ❤️ for the acoustics community</strong>
</p>
