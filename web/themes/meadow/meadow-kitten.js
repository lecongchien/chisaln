/**
 * Studio Ghibli Black Kitten Controller
 * Loads the mipmapped watercolor sprite and drives organic micro-animations:
 * sleeping chest breath, periodic elastic S-curve tail swish, right-ear micro-twitch,
 * and natural quick/sleepy amber-eye blinks.
 */
const sstep = (a, b, x) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

export function createKittenController(gl, onReady) {
  let ready = false;
  const state = { x: 640, y: 460, initialized: false, seed: 3.7, activeAnim: false };

  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));

  const img = new Image();
  img.onload = () => {
    const sq = document.createElement('canvas');
    sq.width = 384;
    sq.height = 384;
    sq.getContext('2d').drawImage(img, 0, 0, 384, 384);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sq);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    ready = true;
    onReady?.();
  };
  img.src = 'assets/meadow-kitten.png';

  function computeAnim(t, flowParam) {
    const flow = Math.max(0.25, flowParam);
    const breath = Math.sin(t * 1.65 * flow);

    const swishPeriod = 7.4;
    const swishAge = ((t + state.seed) % swishPeriod) - 1.4;
    let swishEnv = 0;
    if (swishAge > 0 && swishAge < 2.3) {
      swishEnv = Math.pow(Math.sin((swishAge / 2.3) * Math.PI), 2);
    }

    const wavePhase = t * 4.2 * flow;
    const swishAmp = 0.084 * swishEnv;

    const earPeriod = 6.8;
    const earAge = ((t + state.seed * 2.1) % earPeriod) - 3.5;
    let earTwitch = 0;
    if (earAge > 0 && earAge < 0.24) {
      earTwitch = Math.sin((earAge / 0.24) * Math.PI * 2) * Math.sin((earAge / 0.24) * Math.PI);
    }

    const blinkPeriod = 5.2;
    const blinkCycle = Math.floor((t + 1.3) / blinkPeriod);
    const blinkAge = (t + 1.3) % blinkPeriod;
    let blink = 0;
    if (blinkCycle % 3 === 2) {
      if (blinkAge < 0.35) blink = sstep(0, 0.35, blinkAge);
      else if (blinkAge < 1.35) blink = 1.0;
      else if (blinkAge < 1.80) blink = 1.0 - sstep(1.35, 1.80, blinkAge);
    } else if (blinkAge < 0.28) {
      blink = Math.pow(Math.sin((blinkAge / 0.28) * Math.PI), 1.4);
    }

    state.activeAnim = swishEnv > 0.02 || Math.abs(earTwitch) > 0.01 || (blink > 0.01 && blink < 0.99);
    return { anim: [wavePhase, swishAmp, breath, earTwitch], blink };
  }

  return {
    state,
    texture,
    isReady: () => ready,
    isHighMotion: () => state.activeAnim,
    computeAnim
  };
}
