import * as twgl from '../../lib/vendor/twgl-full.module.js';
import listenToInputs, { update as inputUpdate } from '../../lib/input.js';
import { loadImage, degToRad } from '../../lib/utils.js';
import { matrix4 } from '../../lib/matrix.js';

const vertexShaderSource = `#version 300 es
in vec4 a_position;
in vec2 a_texcoord;
in vec3 a_normal;

uniform mat4 u_matrix;
uniform mat4 u_worldMatrix;
uniform mat4 u_normalMatrix;
uniform vec3 u_worldViewerPosition;
uniform mat4 u_mirrorMatrix;

out vec2 v_texcoord;
out vec3 v_surfaceToViewer;
out mat3 v_normalMatrix;
out vec4 v_mirrorTexcoord;
out float v_depth;

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

  vec4 worldPosition = u_worldMatrix * a_position;
  v_surfaceToViewer = u_worldViewerPosition - worldPosition.xyz;

  v_mirrorTexcoord = u_mirrorMatrix * worldPosition;

  v_depth = gl_Position.z / gl_Position.w * 0.5 + 0.5;
}
`;

const fragmentShaderSource = `#version 300 es
precision highp float;

in vec2 v_texcoord;
in vec3 v_surfaceToViewer;
in vec3 v_surfaceToLight;
in mat3 v_normalMatrix;
in vec4 v_mirrorTexcoord;

uniform sampler2D u_normalMap;
uniform vec3 u_diffuse;
uniform sampler2D u_diffuseMap;
uniform vec3 u_lightDir;
uniform vec3 u_specular;
uniform float u_specularExponent;
uniform vec3 u_emissive;
uniform vec3 u_ambient;
uniform bool u_useMirrorTexcoord;

out vec4 outColor;

void main() {
  vec2 texcoord = u_useMirrorTexcoord ? (
    (v_mirrorTexcoord.xy / v_mirrorTexcoord.w) * 0.5 + 0.5
  ) : v_texcoord;
  vec3 normal = texture(u_normalMap, v_texcoord).xyz * 2.0 - 1.0;
  normal = normalize(v_normalMatrix * normal);

  vec3 diffuse = u_diffuse + texture(u_diffuseMap, texcoord).rgb;

  vec3 surfaceToLightDir = normalize(-u_lightDir);

  float diffuseLight = clamp(dot(surfaceToLightDir, normal), 0.0, 1.0);

  vec3 surfaceToViewerDirection = normalize(v_surfaceToViewer);

  vec3 halfVector = normalize(surfaceToLightDir + surfaceToViewerDirection);
  float specularBrightness = pow(
    clamp(dot(halfVector, normal), 0.0, 1.0), u_specularExponent
  );

  vec3 ambient = u_ambient * diffuse;

  outColor = vec4(
    clamp(
      diffuse * diffuseLight +
      u_specular * specularBrightness +
      u_emissive,
      ambient, vec3(1, 1, 1)
    ),
    1
  );
}
`;

const depthFragmentShaderSource = `#version 300 es
precision highp float;

in float v_depth;

out vec4 outColor;

void main() {
  outColor = vec4(v_depth, v_depth, v_depth, 1);
}
`;

async function setup() {
  const canvas = document.getElementById('canvas');
  const gl = canvas.getContext('webgl2');

  twgl.setAttributePrefix('a_');

  const programInfo = twgl.createProgramInfo(gl, [vertexShaderSource, fragmentShaderSource]);
  const depthProgramInfo = twgl.createProgramInfo(gl, [vertexShaderSource, depthFragmentShaderSource]);

  const textures = Object.fromEntries(
    await Promise.all(Object.entries({
      scale: '/assets/scale_diffuse.webp',
      scaleNormal: '/assets/scale_normal.webp',
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

  const framebuffers = {};

  framebuffers.mirror = twgl.createFramebufferInfo(
    gl,
    null, // attachments
    2048, // width
    2048, // height
  );
  textures.mirror = framebuffers.mirror.attachments[0];

  framebuffers.lightProjection = twgl.createFramebufferInfo(gl, [{
    attachmentPoint: gl.DEPTH_ATTACHMENT,
    internalFormat: gl.DEPTH_COMPONENT32F,
    minMag: gl.NEAREST,
  }], 2048, 2048);
  textures.lightProjection = framebuffers.lightProjection.attachments[0];

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
  gl.clearColor(1, 1, 1, 1);

  return {
    gl,
    programInfo, depthProgramInfo,
    textures, framebuffers, objects,
    state: {
      fieldOfView: degToRad(45),
      cameraRotationXY: [degToRad(-45), 0],
      cameraDistance: 15,
      cameraViewing: [0, 0, 0],
      lightRotationXY: [0, 0],
    },
    time: 0,
  };
}

function renderSphere(app, viewMatrix, programInfo) {
  const {
    gl,
    textures, objects,
  } = app;

  gl.bindVertexArray(objects.sphere.vao);

  const worldMatrix = matrix4.multiply(
    matrix4.translate(0, 1, 0),
    matrix4.scale(1, 1, 1),
  );

  twgl.setUniforms(programInfo, {
    u_matrix: matrix4.multiply(viewMatrix, worldMatrix),
    u_worldMatrix: worldMatrix,
    u_normalMatrix: matrix4.transpose(matrix4.inverse(worldMatrix)),
    u_normalMap: textures.scaleNormal,
    u_diffuse: [0, 0, 0],
    u_diffuseMap: textures.scale,
    u_specularExponent: 40,
    u_emissive: [0.15, 0.15, 0.15],
  });

  twgl.drawBufferInfo(gl, objects.sphere.bufferInfo);
}

function renderGround(app, viewMatrix, mirrorViewMatrix, programInfo) {
  const {
    gl,
    textures, objects,
  } = app;

  gl.bindVertexArray(objects.ground.vao);

  const worldMatrix = matrix4.multiply(
    matrix4.translate(0, 0, 0),
    matrix4.scale(10, 1, 10),
  );

  twgl.setUniforms(programInfo, {
    u_matrix: matrix4.multiply(viewMatrix, worldMatrix),
    u_worldMatrix: worldMatrix,
    u_normalMatrix: matrix4.transpose(matrix4.inverse(worldMatrix)),
    u_normalMap: textures.nullNormal,
    u_diffuse: [0, 0, 0],
    u_diffuseMap: textures.mirror,
    u_specularExponent: 200,
    u_emissive: [0, 0, 0],
    u_useMirrorTexcoord: true,
    u_mirrorMatrix: mirrorViewMatrix,
  });

  twgl.drawBufferInfo(gl, objects.ground.bufferInfo);

  twgl.setUniforms(programInfo, {
    u_useMirrorTexcoord: false,
  });
}

function render(app) {
  const {
    gl,
    programInfo,
    depthProgramInfo,
    framebuffers,
    state,
  } = app;

  gl.useProgram(programInfo.program);

  const cameraMatrix = matrix4.multiply(
    matrix4.translate(...state.cameraViewing),
    matrix4.yRotate(state.cameraRotationXY[1]),
    matrix4.xRotate(state.cameraRotationXY[0]),
    matrix4.translate(0, 0, state.cameraDistance),
  );

  const viewMatrix = matrix4.multiply(
    matrix4.perspective(state.fieldOfView, gl.canvas.width / gl.canvas.height, 0.1, 2000),
    matrix4.inverse(cameraMatrix),
  );

  const mirrorCameraMatrix = matrix4.multiply(
    matrix4.translate(...state.cameraViewing),
    matrix4.yRotate(state.cameraRotationXY[1]),
    matrix4.xRotate(-state.cameraRotationXY[0]),
    matrix4.translate(0, 0, state.cameraDistance),
  );

  const mirrorViewMatrix = matrix4.multiply(
    matrix4.perspective(state.fieldOfView, gl.canvas.width / gl.canvas.height, 0.1, 2000),
    matrix4.inverse(mirrorCameraMatrix),
  );

  const lightProjectionViewMatrix = matrix4.multiply(
    matrix4.translate(1, -1, 0),
    matrix4.projection(20, 20, 10),
    [ // shearing
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, Math.tan(state.lightRotationXY[0]), 1, 0,
      0, 0, 0, 1,
    ],
    matrix4.inverse(
      matrix4.multiply(
        matrix4.yRotate(state.lightRotationXY[1]),
        matrix4.xRotate(degToRad(90)),
      )
    ),
  );

  twgl.setUniforms(programInfo, {
    u_worldViewerPosition: cameraMatrix.slice(12, 15),
    u_lightDir: [
      -1 * Math.sin(state.lightRotationXY[0]) * Math.sin(state.lightRotationXY[1]),
      -1 * Math.cos(state.lightRotationXY[0]),
      -1 * Math.sin(state.lightRotationXY[0]) * Math.cos(state.lightRotationXY[1]),
    ],
    u_specular: [1, 1, 1],
    u_ambient: [0.4, 0.4, 0.4],
  });

  twgl.bindFramebufferInfo(gl, framebuffers.mirror);

  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  renderSphere(app, mirrorViewMatrix, programInfo);

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  gl.canvas.width = gl.canvas.clientWidth;
  gl.canvas.height = gl.canvas.clientHeight;
  gl.viewport(0, 0, canvas.width, canvas.height);

  gl.useProgram(depthProgramInfo.program);

  renderGround(app, lightProjectionViewMatrix, mirrorViewMatrix, depthProgramInfo);
  renderSphere(app, lightProjectionViewMatrix, depthProgramInfo);
}

function startLoop(app, now = 0) {
  const timeDiff = now - app.time;
  app.time = now;

  inputUpdate(app.input, app.state);

  app.state.lightRotationXY[0] = Math.sin(now * 0.00041) * degToRad(45);
  app.state.lightRotationXY[1] = now * 0.00037;

  render(app, timeDiff);
  requestAnimationFrame(now => startLoop(app, now));
}

async function main() {
  const app = await setup();
  window.app = app;
  window.gl = app.gl;

  app.input = listenToInputs(app.gl.canvas, app.state);

  startLoop(app);
}
main();
