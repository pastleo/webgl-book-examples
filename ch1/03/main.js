const canvas = document.getElementById('canvas');
const gl = canvas.getContext('webgl2');
window.gl = gl;

gl.clearColor(108/255, 225/255, 153/255, 1);
gl.clear(gl.COLOR_BUFFER_BIT);

// 把 GLSL 寫的 vertex shader 以 `` 字串包在 Javascript 中：
const vertexShaderSource = `#version 300 es
in vec2 a_position;

void main() {
  gl_Position = vec4(a_position, 0, 1);
}
`;

// 把 GLSL 寫的 fragment shader 以 `` 字串包在 Javascript 中：
const fragmentShaderSource = `#version 300 es
precision highp float;

out vec4 outColor;

void main() {
  outColor = vec4(0.4745, 0.3333, 0.2823, 1);
}
`;

// 編譯並建立 vertexShader
const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
// 編譯並建立 fragmentShader
const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
// 連結 vertex shader 及 fragment shader 獲得 program
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

// 取得一個 attribute 在 program 中的位置
const positionAttributeLocation = gl.getAttribLocation(program, 'a_position');


// 建立並使用 Buffer
const positionBuffer = gl.createBuffer();
// 設定目前使用中的 array buffer
gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

// 啟用 Vertex Attribute Array 這個功能
gl.enableVertexAttribArray(positionAttributeLocation);
// 設定 attribute 拿資料的方法
gl.vertexAttribPointer(
  positionAttributeLocation, // index
  2, // size
  gl.FLOAT, // type
  false, // normalize
  0, // stride
  0, // offset
);

// 對 buffer 輸入三角形頂點的位置資料
gl.bufferData(
  gl.ARRAY_BUFFER,
  new Float32Array([
    0, 0.2,
    0.2, -0.1,
    -0.2, -0.1,
  ]),
  gl.STATIC_DRAW,
);

console.log({
  positionAttributeLocation,
  positionBuffer,
});
// 使用建立好的 program 
gl.useProgram(program);
// 畫出三角形
gl.drawArrays(
  gl.TRIANGLES, // mode
  0, // first
  3, // count
);