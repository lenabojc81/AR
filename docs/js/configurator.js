import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const CAR_NODES = [
    'Cube',
    'Cube015',
    'Cube029',
    'Cube034',
    'Cube053',
    'Cube055',
    'Cube070',
    'Cube072',
    'Cube074',
    'Cube082',
];

// Display names for each car
const CAR_NAMES = [
    'The Bumblebee',
    'The Crimson Dart',
    'Shadow Racer',
    'The Brick',
    'Tangerine Dream',
    'Desert Fox',
    'Blue Thunder',
    'La Rossa',
    'Night Cruiser',
    'Officer Wheels',
];

let currentIndex = 0;
let carRoots = {};

// Scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a2e);

// Camera
const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
);
camera.position.set(0, 2, 6);
camera.lookAt(0, 0, 0);

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Orbit controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 2;
controls.maxDistance = 20;
controls.maxPolarAngle = Math.PI / 2;

// Lights
const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
directionalLight.position.set(10, 20, 10);
scene.add(directionalLight);

function centerCameraOn(object) {
    const box = new THREE.Box3().setFromObject(object);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    camera.position.set(center.x, center.y + maxDim * 0.5, center.z + maxDim * 2);
    camera.lookAt(center);
    controls.target.copy(center);
    controls.update();
}

// Build the card row
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

// Update which card looks selected
function updateSelectedCard(index) {
    document.querySelectorAll('.car-card').forEach((card, i) => {
        card.classList.toggle('selected', i === index);
    });

    // scroll the selected card into view smoothly
    const cards = document.querySelectorAll('.car-card');
    cards[index].scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center'
    });
}

function selectCar(index) {
    currentIndex = index;
    localStorage.setItem('selectedCarIndex', index);
    updateSelectedCard(index);

    CAR_NODES.forEach((name) => {
        if (carRoots[name]) carRoots[name].visible = false;
    });

    const name = CAR_NODES[index];
    if (carRoots[name]) {
        carRoots[name].visible = true;
        centerCameraOn(carRoots[name]);
    }
}

// Load GLB
const loader = new GLTFLoader();
loader.load(
    'assets/low_poly_cars.glb',
    (gltf) => {
        scene.add(gltf.scene);

        CAR_NODES.forEach((name) => {
            const node = gltf.scene.getObjectByName(name);
            if (node) {
                carRoots[name] = node;
            } else {
                console.warn('Could not find node:', name);
            }
        });

        setTimeout(() => { 
            const saved = localStorage.getItem('selectedCarIndex');
            const startIndex = saved !== null ? parseInt(saved) : 0;
            selectCar(startIndex);
        }, 10);
    },
    null,
    (error) => console.error('Error loading model:', error)
);

// Resize handler
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

buildSelector();
animate();