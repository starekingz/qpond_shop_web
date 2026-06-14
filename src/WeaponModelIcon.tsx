import { useEffect, useRef, useState, type ReactNode } from "react";

// ── 3D Math ──────────────────────────────────────────────
type V3 = [number, number, number];

function rotateX(p: V3, deg: number): V3 {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r), s = Math.sin(r);
  return [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c];
}
function rotateY(p: V3, deg: number): V3 {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r), s = Math.sin(r);
  return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c];
}
function rotateZ(p: V3, deg: number): V3 {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r), s = Math.sin(r);
  return [p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2]];
}

function rotateAroundOrigin(p: V3, origin: V3, axis: string, deg: number): V3 {
  let t: V3 = [p[0] - origin[0], p[1] - origin[1], p[2] - origin[2]];
  if (axis === "x") t = rotateX(t, deg);
  else if (axis === "y") t = rotateY(t, deg);
  else if (axis === "z") t = rotateZ(t, deg);
  return [t[0] + origin[0], t[1] + origin[1], t[2] + origin[2]];
}

function applyDisplay(p: V3, display: { rotation: V3; translation: V3; scale: V3 }): V3 {
  // Center at (8,8,8)
  let v: V3 = [p[0] - 8, p[1] - 8, p[2] - 8];
  // Apply rotation (YXZ order as Minecraft uses)
  v = rotateY(v, display.rotation[1]);
  v = rotateX(v, display.rotation[0]);
  v = rotateZ(v, display.rotation[2]);
  // Scale
  v = [v[0] * display.scale[0], v[1] * display.scale[1], v[2] * display.scale[2]];
  // Translate
  v = [v[0] + display.translation[0], v[1] + display.translation[1], v[2] + display.translation[2]];
  return v;
}

// ── Face vertex definitions ──────────────────────────────
// Minecraft BlockBench face vertex ordering (UV top-left to bottom-right)
const FACE_VERTICES: Record<string, number[][]> = {
  north: [[0,1,0],[1,1,0],[1,0,0],[0,0,0]], // TL, TR, BR, BL
  south: [[1,1,1],[0,1,1],[0,0,1],[1,0,1]],
  east:  [[1,1,0],[1,1,1],[1,0,1],[1,0,0]],
  west:  [[0,1,1],[0,1,0],[0,0,0],[0,0,1]],
  up:    [[0,1,1],[1,1,1],[1,1,0],[0,1,0]], // flipped V
  down:  [[0,0,0],[1,0,0],[1,0,1],[0,0,1]],
};

// ── Affine texture mapping for a triangle ────────────────
function drawTexturedTriangle(
  ctx: CanvasRenderingContext2D,
  texture: HTMLCanvasElement,
  // Source UV corners (pixels in texture)
  su: number[], sv: number[],
  // Destination 2D corners (pixels on canvas)
  dx: number[], dy: number[]
) {
  ctx.save();

  // Clip to triangle
  ctx.beginPath();
  ctx.moveTo(dx[0], dy[0]);
  ctx.lineTo(dx[1], dy[1]);
  ctx.lineTo(dx[2], dy[2]);
  ctx.closePath();
  ctx.clip();

  // Compute affine transform: maps (su[i], sv[i]) → (dx[i], dy[i])
  const denom =
    (su[1] - su[0]) * (sv[2] - sv[0]) - (su[2] - su[0]) * (sv[1] - sv[0]);
  if (Math.abs(denom) < 0.001) { ctx.restore(); return; }

  const a = ((dx[1] - dx[0]) * (sv[2] - sv[0]) - (dx[2] - dx[0]) * (sv[1] - sv[0])) / denom;
  const c = ((dx[2] - dx[0]) * (su[1] - su[0]) - (dx[1] - dx[0]) * (su[2] - su[0])) / denom;
  const e = dx[0] - a * su[0] - c * sv[0];
  const b = ((dy[1] - dy[0]) * (sv[2] - sv[0]) - (dy[2] - dy[0]) * (sv[1] - sv[0])) / denom;
  const d = ((dy[2] - dy[0]) * (su[1] - su[0]) - (dy[1] - dy[0]) * (su[2] - su[0])) / denom;
  const f = dy[0] - b * su[0] - d * sv[0];

  ctx.setTransform(a, b, c, d, e, f);
  ctx.drawImage(texture, 0, 0);
  ctx.restore();
}

// ── Render a model onto a canvas ─────────────────────────
function renderModel(
  ctx: CanvasRenderingContext2D,
  model: { texture_size?: number[]; display?: { gui?: { rotation?: number[]; translation?: number[]; scale?: number[] } }; elements?: { from: number[]; to: number[]; rotation?: { origin: number[]; axis: string; angle: number }; faces?: Record<string, { uv: number[]; texture?: string } | undefined> }[] },
  textureCanvas: HTMLCanvasElement,
  canvasSize: number
) {

  // Get GUI display settings (with defaults)
  const gui = model.display?.gui || {};
  const display = {
    rotation: (gui.rotation || [0, 0, 0]) as V3,
    translation: (gui.translation || [0, 0, 0]) as V3,
    scale: (gui.scale || [1, 1, 1]) as V3,
  };

  // Collect all faces with their projected data
  type FaceData = {
    projected: [number, number][];
    uv: number[];
    depth: number;
    normalZ: number;
  };
  const faces: FaceData[] = [];

  for (const elem of model.elements || []) {
    const from = elem.from as V3;
    const to = elem.to as V3;

    // 8 corners of the box
    const corners: V3[] = [
      [from[0], from[1], from[2]], // 0: min,min,min
      [to[0], from[1], from[2]],   // 1: max,min,min
      [to[0], to[1], from[2]],     // 2: max,max,min
      [from[0], to[1], from[2]],   // 3: min,max,min
      [from[0], from[1], to[2]],   // 4: min,min,max
      [to[0], from[1], to[2]],     // 5: max,min,max
      [to[0], to[1], to[2]],       // 6: max,max,max
      [from[0], to[1], to[2]],     // 7: min,max,max
    ];

    // Apply element rotation
    if (elem.rotation) {
      const origin = elem.rotation.origin as V3;
      const axis = elem.rotation.axis as string;
      const angle = elem.rotation.angle as number;
      for (let i = 0; i < 8; i++) {
        corners[i] = rotateAroundOrigin(corners[i], origin, axis, angle);
      }
    }

    // Apply display transform and project
    const transformed = corners.map((c) => applyDisplay(c, display));

    // Process each face
    for (const [faceName, faceDef] of Object.entries(elem.faces || {}) as [string, { uv: number[]; texture?: string } | undefined][]) {
      if (!faceDef || !faceDef.uv) continue;

      const uv = faceDef.uv as number[]; // [u1, v1, u2, v2]
      const vertIndices = FACE_VERTICES[faceName];
      if (!vertIndices) continue;

      // Get the 4 corner positions (index = X_bit + Y_bit*2 + Z_bit*4)
      const pts: V3[] = vertIndices.map((vi) => {
        const idx = vi[0] + vi[1] * 2 + vi[2] * 4;
        return transformed[idx];
      });

      // Project to 2D (orthographic: drop Z, flip Y)
      const projected: [number, number][] = pts.map((p) => [
        (p[0] + 8) * (canvasSize / 16),
        (-p[1] + 8) * (canvasSize / 16), // flip Y for screen
      ]);

      // Backface culling using 2D cross product on projected coords
      // (screen Y is down, so winding is reversed from 3D)
      const e1x = projected[1][0] - projected[0][0];
      const e1y = projected[1][1] - projected[0][1];
      const e2x = projected[2][0] - projected[0][0];
      const e2y = projected[2][1] - projected[0][1];
      const cross2D = e1x * e2y - e1y * e2x;
      if (cross2D >= 0) continue; // back face

      // Average depth for sorting
      const depth = pts.reduce((s, p) => s + p[2], 0) / 4;

      faces.push({ projected, uv, depth, normalZ: cross2D });
    }
  }

  // Sort by depth descending (painter's algorithm: draw far faces first)
  faces.sort((a, b) => b.depth - a.depth);

  // Clear canvas
  ctx.clearRect(0, 0, canvasSize, canvasSize);
  ctx.imageSmoothingEnabled = false;

  // Draw each face
  for (const face of faces) {
    const [u1, v1, u2, v2] = face.uv;
    const p = face.projected;

    // UV in texture pixels
    const su = [u1, u2, u2, u1];
    const sv = [v1, v1, v2, v2];
    const dx = [p[0][0], p[1][0], p[2][0], p[3][0]];
    const dy = [p[0][1], p[1][1], p[2][1], p[3][1]];

    // Draw as 2 triangles: (0,1,2) and (0,2,3)
    drawTexturedTriangle(ctx, textureCanvas,
      [su[0], su[1], su[2]], [sv[0], sv[1], sv[2]],
      [dx[0], dx[1], dx[2]], [dy[0], dy[1], dy[2]]);
    drawTexturedTriangle(ctx, textureCanvas,
      [su[0], su[2], su[3]], [sv[0], sv[2], sv[3]],
      [dx[0], dx[2], dx[3]], [dy[0], dy[2], dy[3]]);
  }
}

// ── React Component ──────────────────────────────────────
interface Props {
  modelRef: string; // e.g. "qp_weapon:bow/dark"
  size?: number;
  fallback?: ReactNode;
}

export default function WeaponModelIcon({ modelRef, size = 32, fallback }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const [ns, path] = modelRef.split(":");
    const modelUrl = `/textures/assets/${ns}/models/${path}.json`;
    const texUrl = `/textures/assets/${ns}/textures/${path}.png`;

    let cancelled = false;

    (async () => {
      try {
        // Load model JSON and texture in parallel
        const [modelRes, texImg] = await Promise.all([
          fetch(modelUrl).then((r) => (r.ok ? r.json() : null)),
          new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = texUrl;
          }),
        ]);

        if (cancelled || !modelRes) { if (!cancelled) setFailed(true); return; }

        // Create offscreen canvas for texture
        const texCanvas = document.createElement("canvas");
        texCanvas.width = texImg.naturalWidth;
        texCanvas.height = texImg.naturalHeight;
        const texCtx = texCanvas.getContext("2d")!;
        texCtx.drawImage(texImg, 0, 0);

        // Render to visible canvas
        const canvas = canvasRef.current;
        if (!canvas) { return; }
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d")!;
        renderModel(ctx, modelRes, texCanvas, size);
        setLoaded(true);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => { cancelled = true; };
  }, [modelRef, size]);

  if (failed) {
    if (fallback) return <>{fallback}</>;
    return (
      <div className="item-icon item-icon-fallback" style={{ width: size, height: size }}>
        ?
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      className="item-icon"
      width={size}
      height={size}
      style={{ imageRendering: "pixelated", opacity: loaded ? 1 : 0 }}
    />
  );
}
