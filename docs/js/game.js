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
const START_SPEED = 20; 
const ACCELERATION = 0.5;   // speed gained per second (20 -> 40 takes 40 s)
const MAX_SPEED = 150;
const HIT_COOLDOWN = 1.5;   // seconds of protection after the first hit

let hits = 0;
let invincibleUntil = 0;
let gameOver = false;
let lane = 0;   // -1 = left, 0 = center, 1 = right

let speed = START_SPEED;

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

// ---------- Scenery (trees and posts beside the road) ----------
const SCENERY_START = 20;       // items behind this z get recycled
const SCENERY_LENGTH = 180;     // how far ahead items are spread
const scenery = [];

const treeTopGeometry = new THREE.ConeGeometry(1, 2.6, 6);
const trunkGeometry = new THREE.CylinderGeometry(0.15, 0.2, 0.8, 5);
const treeTopMaterial = new THREE.MeshLambertMaterial({ color: 0x4a5d23, flatShading: true });
const trunkMaterial = new THREE.MeshLambertMaterial({ color: 0x5a3a22, flatShading: true });

const postGeometry = new THREE.BoxGeometry(0.12, 0.9, 0.12);
const reflectorGeometry = new THREE.BoxGeometry(0.14, 0.15, 0.14);
const postMaterial = new THREE.MeshLambertMaterial({ color: COLORS.dash });
const reflectorMaterial = new THREE.MeshBasicMaterial({ color: COLORS.edge });

function makeTree() {
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
    trunk.position.y = 0.4;
    const top = new THREE.Mesh(treeTopGeometry, treeTopMaterial);
    top.position.y = 2.1;
    tree.add(trunk, top);
    return tree;
}

function makePost() {
    const post = new THREE.Group();
    const pole = new THREE.Mesh(postGeometry, postMaterial);
    pole.position.y = 0.45;
    const reflector = new THREE.Mesh(reflectorGeometry, reflectorMaterial);
    reflector.position.y = 0.8;
    post.add(pole, reflector);
    return post;
}

// Trees: random side, distance from road, size and rotation
function placeTree(tree, z) {
    const side = Math.random() < 0.5 ? -1 : 1;
    tree.position.set(side * (ROAD_WIDTH / 2 + 2 + Math.random() * 12), 0, z);
    tree.scale.setScalar(0.7 + Math.random() * 0.8);
    tree.rotation.y = Math.random() * Math.PI;
}

// Posts: fixed spacing on both road edges
function placePost(post, z) {
    post.position.z = z;
}

for (let i = 0; i < 40; i++) {
    const tree = makeTree();
    placeTree(tree, SCENERY_START - Math.random() * SCENERY_LENGTH);
    tree.userData.place = placeTree;
    scene.add(tree);
    scenery.push(tree);
}

const POST_SPACING = 10;   // SCENERY_LENGTH must divide evenly by this
for (let z = SCENERY_START; z > SCENERY_START - SCENERY_LENGTH; z -= POST_SPACING) {
    for (const side of [-1, 1]) {
        const post = makePost();
        post.position.set(side * (ROAD_WIDTH / 2 + 0.4), 0, z);
        post.userData.place = placePost;
        scene.add(post);
        scenery.push(post);
    }
}

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

// ---------- Controls ----------
function changeLane(direction) {
    if (gameOver) return;
    lane = THREE.MathUtils.clamp(lane + direction, -1, 1);
}

// Keyboard: arrows or A / D
window.addEventListener('keydown', (e) => {
    if (e.repeat) return;   // holding a key moves only one lane
    const key = e.key.toLowerCase();
    if (key === 'arrowleft' || key === 'a') changeLane(-1);
    if (key === 'arrowright' || key === 'd') changeLane(1);
});

// Swipe (also works with mouse drag)
const SWIPE_MIN = 30;   // pixels before it counts as a swipe
let swipeStart = null;

container.addEventListener('pointerdown', (e) => {
    swipeStart = { x: e.clientX, y: e.clientY };
});

container.addEventListener('pointermove', (e) => {
    if (!swipeStart) return;
    const dx = e.clientX - swipeStart.x;
    const dy = e.clientY - swipeStart.y;

    // Trigger as soon as the finger has moved far enough sideways
    if (Math.abs(dx) > SWIPE_MIN && Math.abs(dx) > Math.abs(dy)) {
        changeLane(dx > 0 ? 1 : -1);
        swipeStart = null;   // one lane per swipe
    }
});

container.addEventListener('pointerup', () => (swipeStart = null));
container.addEventListener('pointercancel', () => (swipeStart = null));

// ---------- Loop ----------
const clock = new THREE.Clock();

function handleHit() {
    // Ignore hits during the cooldown, so one obstacle can't count twice
    if (gameOver || clock.elapsedTime < invincibleUntil) return;

    hits++;

    if (hits === 1) {
        // First hit: half speed, but never below the starting speed
        speed = Math.max(speed / 2, START_SPEED);
        invincibleUntil = clock.elapsedTime + HIT_COOLDOWN;
        console.log('Hit! Speed now', speed.toFixed(1));
    } else {
        // Second hit: game over
        gameOver = true;
        speed = 0;
        console.log('Game over');
    }
}

// TEMPORARY: press H to test until obstacles exist
window.addEventListener('keydown', (e) => {
    if (e.key === 'h') handleHit();
});

renderer.setAnimationLoop(() => {
    // Time since last frame (capped so switching tabs doesn't cause a jump)
    const dt = Math.min(clock.getDelta(), 0.05);
    // Slowly speed up
    if (!gameOver) {
        speed = Math.min(speed + ACCELERATION * dt, MAX_SPEED);
    }
    const move = speed * dt;

    // Lane dashes: slide toward the camera, snap back every dash spacing.
    // Because all dashes look the same, the snap is invisible.
    laneMarks.position.z = (laneMarks.position.z + move) % DASH_SPACING;

    // Scenery: move toward the camera, send to the far end once passed
    for (const item of scenery) {
        item.position.z += move;
        if (item.position.z > SCENERY_START) {
            item.userData.place(item, item.position.z - SCENERY_LENGTH);
        }
    }

    // Engine vibration (stops when the game is over)
    if (!gameOver) {
        player.position.y = Math.sin(clock.elapsedTime * 40) * 0.015;
    }

    // Blink the car while protected after a hit
    const protectedNow = clock.elapsedTime < invincibleUntil;
    player.visible = !protectedNow || Math.floor(clock.elapsedTime * 10) % 2 === 0;

    // Slide toward the target lane (quicker at higher speeds)
    const targetX = lane * LANE_WIDTH;
    const sharpness = 10 + speed * 0.1;
    player.position.x += (targetX - player.position.x) * (1 - Math.exp(-sharpness * dt));

    // Lean into the lane change: turn toward it and roll slightly outward
    const offset = targetX - player.position.x;
    player.rotation.y = -offset * 0.12;
    player.rotation.z = offset * 0.04;

    renderer.render(scene, camera);
});