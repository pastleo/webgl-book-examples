import { createShader, createProgram, degToRad } from '../../lib/utils.js';
import { matrix4 } from '../../lib/matrix.js';

const vertexShaderSource = `#version 300 es
in vec4 a_position;
in vec3 a_color;

uniform mat4 u_matrix;
out vec3 v_color;

void main() {
  gl_Position = u_matrix * a_position;
  v_color = a_color;
}
`;

const fragmentShaderSource = `#version 300 es
precision highp float;

in vec3 v_color;
out vec4 outColor;

void main() {
  outColor = vec4(v_color, 1);
}
`;

async function setup() {
  const canvas = document.getElementById('canvas');
  const gl = canvas.getContext('webgl2');

  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
  const program = createProgram(gl, vertexShader, fragmentShader);

  const attributes = {
    position: gl.getAttribLocation(program, 'a_position'),
    color: gl.getAttribLocation(program, 'a_color'),
  };
  const uniforms = {
    matrix: gl.getUniformLocation(program, 'u_matrix'),
  };

  const modelBufferArrays = createModelBufferArrays();

  const buffers = {};

  // a_position
  buffers.position = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position);

  gl.enableVertexAttribArray(attributes.position);
  gl.vertexAttribPointer(
    attributes.position,
    3, // size
    gl.FLOAT, // type
    false, // normalize
    0, // stride
    0, // offset
  );

  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array(modelBufferArrays.vertexDataArrays.a_position),
    gl.STATIC_DRAW,
  );

  // a_color
  buffers.position = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position);

  gl.enableVertexAttribArray(attributes.color);
  gl.vertexAttribPointer(
    attributes.color,
    3, // size
    gl.FLOAT, // type
    false, // normalize
    0, // stride
    0, // offset
  );

  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array(modelBufferArrays.vertexDataArrays.a_color),
    gl.STATIC_DRAW,
  );

  return {
    gl,
    program, attributes, uniforms,
    buffers, modelBufferArrays,
    state: {  // 初始 tranform 值
      projectionZ: 400,
      translate: [150, 100, 0],
      rotate: [degToRad(30), degToRad(30), degToRad(0)],
      scale: [1, 1, 1],
    },
    time: 0,
  };
}

//  create attribute buffer 
function createModelBufferArrays() {
  // positions
  const a = 40, b = 200, c = 60, d = 45;

  const points = [0, d].flatMap(z => ([
    [0, 0, z], // 0, 13
    [0, b, z],
    [a, b, z],
    [a, 0, z],
    [2*a+c, 0, z], // 4, 17
    [a, a, z],
    [2*a+c, a, z],
    [a, 2*a, z],
    [2*a+c, 2*a, z], // 8, 21
    [a, 3*a, z],
    [2*a+c, 3*a, z],
    [a+c, a, z],
    [a+c, 2*a, z], // 12, 25
  ]));

  const a_position = [
    ...rectVertices(points[0], points[1], points[2], points[3]), // 0
    ...rectVertices(points[3], points[5], points[6], points[4]),
    ...rectVertices(points[7], points[9], points[10], points[8]),
    ...rectVertices(points[11], points[12], points[8], points[6]),
    ...rectVertices(points[13], points[16], points[15], points[14]), // 4
    ...rectVertices(points[16], points[17], points[19], points[18]),
    ...rectVertices(points[20], points[21], points[23], points[22]),
    ...rectVertices(points[24], points[19], points[21], points[25]),
    ...rectVertices(points[0], points[13], points[14], points[1]), // 8
    ...rectVertices(points[0], points[4], points[17], points[13]),
    ...rectVertices(points[4], points[10], points[23], points[17]),
    ...rectVertices(points[9], points[22], points[23], points[10]),
    ...rectVertices(points[9], points[2], points[15], points[22]), // 12
    ...rectVertices(points[2], points[1], points[14], points[15]),
    ...rectVertices(points[5], points[7], points[20], points[18]),
    ...rectVertices(points[5], points[18], points[24], points[11]),
    ...rectVertices(points[11], points[24], points[25], points[12]), // 16
    ...rectVertices(points[7], points[12], points[25], points[20]),
  ];

  // a_color
  const frontColor = [108/255, 225/255, 153/255];
  const backColor = randomColor();
  const a_color = [
    ...rectColor(frontColor), // 0
    ...rectColor(frontColor),
    ...rectColor(frontColor),
    ...rectColor(frontColor),
    ...rectColor(backColor), // 4
    ...rectColor(backColor),
    ...rectColor(backColor),
    ...rectColor(backColor),
    ...rectColor(randomColor()), // 8
    ...rectColor(randomColor()),
    ...rectColor(randomColor()),
    ...rectColor(randomColor()),
    ...rectColor(randomColor()), // 12
    ...rectColor(randomColor()),
    ...rectColor(randomColor()),
    ...rectColor(randomColor()),
    ...rectColor(randomColor()), // 16
    ...rectColor(randomColor()),
  ];

  return {
    numElements: a_position.length / 3,
    vertexDataArrays: {
      a_position, a_color,
    },
  };
}

// 接受四個頂點座標，產生兩個三角形的工具
function rectVertices(a, b, c, d) {
  return [
    ...a, ...b, ...c,
    ...a, ...c, ...d,
  ];
}

// 指定長方形色塊的顏色
function rectColor(color) {
  return Array(6).fill(color).flat();
}

// 產生隨機顏色
function randomColor() {
  return [Math.random(), Math.random(), Math.random()];
}

function render(app) {
  const {
    gl,
    program, uniforms,
    modelBufferArrays,
    state,
  } = app;

  gl.canvas.width = gl.canvas.clientWidth;
  gl.canvas.height = gl.canvas.clientHeight;
  gl.viewport(0, 0, canvas.width, canvas.height);

  gl.useProgram(program);
  
  // 只繪製正面面向觀看者的三角形
  gl.enable(gl.CULL_FACE);
  // 深度測試 
  gl.enable(gl.DEPTH_TEST);

  // orthogonal projection
  const viewMatrix = matrix4.projection(gl.canvas.width, gl.canvas.height, state.projectionZ);
  const worldMatrix = matrix4.multiply(
    matrix4.translate(...state.translate),
    matrix4.xRotate(state.rotate[0]),
    matrix4.yRotate(state.rotate[1]),
    matrix4.zRotate(state.rotate[2]),
    matrix4.scale(...state.scale),
  );

  gl.uniformMatrix4fv(
    uniforms.matrix,
    false,
    matrix4.multiply(viewMatrix, worldMatrix),
  );

  gl.drawArrays(gl.TRIANGLES, 0, modelBufferArrays.numElements);
}

// function startLoop(app, now = 0) {
//   const timeDiff = now - app.time;
//   app.time = now;

//   render(app, timeDiff);
//   requestAnimationFrame(now => startLoop(app, now));
// }

async function main() {
  const app = await setup();
  window.app = app;
  window.gl = app.gl;

  const controlsForm = document.getElementById('controls');
  controlsForm.addEventListener('input', () => {
    const formData = new FormData(controlsForm);

    app.state.projectionZ = parseFloat(formData.get('projection-z'));
    app.state.translate[0] = parseFloat(formData.get('translate-x'));
    app.state.translate[1] = parseFloat(formData.get('translate-y'));
    app.state.translate[2] = parseFloat(formData.get('translate-z'));
    app.state.rotate[0] = degToRad(parseFloat(formData.get('rotation-x')));
    app.state.rotate[1] = degToRad(parseFloat(formData.get('rotation-y')));
    app.state.rotate[2] = degToRad(parseFloat(formData.get('rotation-z')));
    app.state.scale[0] = parseFloat(formData.get('scale-x'));
    app.state.scale[1] = parseFloat(formData.get('scale-y'));
    app.state.scale[2] = parseFloat(formData.get('scale-z'));

    render(app);
  });

  // startLoop(app);
  render(app);
}
main();