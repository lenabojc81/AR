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