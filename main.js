// main.js — version propre, sûre pour les matériaux (highlight cloné)
// Garde toutes les fonctionnalités : raycast, halo, audio, menu, déplacement, collisions, API.

import * as THREE from 'three';
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";
//import { RectAreaLightHelper } from 'three/examples/jsm/helpers/RectAreaLightHelper.js';
import { RectAreaLight } from 'three';
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const SUPABASE_URL = "https://hgbntfqrffraejagyauk.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_suro3nVpnhMPzm6_iGmN_g_cEz-UcV9";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
console.log("Supabase OK");

RectAreaLightUniformsLib.init();

/* ------------------------------------------------------------
   AUDIO MAP (fichiers dans le dossier `sons/` à la racine publique)
   ------------------------------------------------------------ */
const audioMap = {
  "headphone_obj":   new Audio("public/sons/arrivee.mp3"),
  "headphone_obj001": new Audio("public/sons/doudou_socle.mp3"),
  "headphone_obj002": new Audio("public/sons/la_porte.mp3"),
  "headphone_obj003": new Audio("public/sons/plante_socle.mp3"),
  "headphone_obj004": new Audio("public/sons/lumiere.mp3")
};
let currentAudio = null;
let currentAudioObject = null;

/* ------------------------------------------------------------
   Scène, caméra, renderer
   ------------------------------------------------------------ */
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

/* limites caméra */
const limites = { xMin: -20, xMax: 20, yMin: 1, yMax: 10, zMin: -20, zMax: 20 };

/* Lumières (garde tes couleurs/intensités mais vérifie distance si trop sombre) */
scene.add(new THREE.AmbientLight(0xffffff, 0.1));
const dirLight = new THREE.DirectionalLight(0xffffff, 0.13);
dirLight.position.set(5, 7, 2);
scene.add(dirLight);

// tes point lights (tu peux ajuster intensity/distance si besoin)
const pointPositions = [
  [3.5041, 2.0290, 2.5884],
  [0.66495, 2.0290, 7.88012],
  [8.5587, 2.05418, -0.26887],
  [6.7322797775268555, 2.0541799068450928, 8.14503002166748],
  [-2.4607, 2.05418, 1.28076]
];
pointPositions.forEach(p => {
  const pl = new THREE.PointLight(0x9933ff, 2, 10); // intensity/distance réduits pour test
  pl.position.set(p[0], p[1], p[2]);
  scene.add(pl);
});

/* ------------------------------------------------------------
   Loader GLTF + interactables
   - originals : Map(mesh -> originalMaterial) sauvegarde
   - interactableMeshes : liste pour raycast
   ------------------------------------------------------------ */
const gltfLoader = new GLTFLoader();
const interactableMeshes = [];
const originals = new Map(); // sauvegarde matériaux originaux

gltfLoader.load(
   "public/scene.glb",
  (gltf) => {
    const model = gltf.scene;
    scene.add(model);

    model.traverse((child) => {
      if (!child.isMesh) return;
     
      // Sauvegarde du matériau original (NE PAS le modifier)
      if (!originals.has(child)) originals.set(child, child.material);

      // Détecter les objets interactifs (nommage)
      if (child.name && child.name.startsWith("headphone_obj")) {
        child.material.color.set(0x141414);     // Couleur blanche
        child.material.transmission = 0;        // Pas de transparence
        child.material.roughness = 0.4;
        child.material.metalness = 0.1;
        child.material.needsUpdate = true;
        interactableMeshes.push(child);
        console.log("Mesh interactif :", child.name);
      }
      // Transformation AreaLights exportées en plane (nommées areaLight_*) 
      if (child.isMesh && child.name.startsWith("Area_")) { 
        const width = child.scale.x || 1; 
        const height = child.scale.y || 1; 
        const color = child.material && child.material.color ? child.material.color.clone() : new THREE.Color(0xffffff); 
        const intensity = 5; 
        // Lumière réelle
         const rectLight = new RectAreaLight(color, intensity, width, height); 
         rectLight.position.copy(child.position); 
         rectLight.quaternion.copy(child.quaternion); 
         scene.add(rectLight); 
         // Plane émissif pour visuel 
         const emissiveMat = new THREE.MeshStandardMaterial({ 
            color: color, 
            emissive: color, 
            emissiveIntensity: 1, 
            side: THREE.DoubleSide 
        }); 
        
        const plane = new THREE.Mesh(child.geometry.clone(), emissiveMat); 
        plane.position.copy(child.position); 
        plane.quaternion.copy(child.quaternion); 
        plane.scale.copy(child.scale); 
        scene.add(plane); 
        
        child.visible = false; // masquer mesh original 
      }
      
        // Exemple : log pour vérifier les lumières
      if (child.isLight) {
      console.log("Lumière importée :", child.name, child.type, child.color, child.intensity);
      }

    });

    console.log("Modèle chargé !");
  },
  undefined,
  (err) => console.error("Erreur chargement GLB :", err)
);

/* ------------------------------------------------------------
   Variables caméra FPS / contrôles souris clavier
   ------------------------------------------------------------ */
camera.position.set(1, 2, 9);
let cameraSpeed = 0.1;
let yaw = 0;
let pitch = 0;
const rotationSpeedX = 0.003;
const rotationSpeedY = 0.008;
let lastMouseX = null;
let lastMouseY = null;
let controlEnabled = false; // activé quand on entre dans la scène

/* clavier */
const keys = {};
document.addEventListener('keydown', e => keys[e.key] = true);
document.addEventListener('keyup', e => keys[e.key] = false);

/* ------------------------------------------------------------
   Raycaster & mouse
   ------------------------------------------------------------ */
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

/* ------------------------------------------------------------
   Fonctions : envoyerAction -> backend (FastAPI)
   ------------------------------------------------------------ */
async function envoyerAction(nomObjet, type = "click", valeur = null) {
  try {
    const { data, error } = await supabase
      .from("interactions")
      .insert([{ objet: nomObjet, type, valeur }]);

    if (error) {
      console.error("Erreur Supabase:", error);
    } else {
      console.log("Interaction enregistrée:", data);
    }
  } catch (err) {
    console.warn("Erreur envoyerAction:", err);
  }
}
async function testerClicksParObjet() {
  const { data, error } = await supabase
    .from("clicks_par_objet")
    .select("*");

  if (error) {
    console.error("Erreur clicks_par_objet:", error);
  } else {
    console.log("Clics par objet:", data);
  }
}
testerClicksParObjet();


/* ------------------------------------------------------------
   Gestion collision simple (ray devant la caméra)
   ------------------------------------------------------------ */
function detecterCollision(direction) {
  if (direction.length() === 0) return false;
  const distance = 0.5;
  const rc = new THREE.Raycaster(camera.position, direction.clone().normalize(), 0, distance);
  const collisions = rc.intersectObjects(scene.children, true);
  return collisions.length > 0;
}

/* ------------------------------------------------------------
   Mise à jour position caméra (clavier, collisions)
   ------------------------------------------------------------ */
function updateCameraPosition() {
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  forward.y = 0;
  forward.normalize();

  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), forward).normalize();
  const direction = new THREE.Vector3();

  if (keys['ArrowUp'] || keys['z']) direction.add(forward.clone().multiplyScalar(cameraSpeed));
  if (keys['ArrowDown'] || keys['s']) direction.add(forward.clone().multiplyScalar(-cameraSpeed));
  if (keys['ArrowLeft'] || keys['q']) direction.add(right.clone().multiplyScalar(cameraSpeed));
  if (keys['ArrowRight'] || keys['d']) direction.add(right.clone().multiplyScalar(-cameraSpeed));

  if (!detecterCollision(direction)) camera.position.add(direction);

  // limites
  camera.position.x = Math.max(limites.xMin, Math.min(limites.xMax, camera.position.x));
  camera.position.y = Math.max(limites.yMin, Math.min(limites.yMax, camera.position.y));
  camera.position.z = Math.max(limites.zMin, Math.min(limites.zMax, camera.position.z));
}

/* ------------------------------------------------------------
   Highlight safe : clone material temporaire (survol) + restore
   ------------------------------------------------------------ */
let highlightedObject = null;
function highlightMeshTemporary(mesh) {
  // restore previous
  if (highlightedObject && originals.has(highlightedObject)) {
    highlightedObject.material = originals.get(highlightedObject);
    highlightedObject = null;
  }

  if (!mesh) return;

  // clone le matériau original, applique surbrillance
  const baseMat = originals.get(mesh) || mesh.material;
  const cloned = Array.isArray(baseMat) ? baseMat.map(m => m.clone()) : baseMat.clone();
  // si multi-material, on peut modifier la première ou toutes
  if (Array.isArray(cloned)) {
    cloned.forEach(m => {
      if ('color' in m) m.color.set(0xffff00);
      if ('emissive' in m) m.emissive.set(0x222200);
    });
  } else {
    if ('color' in cloned) cloned.color.set(0xffff00);
    if ('emissive' in cloned) cloned.emissive.set(0x222200);
  }
  mesh.material = cloned;
  highlightedObject = mesh;
}

/* ------------------------------------------------------------
   Halo (mesh séparé dans la scène, positionné sur le monde)
   - on n'ajoute pas le halo comme enfant pour éviter offsets
   ------------------------------------------------------------ */
let haloMesh = null;
function addHalo(target) {
  if (!target || !target.geometry) return;
  // retire ancien halo
  if (haloMesh) {
    if (haloMesh.parent) haloMesh.parent.remove(haloMesh);
    haloMesh.geometry.dispose();
    haloMesh.material.dispose();
    haloMesh = null;
  }

  // clone géométrie (attention à la taille)
  const geom = target.geometry.clone();

  const mat = new THREE.MeshBasicMaterial({
    color: 0xffff00,
    transparent: true,
    opacity: 0.35,
    side: THREE.BackSide,
    depthTest: true
  });

  haloMesh = new THREE.Mesh(geom, mat);

  // position/rotation/scale basés sur le world transform
  const worldPos = new THREE.Vector3();
  const worldQuat = new THREE.Quaternion();
  const worldScale = new THREE.Vector3();
  target.getWorldPosition(worldPos);
  target.getWorldQuaternion(worldQuat);
  target.getWorldScale(worldScale);

  haloMesh.position.copy(worldPos);
  haloMesh.quaternion.copy(worldQuat);
  haloMesh.scale.copy(worldScale).multiplyScalar(1.06);

  haloMesh.renderOrder = 999;
  scene.add(haloMesh);
}

function removeHalo() {
  if (haloMesh && haloMesh.parent) {
    haloMesh.parent.remove(haloMesh);
    haloMesh.geometry.dispose();
    haloMesh.material.dispose();
    haloMesh = null;
  }
}

/* ------------------------------------------------------------
   Survol et raycast (mousemove)
   - n'affecte que les interactableMeshes (liste safe)
   ------------------------------------------------------------ */
document.addEventListener('mousemove', (event) => {
  // update souris globale pour raycaster
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  if (!controlEnabled) return;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(interactableMeshes, true);

  if (intersects.length > 0) {
    const obj = intersects[0].object;
    
    // NE PAS surligner si audio en cours sur cet objet
    if (obj === currentAudioObject) {
      removeHalo(); // éventuellement enlever halo normal si tu n'en veux pas
      return;
    }
    
    if (highlightedObject !== obj !== currentAudioObject) {
      // restore & apply
      if (highlightedObject && originals.has(highlightedObject) && highlightedObject !== currentAudioObject) {
        highlightedObject.material = originals.get(highlightedObject);
      }
      highlightMeshTemporary(obj);
      addHalo(obj);
    }
  } else {
    if (highlightedObject && originals.has(highlightedObject) && highlightedObject !== currentAudioObject) {
      highlightedObject.material = originals.get(highlightedObject);
      highlightedObject = null;
    }
    removeHalo();
  }
});

/* ------------------------------------------------------------
   Clic : audio + envoi action + toggle stop
   ------------------------------------------------------------ */
document.addEventListener('click', (event) => {
  if (!controlEnabled) return;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(scene.children, true);
  if (intersects.length === 0) return;

  const obj = intersects[0].object;

  // afficher coords si headphone
  if (obj.name && obj.name.startsWith("headphone_obj")) {
    console.log(`${obj.name} position -> x: ${obj.position.x}, y: ${obj.position.y}, z: ${obj.position.z}`);
  }

  // AUDIO toggle exclusif seulement pour headphone_obj*
  if (obj.name && obj.name.startsWith("headphone_obj")) {
    // si on reclique sur le même, stop
    if (currentAudioObject === obj && currentAudio) {
      currentAudio.pause();
      currentAudio.currentTime = 0;
      // restore matériel original
      if (originals.has(obj)) obj.material = originals.get(obj);
      currentAudio = null;
      currentAudioObject = null;
      return;
    }

    // sinon stop précédent
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.currentTime = 0;
      if (currentAudioObject && originals.has(currentAudioObject)) {
        currentAudioObject.material = originals.get(currentAudioObject);
      }
      currentAudio = null;
      currentAudioObject = null;
    }

    // jouer nouveau audio si présent
    const audio = audioMap[obj.name];
    if (audio) {
      audio.currentTime = 0;
      audio.play().catch(e => console.warn("Audio play error:", e));
      currentAudio = audio;
      currentAudioObject = obj;

      // applique couleur pendant lecture (clone pour ne pas altérer original)
      const base = originals.get(obj) || obj.material;
      obj.material = Array.isArray(base) ? base.map(m => m.clone()) : base.clone();
      if (Array.isArray(obj.material)) {
        obj.material.forEach(m => { if ('color' in m) m.color.set(0xff80ff); });
      } else {
        if ('color' in obj.material) obj.material.color.set(0xff80ff);
      }

      // restore à la fin
      audio.onended = () => {
        if (originals.has(obj)) obj.material = originals.get(obj);
        currentAudio = null;
        currentAudioObject = null;
      };
    }
  }

  // envoyer action au backend (tous les objets)
  if (obj.name) envoyerAction(obj.name, "click", null);
});

/* ------------------------------------------------------------
   Menu pause, panel notes, menu principal (Entrer)
   ------------------------------------------------------------ */
/* éléments DOM attendus dans index.html : #menu, #resumeBtn, #quitBtn,
   #notesBtn, #notesPanel, #notesClose, #mainMenu, #enterSceneBtn
*/
const menu = document.getElementById("menu");
const resumeBtn = document.getElementById("resumeBtn");
const quitBtn = document.getElementById("quitBtn");
const notesBtn = document.getElementById("notesBtn");
const notesPanel = document.getElementById("notesPanel");
const notesClose = document.getElementById("notesClose");
const mainMenu = document.getElementById("mainMenu");
const enterSceneBtn = document.getElementById("enterSceneBtn");

function showMenu() {
  if (menu) menu.style.display = "block";
  controlEnabled = false;
  // arrêter audio si besoin
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    if (currentAudioObject && originals.has(currentAudioObject)) {
      currentAudioObject.material = originals.get(currentAudioObject);
    }
    currentAudio = null;
    currentAudioObject = null;
  }
}

function hideMenu() {
  if (menu) menu.style.display = "none";
  controlEnabled = true;
  lastMouseX = null;
  lastMouseY = null;
}

if (document) {
  document.addEventListener('keydown', (e) => {
    if (e.key === " ") {
      if (!menu || menu.style.display === "none" || menu.style.display === "") showMenu();
      else hideMenu();
    }
  });
  if (resumeBtn) resumeBtn.addEventListener('click', hideMenu);
  if (quitBtn) quitBtn.addEventListener('click', () => window.close());
  if (notesBtn) notesBtn.addEventListener('click', () => {
    if (notesPanel) { notesPanel.classList.remove("hidden"); notesPanel.style.display = "block"; }
  });
  if (notesClose) notesClose.addEventListener('click', () => {
    if (notesPanel) { notesPanel.classList.add("hidden"); notesPanel.style.display = "none"; }
  });
  if (enterSceneBtn) enterSceneBtn.addEventListener('click', () => {
    if (mainMenu) mainMenu.style.display = "none";
    controlEnabled = true;
    // démarrer l'animation (elle tourne déjà mais on garantit)
    // (on laisse animate() tourner de toute façon)
  });
}

/* ------------------------------------------------------------
   Resize handler
   ------------------------------------------------------------ */
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* ------------------------------------------------------------
   Suivi souris relatif pour pivot caméra (FPS-style)
   - on n'applique le yaw/pitch que si controlEnabled
   ------------------------------------------------------------ */
document.addEventListener('mousemove', (event) => {
  if (!controlEnabled) return;
  if (lastMouseX !== null && lastMouseY !== null) {
    const deltaX = event.clientX - lastMouseX;
    const deltaY = event.clientY - lastMouseY;
    yaw -= deltaX * rotationSpeedY;
    pitch -= deltaY * rotationSpeedX;
    pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch));
  }
  lastMouseX = event.clientX;
  lastMouseY = event.clientY;
});

/* ------------------------------------------------------------
   Boucle d'animation
   ------------------------------------------------------------ */
function animate() {
  requestAnimationFrame(animate);

  // appliquer rotation caméra (FPS)
  camera.rotation.order = 'YXZ';
  camera.rotation.y = yaw;
  camera.rotation.x = pitch;

  updateCameraPosition();
  

  // si halo présent on peut animer son opacité
  if (haloMesh) haloMesh.material.opacity = 0.25 + 0.15 * Math.sin(Date.now() * 0.005);

  renderer.render(scene, camera);
}

animate(); // on lance l'animation

/* ------------------------------------------------------------
   Fin fichier
   ------------------------------------------------------------ */









