# INSTALL — HDL Toolchain Dependencies

The export and parse paths run pure-JS in the browser — no system
dependencies. The verification gates (L1 iverilog, L2 lint, optional
Yosys round-trip, optional `synth_ice40` synthesis) need a few external
tools, listed below per OS.

## Mandatory: nothing.

The HDL test suite (`node examples/tests/run-hdl.mjs`) skips iverilog +
Yosys gates when those tools are absent. CI passes without them.

## Recommended: iverilog (L1 — Verilog parses + simulates)

| OS | Command |
|---|---|
| Ubuntu / Debian   | `sudo apt install iverilog` |
| Fedora / RHEL     | `sudo dnf install iverilog` |
| macOS (Homebrew)  | `brew install icarus-verilog` |
| Windows           | Download installer from <https://bleyer.org/icarus/> or use WSL |

Verify: `iverilog -V` (expect `Icarus Verilog version 11.0` or newer).

## Optional: Yosys (L3 round-trip + L4 synthesis gate)

| OS | Command |
|---|---|
| Ubuntu / Debian   | `sudo apt install yosys` |
| Fedora / RHEL     | `sudo dnf install yosys` |
| macOS (Homebrew)  | `brew install yosys` |
| Windows           | Build from source (<https://github.com/YosysHQ/yosys>) or use WSL |

Verify: `yosys -V` (expect `0.30+` for full feature support).

## Optional: nextpnr-ice40 (place-and-route on iCE40)

Only needed if you want to push synth output through to a real
bitstream. Not required for any HDL gate today.

| OS | Command |
|---|---|
| Ubuntu / Debian   | `sudo apt install nextpnr-ice40` |
| macOS (Homebrew)  | `brew install nextpnr` |
| Windows           | Use WSL or grab the OSS-CAD Suite bundle |

## Tested versions

The HDL toolchain is exercised in CI against:

| Tool | Version |
|---|---|
| Node.js                 | ≥ 18 |
| Icarus Verilog (L1)     | 11.0, 12.0 |
| Yosys (L3 / L4)         | 0.30, 0.36 |
| Verilator (L2 lint)     | 5.018+ |
| nextpnr-ice40           | 0.6+   (optional) |

Older versions may work; nothing newer than what's listed has been
exercised by the project.

## Quick smoke test

```bash
# Pure-JS suite — always works
node examples/tests/run-hdl.mjs

# 1000-seed property fuzz
node examples/tests/test-hdl-fuzz.mjs

# Corpus round-trip (CANONICAL + FIDELITY)
node examples/tests/test-hdl-corpus-round-trip.mjs
```

If iverilog is on `PATH`, the L1 gates inside the suite light up
automatically (look for `iverilog parses` lines in the output).
