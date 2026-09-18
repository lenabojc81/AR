import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ---------- Cars (same as the rest of the site) ----------
const CAR_NODES = [
    'Cube', 'Cube015', 'Cube029', 'Cube034', 'Cube053',
    'Cube055', 'Cube070', 'Cube072', 'Cube074', 'Cube082',
];

const CAR_NAMES = [
    'The Bumblebee', 'The Crimson Dart', 'Shadow Racer', 'The Brick',
    'Tangerine Dream', 'Desert Fox', 'Blue Thunder',
    'La Rossa', 'Night Cruiser', 'Officer Wheels',
];

function carPath(node) {
    return 'assets/cars/car_' + node.toLowerCase() + '.glb';
}

// ---------- Settings ----------
const LANE_WIDTH = 2.2;                    // distance between lane centers
const ROAD_WIDTH = LANE_WIDTH * 3 + 1;     // 3 lanes + shoulders
const ROAD_LENGTH = 300;                   // road runs from z=+20 to z=-280
const CAR_LENGTH = 2;                      // car is scaled to this length
const CAR_EXTRA_ROTATION = Math.PI;              // set to Math.PI if the car drives backwards

const COLORS = {
    sky:    0x1a0f08,   // --bg-dark
    ground: 0x24170d,
    road:   0x2a2522,
    dash:   0xfef3c7,   // --cream
    edge:   0xf59e0b,   // --amber
};

// ---------- Which car ----------
function getCarIndex() {
    const i = parseInt(localStorage.getItem('selectedCarIndex'), 10);
    return i >= 0 && i < CAR_NODES.length ? i : 0;
}

const carIndex = getCarIndex();
document.getElementById('car-name').textContent = CAR_NAMES[carIndex];

// ---------- Renderer, scene, camera ----------
const container = document.getElementById('game');

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // cap for phone performance
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(COLORS.sky);
scene.fog = new THREE.Fog(COLORS.sky, 40, 140);   // hides the end of the road

const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 400);

// Camera sits behind and above the car. On narrow (portrait) screens it moves
// further back so all 3 lanes stay visible.
function fitCamera() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const aspect = w / h;

    camera.aspect = aspect;
    camera.fov = aspect < 1 ? 70 : 55;
    camera.updateProjectionMatrix();

    const halfWidthToShow = LANE_WIDTH * 1.5;
    const tanHalfHorizontal = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * aspect;
    const distance = Math.max(7, halfWidthToShow / tanHalfHorizontal);

    const direction = new THREE.Vector3(0, 0.5, 1).normalize();
    camera.position.copy(direction.multiplyScalar(distance));
    camera.lookAt(0, 0, -6);

    renderer.setSize(w, h);
}

fitCamera();
window.addEventListener('resize', fitCamera);

// ---------- Lights ----------
scene.add(new THREE.HemisphereLight(0xfff4e0, 0x2d2016, 1.2));
const sun = new THREE.DirectionalLight(0xffffff, 1.8);
sun.position.set(5, 10, 6);
scene.add(sun);

// ---------- World ----------
function flatPlane(width, length, material) {
    const geometry = new THREE.PlaneGeometry(width, length);
    geometry.rotateX(-Math.PI / 2);   // lie flat
    return new THREE.Mesh(geometry, material);
}

// Ground
const ground = flatPlane(400, 400, new THREE.MeshLambertMaterial({ color: COLORS.ground }));
ground.position.set(0, -0.01, -150);
scene.add(ground);

// Road
const road = flatPlane(ROAD_WIDTH, ROAD_LENGTH, new THREE.MeshLambertMaterial({ color: COLORS.road }));
road.position.z = 20 - ROAD_LENGTH / 2;
scene.add(road);

// Solid edge lines
const edgeMaterial = new THREE.MeshBasicMaterial({ color: COLORS.edge });
for (const side of [-1, 1]) {
    const edge = flatPlane(0.15, ROAD_LENGTH, edgeMaterial);
    edge.position.set(side * (ROAD_WIDTH / 2 - 0.3), 0.01, road.position.z);
    scene.add(edge);
}

// Dashed lane lines (in their own group, so Step 25 can move them)
const DASH_LENGTH = 2.5;
const DASH_SPACING = 6;   // dash + gap

const laneMarks = new THREE.Group();
const dashGeometry = new THREE.PlaneGeometry(0.15, DASH_LENGTH);
dashGeometry.rotateX(-Math.PI / 2);
const dashMaterial = new THREE.MeshBasicMaterial({ color: COLORS.dash });

for (const x of [-LANE_WIDTH / 2, LANE_WIDTH / 2]) {
    for (let z = 20; z > 20 - ROAD_LENGTH; z -= DASH_SPACING) {
        const dash = new THREE.Mesh(dashGeometry, dashMaterial);
        dash.position.set(x, 0.02, z);
        laneMarks.add(dash);
    }
}
scene.add(laneMarks);

// ---------- Player car ----------
// `player` is what later steps will move between lanes.
const player = new THREE.Group();
scene.add(player);

const loadingScreen = document.getElementById('loading-screen');
const loadingText = document.getElementById('loading-text');

function hideLoading() {
    loadingScreen.classList.add('hidden');
    setTimeout(() => loadingScreen.remove(), 500);
}

new GLTFLoader().load(
    carPath(CAR_NODES[carIndex]),
    (gltf) => {
        const model = gltf.scene;

        // Turn the car so its long side runs along the road (Z axis)
        let box = new THREE.Box3().setFromObject(model);
        let size = box.getSize(new THREE.Vector3());
        if (size.x > size.z) model.rotation.y = Math.PI / 2;
        model.rotation.y += CAR_EXTRA_ROTATION;
        model.updateMatrixWorld(true);

        // Measure again, then center it with the wheels on the road
        box = new THREE.Box3().setFromObject(model);
        size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        model.position.set(-center.x, -box.min.y, -center.z);

        // Scale to a fixed length so every car fits the lanes
        const pivot = new THREE.Group();
        pivot.add(model);
        pivot.scale.setScalar(CAR_LENGTH / size.z);
        player.add(pivot);

        console.log('Game car loaded:', CAR_NODES[carIndex]);
        hideLoading();
    },
    undefined,
    (error) => {
        console.error('Could not load car:', error);
        loadingText.textContent = "Couldn't load your car. Reload the page to try again.";
    }
);

// ---------- Loop ----------
renderer.setAnimationLoop(() => {
    renderer.render(scene, camera);
});