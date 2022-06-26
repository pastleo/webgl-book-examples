import * as twgl from 'https://unpkg.com/twgl.js@4/dist/4.x/twgl-full.module.js';
import { loadImage } from '../../lib/utils.js';
import { matrix4 } from '../../lib/matrix.js';

const vertexShaderSource = `#version 300 es
in vec4 a_position;
in vec2 a_texcoord;

uniform mat4 u_matrix;

out vec2 v_texcoord;

void main() {
  gl_Position = u_matrix * a_position;
  v_texcoord = vec2(a_texcoord.x, 1.0 - a_texcoord.y);
}
`;

const fragmentShaderSource = `#version 300 es
precision highp float;

in vec2 v_texcoord;

uniform vec3 u_color;
uniform sampler2D u_texture;

out vec4 outColor;

void main() {
  vec3 color = u_color + texture(u_texture, v_texcoord).rgb;
  outColor = vec4(color, 1);
}
`;

const CAMERA_MOVE_SPEED = 0.005;

async function setup() {
  const canvas = document.getElementById('canvas');
  const gl = canvas.getContext('webgl2');

  const program = twgl.createProgram(gl, [vertexShaderSource, fragmentShaderSource]);

  const attributes = {
    position: gl.getAttribLocation(program, 'a_position'),
    texcoord: gl.getAttribLocation(program, 'a_texcoord'),
  };
  const uniforms = {
    matrix: gl.getUniformLocation(program, 'u_matrix'),
    color: gl.getUniformLocation(program, 'u_color'),
    texture: gl.getUniformLocation(program, 'u_texture'),
  };

  const textures = Object.fromEntries(
    await Promise.all(Object.entries({
      wood: '/assets/woodfloor.webp',
      steel: '/assets/steel.webp',
    }).map(async ([name, url]) => {
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
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);

      return [name, texture];
    }))
  );

  const objects = {};

  { // sphere
    const vertexDataArrays = twgl.primitives.deindexVertices(
      twgl.primitives.createSphereVertices(1, 32, 32)
    );
    const numElements = vertexDataArrays.position.length / vertexDataArrays.position.numComponents;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    const buffers = {};

    // a_position
    buffers.position = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position);

    gl.enableVertexAttribArray(attributes.position);
    gl.vertexAttribPointer(
      attributes.position,
      vertexDataArrays.position.numComponents, // size
      gl.FLOAT, // type
      false, // normalize
      0, // stride
      0, // offset
    );

    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array(vertexDataArrays.position),
      gl.STATIC_DRAW,
    );

    // a_texcoord
    buffers.texcoord = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.texcoord);

    gl.enableVertexAttribArray(attributes.texcoord);
    gl.vertexAttribPointer(
      attributes.texcoord,
      vertexDataArrays.texcoord.numComponents, // size
      gl.FLOAT, // type
      false, // normalize
      0, // stride
      0, // offset
    );

    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array(vertexDataArrays.texcoord),
      gl.STATIC_DRAW,
    );

    objects.sphere = {
      vertexDataArrays, numElements,
      vao, buffers,
    };
  }

  { // ground
    const vertexDataArrays = twgl.primitives.deindexVertices(
      twgl.primitives.createPlaneVertices()
    );
    const numElements = vertexDataArrays.position.length / vertexDataArrays.position.numComponents;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    const buffers = {};

    // a_position
    buffers.position = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position);

    gl.enableVertexAttribArray(attributes.position);
    gl.vertexAttribPointer(
      attributes.position,
      vertexDataArrays.position.numComponents, // size
      gl.FLOAT, // type
      false, // normalize
      0, // stride
      0, // offset
    );

    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array(vertexDataArrays.position),
      gl.STATIC_DRAW,
    );

    // a_texcoord
    buffers.texcoord = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.texcoord);

    gl.enableVertexAttribArray(attributes.texcoord);
    gl.vertexAttribPointer(
      attributes.texcoord,
      vertexDataArrays.texcoord.numComponents, // size
      gl.FLOAT, // type
      false, // normalize
      0, // stride
      0, // offset
    );

    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array(vertexDataArrays.texcoord),
      gl.STATIC_DRAW,
    );

    objects.ground = {
      vertexDataArrays, numElements,
      vao, buffers,
    };
  }

  gl.enable(gl.CULL_FACE);
  gl.enable(gl.DEPTH_TEST);

  return {
    gl,
    program, attributes, uniforms,
    textures, objects,
    state: {
      fieldOfView: degToRad(45),
      cameraPosition: [0, 0, 8],
      cameraVelocity: [0, 0, 0],
    },
    time: 0,
  };
}

function render(app) {
  const {
    gl,
    program, uniforms,
    textures, objects,
    state,
  } = app;

  gl.canvas.width = gl.canvas.clientWidth;
  gl.canvas.height = gl.canvas.clientHeight;
  gl.viewport(0, 0, canvas.width, canvas.height);

  gl.useProgram(program);

  const cameraMatrix = matrix4.lookAt(state.cameraPosition, [0, 0, 0], [0, 1, 0]);

  const viewMatrix = matrix4.multiply(
    matrix4.perspective(state.fieldOfView, gl.canvas.width / gl.canvas.height, 0.1, 200),
    matrix4.inverse(cameraMatrix),
  );

  const textureUnit = 0;

  { // sphere
    gl.bindVertexArray(objects.sphere.vao);

    const worldMatrix = matrix4.multiply(
      matrix4.translate(0, 0, 0),
      matrix4.scale(1, 1, 1),
    );

    gl.uniformMatrix4fv(
      uniforms.matrix,
      false,
      matrix4.multiply(viewMatrix, worldMatrix),
    );

    gl.uniform3f(uniforms.color, 0, 0, 0);

    gl.bindTexture(gl.TEXTURE_2D, textures.steel);
    gl.activeTexture(gl.TEXTURE0 + textureUnit);
    gl.uniform1i(uniforms.texture, textureUnit);

    gl.drawArrays(gl.TRIANGLES, 0, objects.sphere.numElements);
  }

  { // ground
    gl.bindVertexArray(objects.ground.vao);

    const worldMatrix = matrix4.multiply(
      matrix4.translate(0, -1, 0),
      matrix4.scale(10, 1, 10),
    );

    gl.uniformMatrix4fv(
      uniforms.matrix,
      false,
      matrix4.multiply(viewMatrix, worldMatrix),
    );

    gl.uniform3f(uniforms.color, 0, 0, 0);

    gl.bindTexture(gl.TEXTURE_2D, textures.wood);
    gl.activeTexture(gl.TEXTURE0 + textureUnit);
    gl.uniform1i(uniforms.texture, textureUnit);

    gl.drawArrays(gl.TRIANGLES, 0, objects.ground.numElements);
  }
}

function startLoop(app, now = 0) {
  const timeDiff = now - app.time;
  app.time = now;

  app.state.cameraPosition[0] += app.state.cameraVelocity[0] * timeDiff;
  app.state.cameraPosition[1] += app.state.cameraVelocity[1] * timeDiff;
  app.state.cameraPosition[2] += app.state.cameraVelocity[2] * timeDiff;

  render(app, timeDiff);
  requestAnimationFrame(now => startLoop(app, now));
}

async function main() {
  const app = await setup();
  window.app = app;
  window.gl = app.gl;

  //const controlsForm = document.getElementById('controls');
  //controlsForm.addEventListener('input', () => {
    //const formData = new FormData(controlsForm);
  //});

  document.addEventListener('keydown', event => {
    handleKeyDown(app, event);
  });
  document.addEventListener('keyup', event => {
    handleKeyUp(app, event);
  });

  app.gl.canvas.addEventListener('mousedown', event => {
    handlePointerDown(app, event);
  });
  app.gl.canvas.addEventListener('mouseup', () => {
    handlePointerUp(app);
  });
  app.gl.canvas.addEventListener('touchstart', event => {
    handlePointerDown(app, event.touches[0]);
  });
  app.gl.canvas.addEventListener('touchend', () => {
    handlePointerUp(app);
  });

  startLoop(app);
}
main();

function degToRad(deg) {
  return deg * Math.PI / 180;
}

function handleKeyDown(app, event) {
  switch (event.code) {
    case 'KeyA':
    case 'ArrowLeft':
      app.state.cameraVelocity[0] = -CAMERA_MOVE_SPEED;
      break;
    case 'KeyD':
    case 'ArrowRight':
      app.state.cameraVelocity[0] = CAMERA_MOVE_SPEED;
      break;
    case 'KeyW':
    case 'ArrowUp':
      app.state.cameraVelocity[1] = CAMERA_MOVE_SPEED;
      break;
    case 'KeyS':
    case 'ArrowDown':
      app.state.cameraVelocity[1] = -CAMERA_MOVE_SPEED;
      break;
  }
}

function handleKeyUp(app, event) {
  switch (event.code) {
    case 'KeyA':
    case 'ArrowLeft':
    case 'KeyD':
    case 'ArrowRight':
      app.state.cameraVelocity[0] = 0;
      break;
    case 'KeyW':
    case 'ArrowUp':
    case 'KeyS':
    case 'ArrowDown':
      app.state.cameraVelocity[1] = 0;
      break;
  }
}

function handlePointerDown(app, touchOrMouseEvent) {
  const x = touchOrMouseEvent.pageX - app.gl.canvas.width / 2;
  const y = touchOrMouseEvent.pageY - app.gl.canvas.height / 2;

  if (x * x > y * y) {
    if (x > 0) {
      app.state.cameraVelocity[0] = CAMERA_MOVE_SPEED;
    } else {
      app.state.cameraVelocity[0] = -CAMERA_MOVE_SPEED;
    }
  } else {
    if (y < 0) {
      app.state.cameraVelocity[1] = CAMERA_MOVE_SPEED;
    } else {
      app.state.cameraVelocity[1] = -CAMERA_MOVE_SPEED;
    }
  }
}

function handlePointerUp(app) {
  app.state.cameraVelocity[0] = 0;
  app.state.cameraVelocity[1] = 0;
  app.state.cameraVelocity[2] = 0;
}