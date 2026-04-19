/**
 * Compat shim — the waveform module moved to `js/waveform/` during Phase 1
 * of the Waveform Pro roadmap. This re-export keeps any old cached client
 * code from 404ing if it still imports the former path. New code should
 * import from `./waveform/WaveformController.js` directly.
 */
export * from '../waveform/WaveformController.js';
