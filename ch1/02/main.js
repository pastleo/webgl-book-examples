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

  // 設定 shader 原始碼，也就是上面用 `` 包起來的 GLSL 程式：
  gl.shaderSource(shader, source);

  gl.compileShader(shader); // 編譯 shader

  // 檢查編譯狀況
  const ok = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
  if (ok) return shader; // 如果成功才回傳 shader

  // 如果編譯過程有出問題，將問題顯示在 Console 上
  console.log(gl.getShaderInfoLog(shader));
  gl.deleteShader(shader);
}

// 連結 shader 的詳細流程
function createProgram(gl, vertexShader, fragmentShader) {
  const program = gl.createProgram();

  // 設定 vertex shader 到新建立的 program：
  gl.attachShader(program, vertexShader);

  // 設定 fragment shader 到新建立的 program：
  gl.attachShader(program, fragmentShader);

  gl.linkProgram(program); // 連結 shader

  // 檢查連結狀況
  const ok = gl.getProgramParameter(program, gl.LINK_STATUS);
  if (ok) return program; // 如果成功才回傳 program

  // 如果連結過程有出問題，將問題顯示在 Console 上
  console.log(gl.getProgramInfoLog(program));
  gl.deleteProgram(program);
}

// 將建立好的 vertexShader、fragmentShader、program 印在 console 上
console.log({
  vertexShader,
  fragmentShader,
  program,
});