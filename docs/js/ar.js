const CAR_NODES = [
    'Cube', 'Cube015', 'Cube029', 'Cube034', 'Cube053',
    'Cube055', 'Cube070', 'Cube072', 'Cube074', 'Cube082',
];

const CAR_NAMES = [
    'The Bumblebee', 'The Crimson Dart', 'Shadow Racer', 'The Brick',
    'Tangerine Dream', 'Desert Fox', 'Blue Thunder',
    'La Rossa', 'Night Cruiser', 'Officer Wheels',
];

// read URL params
const params = new URLSearchParams(window.location.search);
let carName = params.get('car');

// fall back to localStorage
if (!carName) {
    const savedIndex = localStorage.getItem('selectedCarIndex');
    const index = savedIndex !== null ? parseInt(savedIndex) : 0;
    carName = CAR_NODES[index];
    document.getElementById('car-name-label').textContent = CAR_NAMES[index];
} else {
    const index = CAR_NODES.indexOf(carName);
    document.getElementById('car-name-label').textContent =
        index >= 0 ? CAR_NAMES[index] : carName;
}

console.log('AR page loaded for car:', carName);