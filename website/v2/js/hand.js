/*
  hand.js: the realistic 3D hand.
  --------------------------------
  - Loads a rigged hand (.glb). Default: the free MIT WebXR "generic-hand" (assets/models/).
  - Finds the finger bones BY NAME (thumb / index / middle / ring / pinky or little).
  - Each finger gets one number "bend": 0 = straight, 1 = full fist. We spread it over the
    knuckles like a real finger does (MCP, PIP, and DIP ~ 2/3 of PIP).
  - Smooths the motion (critically damped, ~80 ms) so noisy sensors don't make it shake.
  - Skin material, soft lights, ground shadow, camera presets.

  TUNE BY EYE: the angles for a full fist are in FIST_ANGLES just below.
*/
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { FINGERS } from './protocol.js';

// ---------------------------------------------------------------------------
// Joint angles (degrees) at a FULL FIST (bend = 1). Change these to tune the look.
//   fingers: [MCP (knuckle), PIP (middle joint), DIP (end joint)]
//   thumb:   [CMC (base, near the wrist), MCP, IP]
// ---------------------------------------------------------------------------
export const FIST_ANGLES = {
  thumb:  [30, 30, 40],     // the CMC number is replaced by a swing worked out for each model
  index:  [75, 100, 67],
  middle: [80, 100, 67],
  ring:   [85, 100, 67],
  little: [90, 95, 63],
};

// The thumb at bend 0 (open): a few degrees of extra opening, so the open hand looks open.
// Same joints as FIST_ANGLES.thumb. Negative = away from the palm.
export const THUMB_OPEN = [-12, -8, 0];
// Which way the thumb curls: towards the palm (1) plus across towards the little finger (this number).
// thumbAcrossFist: 0 = thumb tip rests on the index finger, 1 = between index and middle.
// thumbRest: how far in front of the curled index finger the thumb tip rests in a fist (part of the hand length).
export const TUNE = { thumbAcross: 0.9, thumbRest: 0.06, thumbAcrossFist: 1.4 };

const SMOOTH_TIME = 0.08;     // seconds. Bigger = smoother but slower to follow.

// Skin tone presets: [base colour, sheen colour]
export const SKIN_TONES = [
  { name: 'Light',  color: 0xe8b496, sheen: 0xffc9b5 },
  { name: 'Medium', color: 0xb5774f, sheen: 0xe0a185 },
  { name: 'Deep',   color: 0x5e3826, sheen: 0x9c624a },
];

/* ---------------- how each knuckle bends for a given bend (0..1) ---------------- */
// Natural coupling: the middle joint (PIP) leads a little at the start, the knuckle (MCP)
// catches up, and the end joint (DIP) follows the PIP.
export function jointAnglesFor(finger, bend) {
  const b = Math.min(1, Math.max(0, bend));
  const [a0, a1, a2] = FIST_ANGLES[finger];
  if (finger === 'thumb') {
    const [o0, o1, o2] = THUMB_OPEN;
    return [o0 + (a0 - o0) * b, o1 + (a1 - o1) * b, o2 + (a2 - o2) * Math.pow(b, 1.1)];
  }
  const pip = a1 * (1 - Math.pow(1 - b, 1.25));
  const mcp = a0 * Math.pow(b, 1.15);
  const dip = pip * (a2 / a1);
  return [mcp, pip, dip];
}

/* ---------------- finding bones by name ---------------- */
const FINGER_WORDS = {
  thumb: /thumb|pollex/,
  index: /index|pointer|forefinger/,
  middle: /middle|mid(?!d)/,
  ring: /ring/,
  little: /pinky|pinkie|little|small/,
};
// segment order along the finger, by keyword
const SEGMENT_WORDS = [
  [/metacarp/, 0],
  [/proximal|prox/, 1],
  [/intermediate|inter|medial/, 2],
  [/distal|dist/, 3],
  [/tip|end|nub|top/, 4],
];
const clean = s => (s || '').toLowerCase().replace(/[_\-.:\s]+/g, ' ');

function segmentRank(name) {
  // remove the finger word first, so "middle-finger-phalanx-intermediate" does not read "middle" as a segment
  const n = clean(name).replace(/middle finger|middlefinger/g, 'FINGER');
  for (const [re, r] of SEGMENT_WORDS) if (re.test(n)) return r;
  return null;
}
function trailingNumber(name) {
  const m = /(\d+)\s*$/.exec(clean(name));
  return m ? parseInt(m[1], 10) : null;
}
function depthOf(o) { let d = 0; while (o.parent) { d++; o = o.parent; } return d; }
function isAncestor(a, b) { for (let o = b.parent; o; o = o.parent) if (o === a) return true; return false; }

/**
 * Finds the bones of each finger. Returns { ok, chains, wrist, missing, message }.
 * chains[finger] = { moving: [3 bones that bend], all: [every bone, in order, incl. the tip] }
 */
export function mapBones(bones) {
  const groups = Object.fromEntries(FINGERS.map(f => [f, []]));
  for (const b of bones) {
    const n = clean(b.name);
    // test "thumb" first, and make sure "middle" in e.g. "middle-finger-..." wins over segment words
    for (const f of FINGERS) {
      if (FINGER_WORDS[f].test(n)) { groups[f].push(b); break; }
    }
  }
  const chains = {};
  const missing = [];
  for (const f of FINGERS) {
    let list = groups[f];
    if (!list.length) { missing.push(f); continue; }
    const ranks = list.map(b => segmentRank(b.name));
    const nums = list.map(b => trailingNumber(b.name));
    if (ranks.every(r => r !== null)) list = list.map((b, i) => [b, ranks[i]]).sort((x, y) => x[1] - y[1]).map(x => x[0]);
    else if (nums.every(v => v !== null)) list = list.map((b, i) => [b, nums[i]]).sort((x, y) => x[1] - y[1]).map(x => x[0]);
    else list = [...list].sort((x, y) => depthOf(x) - depthOf(y));

    // split off tip / end bones (they only tell us which way the last bone points)
    const isTipWord = b => segmentRank(b.name) === 4;
    let body = list.filter(b => !isTipWord(b));
    let tips = list.filter(isTipWord);
    // Mixamo-style "Index1..Index4": the 4th one is the end bone if it has no child bones
    if (!tips.length && body.length >= 4 && !body[body.length - 1].children.some(c => c.isBone)) {
      tips = [body[body.length - 1]];
      body = body.slice(0, -1);
    }
    if (body.length < 2) { missing.push(f); continue; }
    const moving = body.slice(-3);          // the last three bend; a metacarpal (if any) stays still
    chains[f] = { moving, all: [...body, ...tips] };
  }
  const wrist = bones.find(b => /wrist/.test(clean(b.name)))
    || bones.find(b => /hand$|palm/.test(clean(b.name).trim())) || null;
  const needed = ['index', 'middle', 'little'];
  const fatal = needed.filter(f => missing.includes(f));
  const ok = fatal.length === 0;
  let message = '';
  if (!ok) message = `Could not find the ${fatal.join(', ')} finger bones. Bone names must contain thumb / index / middle / ring / pinky (or little).`;
  else if (missing.length) message = `Loaded, but these fingers have no bones and will not move: ${missing.join(', ')}.`;
  return { ok, chains, wrist, missing, message };
}

/* ---------------- procedural skin texture (canvas noise) ---------------- */
function makeSkinMaps(size = 512) {
  // tileable value noise: a lattice that wraps around, smoothly interpolated
  const height = new Float32Array(size * size);
  const octaves = [[8, 0.5], [16, 0.25], [48, 0.15], [128, 0.1]];
  for (const [cells, amp] of octaves) {
    const lat = new Float32Array(cells * cells).map(() => Math.random());
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const fx = (x / size) * cells, fy = (y / size) * cells;
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      const tx = smooth(fx - x0), ty = smooth(fy - y0);
      const g = (i, j) => lat[((j + cells) % cells) * cells + ((i + cells) % cells)];
      const v = lerp(lerp(g(x0, y0), g(x0 + 1, y0), tx), lerp(g(x0, y0 + 1), g(x0 + 1, y0 + 1), tx), ty);
      height[y * size + x] += v * amp;
    }
  }
  const normalCanvas = document.createElement('canvas');
  const roughCanvas = document.createElement('canvas');
  normalCanvas.width = normalCanvas.height = roughCanvas.width = roughCanvas.height = size;
  const nctx = normalCanvas.getContext('2d'), rctx = roughCanvas.getContext('2d');
  const nimg = nctx.createImageData(size, size), rimg = rctx.createImageData(size, size);
  const H = (x, y) => height[((y + size) % size) * size + ((x + size) % size)];
  const strength = 2.2;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * strength;
    const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
    const len = Math.hypot(dx, dy, 1);
    const i = (y * size + x) * 4;
    nimg.data[i] = (-dx / len * 0.5 + 0.5) * 255;
    nimg.data[i + 1] = (-dy / len * 0.5 + 0.5) * 255;
    nimg.data[i + 2] = (1 / len * 0.5 + 0.5) * 255;
    nimg.data[i + 3] = 255;
    const r = 200 + (H(x, y) - 0.5) * 90;       // roughness varies a little: pores are rougher
    rimg.data[i] = rimg.data[i + 1] = rimg.data[i + 2] = Math.max(0, Math.min(255, r));
    rimg.data[i + 3] = 255;
  }
  nctx.putImageData(nimg, 0, 0);
  rctx.putImageData(rimg, 0, 0);
  const normalMap = new THREE.CanvasTexture(normalCanvas);
  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  for (const t of [normalMap, roughnessMap]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(3, 3);
    t.colorSpace = THREE.NoColorSpace;
  }
  return { normalMap, roughnessMap };
}
const smooth = t => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;

/* ---------------- critically damped smoothing (like Unity's SmoothDamp) ---------------- */
function smoothDamp(current, target, state, dt) {
  const omega = 2 / SMOOTH_TIME;
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = current - target;
  const temp = (state.v + omega * change) * dt;
  state.v = (state.v - omega * temp) * exp;
  let out = target + (change + temp) * exp;
  if ((target - current > 0) === (out > target)) { out = target; state.v = 0; }   // never overshoot
  return out;
}

/* ======================================================================= */
export class HandView {
  constructor(container) {
    this.container = container;
    this.side = 'right';
    this.target = [0, 0, 0, 0, 0];      // wanted bend per finger (thumb..little)
    this.current = [0, 0, 0, 0, 0];     // smoothed bend actually shown
    this.vel = FINGERS.map(() => ({ v: 0 }));
    this.rig = null;
    this.flip = false;                  // custom models: bend the other way
    this.cache = {};                    // loaded built-in models, by side

    // renderer
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.82;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    container.prepend(r.domElement);

    // scene + soft studio light from a virtual room (RoomEnvironment)
    this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(r);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(r), 0.04).texture;
    pmrem.dispose();

    this.camera = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
    this.controls = new OrbitControls(this.camera, r.domElement);
    this.controls.enableDamping = true;
    this.controls.enablePan = false;
    this.controls.minDistance = 1.2;
    this.controls.maxDistance = 6;

    // key light with soft shadows
    const key = new THREE.DirectionalLight(0xfff4ea, 1.6);
    key.position.set(1.2, 3.2, 1.6);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    const sc = key.shadow.camera; sc.left = sc.bottom = -1.2; sc.right = sc.top = 1.2; sc.near = 0.5; sc.far = 8;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    this.scene.add(key);
    // gentle fill from below, so the palm view is not black
    const fill = new THREE.HemisphereLight(0xffffff, 0xd8c8c0, 0.35);
    this.scene.add(fill);

    // soft ground shadow: a real shadow catcher + a blurry contact blob
    this.ground = new THREE.Group();
    const catcher = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.ShadowMaterial({ opacity: 0.16 }));
    catcher.rotation.x = -Math.PI / 2;
    catcher.receiveShadow = true;
    this.ground.add(catcher);
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.9), new THREE.MeshBasicMaterial({
      map: blobTexture(), transparent: true, depthWrite: false, opacity: 0.45,
    }));
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.001;
    this.ground.add(blob);
    this.scene.add(this.ground);

    // the hand lives inside "pivot", which turns it palm-down with the fingers pointing away
    this.pivot = new THREE.Group();
    this.scene.add(this.pivot);

    // skin
    const maps = makeSkinMaps();
    this.skin = new THREE.MeshPhysicalMaterial({
      color: SKIN_TONES[0].color,
      roughness: 0.5,
      metalness: 0,
      sheen: 0.35,
      sheenRoughness: 0.8,
      sheenColor: new THREE.Color(SKIN_TONES[0].sheen),
      clearcoat: 0.08,
      clearcoatRoughness: 0.6,
      normalMap: maps.normalMap,
      normalScale: new THREE.Vector2(0.25, 0.25),
      roughnessMap: maps.roughnessMap,
      envMapIntensity: 0.7,
    });

    this.resize();
    new ResizeObserver(() => this.resize()).observe(container);
    this.setView('default');
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // on tall narrow screens, zoom out so the whole hand fits
    this.camera.zoom = Math.min(1, this.camera.aspect / 1.3);
    this.camera.updateProjectionMatrix();
  }

  /* ---------- loading ---------- */

  /** Loads the built-in WebXR hand for 'left' or 'right'. Returns { ok, message }. */
  async loadBuiltIn(side) {
    this.side = side;
    this.custom = false;
    const url = new URL(`../assets/models/${side}.glb`, import.meta.url).href;
    try {
      if (!this.cache[side]) this.cache[side] = await new GLTFLoader().loadAsync(url);
    } catch (err) {
      return { ok: false, message: `Could not load the hand model (${side}.glb). Open the site from a web server (GitHub Pages, Netlify or localhost), not by double-clicking the file.` };
    }
    // the cached scene gets reused, so give it a fresh copy of the pose each time
    return this.useModel(this.cache[side].scene, { builtIn: true });
  }

  /** Loads a .glb the user picked. Returns { ok, message }. Never throws. */
  async loadCustom(arrayBuffer) {
    let gltf;
    try {
      gltf = await new GLTFLoader().parseAsync(arrayBuffer, '');
    } catch {
      return { ok: false, message: 'That file could not be read as a .glb model.' };
    }
    const res = this.useModel(gltf.scene, { builtIn: false });
    if (res.ok) this.custom = true;
    return res;
  }

  useModel(root, { builtIn }) {
    try {
      const skinned = [];
      root.traverse(o => { if (o.isSkinnedMesh) skinned.push(o); });
      if (!skinned.length) return { ok: false, message: 'That model has no skeleton (no rigged/skinned mesh), so the fingers cannot move.' };
      const bones = [...new Set(skinned.flatMap(m => m.skeleton.bones))];
      const map = mapBones(bones);
      if (!map.ok) return { ok: false, message: map.message };

      // remove the old model only now that we know the new one works
      if (this.model) this.pivot.remove(this.model);
      if (this.rig) this.restPose();
      this.pivot.position.set(0, 0, 0);
      this.pivot.quaternion.identity();
      this.pivot.scale.setScalar(1);
      this.pivot.add(root);
      this.model = root;
      root.updateMatrixWorld(true);

      for (const m of skinned) {
        m.castShadow = true;
        m.receiveShadow = true;
        m.frustumCulled = false;       // bones move the mesh outside its original box
        const keepOwn = !builtIn && m.material && m.material.map;   // a custom model with its own skin texture
        if (!keepOwn) m.material = this.skin;
        else m.material.envMapIntensity = 0.9;
      }

      this.rig = this.buildRig(map, root);
      this.applyPose(this.current);
      return { ok: true, message: map.message };
    } catch (err) {
      console.warn(err);
      return { ok: false, message: 'Something in that model could not be set up. Try another .glb with a hand skeleton.' };
    }
  }

  // Works out, for each bending bone, which way is "towards the palm".
  buildRig(map, root) {
    const V = () => new THREE.Vector3();
    const pos = b => b.getWorldPosition(V());
    const { chains } = map;

    // 1. WebXR hands have all bones side by side. Link them into chains so a knuckle moves the rest of the finger.
    for (const f of FINGERS) {
      const c = chains[f];
      if (!c) continue;
      for (let i = 1; i < c.all.length; i++) {
        if (!isAncestor(c.all[i - 1], c.all[i])) c.all[i - 1].attach(c.all[i]);
      }
    }
    root.updateMatrixWorld(true);

    // 2. hand directions
    const firstPos = f => pos(chains[f].moving[0]);
    const indexMcp = firstPos('index'), middleMcp = firstPos('middle'), littleMcp = firstPos('little');
    const middleAll = chains.middle.all;
    const middleTip = pos(middleAll[middleAll.length - 1]);
    let wrist = map.wrist ? pos(map.wrist) : null;
    if (!wrist || wrist.distanceTo(middleMcp) < 1e-6) wrist = middleMcp.clone().sub(middleTip.clone().sub(middleMcp));
    const forward = middleMcp.clone().sub(wrist).normalize();            // wrist -> knuckles
    const across = indexMcp.clone().sub(littleMcp).normalize();          // little -> index (towards the thumb)
    let palm = new THREE.Vector3().crossVectors(across, forward);        // right hand: out of the palm
    if (this.side === 'left') palm.negate();
    if (this.flip) palm.negate();
    palm.sub(forward.clone().multiplyScalar(palm.dot(forward))).normalize();

    // 3. each bending bone: axis = bone direction x palm direction, in the bone's own space
    const rig = {};
    for (const f of FINGERS) {
      const c = chains[f];
      if (!c) continue;
      // the thumb curls towards the palm AND across towards the little finger
      const curlTo = f === 'thumb' ? palm.clone().add(across.clone().multiplyScalar(-TUNE.thumbAcross)).normalize() : palm;
      const joints = c.moving.map(bone => {
        const i = c.all.indexOf(bone);
        const here = pos(bone);
        let dir;
        if (i + 1 < c.all.length) dir = pos(c.all[i + 1]).sub(here);
        else dir = here.clone().sub(pos(c.all[i - 1]));
        dir.normalize();
        const axisWorld = new THREE.Vector3().crossVectors(dir, curlTo);
        if (axisWorld.lengthSq() < 1e-8) axisWorld.copy(across);
        axisWorld.normalize();
        // world -> bone local
        const q = bone.getWorldQuaternion(new THREE.Quaternion()).invert();
        const axis = axisWorld.clone().applyQuaternion(q).normalize();
        snapToAxis(axis);
        return { bone, rest: bone.quaternion.clone(), axis };
      });
      rig[f] = joints;
    }

    // 3b. thumb base (CMC): in a fist the whole thumb swings across the front of the curled fingers.
    // We work out that swing for this model: curl the fingers, then find the rotation that brings
    // the thumb tip to rest on the outside of the index finger's middle segment.
    const length = wrist.distanceTo(middleTip) || 1;
    if (rig.thumb && rig.thumb.length === 3 && rig.index) {
      const [cmc, mcp, ip] = rig.thumb;
      this.applyPose([0, 1, 1, 1, 1], rig);
      const fa = FIST_ANGLES.thumb;
      for (const [j, a] of [[mcp, fa[1]], [ip, fa[2]]]) j.bone.quaternion.copy(j.rest).multiply(new THREE.Quaternion().setFromAxisAngle(j.axis, THREE.MathUtils.degToRad(a)));
      cmc.bone.quaternion.copy(cmc.rest);
      root.updateMatrixWorld(true);
      const thumbAll = chains.thumb.all;
      const C = pos(cmc.bone), P = pos(thumbAll[thumbAll.length - 1]);
      // target: between the index and middle fingers' middle segments, a little in front of them
      const segs = [rig.index, rig.middle || rig.index].flatMap(j => [pos(j[1].bone), pos(j[2].bone)]);
      const T = segs.reduce((a, b) => a.add(b), V()).multiplyScalar(1 / segs.length)
        .lerp(segs[0].clone().lerp(segs[1], 0.5), 1 - TUNE.thumbAcrossFist)
        .add(forward.clone().multiplyScalar(TUNE.thumbRest * length));
      const swing = new THREE.Quaternion().setFromUnitVectors(P.sub(C).normalize(), T.sub(C).normalize());
      const angle = 2 * Math.acos(Math.min(1, Math.abs(swing.w)));
      if (angle > 1e-3) {
        const axisWorld = new THREE.Vector3(swing.x, swing.y, swing.z).multiplyScalar(Math.sign(swing.w) || 1).normalize();
        cmc.axis = axisWorld.applyQuaternion(cmc.bone.getWorldQuaternion(new THREE.Quaternion()).invert()).normalize();
        cmc.fistDeg = THREE.MathUtils.radToDeg(angle);
      }
      this.applyPose([0, 0, 0, 0, 0], rig);
    }

    // 4. turn the hand: palm down, fingers pointing away from the viewer, ~1 unit long
    const s = new THREE.Vector3().crossVectors(forward, palm);
    const from = new THREE.Matrix4().makeBasis(forward, palm, s);
    const F = new THREE.Vector3(0, 0, -1), N = new THREE.Vector3(0, -1, 0);
    const to = new THREE.Matrix4().makeBasis(F, N, new THREE.Vector3().crossVectors(F, N));
    const rot = new THREE.Quaternion().setFromRotationMatrix(to.multiply(from.clone().transpose()));
    const scale = 1.05 / length;
    const center = wrist.clone().add(middleTip).multiplyScalar(0.5);
    this.pivot.quaternion.copy(rot);
    this.pivot.scale.setScalar(scale);
    this.pivot.position.copy(center.applyQuaternion(rot).multiplyScalar(-scale));
    this.pivot.position.y += 0.08;

    // 5. ground: under the lowest point of a full fist
    this.applyPose([1, 1, 1, 1, 1], rig);
    this.pivot.updateMatrixWorld(true);
    let minY = Infinity;
    for (const f of FINGERS) if (chains[f]) for (const b of chains[f].all) minY = Math.min(minY, pos(b).y);
    this.ground.position.y = (Number.isFinite(minY) ? minY : -0.3) - 0.07;
    this.applyPose([0, 0, 0, 0, 0], rig);
    return rig;
  }

  restPose() {
    for (const f of FINGERS) for (const j of this.rig[f] || []) j.bone.quaternion.copy(j.rest);
  }

  applyPose(bends, rig = this.rig) {
    if (!rig) return;
    const q = new THREE.Quaternion();
    FINGERS.forEach((f, i) => {
      const joints = rig[f];
      if (!joints) return;
      const angles = this.anglesFor(i, bends[i], joints);
      joints.forEach((j, k) => {
        // if a thumb has only 2 moving bones, use the MCP and IP angles
        const a = angles[k + (3 - joints.length)];
        q.setFromAxisAngle(j.axis, THREE.MathUtils.degToRad(a));
        j.bone.quaternion.copy(j.rest).multiply(q);
      });
    });
  }

  /* ---------- per frame ---------- */
  setBends(bends) { for (let i = 0; i < 5; i++) if (bends[i] != null) this.target[i] = bends[i]; }

  update(dt) {
    for (let i = 0; i < 5; i++) this.current[i] = smoothDamp(this.current[i], this.target[i], this.vel[i], dt);
    this.applyPose(this.current);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  /** Degrees at each joint right now, e.g. [40, 55, 37] (MCP, PIP, DIP). */
  // (counted from the open pose, so an open thumb reads 0°, not the small THUMB_OPEN offset)
  anglesNow(i) {
    const a = this.anglesFor(i, this.current[i]);
    return FINGERS[i] === 'thumb' ? a.map((v, k) => v - THUMB_OPEN[k]) : a;
  }

  // Like jointAnglesFor, but uses the thumb-base swing worked out for the loaded model.
  anglesFor(i, bend, joints = this.rig && this.rig[FINGERS[i]]) {
    const angles = jointAnglesFor(FINGERS[i], bend);
    const cmc = FINGERS[i] === 'thumb' && joints && joints.length === 3 ? joints[0] : null;
    if (cmc && cmc.fistDeg != null) angles[0] = THUMB_OPEN[0] + (cmc.fistDeg - THUMB_OPEN[0]) * Math.min(1, Math.max(0, bend));
    return angles;
  }

  /* ---------- look ---------- */
  setSkin(index) {
    const t = SKIN_TONES[index] || SKIN_TONES[0];
    this.skin.color.setHex(t.color);
    this.skin.sheenColor.setHex(t.sheen);
  }

  /** Camera presets: 'default' (three-quarter), 'back' (back of the hand), 'palm', 'side'. */
  setView(name) {
    const thumbX = this.side === 'right' ? -1 : 1;     // which side the thumb is on
    const views = {
      default: [thumbX * 2.05, 1.05, 0.95],
      back:    [0, 2.6, 0.9],
      palm:    [thumbX * 0.4, -2.4, 1.0],
      side:    [thumbX * 2.7, 0.25, 0.15],
    };
    const p = views[name] || views.default;
    this.camera.position.set(p[0], p[1], p[2]);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
    this.view = name;
  }
}

// If an axis is almost exactly one of the bone's own X / Y / Z axes, use that exactly (cleaner bending on proper rigs).
function snapToAxis(v) {
  const comps = [Math.abs(v.x), Math.abs(v.y), Math.abs(v.z)];
  const k = comps.indexOf(Math.max(...comps));
  if (comps[k] > 0.92) {
    const sign = Math.sign(v.getComponent(k));
    v.set(0, 0, 0).setComponent(k, sign);
  }
}

// A soft round grey blob for under the hand
function blobTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(0.5, 'rgba(0,0,0,0.18)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
