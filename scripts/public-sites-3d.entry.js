import * as THREE from 'three';

const canvas = document.getElementById('premium-scene');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (canvas && !reduceMotion) {
  try {
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
    renderer.setSize(window.innerWidth, window.innerHeight, false);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x05060a, 0.055);

    const camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.1, 60);
    camera.position.set(0, 0, 7.5);

    const world = new THREE.Group();
    scene.add(world);

    const isMobile = window.matchMedia('(max-width: 640px)').matches;
    const particleCount = isMobile ? 280 : 720;
    const particlePositions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i += 1) {
      const radius = 5 + Math.random() * 15;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      particlePositions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      particlePositions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      particlePositions[i * 3 + 2] = radius * Math.cos(phi) - 5;
    }
    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    const particles = new THREE.Points(
      particleGeometry,
      new THREE.PointsMaterial({ color: 0x4f8cff, size: isMobile ? 0.035 : 0.026, transparent: true, opacity: 0.6, depthWrite: false })
    );
    world.add(particles);

    const knot = new THREE.Mesh(
      new THREE.TorusKnotGeometry(1.55, 0.38, isMobile ? 90 : 150, 14, 2, 3),
      new THREE.MeshBasicMaterial({ color: 0x1e66ff, wireframe: true, transparent: true, opacity: 0.11 })
    );
    knot.position.set(isMobile ? 1.8 : 4.1, isMobile ? 2.1 : 1.7, -2.6);
    knot.rotation.set(0.5, -0.35, 0.2);
    world.add(knot);

    const crystal = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.45, 2),
      new THREE.MeshBasicMaterial({ color: 0x70b4ff, wireframe: true, transparent: true, opacity: 0.08 })
    );
    crystal.position.set(isMobile ? -2.2 : -4.7, -3.2, -3.5);
    world.add(crystal);

    const pointer = new THREE.Vector2();
    const target = new THREE.Vector2();
    window.addEventListener('pointermove', (event) => {
      target.x = (event.clientX / window.innerWidth - 0.5) * 2;
      target.y = (event.clientY / window.innerHeight - 0.5) * 2;
    }, { passive: true });

    renderer.setAnimationLoop((timestamp) => {
      if (document.hidden) return;
      const elapsed = timestamp / 1000;
      pointer.lerp(target, 0.035);
      particles.rotation.y = elapsed * 0.018;
      particles.rotation.x = elapsed * 0.006;
      knot.rotation.x = 0.5 + elapsed * 0.055;
      knot.rotation.y = -0.35 + elapsed * 0.075;
      crystal.rotation.x = elapsed * -0.035;
      crystal.rotation.y = elapsed * 0.045;
      camera.position.x += (pointer.x * 0.22 - camera.position.x) * 0.025;
      camera.position.y += (-pointer.y * 0.14 - camera.position.y) * 0.025;
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
    });

    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
      renderer.setSize(window.innerWidth, window.innerHeight, false);
    }, { passive: true });
  } catch (error) {
    canvas.remove();
  }
}
