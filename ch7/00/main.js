import * as THREE from 'https://unpkg.com/three@0/build/three.module.js'

async function setup() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    75, window.innerWidth / window.innerHeight, 0.1, 1000,
  );
  camera.position.z = 5;

  const renderer = new THREE.WebGLRenderer();
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  const objects = {};

  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
  objects.cube = new THREE.Mesh(geometry, material);
  scene.add(objects.cube);

  return {
    scene, camera, renderer,
    objects,
  }
}

function render(app) {
  const { scene, camera, renderer, objects } = app; 

  objects.cube.rotation.x += 0.01;
  objects.cube.rotation.y += 0.01;

  renderer.render(scene, camera);
}

function startLoop(app, now = 0) {
  const timeDiff = now - app.time || 0;
  app.time = now;

  render(app, timeDiff);
  requestAnimationFrame(now => startLoop(app, now));
}

async function main() {
  const app = await setup();
  window.app = app;

  startLoop(app);
}

main();