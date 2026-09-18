// Splits low_poly_cars.glb into one GLB per car.
//
// Run from the repo root:
//   node tools/split-cars.mjs --list   -> only prints the node names in the file
//   node tools/split-cars.mjs          -> writes one file per car
import { mkdirSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune } from '@gltf-transform/functions';

const INPUT = 'docs/assets/low_poly_cars.glb';
const OUTPUT_DIR = 'docs/assets/cars';

// Names as three.js sees them (same as CAR_NODES in your JS)
const CARS = [
    'Cube', 'Cube015', 'Cube029', 'Cube034', 'Cube053',
    'Cube055', 'Cube070', 'Cube072', 'Cube074', 'Cube082',
];

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

// three.js strips these characters from names (Cube.015 -> Cube015),
// but the file itself still has them.
function cleanName(name) {
    return name.replace(/[\[\]\.:\/]/g, '');
}

// Print the node tree so you can see the real names
function printTree(node, depth = 0) {
    const mesh = node.getMesh() ? '  [mesh]' : '';
    console.log('  '.repeat(depth) + `"${node.getName()}"` + mesh);
    for (const child of node.listChildren()) printTree(child, depth + 1);
}

// Map of clean car name -> node
function findCarNodes(doc) {
    const found = new Map();
    for (const node of doc.getRoot().listNodes()) {
        const name = cleanName(node.getName());
        if (!CARS.includes(name)) continue;
        if (found.has(name)) {
            console.warn(`Warning: more than one node is called "${name}"`);
            continue;
        }
        found.set(name, node);
    }
    return found;
}

// Is `node` somewhere inside `ancestor`?
function isInside(node, ancestor) {
    for (const child of ancestor.listChildren()) {
        if (child === node || isInside(node, child)) return true;
    }
    return false;
}

// Delete a node and everything under it
function disposeTree(node) {
    for (const child of node.listChildren()) disposeTree(child);
    node.dispose();
}

function countMeshes(node) {
    let n = node.getMesh() ? 1 : 0;
    for (const child of node.listChildren()) n += countMeshes(child);
    return n;
}

// ---------- --list mode ----------
if (process.argv.includes('--list')) {
    const doc = await io.read(INPUT);
    for (const scene of doc.getRoot().listScenes()) {
        for (const node of scene.listChildren()) printTree(node);
    }
    const found = findCarNodes(doc);
    console.log('\nCars found:', [...found.keys()].join(', ') || 'none');
    const missing = CARS.filter((c) => !found.has(c));
    if (missing.length) console.log('Cars NOT found:', missing.join(', '));
    process.exit(0);
}

// ---------- split mode ----------
mkdirSync(OUTPUT_DIR, { recursive: true });

for (const keep of CARS) {
    const doc = await io.read(INPUT);
    const cars = findCarNodes(doc);
    const keepNode = cars.get(keep);

    if (!keepNode) {
        console.error(`SKIPPED ${keep}: no node with that name (run with --list)`);
        continue;
    }

    // Remove every other car, but never one that contains the car we keep
    for (const [name, node] of cars) {
        if (name === keep) continue;
        if (isInside(keepNode, node)) {
            console.warn(`${keep} is inside ${name}, so ${name} was not removed`);
            continue;
        }
        disposeTree(node);
    }

    // Drop meshes, materials and textures no longer used
    await doc.transform(prune());

    const out = `${OUTPUT_DIR}/car_${keep.toLowerCase()}.glb`;
    await io.write(out, doc);

    const remaining = [...findCarNodes(doc).keys()];
    const ok = remaining.length === 1 && remaining[0] === keep;
    console.log(
        `${ok ? 'OK  ' : 'FAIL'} ${out}  meshes: ${countMeshes(keepNode)}` +
        (ok ? '' : `  cars left in file: ${remaining.join(', ')}`)
    );
}
