const canvas = document.getElementById('canvas');
const gl = canvas.getContext('webgl2');
window.gl = gl;

canvas.width = canvas.clientWidth;
canvas.height = canvas.clientHeight;
gl.viewport(
  0, // x
  0, // y
  canvas.width, // width
  canvas.height, // height
);

gl.clearColor(108/255, 225/255, 153/255, 1);
gl.clear(gl.COLOR_BUFFER_BIT);

const vertexShaderSource = `#version 300 es
in vec2 a_position;
in vec3 a_color;

uniform vec2 u_resolution;

out vec3 v_color;

void main() {
  gl_Position = vec4(
    a_position / u_resolution * vec2(2, -2) + vec2(-1, 1),
    0, 1
  );
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

const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
const program = createProgram(gl, vertexShader, fragmentShader);

// 編譯並建立 shader 的詳細流程
function createShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  const ok = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
  if (ok) return shader;

  console.log(gl.getShaderInfoLog(shader));
  gl.deleteShader(shader);
}

// 連結 shader 的詳細流程
function createProgram(gl, vertexShader, fragmentShader) {
  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  const ok = gl.getProgramParameter(program, gl.LINK_STATUS);
  if (ok) return program;

  console.log(gl.getProgramInfoLog(program));
  gl.deleteProgram(program);
}

// 取得 位置 attribute a_position 在 program 中的位置
const positionAttributeLocation = gl.getAttribLocation(program, 'a_position');
// 取得 顏色 attribute a_color 在 program 的變數位置
const colorAttributeLocation = gl.getAttribLocation(program, 'a_color');
// 取得 畫布解析度 uniform u_resolution 在 program 中的位置
const resolutionUniformLocation = gl.getUniformLocation(program, 'u_resolution');

const positionBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

gl.enableVertexAttribArray(positionAttributeLocation);

gl.vertexAttribPointer(
  positionAttributeLocation, // index
  2, // size
  gl.FLOAT, // type
  false, // normalize
  0, // stride
  0, // offset
);

gl.bufferData(
  gl.ARRAY_BUFFER,
  new Float32Array([
    150, 60,
    180, 82.5,
    120, 82.5,

    100, 60,
    80, 40,
    120, 40,

    200, 60,
    180, 40,
    220, 40,
  ]),
  gl.STATIC_DRAW,
);

// 對於 attribute a_color 進行『畫什麼』的建立、設定綁定 buffer
const colorBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);

gl.enableVertexAttribArray(colorAttributeLocation);
gl.vertexAttribPointer(
  colorAttributeLocation,
  3, // size
  gl.UNSIGNED_BYTE, // type
  true, // normalize
  0, // stride
  0, // offset
);

// 傳送 a_color 的資料到 buffer 中，為每個頂點指定一個顏色
gl.bufferData(
  gl.ARRAY_BUFFER,
  new Uint8Array([
    121, 85, 72,
    121, 85, 72,
    121, 85, 72,

    0, 76, 213,
    0, 76, 213,
    0, 76, 213,

    0, 0, 0,
    255, 255, 255,
    255, 255, 255,
  ]),
  gl.STATIC_DRAW,
);

console.log({
  positionAttributeLocation, colorAttributeLocation,
  resolutionUniformLocation,
  positionBuffer, colorBuffer
});

// 使用建立好的 program
gl.useProgram(program);

// 設定畫布解析度之 uniform 數值
gl.uniform2f(resolutionUniformLocation, canvas.width, canvas.height);

gl.drawArrays(
  gl.TRIANGLES, // mode
  0, // first
  9, // count
);