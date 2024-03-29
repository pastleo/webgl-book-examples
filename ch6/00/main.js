import * as twgl from '../../lib/vendor/twgl-full.module.js';
import listenToInputs, { update as inputUpdate } from '../../lib/input.js';
import { degToRad } from '../../lib/utils.js';
import { matrix4 } from '../../lib/matrix.js';

const vertexShaderSource = `#version 300 es
in vec4 a_position;
in vec2 a_texcoord;
in vec3 a_normal;

uniform mat4 u_matrix;
uniform mat4 u_worldMatrix;
uniform mat4 u_normalMatrix;
uniform vec3 u_worldViewerPosition;
uniform mat4 u_reflectionMatrix;
uniform mat4 u_lightProjectionMatrix;

out vec2 v_texcoord;
out vec3 v_surfaceToViewer;
out mat3 v_normalMatrix;
out vec4 v_reflectionTexcoord;
out float v_depth;
out vec4 v_lightProjection;
out vec4 v_worldPosition;

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

  v_worldPosition = u_worldMatrix * a_position;
  v_surfaceToViewer = u_worldViewerPosition - v_worldPosition.xyz;

  v_reflectionTexcoord = u_reflectionMatrix * v_worldPosition;

  v_depth = gl_Position.z / gl_Position.w * 0.5 + 0.5;
  v_lightProjection = u_lightProjectionMatrix * v_worldPosition;
}
`;

const fragmentShaderSource = `#version 300 es
precision highp float;

in vec2 v_texcoord;
in vec3 v_surfaceToViewer;
in vec3 v_surfaceToLight;
in mat3 v_normalMatrix;
in vec4 v_lightProjection;

uniform sampler2D u_normalMap;
uniform vec3 u_diffuse;
uniform sampler2D u_diffuseMap;
uniform vec3 u_lightDir;
uniform vec3 u_specular;
uniform float u_specularExponent;
uniform vec3 u_emissive;
uniform vec3 u_ambient;
uniform sampler2D u_lightProjectionMap;

out vec4 outColor;

void main() {
  vec3 normal = texture(u_normalMap, v_texcoord).xyz * 2.0 - 1.0;
  normal = normalize(v_normalMatrix * normal);

  vec2 lightProjectionCoord = v_lightProjection.xy / v_lightProjection.w * 0.5 + 0.5;
  float lightToSurfaceDepth = v_lightProjection.z / v_lightProjection.w * 0.5 + 0.5;
  float lightProjectedDepth = texture(
    u_lightProjectionMap,
    lightProjectionCoord
  ).r;

  vec3 diffuse = u_diffuse + texture(u_diffuseMap, v_texcoord).rgb;

  vec3 surfaceToLightDir = normalize(-u_lightDir);

  float diffuseLight = clamp(dot(surfaceToLightDir, normal), 0.0, 1.0);

  vec3 surfaceToViewerDirection = normalize(v_surfaceToViewer);

  vec3 halfVector = normalize(surfaceToLightDir + surfaceToViewerDirection);
  float specularBrightness = pow(
    clamp(dot(halfVector, normal), 0.0, 1.0), u_specularExponent
  );

  float occlusion = smoothstep(0.01, 0.1, lightToSurfaceDepth - lightProjectedDepth);

  diffuseLight *= 1.0 - occlusion;
  specularBrightness *= 1.0 - clamp(occlusion * 2.0, 0.0, 1.0);

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

const oceanFragmentShaderSource = `#version 300 es
precision highp float;

in vec2 v_texcoord;
in vec3 v_surfaceToViewer;
in vec3 v_surfaceToLight;
in mat3 v_normalMatrix;
in vec4 v_reflectionTexcoord;
in vec4 v_lightProjection;
in vec4 v_worldPosition;

uniform sampler2D u_normalMap;
uniform vec3 u_diffuse;
uniform sampler2D u_diffuseMap;
uniform vec3 u_lightDir;
uniform vec3 u_specular;
uniform float u_specularExponent;
uniform vec3 u_emissive;
uniform vec3 u_ambient;
uniform sampler2D u_lightProjectionMap;
uniform vec2 u_normalMapSize;

out vec4 outColor;

void main() {
  vec2 texcoord = (v_reflectionTexcoord.xy / v_reflectionTexcoord.w) * 0.5 + 0.5;
  vec3 normal = texture(u_normalMap, v_worldPosition.xz / u_normalMapSize).xyz * 2.0 - 1.0;
  vec2 distortion = normalize(normal).xy;
  normal = normalize(v_normalMatrix * normal);

  vec2 lightProjectionCoord = v_lightProjection.xy / v_lightProjection.w * 0.5 + 0.5;
  float lightToSurfaceDepth = v_lightProjection.z / v_lightProjection.w * 0.5 + 0.5;
  float lightProjectedDepth = texture(
    u_lightProjectionMap,
    lightProjectionCoord + distortion * 0.01
  ).r;

  vec3 diffuse = u_diffuse + texture(
    u_diffuseMap,
    texcoord + distortion * 0.1
  ).rgb;

  vec3 surfaceToLightDir = normalize(-u_lightDir);

  float diffuseLight = clamp(dot(surfaceToLightDir, normal), 0.0, 1.0);

  vec3 surfaceToViewerDirection = normalize(v_surfaceToViewer);

  vec3 halfVector = normalize(surfaceToLightDir + surfaceToViewerDirection);
  float specularBrightness = pow(
    clamp(dot(halfVector, normal), 0.0, 1.0), u_specularExponent
  );

  float occlusion = smoothstep(0.01, 0.1, lightToSurfaceDepth - lightProjectedDepth);

  diffuseLight *= 1.0 - occlusion;
  specularBrightness *= 1.0 - clamp(occlusion * 2.0, 0.0, 1.0);

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

async function setup() {
  const canvas = document.getElementById('canvas');
  const gl = canvas.getContext('webgl2');

  twgl.setAttributePrefix('a_');

  const programInfo = twgl.createProgramInfo(gl, [vertexShaderSource, fragmentShaderSource]);
  const depthProgramInfo = twgl.createProgramInfo(gl, [vertexShaderSource, depthFragmentShaderSource]);
  const oceanProgramInfo = twgl.createProgramInfo(gl, [vertexShaderSource, oceanFragmentShaderSource]);

  const textures = twgl.createTextures(gl, {
    scale: {
      src: '/assets/scale_diffuse.webp',
      min: gl.LINEAR_MIPMAP_LINEAR, mag: gl.LINEAR,
    },
    scaleNormal: {
      src: '/assets/scale_normal.webp',
      min: gl.LINEAR_MIPMAP_LINEAR, mag: gl.LINEAR,
    },
    oceanNormal: {
      src: '/assets/water_normal.webp',
      min: gl.LINEAR_MIPMAP_LINEAR, mag: gl.LINEAR,
      wrap: gl.REPEAT,
    },
    null: { src: [0, 0, 0, 255] },
    nullNormal: { src: [127, 127, 255, 255] },
  });

  const framebuffers = {};

  framebuffers.reflection = twgl.createFramebufferInfo(
    gl,
    null, // attachments
    2048, // width
    2048, // height
  );
  textures.reflection = framebuffers.reflection.attachments[0];

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

  { // plane
    const vertexDataArrays = twgl.primitives.createPlaneVertices();
    const bufferInfo = twgl.createBufferInfoFromArrays(gl, vertexDataArrays);
    const vao = twgl.createVAOFromBufferInfo(gl, programInfo, bufferInfo);

    objects.plane = {
      vertexDataArrays,
      vao, bufferInfo,
    };
  }

  gl.enable(gl.CULL_FACE);
  gl.enable(gl.DEPTH_TEST);
  gl.clearColor(0, 0, 0, 1);

  return {
    gl,
    programInfo, depthProgramInfo,
    oceanProgramInfo,
    textures, framebuffers, objects,
    state: {
      fieldOfView: degToRad(45),
      cameraRotationXY: [degToRad(-45), 0],
      cameraDistance: 15,
      cameraViewing: [0, 0, 0],
      lightRotationXY: [0, 0],
      resolutionRatio: 1,
    },
    time: 0,
  };
}

function renderSphere(app, viewMatrix, programInfo) {
  const { gl, textures, objects } = app;

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
    u_ambient: [0.4, 0.4, 0.4],
  });

  twgl.drawBufferInfo(gl, objects.sphere.bufferInfo);
}

function renderOcean(app, viewMatrix, reflectionViewMatrix, programInfo) {
  const { gl, textures, objects } = app;

  gl.bindVertexArray(objects.plane.vao);

  const worldMatrix = matrix4.multiply(
    matrix4.translate(0, 0, 0),
    matrix4.scale(4000, 1, 4000),
  );

  twgl.setUniforms(programInfo, {
    u_matrix: matrix4.multiply(viewMatrix, worldMatrix),
    u_worldMatrix: worldMatrix,
    u_normalMatrix: matrix4.transpose(matrix4.inverse(worldMatrix)),
    u_normalMap: textures.oceanNormal,
    u_diffuse: [45/255, 141/255, 169/255],
    u_diffuseMap: textures.reflection,
    u_specularExponent: 200,
    u_emissive: [0, 0, 0],
    u_ambient: [0.4, 0.4, 0.4],
    u_reflectionMatrix: reflectionViewMatrix,
    u_normalMapSize: [16, 16],
  });

  twgl.drawBufferInfo(gl, objects.plane.bufferInfo);
}

function render(app) {
  const {
    gl,
    programInfo,
    depthProgramInfo,
    oceanProgramInfo,
    framebuffers, textures,
    state,
  } = app;

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

  const reflectionCameraMatrix = matrix4.multiply(
    matrix4.translate(...state.cameraViewing),
    matrix4.yRotate(state.cameraRotationXY[1]),
    matrix4.xRotate(-state.cameraRotationXY[0]),
    matrix4.translate(0, 0, state.cameraDistance),
  );

  const reflectionViewMatrix = matrix4.multiply(
    matrix4.perspective(state.fieldOfView, gl.canvas.width / gl.canvas.height, 0.1, 2000),
    matrix4.inverse(reflectionCameraMatrix),
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

  const globalUniforms = {
    u_worldViewerPosition: cameraMatrix.slice(12, 15),
    u_lightDir: [
      -1 * Math.sin(state.lightRotationXY[0]) * Math.sin(state.lightRotationXY[1]),
      -1 * Math.cos(state.lightRotationXY[0]),
      -1 * Math.sin(state.lightRotationXY[0]) * Math.cos(state.lightRotationXY[1]),
    ],
    u_specular: [1, 1, 1],
    u_lightProjectionMatrix: lightProjectionViewMatrix,
    u_lightProjectionMap: textures.lightProjection,
  }

  { // lightProjection
    twgl.bindFramebufferInfo(gl, framebuffers.lightProjection);

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.useProgram(depthProgramInfo.program);

    renderOcean(app, lightProjectionViewMatrix, reflectionViewMatrix, depthProgramInfo);
    renderSphere(app, lightProjectionViewMatrix, depthProgramInfo);
  }

  gl.useProgram(programInfo.program);
  twgl.setUniforms(programInfo, globalUniforms);

  { // reflection
    twgl.bindFramebufferInfo(gl, framebuffers.reflection);

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    renderSphere(app, reflectionViewMatrix, programInfo);
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  twgl.resizeCanvasToDisplaySize(gl.canvas, state.resolutionRatio);
  gl.viewport(0, 0, canvas.width, canvas.height);

  renderSphere(app, viewMatrix, programInfo);

  gl.useProgram(oceanProgramInfo.program);
  twgl.setUniforms(oceanProgramInfo, globalUniforms);
  renderOcean(app, viewMatrix, reflectionViewMatrix, oceanProgramInfo);
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

  const resolutionSelect = document.getElementById('resolution-ratio');
  resolutionSelect.addEventListener('change', () => {
    app.state.resolutionRatio = parseFloat(resolutionSelect.value);
  });
  if (window.devicePixelRatio > 1) {
    const retinaOption = document.getElementById('resolution-ratio-retina');
    retinaOption.value = window.devicePixelRatio;
    retinaOption.disabled = false;
  }

  startLoop(app);
}
main();
