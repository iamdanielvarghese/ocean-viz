// Camera tween helper for the Dive transition (master §4): a short, purposeful
// ease from the current camera pose to a target pose. No dependencies beyond three.

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

/**
 * Tween camera.position and controls.target to the given Vector3s.
 * @param {import('three').PerspectiveCamera} camera
 * @param {import('three').OrbitControls} controls
 * @param {{position: import('three').Vector3, target: import('three').Vector3}} to
 * @param {number} durationMs
 * @param {{followTarget?: boolean}} [options]
 *   followTarget: during the tween the camera translates by the same delta as
 *   the target each frame, preserving the orbit offset instead of easing
 *   position independently. Used for vertical-exaggeration changes so the
 *   apparent zoom stays constant while the rig translates downward.
 * @returns {() => void} cancel function
 */
export function tweenCamera(camera, controls, to, durationMs = 900, options = {}) {
  const startPos = camera.position.clone()
  const startTarget = controls.target.clone()
  const startTime = performance.now()
  let frame = 0
  let cancelled = false

  function step() {
    if (cancelled) return
    const t = Math.min(1, (performance.now() - startTime) / durationMs)
    const k = easeInOutCubic(t)

    controls.target.lerpVectors(startTarget, to.target, k)

    if (options.followTarget) {
      // Translate with the target: keep the exact orbit offset, so the user's
      // chosen distance/angle survives the rig movement untouched.
      camera.position.copy(startPos).add(controls.target).sub(startTarget)
    } else {
      camera.position.lerpVectors(startPos, to.position, k)
    }

    controls.update()

    if (t < 1) {
      frame = requestAnimationFrame(step)
    }
  }

  frame = requestAnimationFrame(step)

  return () => {
    cancelled = true
    cancelAnimationFrame(frame)
  }
}
