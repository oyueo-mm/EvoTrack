# EvoTrack architecture

## Initial inspection · 2026-10-23
The selected workspace was empty. No existing files were replaced. Git and Node are installed under Program Files but absent from PATH; commands use explicit paths. Git repository status is checked before initialization. This project is local-only until publication is approved.

## Design
React + TypeScript + Vite + Tailwind; Canvas 2D renders snapshots, never controls training. Two deterministic headless environments share reset/step/observe/getState/getMetrics/serialize. Physics uses 1/60 s and swept/substepped collision resolution. Versioned maps and observation/action schemas gate model compatibility.

One module Worker per algorithm owns its RNG, environment, model, optimizer and records. GA evolves a tanh MLP; PPO trains a separate TensorFlow.js actor and critic using categorical actions, GAE, clipped surrogate, entropy, minibatches, global norm clipping and Adam. The CPU backend works in Workers without a GPU. GA and PPO have identical observation/action schemas but independent state. Interaction counts and wall time are the comparison axes. Rendering is capped by snapshot cadence.

Worker messages carry session and request IDs. Pause and stop are acknowledged only at a safe batch boundary. Checkpoints are taken at complete generation/rollout boundaries; they include GA population or PPO actor/critic/Adam slots, RNG, config and counters. PPO checkpoints restart at an episode boundary; they must not be described as an exact mid-episode continuation. Stale messages cannot modify a replacement session.

The development server prebundles Worker-only TensorFlow.js imports up front to prevent dependency discovery from reloading a live training session. Checkpoints embed the training map snapshot and resume against that exact saved geometry. Browser QA also directly checks reset/snapshot/config commands and stale-session isolation. Canvas playback runs the actual learned policy in a separate Simulator, with fixed physics and capped drawing; it never generates learning metrics.

IndexedDB stores maps, inference models/checkpoints and experiment records. Imports are validated before execution. JSON exports are portable. Evaluation freezes weights and runs multiple seeds on a separately selected map. No backend or external training API.

## Delivery order and gates
1. Shell, schemas, deterministic RNG, common environment; TypeScript and schema tests.
2. Racing physics and editor; collision/checkpoint/determinism tests.
3. Bounce physics and editor; gravity/jump/collision tests.
4. MLP and GA; elitism, mutation, serialization tests.
5. PPO; probabilities, GAE/termination/truncation, gradients and memory tests.
6. Workers; browser start/pause/resume/concurrent tests.
7. Persistence; map/model round trips, malformed file handling.
8. Dashboard/evaluation; frozen-parameter and held-out map validation.
9. Browser QA, measured learning runs, static build and Pages workflow. Publication requires user approval.

## Risks and boundaries
- Stochastic improvement must be measured, never promised; small fixtures do not prove generalization.
- CPU TensorFlow.js is portable but lower throughput than WebGL. Training budgets are bounded and Workers yield to receive commands.
- Pause cannot interrupt synchronous optimizer work; it becomes effective when acknowledged.
- Geometric validation can reject invalid starts/disconnected roads, but cannot prove every arbitrary puzzle solvable.
- IndexedDB can fail due to quota/privacy settings; errors must reach the user.
- Imported files are untrusted: finite sizes, bounds, schema versions and all parameter lengths must be checked.
- Relative Vite assets and hash navigation support GitHub Pages project paths and refreshes.
