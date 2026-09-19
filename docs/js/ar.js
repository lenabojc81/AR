const THREE = AFRAME.THREE;

function modelPath(node) {
    return 'assets/cars/car_' + node.toLowerCase() + '.glb';
}

const CAR_WIDTH_ON_MARKER = 0.8;

const CAR_NODES = [
    'Cube', 'Cube015', 'Cube029', 'Cube034', 'Cube053',
    'Cube055', 'Cube070', 'Cube072', 'Cube074', 'Cube082',
];

const CAR_NAMES = [
    'The Bumblebee', 'The Crimson Dart', 'Shadow Racer', 'The Brick',
    'Tangerine Dream', 'Desert Fox', 'Blue Thunder',
    'La Rossa', 'Night Cruiser', 'Officer Wheels',
];

const target = document.querySelector('#target');
const status = document.querySelector('#status');
const label = document.getElementById('car-name-label');
const sceneEl = document.querySelector('a-scene');
const onboarding = document.getElementById('onboarding');
const screenshotBtn = document.getElementById('screenshot-btn');

// URL param -> localStorage -> default (Car 1)
function getCarIndex() {
    const fromUrl = new URLSearchParams(window.location.search).get('car');
    if (fromUrl) {
        const i = CAR_NODES.indexOf(fromUrl);
        if (i >= 0) return i;
        console.warn('Unknown car in URL:', fromUrl);
    }
    const saved = parseInt(localStorage.getItem('selectedCarIndex'), 10);
    if (saved >= 0 && saved < CAR_NODES.length) return saved;
    return 0;
}

const carIndex = getCarIndex();
const carNode = CAR_NODES[carIndex];
label.textContent = CAR_NAMES[carIndex];

// Wrapper lays the car flat on the marker (GLB is Y-up, marker is Z-up)
const wrapper = document.createElement('a-entity');
wrapper.setAttribute('rotation', '90 0 0');

const car = document.createElement('a-entity');
car.setAttribute('gltf-model', modelPath(carNode));

wrapper.appendChild(car);
target.appendChild(wrapper);

// Center and scale the car once loaded
car.addEventListener('model-loaded', () => {
    const model = car.getObject3D('mesh');

    const parent = model.parent;
    parent.remove(model);
    model.position.set(0, 0, 0);
    model.scale.set(1, 1, 1);
    model.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    const scale = CAR_WIDTH_ON_MARKER / Math.max(size.x, size.z);
    model.scale.setScalar(scale);
    model.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);

    parent.add(model);
    console.log('Car loaded:', carNode);
});

// Fall back to Car 1 if the file fails to load
car.addEventListener('model-error', () => {
    console.error('Could not load', modelPath(carNode));
    if (carNode !== CAR_NODES[0]) {
        car.setAttribute('gltf-model', modelPath(CAR_NODES[0]));
        label.textContent = CAR_NAMES[0];
    }
});

// ---------- Sound ----------
const FLYER_SOUND = 'assets/sounds/sound_send_video_vlado.mp3';
const FLYER_HOLD_DEFAULT = 3;   // seconds in front of the lens if the sound can't load

const AudioCtx = window.AudioContext || window.webkitAudioContext;
const audioCtx = AudioCtx ? new AudioCtx() : null;
let flyerSoundBuffer = null;
let soundUnlocked = false;

if (audioCtx) {
    fetch(FLYER_SOUND)
        .then((res) => {
            if (!res.ok) throw new Error(res.status);
            return res.arrayBuffer();
        })
        .then((data) => audioCtx.decodeAudioData(data))
        .then((buffer) => (flyerSoundBuffer = buffer))
        .catch((err) => console.warn('Flyer sound not loaded:', err));
}

// Must be called from a tap - browsers only allow sound after one
function unlockAudio() {
    soundUnlocked = true;
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}

function playFlyerSound() {
    if (!audioCtx || !flyerSoundBuffer) return null;
    const source = audioCtx.createBufferSource();
    source.buffer = flyerSoundBuffer;
    source.connect(audioCtx.destination);
    source.start();
    return source;
}

// Silence when switching apps or locking the phone
document.addEventListener('visibilitychange', () => {
    if (!audioCtx || !soundUnlocked) return;
    if (document.hidden) audioCtx.suspend();
    else audioCtx.resume();
});

// ---------- Flying coffee guy ----------
const FLYER_MODEL = 'assets/obstacles/obstacle_1.glb';
const FLYER_HEIGHT = 0.3;           // his height (marker width = 1)
const FLYER_SPEED = 0.35;           // cruising speed
const FLYER_DIVE_EVERY = [7, 12];   // seconds between crashes into the phone
const FLYER_DIVE_TIME = 0.9;
const FLYER_CLOSEUP = 0.5;   // share of his height visible on screen in the close-up (lower = bigger)

AFRAME.registerComponent('flying-guy', {
    init() {
        this.active = false;        // waits for a tap on his head button
        this.home = null;           // the page space he normally lives in
        this.state = 'cruise';
        this.timer = 0;
        this.time = 0;
        this.nextDive = 5;
        this.holdTime = FLYER_HOLD_DEFAULT;
        this.sound = null;
        this.pos = new THREE.Vector3(0.7, 0.3, 0);
        this.vel = new THREE.Vector3();
        this.goal = new THREE.Vector3();
        this.from = new THREE.Vector3();
        this.to = new THREE.Vector3();
        this.closeup = new THREE.Vector3();
        this.fromQ = new THREE.Quaternion();
        this.toQ = new THREE.Quaternion();   // identity = facing straight into the lens
        this.v = new THREE.Vector3();
        this.w = new THREE.Vector3();
        this.s = new THREE.Vector3();
        this.marker = document.querySelector('#target').object3D;
        this.pickGoal();
    },

    // Called when the head button is tapped
    activate() {
        this.active = true;
        this.state = 'cruise';
        this.timer = 0;
        this.nextDive = this.time + 4;   // first crash a few seconds after he appears
    },

    rand(a, b) { return a + Math.random() * (b - a); },

    // Random point around the car: near or far, low or high
    pickGoal() {
        const a = Math.random() * Math.PI * 2;
        const r = this.rand(0.5, 1.0);
        this.goal.set(Math.cos(a) * r, this.rand(0.15, 0.7), Math.sin(a) * r);
    },

    // Page units -> world size (MindAR scales the page)
    worldScale() {
        return this.home.getWorldScale(this.s).x;
    },

    faceCamera() {
        const cam = this.el.sceneEl.camera;
        cam.getWorldPosition(this.w);
        this.w.y -= FLYER_HEIGHT * this.worldScale() * 0.8;
        this.el.object3D.lookAt(this.w);
    },

    // Move him between page space and camera space without any visible jump
    toCamera() { this.el.sceneEl.camera.attach(this.el.object3D); },
    toPage()   { this.home.attach(this.el.object3D); },

    // Close-up spot in camera space: right in front of the lens, face in the middle
    computeCloseup() {
        const cam = this.el.sceneEl.camera;
        const H = FLYER_HEIGHT * this.el.object3D.scale.y;          // his height in camera units
        const tanHalf = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
        // how much of him the screen shows vertically; on narrow screens keep his whole head in view
        const visible = Math.max(FLYER_CLOSEUP * H, (0.32 * H) / cam.aspect);
        let d = visible / (2 * tanHalf);
        d = Math.max(d, cam.near + 0.4 * H);                          // never cut off by the camera
        this.closeup.set(0, -0.78 * H, -d);
        return H;
    },

    tick(t, dtMs) {
        const obj = this.el.object3D;
        if (!obj.parent) return;
        if (!this.home) this.home = obj.parent;

        // Hidden until the head button is tapped
        obj.visible = this.active;
        if (!this.active) return;

        const dt = Math.min(dtMs / 1000, 0.05);
        this.time += dt;
        this.timer += dt;

        const inYourFace = this.state === 'dive' || this.state === 'splat';

        // Page not visible: calm down - unless he's already in your face (then he stays)
        if (!this.marker.visible && !inYourFace) {
            if (obj.parent !== this.home) this.toPage();
            if (this.state !== 'cruise') {
                this.state = 'cruise';
                this.pos.set(0.7, 0.3, 0);
                this.vel.set(0, 0, 0);
            }
            this.nextDive = Math.max(this.nextDive, this.time + 3);
            return;
        }

        if (this.state === 'cruise') {
            this.v.copy(this.goal).sub(this.pos);
            if (this.v.length() < 0.15) this.pickGoal();
            this.v.setLength(FLYER_SPEED);
            this.vel.lerp(this.v, 1 - Math.exp(-1.5 * dt));
            this.pos.addScaledVector(this.vel, dt);
            if (this.time > this.nextDive) { this.state = 'windup'; this.timer = 0; }

        } else if (this.state === 'windup') {        // brake and turn to the phone
            this.vel.multiplyScalar(Math.exp(-6 * dt));
            this.pos.addScaledVector(this.vel, dt);
            if (this.timer > 0.5) {
                this.state = 'dive';
                this.timer = 0;
                this.toCamera();                     // from now on he moves in camera space
                this.from.copy(obj.position);
                this.fromQ.copy(obj.quaternion);
                this.computeCloseup();
            }

        } else if (this.state === 'dive') {          // accelerate straight into the lens
            const p = Math.min(this.timer / FLYER_DIVE_TIME, 1);
            obj.position.lerpVectors(this.from, this.closeup, p * p * p);
            obj.quaternion.slerpQuaternions(this.fromQ, this.toQ, Math.min(1, p * 2));
            if (p >= 1) {
                this.state = 'splat';
                this.timer = 0;
                // Stay in your face for as long as the sound lasts
                this.holdTime = flyerSoundBuffer ? flyerSoundBuffer.duration : FLYER_HOLD_DEFAULT;
                this.sound = playFlyerSound();
            }
            return;

        } else if (this.state === 'splat') {         // glaring into the lens while the sound plays
            const H = this.computeCloseup();         // recalculated in case the screen rotates
            obj.position.copy(this.closeup);
            obj.quaternion.copy(this.toQ);
            if (this.timer < 0.3) {
                // short impact shake
                obj.position.x += this.rand(-0.02, 0.02) * H;
                obj.position.y += this.rand(-0.02, 0.02) * H;
            } else {
                // aggressive glare: slowly lean in and out, slight head tilt
                obj.position.z += Math.sin(this.time * 4) * 0.03 * H;
                obj.rotateZ(Math.sin(this.time * 1.7) * 0.05);
            }
            if (this.timer > this.holdTime) {
                this.sound = null;
                this.toPage();                       // back to page space, same spot on screen
                this.pos.copy(obj.position);
                this.from.copy(this.pos);
                const a = Math.random() * Math.PI * 2;
                this.to.set(Math.cos(a) * 0.8, 0.45, Math.sin(a) * 0.8);   // retreat toward the car
                this.state = 'exit';
                this.timer = 0;
            }
            return;

        } else if (this.state === 'exit') {          // back off, then fly normally again
            const p = Math.min(this.timer / 0.9, 1);
            this.pos.lerpVectors(this.from, this.to, 1 - (1 - p) * (1 - p));
            if (p >= 1) {
                this.state = 'cruise';
                this.timer = 0;
                this.vel.subVectors(this.to, this.from).setLength(FLYER_SPEED);
                this.pickGoal();
                this.nextDive = this.time + this.rand(FLYER_DIVE_EVERY[0], FLYER_DIVE_EVERY[1]);
            }
        }

        // Page space: position, bobbing and facing
        obj.position.copy(this.pos);
        if (this.state === 'cruise') obj.position.y += Math.sin(this.time * 3) * 0.02;

        if (this.state === 'windup' || (this.state === 'exit' && this.timer < 0.4)) {
            this.faceCamera();                       // keeps staring at you while backing off
        } else {
            const dir = this.state === 'exit' ? this.v.subVectors(this.to, this.from) : this.vel;
            this.w.copy(obj.position).add(dir);
            obj.lookAt(obj.parent.localToWorld(this.w));   // face where he's flying
        }
    },
});

const flyer = document.createElement('a-entity');
flyer.setAttribute('gltf-model', FLYER_MODEL);
flyer.setAttribute('flying-guy', '');
wrapper.appendChild(flyer);   // page space, so he flies around the car on the paper

// ---------- Head button ----------
const flyerBtn = document.getElementById('flyer-btn');

// Render just his head as a round button icon
function renderHeadIcon(model) {
    const size = 192;   // 64 px shown x3 for sharp phone screens
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setSize(size, size);
    r.outputEncoding = THREE.sRGBEncoding;

    const s = new THREE.Scene();
    s.add(new THREE.HemisphereLight(0xfff4e0, 0x55463a, 1.1));
    const light = new THREE.DirectionalLight(0xffffff, 1.2);
    light.position.set(1, 2, 3);
    s.add(light);

    const copy = model.clone();
    s.add(copy);
    copy.updateMatrixWorld(true);

    // Frame from the chin (64% up) to the top of the hair
    const box = new THREE.Box3().setFromObject(copy);
    const h = box.max.y - box.min.y;
    const bottom = box.min.y + h * 0.64;
    const top = box.max.y + h * 0.03;
    const frameH = top - bottom;
    const cx = (box.min.x + box.max.x) / 2;
    const cy = (top + bottom) / 2;

    const cam = new THREE.PerspectiveCamera(30, 1, 0.001, 100);
    const dist = (frameH / 2) / Math.tan(THREE.MathUtils.degToRad(15)) * 1.15;
    cam.position.set(cx, cy, box.max.z + dist);
    cam.lookAt(cx, cy, 0);

    r.render(s, cam);
    const url = r.domElement.toDataURL('image/png');
    r.dispose();
    r.forceContextLoss();
    return url;
}

// Tap his head: unlock sound + let him fly
flyerBtn.addEventListener('click', () => {
    unlockAudio();
    flyer.components['flying-guy'].activate();
    flyerBtn.hidden = true;
});

// Scale him to FLYER_HEIGHT with his feet at his origin, then make the button
flyer.addEventListener('model-loaded', () => {
    const model = flyer.getObject3D('mesh');
    const parent = model.parent;
    parent.remove(model);
    model.position.set(0, 0, 0);
    model.scale.set(1, 1, 1);
    model.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    const scale = FLYER_HEIGHT / size.y;
    model.scale.setScalar(scale);
    model.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);

    parent.add(model);

    // Button with his face appears once the model is ready
    flyerBtn.querySelector('img').src = renderHeadIcon(model);
    flyerBtn.hidden = false;
});

flyer.addEventListener('model-error', () => {
    console.warn('Flying guy not loaded:', FLYER_MODEL);
});

target.addEventListener('targetFound', () => {
    console.log('Marker found');
    status.textContent = 'Marker found!';

    // First detection: hide onboarding, show screenshot button
    if (onboarding) {
        onboarding.classList.add('hidden');
        onboarding.addEventListener('transitionend', () => onboarding.remove(), { once: true });
    }
    screenshotBtn.hidden = false;
});
target.addEventListener('targetLost', () => {
    console.log("Marker lost");
    status.textContent = 'Marker lost!';
});

// ---------- Screenshot ----------
// MindAR shows the camera in a <video> behind the 3D canvas,
// so we draw both onto one canvas to get the full picture.
function takeScreenshot() {
    const video = document.querySelector('video');
    const glCanvas = sceneEl.canvas;

    const dpr = window.devicePixelRatio || 1;
    const out = document.createElement('canvas');
    out.width = window.innerWidth * dpr;
    out.height = window.innerHeight * dpr;
    const ctx = out.getContext('2d');
    ctx.scale(dpr, dpr);

    // 1. Camera image
    if (video) {
        const r = video.getBoundingClientRect();
        ctx.drawImage(video, r.left, r.top, r.width, r.height);
    }

    // 2. The car (render a fresh frame so the canvas isn't blank)
    sceneEl.renderer.render(sceneEl.object3D, sceneEl.camera);
    const c = glCanvas.getBoundingClientRect();
    ctx.drawImage(glCanvas, c.left, c.top, c.width, c.height);

    // 3. Download
    out.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = CAR_NAMES[carIndex].replace(/\s+/g, '-').toLowerCase() + '-ar.png';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);

        screenshotBtn.textContent = 'Saved ✓';
        setTimeout(() => (screenshotBtn.textContent = '📷 Save photo'), 1500);
    }, 'image/png');
}

screenshotBtn.addEventListener('click', takeScreenshot);

console.log('AR page loaded for car:', carNode);