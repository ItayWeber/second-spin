/* The four inspection models are assembled from lit surfaces in three dimensions. */
(() => {
  "use strict";

  const TAU = 2 * Math.PI;
  const sampleCount = 44;

  function subtract(a, b) { return a.map((value, i) => value - b[i]); }
  function cross(a, b) {
    return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  }
  function normalized(vector) {
    const length = Math.hypot(...vector) || 1;
    return vector.map(value => value / length);
  }

  function mesh() {
    const faces = [];
    function face(points, color, normals) { faces.push({ points, color, normals }); }

    function block(x, y, z, width, height, depth, color) {
      const corners = [
        [x,y,z], [x+width,y,z], [x+width,y+height,z], [x,y+height,z],
        [x,y,z+depth], [x+width,y,z+depth], [x+width,y+height,z+depth], [x,y+height,z+depth]
      ];
      [[3,2,1,0],[4,5,6,7],[0,4,7,3],[5,1,2,6],[0,1,5,4],[7,6,2,3]]
        .forEach(indices => face(indices.map(i => corners[i]), color));
    }

    function cartonWall(x, y, z, width, height, depth, color) {
      const bevel = Math.min(1.2, width / 4, height / 4, depth / 4);
      function ring(level, inset) {
        const l = x + inset, r = x + width - inset;
        const f = z + inset, b = z + depth - inset;
        const k = bevel / 2;
        return [[l+k,level,f],[r-k,level,f],[r,level,f+k],[r,level,b-k],
          [r-k,level,b],[l+k,level,b],[l,level,b-k],[l,level,f+k]];
      }
      const layers = [ring(y, bevel), ring(y + bevel, 0),
        ring(y + height - bevel, 0), ring(y + height, bevel)];
      face(layers[0], color);
      face(layers[3].slice().reverse(), color);
      for (let j = 1; j < layers.length; j++) {
        for (let i = 0; i < 8; i++) {
          const k = (i + 1) % 8;
          face([layers[j-1][i],layers[j][i],layers[j][k],layers[j-1][k]], color);
        }
      }
    }

    function loft(rings, color, tilt = 0, offsetX = 0, offsetY = 0) {
      const cos = Math.cos(tilt), sin = Math.sin(tilt);
      const layers = rings.map(([y, width, depth], j) => Array.from({ length: sampleCount }, (_, i) => {
        const a = i * TAU / sampleCount;
        const wave = 1 + .022 * Math.cos(5*a + j*.44) + .012 * Math.sin(9*a - j*.55);
        const x = Math.cos(a) * width * wave;
        return [x * cos - y * sin + offsetX, x * sin + y * cos + offsetY, Math.sin(a) * depth * wave];
      }));
      const normals = rings.map(([, width, depth], j) => layers[j].map((point, i) => {
        const before = layers[j][(i - 1 + sampleCount) % sampleCount];
        const after = layers[j][(i + 1) % sampleCount];
        const low = layers[Math.max(0,j-1)][i], high = layers[Math.min(rings.length-1,j+1)][i];
        const normal = cross(subtract(high, low), subtract(after, before));
        return Math.hypot(...normal) > .001 ? normalized(normal) : normalized([point[0]/width, 0, point[2]/depth]);
      }));
      layers.forEach((ring, j) => {
        if (!j) return;
        const previous = layers[j - 1];
        ring.forEach((point, i) => {
          const k = (i + 1) % sampleCount;
          face([previous[i], ring[i], ring[k], previous[k]], color,
            [normals[j-1][i], normals[j][i], normals[j][k], normals[j-1][k]]);
        });
      });
      face(layers[0], color);
      face(layers.at(-1).slice().reverse(), color);
    }

    function seam(points, color, width = 1) {
      for (let i = 1; i < points.length; i++) {
        faces.push({ points: [points[i - 1], points[i]], color, width });
      }
    }

    function button(x, y, z, radius, color) {
      const ring = Array.from({ length: 18 }, (_, i) => {
        const a = i * TAU / 18;
        return [x + radius * Math.cos(a), y + radius * Math.sin(a), z];
      });
      face(ring, color);
    }

    return { faces, face, block, cartonWall, loft, seam, button };
  }

  function garment(coat) {
    const model = mesh();
    const color = coat ? [116,120,165] : [83,152,165];
    const stitching = coat ? [179,172,211] : [165,208,204];
    const depth = coat ? 18 : 12;
    const hem = coat ? -57 : -48;
    const torso = [
      [hem, 35, depth * .78], [hem + 4, 36, depth * .86],
      [hem + 15, 34.5, depth * .94], [-19, 35, depth],
      [2, 34.8, depth * 1.07], [17, 36, depth * 1.12],
      [31, 39, depth], [40, 40, depth * .82], [45, 34, depth * .72],
      [49, 23, depth * .61], [49, 15, depth * .65], [43, 12, depth * .58]
    ];
    model.loft(torso, color);

    function fabricPoint(x, y, side, offset = 0) {
      const next = torso.findIndex(ring => ring[0] >= y);
      const top = torso[Math.max(1, next)], bottom = torso[Math.max(0, next-1)];
      const t = Math.max(0, Math.min(1, (y-bottom[0])/(top[0]-bottom[0] || 1)));
      const width = bottom[1] + (top[1]-bottom[1])*t;
      const radius = bottom[2] + (top[2]-bottom[2])*t;
      return [x,y,side*(radius*Math.sqrt(Math.max(.02, 1-(x/width)**2)) + offset)];
    }

    function sew(coordinates, side, ink = stitching) {
      const points = [];
      coordinates.forEach(([x,y], i) => {
        if (!i) { points.push(fabricPoint(x,y,side,.55)); return; }
        const [px,py] = coordinates[i-1];
        for (let step = 1; step <= 5; step++) {
          points.push(fabricPoint(px+(x-px)*step/5,py+(y-py)*step/5,side,.55));
        }
      });
      model.seam(points, ink, .85);
    }

    for (const side of [-1, 1]) {
      const length = coat ? 71 : 34;
      const tilt = side * (coat ? .34 : .71);
      const sleeveRings = [[-length, 10, depth * .58], [-length + 4, 11, depth * .63],
        [-length * .55, 13, depth * .72], [0, 15, depth * .8]];
      model.loft(sleeveRings, color, tilt, side * 31, 33);
      model.loft([[-length - 1, 10, depth * .6], [-length + 3, 10.8, depth * .65]],
        stitching, tilt, side * 31, 33);
    }

    // Contrasting binding, curved yoke seams and a small woven care label.
    const binding = coat ? [65,83,121] : [45,107,126];
    model.loft([[hem-1,35,depth*.79],[hem+3,36.2,depth*.85]], binding);
    model.loft([[46,14.5,depth*.62],[49,15.5,depth*.7],[51,14.5,depth*.68],
      [50,11.6,depth*.53],[46,11.5,depth*.52]], binding);
    for (const side of [-1, 1]) {
      sew([[-30,hem+5],[0,hem+5],[30,hem+5]], side);
      sew([[-29,37],[-20,32],[0,29],[20,32],[29,37]], side);
    }
    sew([[0,29],[0,8],[0,-19],[0,hem+7]], -1, binding);
    const tag = [[-6,44],[6,44],[6,40],[-6,40]].map(([x,y]) => fabricPoint(x,y,-1,.9));
    model.face(tag.slice().reverse(), [222,215,181]);

    if (coat) {
      const lapel = [[-17,43],[-6,44],[0,27],[-13,33]];
      for (const side of [-1, 1]) {
        const points = lapel.map(([x,y]) => fabricPoint(x * side,y,1,1.35));
        model.face(side === 1 ? points.slice().reverse() : points, [174,165,201]);
        model.seam([...points, points[0]], [204,195,218], 1);
      }
      model.seam([[0,44,14],[0,30,19],[0,10,21],[0,-18,19],[0,hem+4,15]],
        [56,74,116], 2.2);
      [29, 13, -3, -20].forEach((y, index) => {
        const z = index === 0 ? 19.5 : 21;
        if (index !== 2) {
          model.button(5, y, z, 3.4, [218,180,100]);
          model.button(4, y + 1, z + .15, .7, [84,73,54]);
          model.button(6, y - 1, z + .15, .7, [84,73,54]);
        } else {
          model.seam([[3,y-1,z],[7,y+1,z],[3,y+1,z],[7,y-1,z]], [233,216,176], 1.2);
        }
      });
      for (const side of [-1, 1]) {
        model.seam([[side*15,-21,17],[side*26,-27,13],[side*24,-39,12],
          [side*14,-35,17],[side*15,-21,17]], stitching, 1.15);
      }
    } else {
      const pocket = [[-26,15],[-12,15],[-12,3],[-15,0],[-23,0],[-26,3]];
      model.face(pocket.slice().reverse().map(([x,y]) => fabricPoint(x,y,1,1.25)), [46,111,138]);
      model.seam([...pocket,pocket[0]].map(([x,y]) => fabricPoint(x,y,1,1.55)), stitching, .9);
      model.seam([[-25,12],[-14,12]].map(([x,y]) => fabricPoint(x,y,1,1.7)), [188,223,222], .75);
    }
    return model.faces;
  }

  function game(memory) {
    const model = mesh();
    const base = memory ? [101,132,90] : [165,111,72];
    const rim = memory ? [164,179,132] : [218,171,117];
    const paper = [246,228,192];
    const print = memory ? [87,118,88] : [106,92,126];
    // Open tray: a floor, four walls and raised contents give the box real depth.
    model.cartonWall(-55,-39,-18,110,78,6,base);
    model.cartonWall(-55,-39,-12,110,5,24,rim);
    model.cartonWall(-55,-34,-12,5,68,24,rim);
    model.cartonWall(50,-34,-12,5,68,24,rim);
    if (memory) {
      model.cartonWall(-55,34,-12,110,5,24,rim);
    } else {
      model.cartonWall(-55,34,-12,87,5,24,rim);
      model.block(32,34,-12,23,5,8,base);
      model.face([[32,34,-4],[55,34,-4],[55,34,6],[46,34,1],[39,34,7],[32,34,12]], rim);
    }
    for (const x of [-55.2, 55.2]) {
      model.face([[x,-24,-9],[x,24,-9],[x,24,4],[x,-24,4]], print);
      model.seam([[x,-26,-3],[x,25,-3]], paper, 1.3);
      model.seam([[x,-21,3],[x,19,3]], base, 1);
    }

    for (const y of [-39.1,39.1]) {
      for (let x = -48; x < 49; x += 7) {
        model.seam([[x,y,-11],[x+3,y,-6],[x+6,y,-11]], base, .7);
      }
    }
    if (memory) {
      const occupied = new Set([0,1,3,5,7,8]);
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 4; col++) {
          const x = -45 + col * 24, y = 17 - row * 22;
          if (occupied.has(row * 4 + col)) {
            model.block(x,y,-12,18,17,3,paper);
            const ink = [68,112,91];
            if ((row + col) % 2 === 0) {
              model.button(x+9,y+8,-8.7,4.3,ink);
            } else {
              model.face([[x+9,y+13,-8.7],[x+14,y+8,-8.7],[x+9,y+3,-8.7],[x+4,y+8,-8.7]], ink);
            }
          } else {
            model.seam([[x,y,-11.8],[x+18,y,-11.8],[x+18,y+17,-11.8],[x,y+17,-11.8],[x,y,-11.8]], rim);
          }
        }
      }
    } else {
      for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
          const x = -44 + col * 7.4, y = -29 + row * 7.4;
          const tile = (row + col) % 2 ? [104,75,54] : paper;
          model.face([[x,y,-11.5],[x+7.4,y,-11.5],[x+7.4,y+7.4,-11.5],[x,y+7.4,-11.5]], tile);
        }
      }
      model.block(20,-28,-12,25,55,4,base);
      for (let i = 0; i < 6; i++) {
        const x = 27+(i%2)*11, y = -18+Math.floor(i/2)*15;
        const ink = i%2 ? paper : [79,58,48];
        model.button(x,y,-7.75,4.8,ink);
        model.button(x,y,-7.6,3.25,i%2 ? [190,154,107] : [112,86,64]);
        model.button(x,y,-7.45,2.5,ink);
      }
    }

    // Reverse face: a printed inventory label, miniature board or cards, and barcode.
    model.face([[-46,-29,-18.3],[46,-29,-18.3],[46,29,-18.3],[-46,29,-18.3]], paper);
    model.face([[-46,17,-18.5],[46,17,-18.5],[46,29,-18.5],[-46,29,-18.5]], print);
    for (let i = 0; i < 4; i++) {
      model.seam([[2,10-i*6,-18.7],[38-i*3,10-i*6,-18.7]], base, 1.2);
    }
    for (let i = 0; i < 9; i++) {
      model.seam([[2+i*4,-16,-18.7],[2+i*4,-25,-18.7]], [71,63,48], i%3 ? 1 : 2);
    }
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        const x = -37 + col * 8, y = -20 + row * 8;
        model.face([[x,y,-18.8],[x+7,y,-18.8],[x+7,y+7,-18.8],[x,y+7,-18.8]],
          (row + col) % 2 ? rim : base);
      }
    }
    return model.faces;
  }

  const models = [garment(false), garment(true), game(false), game(true)];

  function drawFlat(canvas, index, yaw, pitch, zoom) {
    const ctx = canvas.getContext("2d");
    const width = canvas.clientWidth, height = canvas.clientHeight;
    if (!width || !height) return;
    const dpi = Math.min(devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(width*dpi) || canvas.height !== Math.round(height*dpi)) {
      canvas.width = Math.round(width*dpi);
      canvas.height = Math.round(height*dpi);
    }
    ctx.setTransform(dpi, 0, 0, dpi, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const scale = Math.min(width,height) / 152 * zoom;
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cx = Math.cos(pitch), sx = Math.sin(pitch);
    function rotate([x,y,z]) {
      const depth = z*cy - x*sy;
      return [x*cy + z*sy, y*cx - depth*sx, y*sx + depth*cx];
    }
    const surfaces = models[index].map(surface => {
      const points = surface.points.map(rotate);
      const z = points.reduce((sum, point) => sum + point[2], 0) / points.length;
      return { ...surface, points, z };
    }).sort((a,b) => a.z-b.z);

    surfaces.forEach(({points,color,width:lineWidth}) => {
      let light = 1;
      if (points.length > 2) {
        const [a,b,c] = points;
        const u = b.map((value,i) => value-a[i]), v = c.map((value,i) => value-a[i]);
        const normal = [u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
        const length = Math.hypot(...normal) || 1;
        const side = normal[2] < 0 ? -1 : 1;
        const key = side * (-.35*normal[0]+.55*normal[1]+.76*normal[2])/length;
        light = key < .05 ? .77 : key < .53 ? .91 : 1.04;
      }
      const ink = `rgb(${color.map(channel => Math.min(255,Math.round(channel*light))).join(",")})`;
      ctx.beginPath();
      points.forEach(([x,y], i) => {
        const px = width/2+x*scale, py = height/2-y*scale;
        if (i === 0) ctx.moveTo(px,py);
        else ctx.lineTo(px,py);
      });
      if (lineWidth) {
        ctx.strokeStyle = ink;
        ctx.lineWidth = lineWidth*scale;
        ctx.lineCap = "round";
        ctx.stroke();
      } else {
        ctx.closePath();
        ctx.fillStyle = ink;
        ctx.fill();
        ctx.strokeStyle = ink;
        ctx.lineWidth = .48;
        ctx.stroke();
      }
    });
  }

  // The depth buffer keeps seams and box contents correctly occluded at every angle.
  const renderers = new WeakMap();

  function vertexData(faces) {
    const triangles = [], lines = [];
    for (const surface of faces) {
      const {points, color, normals} = surface;
      const ink = color.map(value => value / 255);
      if (points.length === 2) {
        points.forEach(point => lines.push(...point, 0, 0, 1, ...ink));
        continue;
      }
      const normal = normalized(cross(subtract(points[1], points[0]), subtract(points[2], points[0])));
      for (let i = 1; i < points.length - 1; i++) {
        [0, i, i + 1].forEach(k => triangles.push(...points[k], ...(normals?.[k] ?? normal), ...ink));
      }
    }
    return { triangles: new Float32Array(triangles), lines: new Float32Array(lines) };
  }

  const geometry = models.map(vertexData);
  const vertex = `
    attribute vec3 aPosition;
    attribute vec3 aNormal;
    attribute vec3 aColor;
    uniform vec2 uYaw;
    uniform vec2 uPitch;
    uniform vec2 uScale;
    varying vec3 vNormal;
    varying vec3 vColor;
    varying vec3 vPosition;
    vec3 turn(vec3 p) {
      float z = p.z * uYaw.x - p.x * uYaw.y;
      return vec3(p.x * uYaw.x + p.z * uYaw.y,
        p.y * uPitch.x - z * uPitch.y, p.y * uPitch.y + z * uPitch.x);
    }
    void main() {
      vec3 p = turn(aPosition);
      float perspective = 1.0 + p.z * .0014;
      gl_Position = vec4(p.xy * uScale * perspective, -p.z / 150.0, 1.0);
      vNormal = turn(aNormal);
      vPosition = aPosition;
      vColor = aColor;
    }
  `;
  const fragment = `
    precision mediump float;
    varying vec3 vNormal;
    varying vec3 vColor;
    varying vec3 vPosition;
    void main() {
      vec3 n = normalize(vNormal);
      float key = dot(n, normalize(vec3(-.5, .65, .65)));
      float shade = .79 + .13 * smoothstep(.02, .09, key)
        + .11 * smoothstep(.51, .57, key);
      float speckle = fract(sin(dot(floor(vPosition * 3.1), vec3(12.98, 27.13, 43.07))) * 4375.85);
      float brush = sin(vPosition.x * .28 + vPosition.y * .09 + vPosition.z * .21);
      vec3 paper = vec3(.99, .93, .83);
      vec3 rgb = mix(vColor * shade, paper, .04 + speckle * .025 + brush * .012);
      gl_FragColor = vec4(rgb, 1.0);
    }
  `;

  function createRenderer(canvas, index) {
    const gl = canvas.getContext("webgl", { alpha: true, antialias: true });
    if (!gl) return null;
    const program = gl.createProgram();
    for (const [type, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]]) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      gl.attachShader(program, shader);
      gl.deleteShader(shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
    gl.useProgram(program);

    const locations = ["aPosition", "aNormal", "aColor"].map(name => gl.getAttribLocation(program, name));
    const yawUniform = gl.getUniformLocation(program, "uYaw");
    const pitchUniform = gl.getUniformLocation(program, "uPitch");
    const scaleUniform = gl.getUniformLocation(program, "uScale");
    const batches = [
      [geometry[index].triangles, gl.TRIANGLES],
      [geometry[index].lines, gl.LINES]
    ].map(([data, mode]) => {
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      return { buffer, mode, count: data.length / 9 };
    });

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.clearColor(0, 0, 0, 0);
    return (yaw, pitch, zoom) => {
      const width = canvas.clientWidth, height = canvas.clientHeight;
      if (!width || !height || gl.isContextLost()) return;
      const dpi = Math.min(devicePixelRatio || 1, 2);
      if (canvas.width !== Math.round(width*dpi) || canvas.height !== Math.round(height*dpi)) {
        canvas.width = Math.round(width*dpi);
        canvas.height = Math.round(height*dpi);
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.uniform2f(yawUniform, Math.cos(yaw), Math.sin(yaw));
      gl.uniform2f(pitchUniform, Math.cos(pitch), Math.sin(pitch));
      const scale = Math.min(width, height) / 77 * zoom;
      gl.uniform2f(scaleUniform, scale / width, scale / height);
      batches.forEach(({buffer, mode, count}) => {
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        locations.forEach((location, i) => {
          gl.enableVertexAttribArray(location);
          gl.vertexAttribPointer(location, 3, gl.FLOAT, false, 36, 12*i);
        });
        gl.drawArrays(mode, 0, count);
      });
    };
  }

  function draw(canvas, index, yaw, pitch, zoom) {
    if (!renderers.has(canvas)) renderers.set(canvas, createRenderer(canvas, index));
    const renderer = renderers.get(canvas);
    if (renderer) renderer(yaw, pitch, zoom);
    else if (canvas.getContext("2d")) drawFlat(canvas, index, yaw, pitch, zoom);
  }

  window.donationModels = { draw };
})();
