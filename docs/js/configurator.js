import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

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

// Orbit controls — NEW
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;      // smooth inertia when you release the mouse
controls.dampingFactor = 0.05;
controls.minDistance = 2;           // can't zoom in too close
controls.maxDistance = 20;          // can't zoom out too far
controls.maxPolarAngle = Math.PI / 2; // can't rotate below the ground

// Lights
const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
directionalLight.position.set(10, 20, 10);
scene.add(directionalLight);

// Center camera on a given 3D object — NEW
function centerCameraOn(object) {
    const box = new THREE.Box3().setFromObject(object);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);

    camera.position.set(center.x, center.y + maxDim * 0.5, center.z + maxDim * 2);
    camera.lookAt(center);
    controls.target.copy(center);    // orbit around the car's center, not world origin
    controls.update();
}

// Show only the car at currentIndex, hide the rest
function showCar(index) {
    CAR_NODES.forEach((name) => {
        if (carRoots[name]) carRoots[name].visible = false;
    });
    const name = CAR_NODES[index];
    if (carRoots[name]) {
        carRoots[name].visible = true;
        centerCameraOn(carRoots[name]);  // NEW — reposition camera for this car
    }
    document.getElementById('car-label').textContent =
        `Car ${index + 1} / ${CAR_NODES.length}`;
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

        setTimeout(() => showCar(0), 1);
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

// Animation loop — controls.update() added for damping to work
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}
animate();