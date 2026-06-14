const fs = require("fs");

// Test: parse bow/dark model and show vertex/face statistics
const model = JSON.parse(fs.readFileSync(
  "c:\\Users\\ted97\\Desktop\\模組開發\\倉儲網頁\\public\\textures\\assets\\qp_weapon\\models\\bow\\dark.json", "utf-8"
));

const canvasSize = 64; // bigger for testing
const display = {
  rotation: model.display?.gui?.rotation || [0,0,0],
  translation: model.display?.gui?.translation || [0,0,0],
  scale: model.display?.gui?.scale || [1,1,1],
};

console.log("Model:", model.elements.length, "elements");
console.log("Display GUI:", JSON.stringify(display));
console.log("Texture size:", model.texture_size);

// Count total faces
let totalFaces = 0;
for (const elem of model.elements) {
  totalFaces += Object.keys(elem.faces || {}).length;
}
console.log("Total faces:", totalFaces);

// Test: compute bounding box of projected coordinates
let minX = Infinity, maxX = -Infinity;
let minY = Infinity, maxY = -Infinity;
let minZ = Infinity, maxZ = -Infinity;

function rotX(p, deg) {
  const r = deg * Math.PI / 180;
  const c = Math.cos(r), s = Math.sin(r);
  return [p[0], p[1]*c - p[2]*s, p[1]*s + p[2]*c];
}
function rotY(p, deg) {
  const r = deg * Math.PI / 180;
  const c = Math.cos(r), s = Math.sin(r);
  return [p[0]*c + p[2]*s, p[1], -p[0]*s + p[2]*c];
}
function rotZ(p, deg) {
  const r = deg * Math.PI / 180;
  const c = Math.cos(r), s = Math.sin(r);
  return [p[0]*c - p[1]*s, p[0]*s + p[1]*c, p[2]];
}

for (const elem of model.elements) {
  const corners = [];
  for (let z = 0; z < 2; z++)
    for (let y = 0; y < 2; y++)
      for (let x = 0; x < 2; x++)
        corners.push([
          x ? elem.to[0] : elem.from[0],
          y ? elem.to[1] : elem.from[1],
          z ? elem.to[2] : elem.from[2],
        ]);
  
  // Element rotation
  if (elem.rotation) {
    const o = elem.rotation.origin;
    const a = elem.rotation.axis;
    const deg = elem.rotation.angle;
    for (let i = 0; i < 8; i++) {
      let p = [corners[i][0]-o[0], corners[i][1]-o[1], corners[i][2]-o[2]];
      if (a === "x") p = rotX(p, deg);
      else if (a === "y") p = rotY(p, deg);
      else if (a === "z") p = rotZ(p, deg);
      corners[i] = [p[0]+o[0], p[1]+o[1], p[2]+o[2]];
    }
  }
  
  // Display transform
  for (let i = 0; i < 8; i++) {
    let v = [corners[i][0]-8, corners[i][1]-8, corners[i][2]-8];
    v = rotY(v, display.rotation[1]);
    v = rotX(v, display.rotation[0]);
    v = rotZ(v, display.rotation[2]);
    v = [v[0]*display.scale[0], v[1]*display.scale[1], v[2]*display.scale[2]];
    v = [v[0]+display.translation[0], v[1]+display.translation[1], v[2]+display.translation[2]];
    
    // Project
    const sx = (v[0]+8) * (canvasSize/16);
    const sy = (-v[1]+8) * (canvasSize/16);
    
    minX = Math.min(minX, sx); maxX = Math.max(maxX, sx);
    minY = Math.min(minY, sy); maxY = Math.max(maxY, sy);
    minZ = Math.min(minZ, v[2]); maxZ = Math.max(maxZ, v[2]);
  }
}

console.log("\nProjected bounding box:");
console.log(`  X: ${minX.toFixed(1)} to ${maxX.toFixed(1)} (canvas: ${canvasSize})`);
console.log(`  Y: ${minY.toFixed(1)} to ${maxY.toFixed(1)} (canvas: ${canvasSize})`);
console.log(`  Z: ${minZ.toFixed(2)} to ${maxZ.toFixed(2)}`);
console.log(`  Model width: ${(maxX-minX).toFixed(1)}px, height: ${(maxY-minY).toFixed(1)}px`);
