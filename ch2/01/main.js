// 來自工具箱的 async function : createShader, createProgram, loadImage
import { createShader, createProgram, loadImage } from '../../lib/utils.js';

const vertexShaderSource = `#version 300 es
in vec2 a_position;
in vec2 a_texcoord;

uniform vec2 u_resolution;
out vec2 v_texcoord;

void main() {
  gl_Position = vec4(
    a_position / u_resolution * vec2(2, -2) + vec2(-1, 1),
    0, 1
  );
  v_texcoord = a_texcoord;
}
`;

const fragmentShaderSource = `#version 300 es
precision highp float;

in vec2 v_texcoord;

uniform sampler2D u_texture;

out vec4 outColor;

void main() {
  outColor = texture(u_texture, v_texcoord);
}
`;

async function main() {
  const canvas = document.getElementById('canvas');
  const gl = canvas.getContext('webgl2');
  window.gl = gl;

  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;
  gl.viewport(0, 0, canvas.width, canvas.height);

  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
  const program = createProgram(gl, vertexShader, fragmentShader);

  const positionAttributeLocation = gl.getAttribLocation(program, 'a_position');
  // 取得 a_texcorrd attribute 位置
  const texcoordAttributeLocation = gl.getAttribLocation(program, 'a_texcoord');
  const resolutionUniformLocation = gl.getUniformLocation(program, 'u_resolution');
  // 取得 texture 的 uniform 位置
  const textureUniformLocation = gl.getUniformLocation(program, 'u_texture');

  // 呼叫圖片
  const image = await loadImage('/assets/pastleo.jpg');
  // 建立 texture
  const texture = gl.createTexture();
  // 對準 texture
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0, // level
    gl.RGB, // internalFormat
    gl.RGB, // format
    gl.UNSIGNED_BYTE, // type
    image, // data
  );

  // 把各個尺寸的縮圖做好放在記憶體裡
  gl.generateMipmap(gl.TEXTURE_2D);

  // a_position
  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

  gl.enableVertexAttribArray(positionAttributeLocation);
  gl.vertexAttribPointer(
    positionAttributeLocation,
    2, // size
    gl.FLOAT, // type
    false, // normalize
    0, // stride
    0, // offset
  );

  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([
      100, 50, // A
      250, 50, // B
      250, 200, // C

      100, 50, // D
      250, 200, // E
      100, 200, // F
    ]),
    gl.STATIC_DRAW,
  );

  // 建立 a_texcoord buffer
  const texcoordBuffer = gl.createBuffer();
  // 設定 vertex attribute array
  gl.bindBuffer(gl.ARRAY_BUFFER, texcoordBuffer);

  
  gl.enableVertexAttribArray(texcoordAttributeLocation);
  gl.vertexAttribPointer(
    texcoordAttributeLocation,
    2, // size
    gl.FLOAT, // type
    false, // normalize
    0, // stride
    0, // offset
  );

  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([
      0, 0, // A
      1, 0, // B
      1, 1, // C

      0, 0, // D
      1, 1, // E
      0, 1, // F
    ]),
    gl.STATIC_DRAW,
  );

  gl.useProgram(program);

  gl.uniform2f(resolutionUniformLocation, canvas.width, canvas.height);

  // 通道的編號， 0 使用為第一個通道
  const textureUnit = 0;
  // 把目標指向建立好的 texture
  gl.bindTexture(gl.TEXTURE_2D, texture);
  // 啟用通道並把目標 texture 設定到通道上
  gl.activeTexture(gl.TEXTURE0 + textureUnit);
  gl.uniform1i(textureUniformLocation, textureUnit);

  gl.drawArrays(gl.TRIANGLES, 0, 6);
}

main();
