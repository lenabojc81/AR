import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// The 10 car root node names from our hierarchy map
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

let currentIndex = 0;
let carRoots = {};

// Scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a2e);

// Camera
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 2, 6);
camera.lookAt(0, 0, 0);

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Lights
const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
directionalLight.position.set(10, 20, 10);
scene.add(directionalLight);

// Show only the car at currentIndex, hide the rest
function showCar(index) {
    CAR_NODES.forEach((name) => {
        if (carRoots[name]) carRoots[name].visible = false;
    });
    const name = CAR_NODES[index];
    if (carRoots[name]) carRoots[name].visible = true;
    document.getElementById('car-label').textContent =
        `Car ${index + 1} / ${CAR_NODES.length}`;
}

// Load GLB
const loader = new GLTFLoader();
loader.load(
    'assets/low_poly_cars.glb',
    (gltf) => {
        scene.add(gltf.scene);

        // Find each car root node by name and store it
        CAR_NODES.forEach((name) => {
            const node = gltf.scene.getObjectByName(name);
            if (node) {
                carRoots[name] = node;
            } else {
                console.warn('Could not find node:', name);
            }
        });

        // Start by showing only Car 1
        showCar(0);
    },
    null,
    (error) => console.error('Error loading model:', error)
);

// Button handlers
document.getElementById('prev').addEventListener('click', () => {
    currentIndex = (currentIndex - 1 + CAR_NODES.length) % CAR_NODES.length;
    showCar(currentIndex);
});

document.getElementById('next').addEventListener('click', () => {
    currentIndex = (currentIndex + 1) % CAR_NODES.length;
    showCar(currentIndex);
});

// Resize handler
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
}
animate();