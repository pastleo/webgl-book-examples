import * as twgl from 'https://unpkg.com/twgl.js@4/dist/4.x/twgl-full.module.js';
import { loadImage } from '../../lib/utils.js';
import { matrix4 } from '../../lib/matrix.js';

const vertexShaderSource = `#version 300 es
in vec4 a_position;
in vec2 a_texcoord;
in vec3 a_normal;

uniform mat4 u_matrix;
uniform mat4 u_worldMatrix;
uniform mat4 u_normalMatrix;
uniform vec3 u_worldViewerPosition;
uniform vec3 u_worldLightPosition;

out vec2 v_texcoord;
out vec3 v_surfaceToViewer;
out vec3 v_surfaceToLight;
out mat3 v_normalMatrix;

void main() {
  gl_Position = u_matrix * a_position;
  v_texcoord = vec2(a_texcoord.x, 1.0 - a_texcoord.y);

  vec3 normal = mat3(u_normalMatrix) * a_normal;
  vec3 normalMatrixI = normal.y >= 1.0 ?
    vec3(1, 0, 0) :
    normalize(cross(vec3(0, 1, 0), normal));
  vec3 normalMatrixJ = normalize(cross(normal, normalMatrixI));

  v_normalMatrix = mat3(
    normalMatrixI,
    normalMatrixJ,
    normal
  );

  vec3 worldPosition = (u_worldMatrix * a_position).xyz;
  v_surfaceToViewer = u_worldViewerPosition - worldPosition;

  v_surfaceToLight = u_worldLightPosition - worldPosition;
}
`;

const fragmentShaderSource = `#version 300 es
precision highp float;

in vec2 v_texcoord;
in vec3 v_surfaceToViewer;
in vec3 v_surfaceToLight;
in mat3 v_normalMatrix;

uniform vec3 u_color;
uniform sampler2D u_texture;
uniform vec3 u_specular;
uniform float u_specularExponent;
uniform vec3 u_emissive;
uniform sampler2D u_normalMap;

out vec4 outColor;

void main() {
  vec3 color = u_color + texture(u_texture, v_texcoord).rgb;

  vec3 normal = texture(u_normalMap, v_texcoord).xyz * 2.0 - 1.0;
  normal = normalize(v_normalMatrix * normal);

  vec3 surfaceToLightDir = normalize(v_surfaceToLight);

  float colorLight = clamp(dot(surfaceToLightDir, normal), 0.0, 1.0);

  vec3 surfaceToViewerDirection = normalize(v_surfaceToViewer);

  vec3 halfVector = normalize(surfaceToLightDir + surfaceToViewerDirection);
  float specularBrightness = pow(
    clamp(dot(halfVector, normal), 0.0, 1.0), u_specularExponent
  );

  outColor = vec4(
    color * colorLight +
    u_specular * specularBrightness +
    u_emissive,
    1
  );
}
`;

const CAMERA_MOVE_SPEED = 0.005;

async function setup() {
  const canvas = document.getElementById('canvas');
  const gl = canvas.getContext('webgl2');

  twgl.setAttributePrefix('a_');

  const programInfo = twgl.createProgramInfo(gl, [vertexShaderSource, fragmentShaderSource]);

  const textures = Object.fromEntries(
    await Promise.all(Object.entries({
      wood: '/assets/woodfloor.webp',
      steel: '/assets/steel.webp',
      woodNormal: '/assets/woodfloor_normal.webp',
      steelNormal: '/assets/steel_normal.webp',
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

  textures.null = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, textures.null);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0, // level
    gl.RGB, // internalFormat
    1, 1, 0, // width, height, border
    gl.RGB, // format
    gl.UNSIGNED_BYTE, // type
    new Uint8Array([0, 0, 0, 255]), // data
  );

  textures.nullNormal = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, textures.nullNormal);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0, // level
    gl.RGBA, // internalFormat
    1, // width
    1, // height
    0, // border
    gl.RGBA, // format
    gl.UNSIGNED_BYTE, // type
    new Uint8Array([
      127, 127, 255, 255
    ])
  );

  const objects = {};

  { // sphere
    const vertexDataArrays = twgl.primitives.createSphereVertices(1, 32, 32);
    const bufferInfo = twgl.createBufferInfoFromArrays(gl, vertexDataArrays);
    const vao = twgl.createVAOFromBufferInfo(gl, programInfo, bufferInfo);

    objects.sphere = {
      vertexDataArrays,
      vao, bufferInfo,
    };
  }

  { // ground
    const vertexDataArrays = twgl.primitives.createPlaneVertices();
    const bufferInfo = twgl.createBufferInfoFromArrays(gl, vertexDataArrays);
    const vao = twgl.createVAOFromBufferInfo(gl, programInfo, bufferInfo);

    objects.ground = {
      vertexDataArrays,
      vao, bufferInfo,
    };
  }

  gl.enable(gl.CULL_FACE);
  gl.enable(gl.DEPTH_TEST);

  return {
    gl,
    programInfo,
    textures, objects,
    state: {
      fieldOfView: degToRad(45),
      cameraPosition: [0, 0, 8],
      cameraVelocity: [0, 0, 0],
      sphereScaleX: 1,
      lightPosition: [0, 2, 0],
      specular: [1, 1, 1],
      sphereSpecularExponent: 40,
      groundSpecularExponent: 100,
    },
    time: 0,
  };
}

function render(app) {
  const {
    gl,
    programInfo,
    textures, objects,
    state,
  } = app;

  gl.canvas.width = gl.canvas.clientWidth;
  gl.canvas.height = gl.canvas.clientHeight;
  gl.viewport(0, 0, canvas.width, canvas.height);

  gl.useProgram(programInfo.program);

  const cameraMatrix = matrix4.lookAt(state.cameraPosition, [0, 0, 0], [0, 1, 0]);

  const viewMatrix = matrix4.multiply(
    matrix4.perspective(state.fieldOfView, gl.canvas.width / gl.canvas.height, 0.1, 200),
    matrix4.inverse(cameraMatrix),
  );

  twgl.setUniforms(programInfo, {
    u_worldViewerPosition: state.cameraPosition,
    u_worldLightPosition: state.lightPosition,
    u_specular: state.specular,
  });

  { // sphere
    gl.bindVertexArray(objects.sphere.vao);

    const worldMatrix = matrix4.multiply(
      matrix4.translate(0, 0, 0),
      matrix4.scale(state.sphereScaleX, 1, 1),
    );

    twgl.setUniforms(programInfo, {
      u_matrix: matrix4.multiply(viewMatrix, worldMatrix),
      u_worldMatrix: worldMatrix,
      u_normalMatrix: matrix4.transpose(matrix4.inverse(worldMatrix)),
      u_color: [0, 0, 0],
      u_texture: textures.steel,
      u_specularExponent: state.sphereSpecularExponent,
      u_emissive: [0.15, 0.15, 0.15],
      u_normalMap: textures.steelNormal,
    });

    twgl.drawBufferInfo(gl, objects.sphere.bufferInfo);
  }

  { // ground
    gl.bindVertexArray(objects.ground.vao);

    const worldMatrix = matrix4.multiply(
      matrix4.translate(0, -1, 0),
      matrix4.scale(10, 1, 10),
    );

    twgl.setUniforms(programInfo, {
      u_matrix: matrix4.multiply(viewMatrix, worldMatrix),
      u_worldMatrix: worldMatrix,
      u_normalMatrix: matrix4.transpose(matrix4.inverse(worldMatrix)),
      u_color: [0, 0, 0],
      u_texture: textures.wood,
      u_specularExponent: state.groundSpecularExponent,
      u_emissive: [0, 0, 0],
      u_normalMap: textures.woodNormal,
    });

    twgl.drawBufferInfo(gl, objects.ground.bufferInfo);
  }

  { // light bulb
    gl.bindVertexArray(objects.sphere.vao);

    const worldMatrix = matrix4.multiply(
      matrix4.translate(...state.lightPosition),
      matrix4.scale(0.1, 0.1, 0.1),
    );

    twgl.setUniforms(programInfo, {
      u_matrix: matrix4.multiply(viewMatrix, worldMatrix),
      u_worldMatrix: worldMatrix,
      u_normalMatrix: matrix4.transpose(matrix4.inverse(worldMatrix)),
      u_color: [0, 0, 0],
      u_texture: textures.null,
      u_specularExponent: 1000,
      u_emissive: [1, 1, 0],
      u_normalMap: textures.nullNormal,
    });

    twgl.drawBufferInfo(gl, objects.sphere.bufferInfo);
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

  const controlsForm = document.getElementById('controls');
  controlsForm.addEventListener('input', () => {
    const formData = new FormData(controlsForm);

    app.state.lightPosition[0] = parseFloat(formData.get('light-pos-x'));
    app.state.lightPosition[1] = parseFloat(formData.get('light-pos-y'));
    app.state.lightPosition[2] = parseFloat(formData.get('light-pos-z'));

    app.state.sphereScaleX = parseFloat(formData.get('sphere-scale-x'));

    app.state.specular = formData.get('specular').match(/#(\w{2})(\w{2})(\w{2})/).slice(1,4).map(c => parseInt(c, 16) / 256);

    app.state.sphereSpecularExponent = parseFloat(formData.get('sphere-specular-exponent'));
    app.state.groundSpecularExponent = parseFloat(formData.get('ground-specular-exponent'));
  });

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