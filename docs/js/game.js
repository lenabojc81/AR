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
let START_SPEED = 20; 
let ACCELERATION = 0.5;   // speed gained per second (20 -> 40 takes 40 s)
const MAX_SPEED = 500;
const HIT_COOLDOWN = 1.5;   // seconds of protection after the first hit

let hits = 0;
let invincibleUntil = 0;
let gameOver = false;
let started = false;
let lane = 0;   // -1 = left, 0 = center, 1 = right

// Obstacles
const OBSTACLE_SIZE = { w: 1.4, h: 1.2, d: 1.4 };
const OBSTACLE_TYPES = [
    { model: 'assets/obstacles/obstacle_1.glb', sound: 'assets/obstacles/obstacle_1.mp3', }
];
const SPAWN_Z = -150;              // spawned beyond the fog, so they never pop in
const DESPAWN_Z = 12;              // recycled once behind the camera
let MIN_ROW_GAP = 28;            // road distance between obstacle rows at start speed
const ROW_GAP_PER_SPEED = 0.25;    // rows spread out a bit as speed increases
let TWO_LANE_CHANCE = 0.35;      // chance a row blocks 2 lanes instead of 1
let HITBOX_FORGIVENESS = 0.8;

let speed = START_SPEED;
const DIFFICULTIES = {
    easy:   { startSpeed: 20, acceleration: 0.5, minRowGap: 28, twoLaneChance: 0.35, hitbox: 0.8  },
    normal: { startSpeed: 26, acceleration: 0.8, minRowGap: 24, twoLaneChance: 0.45, hitbox: 0.85 },
    hard:   { startSpeed: 32, acceleration: 1.2, minRowGap: 20, twoLaneChance: 0.55, hitbox: 0.95 },
};

const DIFFICULTY_KEY = 'laneDodgerDifficulty';

function loadDifficulty() {
    try {
        const saved = localStorage.getItem(DIFFICULTY_KEY);
        return saved in DIFFICULTIES ? saved : 'easy';
    } catch {
        return 'easy';
    }
}

let difficulty = loadDifficulty();

// Each difficulty has its own high score. Easy keeps the old key,
// so the existing best score isn't lost.
function bestKey() {
    return difficulty === 'easy' ? 'laneDodgerBest' : 'laneDodgerBest_' + difficulty;
}
let distance = 0;

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

// ---------- Sound ----------
const AudioCtx = window.AudioContext || window.webkitAudioContext;
const audioCtx = AudioCtx ? new AudioCtx() : null;

function loadSound(url) {
    if (!audioCtx) return Promise.resolve(null);
    return fetch(url)
        .then((res) => {
            if (!res.ok) throw new Error(res.status);
            return res.arrayBuffer();
        })
        .then((data) => audioCtx.decodeAudioData(data))
        .catch((err) => {
            console.warn('Sound not loaded:', url, err);
            return null;
        });
}

function playSound(buffer) {
    if (!audioCtx || !buffer) return;
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(audioCtx.destination);
    source.start();
}

// Browsers only allow sound after the player taps or presses a key
function unlockAudio() {
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}

// ---------- Obstacles ----------
const obstacles = [];      // boxes currently on the road

let distanceSinceRow = -60;      // negative = short grace period at the start
let nextRowGap = MIN_ROW_GAP;

// Loading manager: hides the loading screen once the car AND obstacles are loaded
const loadingManager = new THREE.LoadingManager();
loadingManager.onLoad = () => {
    if (carLoaded) hideLoading();   // keep the error message if the car failed
};
const gltfLoader = new GLTFLoader(loadingManager);

// Fallback box, used if the custom models are missing
const fallbackGeometry = new THREE.BoxGeometry(OBSTACLE_SIZE.w, OBSTACLE_SIZE.h, OBSTACLE_SIZE.d);
fallbackGeometry.translate(0, OBSTACLE_SIZE.h / 2, 0);   // bottom at y = 0, like the models
const fallbackMaterial = new THREE.MeshLambertMaterial({ color: 0xef4444, flatShading: true });
let obstacleTemplates = [new THREE.Mesh(fallbackGeometry, fallbackMaterial)];

const obstacleSounds = new Map();   // template -> its hit sound

// Center a model, stand it on the road and scale it to fit a lane
function normalizeObstacle(model) {
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    model.position.set(-center.x, -box.min.y, -center.z);

    const holder = new THREE.Group();
    holder.add(model);
    holder.scale.setScalar(Math.min(
        OBSTACLE_SIZE.w / size.x,
        OBSTACLE_SIZE.d / size.z,
        (OBSTACLE_SIZE.h * 1.8) / size.y   // stop tall models from towering
    ));
    return holder;
}

// Load every model + its sound
Promise.all(
    OBSTACLE_TYPES.map((type) =>
        Promise.all([
            gltfLoader.loadAsync(type.model).then((gltf) => normalizeObstacle(gltf.scene)),
            loadSound(type.sound),
        ])
            .then(([template, sound]) => {
                obstacleSounds.set(template, sound);
                return template;
            })
            .catch((err) => {
                console.warn('Could not load obstacle:', type.model, err);
                return null;
            })
    )
).then((templates) => {
    const loaded = templates.filter(Boolean);
    if (loaded.length) obstacleTemplates = loaded;
    console.log('Obstacle types loaded:', loaded.length);
});

// One pool of hidden, reusable copies per obstacle type
const obstaclePools = new Map();

function getObstacle() {
    const template = obstacleTemplates[Math.floor(Math.random() * obstacleTemplates.length)];
    if (!obstaclePools.has(template)) obstaclePools.set(template, []);

    const obj = obstaclePools.get(template).pop() || template.clone();   // clones share geometry
    obj.userData.template = template;
    if (!obj.parent) scene.add(obj);
    obj.visible = true;
    obj.userData.hit = false;
    return obj;
}

function releaseObstacle(obj) {
    obj.visible = false;
    obstaclePools.get(obj.userData.template).push(obj);
}

// A row blocks 1 or 2 random lanes, never all 3
function spawnRow(z) {
    const lanes = [-1, 0, 1];
    for (let i = lanes.length - 1; i > 0; i--) {   // shuffle
        const j = Math.floor(Math.random() * (i + 1));
        [lanes[i], lanes[j]] = [lanes[j], lanes[i]];
    }

    const count = Math.random() < TWO_LANE_CHANCE ? 2 : 1;
    for (let i = 0; i < count; i++) {
        const box = getObstacle();
        box.position.set(lanes[i] * LANE_WIDTH, 0, z);
        obstacles.push(box);
    }
}

function updateObstacles(move) {
    // Move active boxes, recycle the ones that passed the camera
    for (let i = obstacles.length - 1; i >= 0; i--) {
        const box = obstacles[i];
        box.position.z += move;
        if (box.position.z > DESPAWN_Z) {
            releaseObstacle(box);
            obstacles.splice(i, 1);
        }
    }

    // Spawn a new row every `nextRowGap` units of road
    distanceSinceRow += move;
    if (distanceSinceRow >= nextRowGap) {
        distanceSinceRow -= nextRowGap;
        spawnRow(SPAWN_Z + distanceSinceRow);   // keeps spacing exact at any frame rate
        nextRowGap = MIN_ROW_GAP
            + (speed - START_SPEED) * ROW_GAP_PER_SPEED
            + Math.random() * 10;
    }
}

// Car and obstacles are compared as flat rectangles on the road
// function checkCollisions() {
//     const reachX = carHalfWidth * HITBOX_FORGIVENESS + OBSTACLE_SIZE.w / 2;
//     const reachZ = carHalfLength * HITBOX_FORGIVENESS + OBSTACLE_SIZE.d / 2;

//     for (const box of obstacles) {
//         if (box.userData.hit) continue;   // each box can only hit once

//         const overlapX = Math.abs(box.position.x - player.position.x) < reachX;
//         const overlapZ = Math.abs(box.position.z - player.position.z) < reachZ;

//         if (overlapX && overlapZ) {
//             box.userData.hit = true;
//             handleHit();
//         }
//     }
// }
function checkCollisions(move) {
    const reachX = carHalfWidth * HITBOX_FORGIVENESS + OBSTACLE_SIZE.w / 2;
    const reachZ = carHalfLength * HITBOX_FORGIVENESS + OBSTACLE_SIZE.d / 2;
    const carZ = player.position.z;

    for (const box of obstacles) {
        if (box.userData.hit) continue;   // each box can only hit once

        const nowZ = box.position.z;
        const beforeZ = nowZ - move;

        const overlapX = Math.abs(box.position.x - player.position.x) < reachX;
        const overlapZ = nowZ > carZ - reachZ && beforeZ < carZ + reachZ;

        if (overlapX && overlapZ) {
            box.userData.hit = true;
            handleHit(box);
        }
    }
}

// ---------- Player car ----------
// `player` is what later steps will move between lanes.
const player = new THREE.Group();
scene.add(player);

let carLoaded = false;
let carHalfWidth = 0;
const carHalfLength = CAR_LENGTH / 2;

const loadingScreen = document.getElementById('loading-screen');
const loadingText = document.getElementById('loading-text');

function hideLoading() {
    loadingScreen.classList.add('hidden');
    setTimeout(() => loadingScreen.remove(), 500);
}

gltfLoader.load(
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
        const scale = CAR_LENGTH / size.z;
        pivot.scale.setScalar(scale);
        carHalfWidth = (size.x * scale) / 2;
        carLoaded = true;
        player.add(pivot);

        console.log('Game car loaded:', CAR_NODES[carIndex]);
        // hideLoading();
    },
    undefined,
    (error) => {
        console.error('Could not load car:', error);
        loadingText.textContent = "Couldn't load your car. Reload the page to try again.";
    }
);

// ---------- Controls ----------
function changeLane(direction) {
    if (!started || gameOver) return;
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

// ---------- Score ----------
const scoreEl = document.getElementById('score');
const bestEl = document.getElementById('best');

function loadBest() {
    try {
        return parseInt(localStorage.getItem(bestKey()), 10) || 0;
    } catch {
        return 0;
    }
}

function formatMeters(m) {
    return m.toLocaleString() + ' m';
}

let best = loadBest();
let shownScore = -1;
bestEl.textContent = 'Best ' + formatMeters(best);

function updateScore() {
    const score = Math.floor(distance);
    if (score === shownScore) return;   // only touch the page when the number changes
    shownScore = score;
    scoreEl.textContent = formatMeters(score);

    if (score > best && !bestEl.classList.contains('new-best')) {
        bestEl.textContent = 'New best!';
        bestEl.classList.add('new-best');
    }
}

function saveBest() {
    const score = Math.floor(distance);
    if (score > best) {
        best = score;
        try {
            localStorage.setItem(bestKey(), best);
        } catch {
            // storage blocked (private mode) - the game still works
        }
    }
}

// ---------- Screens ----------
const startScreen = document.getElementById('start-screen');
const gameOverScreen = document.getElementById('gameover-screen');
const restartBtn = document.getElementById('restart-btn');
const finalScoreEl = document.getElementById('final-score');
const finalBestEl = document.getElementById('final-best');

function setState(state) {
    document.body.dataset.state = state;    // "ready", "playing", or "over"
}

function startGame() {
    if (!carLoaded || started) return;
    startScreen.hidden = true;
    started = true;
    unlockAudio();
    setState('playing');
}

function endGame() {
    gameOver = true;
    speed = 0;

    const score = Math.floor(distance);
    const isNewBest = score > best;   // check before saveBest() updates `best`
    saveBest();

    // Short pause so the player sees the crash before the screen appears
    setTimeout(() => {
        finalScoreEl.textContent = formatMeters(score);
        finalBestEl.textContent = isNewBest ? 'New best!' : 'Best ' + formatMeters(best);
        finalBestEl.classList.toggle('new-best', isNewBest);
        gameOverScreen.hidden = false;
        setState('over');
        restartBtn.focus();
    }, 700);
}

// Put everything back to the starting state without reloading the page
function resetGame() {
    for (const box of obstacles) releaseObstacle(box);
    obstacles.length = 0;
    distanceSinceRow = -60;
    nextRowGap = MIN_ROW_GAP;

    hits = 0;
    invincibleUntil = 0;
    gameOver = false;
    speed = START_SPEED;
    distance = 0;

    lane = 0;
    player.position.x = 0;
    player.rotation.set(0, 0, 0);
    player.visible = true;

    shownScore = -1;
    bestEl.textContent = 'Best ' + formatMeters(best);
    bestEl.classList.remove('new-best');

    gameOverScreen.hidden = true;
    started = true;
    unlockAudio();
    setState('playing');
}

startScreen.addEventListener('click', startGame);
restartBtn.addEventListener('click', resetGame);

// Space / Enter also start and restart
window.addEventListener('keydown', (e) => {
    if (e.target.closest && e.target.closest('#difficulty')) return;
    if (e.key !== ' ' && e.key !== 'Enter') return;
    if (!started) {
        e.preventDefault();
        startGame();
    } else if (gameOver && !gameOverScreen.hidden) {
        e.preventDefault();
        resetGame();
    }
});

// ---------- Difficulty ----------
const difficultyEl = document.getElementById('difficulty');
const startBestEl = document.getElementById('start-best');

function applyDifficulty(level) {
    difficulty = level;
    const d = DIFFICULTIES[level];

    START_SPEED = d.startSpeed;
    ACCELERATION = d.acceleration;
    MIN_ROW_GAP = d.minRowGap;
    TWO_LANE_CHANCE = d.twoLaneChance;
    HITBOX_FORGIVENESS = d.hitbox;

    // Before the first run, apply right away (resetGame handles later runs)
    if (!started) {
        speed = START_SPEED;
        nextRowGap = MIN_ROW_GAP;
    }

    // Show this difficulty's best score
    best = loadBest();
    bestEl.textContent = 'Best ' + formatMeters(best);
    bestEl.classList.remove('new-best');
    startBestEl.textContent = best > 0 ? 'Your best: ' + formatMeters(best) : '';

    for (const btn of difficultyEl.querySelectorAll('button')) {
        btn.setAttribute('aria-checked', btn.dataset.level === level);
    }

    try {
        localStorage.setItem(DIFFICULTY_KEY, level);
    } catch {
        // storage blocked - still works for this session
    }
}

difficultyEl.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (btn) applyDifficulty(btn.dataset.level);
});

applyDifficulty(difficulty);

// ---------- Loop ----------
const clock = new THREE.Clock();

function handleHit(obstacle) {
    // Ignore hits during the cooldown, so one obstacle can't count twice
    if (gameOver || clock.elapsedTime < invincibleUntil) return;

    hits++;
    playSound(obstacleSounds.get(obstacle.userData.template));

    if (hits === 1) {
        // First hit: half speed, but never below the starting speed
        speed = Math.max(speed / 2, START_SPEED);
        invincibleUntil = clock.elapsedTime + HIT_COOLDOWN;
        console.log('Hit! Speed now', speed.toFixed(1));
    } else {
        endGame();
    }
}

// // TEMPORARY: press H to test until obstacles exist
// window.addEventListener('keydown', (e) => {
//     if (e.key === 'h') handleHit();
// });

renderer.setAnimationLoop(() => {
    // Time since last frame (capped so switching tabs doesn't cause a jump)
    const dt = Math.min(clock.getDelta(), 0.05);
    if (!started) {
        renderer.render(scene, camera);
        return;
    }
    // Slowly speed up
    if (!gameOver) {
        speed = Math.min(speed + ACCELERATION * dt, MAX_SPEED);
    }
    const move = speed * dt;
    distance += move;
    updateScore();

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

    // Obstacles
    updateObstacles(move);
    if (carLoaded && !gameOver) checkCollisions(move);

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