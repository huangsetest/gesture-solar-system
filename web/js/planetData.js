/**
 * Planet and celestial body data
 * Realistic colors and orbital properties
 */

export const PLANET_DATA = {
    sun: {
        name: 'Sun',
        radius: 8,
        color: 0xFDB813,
        emissive: 0xFDB813,
        emissiveIntensity: 1.5,
        glow: true
    },
    mercury: {
        name: 'Mercury',
        radius: 0.4,
        distance: 15,
        orbitSpeed: 0.04,
        rotationSpeed: 0.01,
        color: 0x8C7853,
        tilt: 0.034
    },
    venus: {
        name: 'Venus',
        radius: 0.95,
        distance: 20,
        orbitSpeed: 0.015,
        rotationSpeed: -0.004,
        color: 0xFFC649,
        tilt: 177.4
    },
    earth: {
        name: 'Earth',
        radius: 1,
        distance: 25,
        orbitSpeed: 0.01,
        rotationSpeed: 0.02,
        color: 0x2F6A9F,
        tilt: 23.5,
        hasMoon: true,
        atmosphere: true
    },
    mars: {
        name: 'Mars',
        radius: 0.53,
        distance: 30,
        orbitSpeed: 0.008,
        rotationSpeed: 0.018,
        color: 0xCD5C5C,
        tilt: 25.2
    },
    jupiter: {
        name: 'Jupiter',
        radius: 3.5,
        distance: 50,
        orbitSpeed: 0.002,
        rotationSpeed: 0.04,
        color: 0xDAA520,
        tilt: 3.1,
        moons: 4
    },
    saturn: {
        name: 'Saturn',
        radius: 3,
        distance: 70,
        orbitSpeed: 0.001,
        rotationSpeed: 0.038,
        color: 0xF4A460,
        tilt: 26.7,
        hasRings: true,
        moons: 3
    },
    uranus: {
        name: 'Uranus',
        radius: 1.6,
        distance: 90,
        orbitSpeed: 0.0007,
        rotationSpeed: -0.03,
        color: 0x4FD0E0,
        tilt: 97.8
    },
    neptune: {
        name: 'Neptune',
        radius: 1.55,
        distance: 110,
        orbitSpeed: 0.0005,
        rotationSpeed: 0.032,
        color: 0x4169E1,
        tilt: 28.3
    }
};

export const ASTEROID_BELT = {
    count: 1500,
    innerRadius: 35,
    outerRadius: 45,
    color: 0x8B7355,
    size: 0.05
};

export const MOON_DATA = {
    earth: {
        radius: 0.27,
        distance: 2.5,
        orbitSpeed: 0.05,
        color: 0xAAAAAA
    },
    jupiter: [
        { radius: 0.15, distance: 5, orbitSpeed: 0.08, color: 0xCCCCCC },
        { radius: 0.12, distance: 6, orbitSpeed: 0.06, color: 0xBBBBBB },
        { radius: 0.18, distance: 7, orbitSpeed: 0.04, color: 0xDDDDDD },
        { radius: 0.14, distance: 8, orbitSpeed: 0.03, color: 0xAAAAAA }
    ],
    saturn: [
        { radius: 0.2, distance: 5, orbitSpeed: 0.07, color: 0xCCCCCC },
        { radius: 0.16, distance: 6.5, orbitSpeed: 0.05, color: 0xBBBBBB },
        { radius: 0.12, distance: 8, orbitSpeed: 0.04, color: 0xAAAAAA }
    ]
};
