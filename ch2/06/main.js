import { createShader, createProgram, loadImage } from '../../lib/utils.js';

const matrix3 = {
  multiply: (a, b) => ([
    a[0]*b[0] + a[3]*b[1] + a[6]*b[2], /**/ a[1]*b[0] + a[4]*b[1] + a[7]*b[2], /**/ a[2]*b[0] + a[5]*b[1] + a[8]*b[2],
    a[0]*b[3] + a[3]*b[4] + a[6]*b[5], /**/ a[1]*b[3] + a[4]*b[4] + a[7]*b[5], /**/ a[2]*b[3] + a[5]*b[4] + a[8]*b[5],
    a[0]*b[6] + a[3]*b[7] + a[6]*b[8], /**/ a[1]*b[6] + a[4]*b[7] + a[7]*b[8], /**/ a[2]*b[6] + a[5]*b[7] + a[8]*b[8],
  ]),

  translate: (x, y) => ([
    1, 0, 0,
    0, 1, 0,
    x, y, 1,
  ]),

  scale: (sx, sy) => ([
    sx, 0,  0,
    0,  sy, 0,
    0,  0,  1,
  ]),

  projection: (width, height) => (
    matrix3.multiply(
      matrix3.translate(-1, 1),
      matrix3.scale(2 / width, -2 / height),
    )
  ),
};

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
      0, 0, // A
      150, 0, // B
      150, 150, // C

      0, 0, // D
      150, 150, // E
      0, 150, // F
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

  const viewMatrix = matrix3.projection(gl.canvas.width, gl.canvas.height);
  const worldMatrix = matrix3.translate(...state.offset);

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

  if (state.offset[0] + 150 > gl.canvas.width) {
    state.direction[0] *= -1;
    state.offset[0] = gl.canvas.width - 150;
  } else if (state.offset[0] < 0) {
    state.direction[0] *= -1;
    state.offset[0] = 0;
  }

  if (state.offset[1] + 150 > gl.canvas.height) {
    state.direction[1] *= -1;
    state.offset[1] = gl.canvas.height - 150;
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
  });

  loop(app);
}

main();