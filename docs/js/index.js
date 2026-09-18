import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const CAR_FILES = {
    'Cube':    'assets/cars/car_cube.glb',
    'Cube015': 'assets/cars/car_cube015.glb',
    'Cube029': 'assets/cars/car_cube029.glb',
    'Cube034': 'assets/cars/car_cube034.glb',
    'Cube053': 'assets/cars/car_cube053.glb',
    'Cube055': 'assets/cars/car_cube055.glb',
    'Cube070': 'assets/cars/car_cube070.glb',
    'Cube072': 'assets/cars/car_cube072.glb',
    'Cube074': 'assets/cars/car_cube074.glb',
    'Cube082': 'assets/cars/car_cube082.glb',
};

const CAR_NODES = [
    'Cube', 'Cube015', 'Cube029', 'Cube034', 'Cube053',
    'Cube055', 'Cube070', 'Cube072', 'Cube074', 'Cube082',
];

const CAR_NAMES = [
    'The Bumblebee', 'The Crimson Dart', 'Shadow Racer', 'The Brick',
    'Tangerine Dream', 'Desert Fox', 'Blue Thunder',
    'La Rossa', 'Night Cruiser', 'Officer Wheels',
];

let currentIndex = 0;
let carRoots = {};

// Scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a0f08);

// Renderer — attached to #canvas-wrapper
const canvasWrapper = document.getElementById('canvas-wrapper');

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(canvasWrapper.clientWidth, canvasWrapper.clientHeight);
canvasWrapper.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(
    75,
    canvasWrapper.clientWidth / canvasWrapper.clientHeight,
    0.1,
    1000
);
camera.position.set(0, 2, 6);
camera.lookAt(0, 0, 0);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 2;
controls.maxDistance = 20;
controls.maxPolarAngle = Math.PI / 2;

// Lights
scene.add(new THREE.AmbientLight(0xffffff, 0.7));
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(10, 20, 10);
scene.add(sun);

function centerCameraOn(object) {
    const box = new THREE.Box3().setFromObject(object);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);

    controls.enabled = false;
    camera.position.set(center.x, center.y + maxDim * 0.5, center.z + maxDim * 2);
    camera.lookAt(center);
    controls.target.copy(center);
    controls.enabled = true;
    controls.update();
}

function buildSelector() {
    const selector = document.getElementById('car-selector');
    CAR_NODES.forEach((name, index) => {
        const card = document.createElement('div');
        card.className = 'car-card' + (index === 0 ? ' selected' : '');
        card.dataset.index = index;

        const img = document.createElement('img');
        img.src = `assets/thumbnails/car_0${index}.png`;
        img.alt = CAR_NAMES[index];

        const label = document.createElement('span');
        label.textContent = CAR_NAMES[index];

        card.appendChild(img);
        card.appendChild(label);
        card.addEventListener('click', () => selectCar(index));
        selector.appendChild(card);
    });
}

function buildDots() {
    const dotsContainer = document.getElementById('scroll-dots');
    CAR_NODES.forEach((_, index) => {
        const dot = document.createElement('div');
        dot.className = 'scroll-dot' + (index === 0 ? ' active' : '');
        dot.addEventListener('click', () => selectCar(index));
        dotsContainer.appendChild(dot);
    });
}

document.getElementById('ar-btn').addEventListener('click', () => {
    const carName = CAR_NODES[currentIndex];
    window.location.href = `ar.html?car=${carName}`;
});

function updateDots(index) {
    document.querySelectorAll('.scroll-dot').forEach((dot, i) => {
        dot.classList.toggle('active', i === index);
    });
}

function updateSelectedCard(index) {
    document.querySelectorAll('.car-card').forEach((card, i) => {
        card.classList.toggle('selected', i === index);
    });
    const cards = document.querySelectorAll('.car-card');
    cards[index].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
}

function selectCar(index) {
    currentIndex = index;
    const name = CAR_NODES[index];
    localStorage.setItem('selectedCarIndex', index);
    localStorage.setItem('selectedCarFile', CAR_FILES[name]);
    updateSelectedCard(index);
    updateDots(index);

    // hide all cars including children
    CAR_NODES.forEach((n) => {
        if (carRoots[n]) carRoots[n].visible = (n === name);
    });

    // show selected car and all children
    if (carRoots[name]) {
        // carRoots[name].traverse(child => child.visible = true);
        centerCameraOn(carRoots[name]);

        let meshCount = 0;
        scene.traverse(n => { if (n.isMesh && n.visible) meshCount++; });
    }
}

// Load
const loader = new GLTFLoader();
const loadStartTime = Date.now();

loader.load(
    'assets/low_poly_cars.glb',
    (gltf) => {
        scene.add(gltf.scene);
        // gltf.scene.traverse(n => n.visible = false);

        CAR_NODES.forEach((name) => {
            const node = gltf.scene.getObjectByName(name);
            if (node) {
                carRoots[name] = node;
                node.visible = false;
            } else {
                console.warn('Could not find node:', name);
            }
        });

        const saved = localStorage.getItem('selectedCarIndex');
        const startIndex = saved !== null ? parseInt(saved) : 0;

        const elapsed = Date.now() - loadStartTime;
        const remaining = Math.max(0, 2000 - elapsed);

        setTimeout(() => {
            selectCar(startIndex);
            const loading = document.getElementById('loading-screen');

            if (loading) {
                loading.classList.add('hidden');
                setTimeout(() => loading.remove(), 500);
            }
        }, remaining);
    },
    null,
    (error) => console.error('Error:', error)
);

// Resize
window.addEventListener('resize', () => {
    const w = canvasWrapper.clientWidth;
    const h = canvasWrapper.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
});

// Animate
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

buildSelector();
buildDots();
animate();