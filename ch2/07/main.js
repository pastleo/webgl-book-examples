import { createShader, createProgram, loadImage } from '../../lib/utils.js';
// 導入 matrix3 工具箱
import { matrix3 } from '../../lib/matrix.js';

const vertexShaderSource = `#version 300 es
in vec2 a_position;
in vec2 a_texcoord;

uniform mat3 u_matrix;
out vec2 v_texcoord;

void main() {
  vec3 position = u_matrix * vec3(a_position.xy, 1);
  gl_Position = vec4(position.xy, 0, 1);
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

async function setup() {
  const canvas = document.getElementById('canvas');
  const gl = canvas.getContext('webgl2');

  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
  const program = createProgram(gl, vertexShader, fragmentShader);

  const attributes = {
    position: gl.getAttribLocation(program, 'a_position'),
    texcoord: gl.getAttribLocation(program, 'a_texcoord'),
  };
  const uniforms = {
    matrix: gl.getUniformLocation(program, 'u_matrix'),
    texture: gl.getUniformLocation(program, 'u_texture'),
  };

  const textures = await Promise.all([
    '/assets/cat-1.jpg',
    '/assets/cat-2.jpg',
    '/assets/penguins.jpg',
  ].map(async url => {
    const image = await loadImage(url);
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0, // level
      gl.RGB, // internalFormat
      gl.RGB, // format
      gl.UNSIGNED_BYTE, // type
      image, // data
    );

    gl.generateMipmap(gl.TEXTURE_2D);

    return texture;
  }));

  const buffers = {};

  // a_position
  buffers.position = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position);

  gl.enableVertexAttribArray(attributes.position);
  gl.vertexAttribPointer(
    attributes.position,
    2, // size
    gl.FLOAT, // type
    false, // normalize
    0, // stride
    0, // offset
  );

  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([
      -75, -75, // A
      75, -75, // B
      75, 75, // C

      -75, -75, // D
      75, 75, // E
      -75, 75, // F
    ]),
    gl.STATIC_DRAW,
  );

  // a_texcoord
  buffers.texcoord = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffers.texcoord);

  gl.enableVertexAttribArray(attributes.texcoord);
  gl.vertexAttribPointer(
    attributes.texcoord,
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

  const directionDeg = Math.random() * 2 * Math.PI;

  return {
    gl,
    program, attributes, uniforms,
    buffers, textures,
    state: {
      texture: 0,
      offset: [0, 0],
      direction: [Math.cos(directionDeg), Math.sin(directionDeg)],
      translate: [0, 0],
      scale: 1,
      rotation: 0,
      speed: 0.08,
    },
    time: 0,
  };
}

function render(app) {
  const {
    gl,
    program, uniforms,
    textures,
    state,
  } = app;

  gl.canvas.width = gl.canvas.clientWidth;
  gl.canvas.height = gl.canvas.clientHeight;
  gl.viewport(0, 0, canvas.width, canvas.height);

  gl.useProgram(program);

  // 平移 state.offset * 旋轉 state.rotation * 縮放 state.scale * 平移 state.translate
  const viewMatrix = matrix3.projection(gl.canvas.width, gl.canvas.height);

  // 平移 state.offset * 旋轉 state.rotation * 縮放 state.scale * 平移 state.translate
  const worldMatrix = matrix3.multiply(
    matrix3.translate(...state.offset),
    matrix3.rotate(state.rotation),
    matrix3.scale(state.scale, state.scale),
    matrix3.translate(...state.translate),
  );

  gl.uniformMatrix3fv(
    uniforms.matrix,
    false,
    matrix3.multiply(viewMatrix, worldMatrix),
  );

  // texture uniform
  const textureUnit = 0;
  gl.bindTexture(gl.TEXTURE_2D, textures[state.texture]);
  gl.activeTexture(gl.TEXTURE0 + textureUnit);
  gl.uniform1i(uniforms.texture, textureUnit);

  gl.drawArrays(gl.TRIANGLES, 0, 6);
}

function loop(app, now = 0) {
  const { state, gl } = app;
  const timeDiff = now - app.time;
  app.time = now;

  state.offset = state.offset.map(
    (v, i) => v + state.direction[i] * timeDiff * state.speed
  );
  
  // 碰撞測試
  if (state.offset[0] > gl.canvas.width) {
    state.direction[0] *= -1;
    state.offset[0] = gl.canvas.width;
  } else if (state.offset[0] < 0) {
    state.direction[0] *= -1;
    state.offset[0] = 0;
  }

  if (state.offset[1] > gl.canvas.height) {
    state.direction[1] *= -1;
    state.offset[1] = gl.canvas.height;
  } else if (state.offset[1] < 0) {
    state.direction[1] *= -1;
    state.offset[1] = 0;
  }

  render(app);
  requestAnimationFrame(now => loop(app, now));
}

async function main() {
  const app = await setup();
  window.app = app;
  window.gl = app.gl;

  const controlsForm = document.getElementById('controls');
  controlsForm.addEventListener('input', () => {
    const formData = new FormData(controlsForm);
    app.state.texture = parseInt(formData.get('texture'));
    app.state.speed = parseFloat(formData.get('speed'));
    app.state.translate[0] = parseFloat(formData.get('translate-x'));
    app.state.translate[1] = parseFloat(formData.get('translate-y'));
    app.state.scale = parseFloat(formData.get('scale'));
    app.state.rotation = parseFloat(formData.get('rotation')) * Math.PI / 180;
  });

  loop(app);
}

main();