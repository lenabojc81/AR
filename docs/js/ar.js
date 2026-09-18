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

// DEBUG: remove later
const debugBox = document.createElement('a-box');
debugBox.setAttribute('scale', '0.2 0.2 0.2');
debugBox.setAttribute('color', 'red');
wrapper.appendChild(debugBox);

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
    console.log("Marker found");
    status.textContent = 'Marker found!';
});
target.addEventListener('targetLost', () => {
    console.log("Marker lost");
    status.textContent = 'Marker lost!';
});

console.log('AR page loaded for car:', carNode);